import type { Context } from "@netlify/functions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_UNLOCKS_PER_EMAIL = 2;

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const { name, email, phone, url } = await req.json();

  if (!name || !email || !url) {
    return jsonResponse({ error: "Missing fields" }, 400);
  }

  const emailLower = email.trim().toLowerCase();

  // Check rate limit via GHL: search contacts with this email + tag "trust-score"
  const ghlApiKey = process.env.GHL_API_KEY;
  const ghlLocationId = process.env.GHL_LOCATION_ID;
  let ghlStatus = "skipped";
  let limitReached = false;

  if (ghlApiKey && ghlLocationId) {
    try {
      // 1. Search for existing contact by email
      const searchResp = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&query=${encodeURIComponent(emailLower)}`,
        {
          headers: {
            "Authorization": `Bearer ${ghlApiKey}`,
            "Version": "2021-07-28",
          },
          signal: AbortSignal.timeout(5_000),
        }
      );
      const searchData = await searchResp.json();
      const existingContacts = (searchData?.contacts || []).filter(
        (c: { email?: string; tags?: string[] }) =>
          c.email?.toLowerCase() === emailLower &&
          c.tags?.includes("trust-score")
      );

      // Check how many trust-score analyses this email has done
      if (existingContacts.length > 0) {
        const contact = existingContacts[0];
        const unlockCount = contact.customFields?.find(
          (f: { id: string; value: unknown }) => f.id === "trust_score_unlocks"
        )?.value;
        if (typeof unlockCount === "number" && unlockCount >= MAX_UNLOCKS_PER_EMAIL) {
          limitReached = true;
        }
      }

      if (!limitReached) {
        // 2. Create or update contact in GHL
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        const ghlResp = await fetch("https://services.leadconnectorhq.com/contacts/", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
          body: JSON.stringify({
            locationId: ghlLocationId,
            firstName,
            lastName,
            email: emailLower,
            phone: phone || undefined,
            website: url,
            tags: ["trust-score"],
            source: "Trust Score Analyzer",
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!ghlResp.ok) {
          const text = await ghlResp.text();
          ghlStatus = `error:${ghlResp.status}:${text}`;
        } else {
          ghlStatus = "ok";
        }
      }
    } catch (err) {
      ghlStatus = `exception:${String(err)}`;
      // On GHL error, don't block the user — allow the unlock
    }
  } else {
    ghlStatus = `not_configured:key=${!!ghlApiKey},loc=${!!ghlLocationId}`;
  }

  if (limitReached) {
    return jsonResponse({ ok: false, limit_reached: true });
  }

  console.log("Trust Score lead captured:", JSON.stringify({ name, email: emailLower, url, timestamp: new Date().toISOString() }));

  return jsonResponse({ ok: true, limit_reached: false, ghlStatus });
};
