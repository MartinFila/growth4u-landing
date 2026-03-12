import type { Context } from "@netlify/functions";
import { deflateSync } from "zlib";

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

  const { name, email, result, origin } = await req.json();

  if (!email || !result || !origin) {
    return jsonResponse({ error: "Missing fields" }, 400);
  }

  // Generate report URL via compressed data in URL
  const compressed = deflateSync(Buffer.from(JSON.stringify(result))).toString("base64url");
  const reportUrl = `${origin}/recursos/trust-score/report?d=${compressed}`;

  // Send email via Mailgun
  const mgKey = process.env.MAILGUN_API_KEY;
  const mgDomain = process.env.MAILGUN_DOMAIN || "email.growth4u.io";

  if (!mgKey) {
    console.error("MAILGUN_API_KEY not set — cannot send email");
    return jsonResponse({ ok: false, error: "Email not configured", reportUrl, emailSent: false });
  }

  const firstName = (name || "").trim().split(/\s+/)[0] || "Hola";
  const trustScore = result.trust_score ?? "—";
  const companyName = result.company_name ?? "tu empresa";
  const calendarUrl = "https://api.leadconnectorhq.com/widget/booking/9VRbPAQQnH5AF0jDOPNE";

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
    <!-- Header -->
    <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
      <img src="https://trust.growth4u.io/growth4u_logo.png" alt="Growth4U" width="140" style="display:inline-block;" />
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;color:#0F1B2D;margin:0 0 16px;">
        ${firstName}, tu reporte está listo.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6;">
        Hemos analizado la confianza digital de <strong style="color:#0F1B2D;">${companyName}</strong>
        en 6 pilares clave: presencia en Google, visibilidad en IAs, activos de marca y más.
      </p>

      <!-- Score highlight -->
      <div style="background:#f0fdf9;border:1px solid #d1fae5;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Trust Score</div>
        <div style="font-size:48px;font-weight:bold;color:${trustScore >= 70 ? '#0d9488' : trustScore >= 40 ? '#d97706' : '#dc2626'};font-family:monospace;">
          ${trustScore}<span style="font-size:18px;color:#9ca3af;">/100</span>
        </div>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${reportUrl}" style="display:inline-block;background:#00C9A7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver reporte completo
        </a>
      </div>

      <p style="font-size:13px;color:#9ca3af;text-align:center;margin:0 0 24px;">
        El reporte estará disponible durante 30 días.
      </p>

      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />

      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.6;">
        ¿Quieres que te ayudemos a mejorar tu Trust Score? Agenda una sesión estratégica gratuita con nuestro equipo.
      </p>

      <div style="text-align:center;">
        <a href="${calendarUrl}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">
          Agendar sesión gratuita
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        Growth4U · <a href="https://growth4u.io" style="color:#00C9A7;text-decoration:none;">growth4u.io</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const form = new URLSearchParams();
    form.append("from", "Growth4U Trust Score <trust@" + mgDomain + ">");
    form.append("to", email);
    form.append("subject", `${firstName}, tu Trust Score está listo — ${companyName}`);
    form.append("html", htmlBody);

    const resp = await fetch(`https://api.mailgun.net/v3/${mgDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from("api:" + mgKey).toString("base64"),
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn("Mailgun error:", resp.status, text);
      return jsonResponse({ ok: true, reportUrl, emailSent: false, mailgunError: `${resp.status}: ${text}` });
    }

    return jsonResponse({ ok: true, reportUrl, emailSent: true });
  } catch (err) {
    console.warn("Mailgun request failed:", err);
    return jsonResponse({ ok: true, reportUrl, emailSent: false, mailgunError: String(err) });
  }
};
