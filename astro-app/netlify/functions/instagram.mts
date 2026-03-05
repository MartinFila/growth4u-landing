import type { Context } from "@netlify/functions";

const IG_USER_ID = process.env.META_IG_USER_ID;
const ACCESS_TOKEN = process.env.META_IG_ACCESS_TOKEN;
const GRAPH_API = "https://graph.instagram.com/v21.0";

interface PublishRequest {
  action: "publish" | "schedule";
  image_url: string;
  caption: string;
  scheduled_publish_time?: number; // Unix timestamp
}

interface IGContainerResponse {
  id: string;
}

interface IGPublishResponse {
  id: string;
}

interface IGErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

async function createMediaContainer(
  imageUrl: string,
  caption: string,
): Promise<IGContainerResponse> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: ACCESS_TOKEN!,
  });

  const res = await fetch(`${GRAPH_API}/${IG_USER_ID}/media`, {
    method: "POST",
    body: params,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = data as IGErrorResponse;
    throw new Error(err.error?.message || "Failed to create media container");
  }
  return data as IGContainerResponse;
}

async function publishMedia(containerId: string): Promise<IGPublishResponse> {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: ACCESS_TOKEN!,
  });

  const res = await fetch(`${GRAPH_API}/${IG_USER_ID}/media_publish`, {
    method: "POST",
    body: params,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = data as IGErrorResponse;
    throw new Error(err.error?.message || "Failed to publish media");
  }
  return data as IGPublishResponse;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function fetchMetrics() {
  // Fetch account info + recent media with metrics
  const accountRes = await fetch(
    `${GRAPH_API}/${IG_USER_ID}?fields=username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${ACCESS_TOKEN}`
  );
  const account = await accountRes.json();
  if (!accountRes.ok) {
    throw new Error(account.error?.message || "Failed to fetch account");
  }

  // Fetch recent media with insights
  const mediaRes = await fetch(
    `${GRAPH_API}/${IG_USER_ID}/media?fields=id,caption,like_count,comments_count,timestamp,media_url,permalink,media_type,insights.metric(impressions,reach,saved,shares)&limit=25&access_token=${ACCESS_TOKEN}`
  );
  const mediaData = await mediaRes.json();
  if (!mediaRes.ok) {
    throw new Error(mediaData.error?.message || "Failed to fetch media");
  }

  // Parse media insights into flat objects
  const media = (mediaData.data || []).map((post: Record<string, unknown>) => {
    const insights: Record<string, number> = {};
    const insightsData = post.insights as { data?: Array<{ name: string; values: Array<{ value: number }> }> } | undefined;
    if (insightsData?.data) {
      for (const metric of insightsData.data) {
        insights[metric.name] = metric.values?.[0]?.value ?? 0;
      }
    }
    return {
      id: post.id,
      caption: post.caption,
      like_count: post.like_count,
      comments_count: post.comments_count,
      timestamp: post.timestamp,
      media_url: post.media_url,
      permalink: post.permalink,
      media_type: post.media_type,
      impressions: insights.impressions || 0,
      reach: insights.reach || 0,
      saved: insights.saved || 0,
      shares: insights.shares || 0,
    };
  });

  return { account, media };
}

export default async (req: Request, _context: Context) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!IG_USER_ID || !ACCESS_TOKEN) {
    return Response.json(
      { error: "Instagram API not configured" },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // GET = fetch metrics
  if (req.method === "GET") {
    try {
      const data = await fetchMetrics();
      return Response.json(data, { headers: CORS_HEADERS });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
    }
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json()) as PublishRequest;
    const { image_url, caption } = body;

    if (!image_url || !caption) {
      return Response.json(
        { error: "image_url and caption are required" },
        { status: 400 }
      );
    }

    // Create media container (always immediate — IG API doesn't support native scheduling)
    const container = await createMediaContainer(image_url, caption);

    // Wait for container to be ready, then publish
    await new Promise((r) => setTimeout(r, 3000));

    const published = await publishMedia(container.id);

    return Response.json(
      {
        success: true,
        media_id: published.id,
        scheduled: false,
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
};
