import type { Context } from "@netlify/functions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const GHL_LOCATION_ID = "BnXWP5dcLVMgUudLv10O";

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function findOrCreateGhlContact(
  apiKey: string,
  email: string,
  name: string,
  empresa: string,
  magnetSlug: string,
  magnetTitle: string,
): Promise<string | null> {
  // Search existing contact
  const searchResp = await fetch(
    `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" },
      signal: AbortSignal.timeout(8_000),
    },
  );
  const searchData = await searchResp.json();
  const existing = (searchData?.contacts || []).find(
    (c: { email?: string }) => c.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existing) {
    // Update tags to include this lead magnet
    const existingTags: string[] = existing.tags || [];
    const newTag = `lead-magnet-${magnetSlug}`;
    if (!existingTags.includes(newTag)) {
      await fetch(`https://services.leadconnectorhq.com/contacts/${existing.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({ tags: [...existingTags, newTag] }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
    }
    return existing.id;
  }

  // Create new contact
  const nameParts = name.trim().split(/\s+/);
  const createResp = await fetch("https://services.leadconnectorhq.com/contacts/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email,
      companyName: empresa || undefined,
      tags: ["lead-magnet", `lead-magnet-${magnetSlug}`],
      source: `Lead Magnet: ${magnetTitle}`,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const createData = await createResp.json();
  return createData?.contact?.id || null;
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const { nombre, email, empresa, magnetSlug, magnetTitle, contentUrl } = await req.json();

  if (!nombre || !email || !magnetSlug || !magnetTitle || !contentUrl) {
    return jsonResponse({ error: "Missing fields" }, 400);
  }

  const ghlApiKey = process.env.GHL_API_KEY;
  if (!ghlApiKey) {
    console.error("GHL_API_KEY not set");
    return jsonResponse({ ok: false, emailSent: false, error: "Email not configured" });
  }

  const firstName = nombre.trim().split(/\s+/)[0] || "Hola";
  const fullContentUrl = contentUrl;
  const calendarUrl = "https://api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN";

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
    <!-- Header -->
    <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
      <img src="https://i.imgur.com/imHxGWI.png" alt="Growth4U" width="140" style="display:inline-block;" />
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;color:#032149;margin:0 0 16px;">
        ${firstName}, tu recurso está listo.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6;">
        Has desbloqueado <strong style="color:#032149;">${magnetTitle}</strong>.
        Haz clic en el botón de abajo para acceder al contenido completo.
      </p>

      <!-- Resource highlight -->
      <div style="background:#f5f3ff;border:1px solid #e0ddf7;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
        <div style="font-size:28px;margin:0 0 8px;">📖</div>
        <div style="font-size:14px;font-weight:600;color:#6351d5;">${magnetTitle}</div>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${fullContentUrl}" style="display:inline-block;background:#6351d5;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Leer contenido completo
        </a>
      </div>

      <p style="font-size:13px;color:#9ca3af;text-align:center;margin:0 0 24px;">
        Este enlace es personal. Puedes volver a acceder cuando quieras.
      </p>

      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />

      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
        ¿Quieres implementar estas estrategias en tu empresa? Agenda una sesión gratuita con nuestro equipo.
      </p>

      <div style="text-align:center;">
        <a href="${calendarUrl}" style="display:inline-block;background:#032149;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">
          Agendar sesión gratuita
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        Growth4U · <a href="https://growth4u.io" style="color:#0faec1;text-decoration:none;">growth4u.io</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    // 1. Create/update contact in GHL
    const contactId = await findOrCreateGhlContact(
      ghlApiKey, email.trim().toLowerCase(), nombre.trim(), empresa || "", magnetSlug, magnetTitle,
    );
    if (!contactId) {
      console.error("Could not find/create GHL contact for:", email);
      return jsonResponse({ ok: false, emailSent: false, error: "Contact creation failed" });
    }

    // 2. Send email via GHL Conversations API
    const emailResp = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghlApiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        type: "Email",
        contactId,
        subject: `${firstName}, tu recurso "${magnetTitle}" está listo`,
        html: htmlBody,
        emailFrom: "Growth4U <accounts@growth4u.io>",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!emailResp.ok) {
      const text = await emailResp.text();
      console.warn("GHL email error:", emailResp.status, text);
      return jsonResponse({ ok: true, emailSent: false, ghlError: `${emailResp.status}: ${text}` });
    }

    const emailData = await emailResp.json();
    console.log("Lead magnet email sent:", emailData.messageId, "to:", email, "magnet:", magnetSlug);
    return jsonResponse({ ok: true, emailSent: true });
  } catch (err) {
    console.warn("Lead magnet gate failed:", err);
    return jsonResponse({ ok: false, emailSent: false, error: String(err) });
  }
};
