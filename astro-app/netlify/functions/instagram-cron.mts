import type { Config } from "@netlify/functions";

// Runs every hour — publishes scheduled Instagram posts that are due
export default async () => {
  const siteUrl = process.env.URL || "https://growth4u.io";
  const url = `${siteUrl}/.netlify/functions/instagram?action=cron`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error("[IG Cron] Error:", JSON.stringify(data));
    } else {
      console.log("[IG Cron] Result:", JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[IG Cron] Fetch failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  schedule: "0 * * * *",
};
