import type { Context } from "@netlify/functions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  const lead = {
    name,
    email,
    phone: phone || "",
    url,
    timestamp: new Date().toISOString(),
    source: "trust-score-analyzer",
  };

  // Create contact in GHL via API
  const ghlApiKey = process.env.GHL_API_KEY;
  const ghlLocationId = process.env.GHL_LOCATION_ID;
  let ghlStatus = "skipped";
  if (ghlApiKey && ghlLocationId) {
    try {
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
          email,
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
    } catch (err) {
      ghlStatus = `exception:${String(err)}`;
    }
  } else {
    ghlStatus = `not_configured:key=${!!ghlApiKey},loc=${!!ghlLocationId}`;
  }

  console.log("Trust Score lead captured:", JSON.stringify(lead));

  return jsonResponse({ ok: true, limit_reached: false, ghlStatus });
};
