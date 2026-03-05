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
  scheduledTime?: number
): Promise<IGContainerResponse> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: ACCESS_TOKEN!,
  });

  if (scheduledTime) {
    params.set("published", "false");
    params.set("scheduled_publish_time", scheduledTime.toString());
  }

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

export default async (req: Request, _context: Context) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!IG_USER_ID || !ACCESS_TOKEN) {
    return Response.json(
      { error: "Instagram API not configured" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as PublishRequest;
    const { action, image_url, caption, scheduled_publish_time } = body;

    if (!image_url || !caption) {
      return Response.json(
        { error: "image_url and caption are required" },
        { status: 400 }
      );
    }

    // Create media container
    const container = await createMediaContainer(
      image_url,
      caption,
      action === "schedule" ? scheduled_publish_time : undefined
    );

    if (action === "schedule" && scheduled_publish_time) {
      // Scheduled posts — Meta publishes automatically at the specified time
      return Response.json(
        {
          success: true,
          container_id: container.id,
          scheduled: true,
          scheduled_publish_time,
        },
        {
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // Immediate publish — wait a bit for container to be ready
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
