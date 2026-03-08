import type { Context } from "@netlify/functions";

const IG_USER_ID = process.env.META_IG_USER_ID;
const ACCESS_TOKEN = process.env.META_IG_ACCESS_TOKEN;
const GRAPH_API = "https://graph.instagram.com/v21.0";

interface PublishRequest {
  action: "publish";
  image_url: string;
  caption: string;
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

// --- Cron: process scheduled posts from Firestore ---

const FIREBASE_PROJECT_ID = "landing-growth4u";
const FB_APP_ID = "growth4u-public-app";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const IG_COLLECTION = `artifacts/${FB_APP_ID}/public/data/ig_scheduled_posts`;

interface FirestoreDoc {
  name: string;
  fields: Record<string, { stringValue?: string; timestampValue?: string }>;
}

async function checkContainerStatus(containerId: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_API}/${containerId}?fields=status_code&access_token=${ACCESS_TOKEN}`
  );
  const data = await res.json();
  return data.status_code || "UNKNOWN";
}

async function waitForContainer(containerId: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkContainerStatus(containerId);
    if (status === "FINISHED") return;
    if (status === "ERROR") throw new Error("Container processing failed on Instagram side");
    // Wait 3s between checks
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Container not ready after 30s — timed out");
}

async function processScheduledPosts() {
  const errors: Array<{ id: string; error: string }> = [];

  // Read all pending scheduled posts
  const res = await fetch(`${FIRESTORE_BASE}/${IG_COLLECTION}?pageSize=100`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore read failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.documents) return { processed: 0, total_due: 0, errors, message: "No documents in collection" };

  const now = new Date();
  const pending = (data.documents as FirestoreDoc[])
    .map((doc) => {
      const f = doc.fields;
      return {
        id: doc.name.split("/").pop()!,
        imageUrl: f.imageUrl?.stringValue || "",
        caption: f.caption?.stringValue || "",
        scheduledAt: new Date(f.scheduledAt?.timestampValue || 0),
        status: f.status?.stringValue || "pending",
      };
    })
    .filter((p) => p.status === "pending" && p.scheduledAt <= now);

  if (pending.length === 0) {
    return { processed: 0, total_due: 0, errors, message: "No posts due" };
  }

  let published = 0;
  for (const post of pending) {
    try {
      console.log(`[IG Cron] Publishing post ${post.id} — scheduled ${post.scheduledAt.toISOString()}`);

      // Mark as publishing
      await patchFirestoreDoc(post.id, { status: "publishing" });

      // Publish to Instagram
      const container = await createMediaContainer(post.imageUrl, post.caption);
      console.log(`[IG Cron] Container created: ${container.id}`);

      // Poll container status instead of blind wait
      await waitForContainer(container.id);

      const result = await publishMedia(container.id);
      console.log(`[IG Cron] Published! Media ID: ${result.id}`);

      // Mark as published with timestamp
      await patchFirestoreDoc(post.id, {
        status: "published",
        mediaId: result.id,
        publishedAt: new Date().toISOString(),
      });
      published++;

      // Rate limit between posts
      if (pending.indexOf(post) < pending.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[IG Cron] FAILED post ${post.id}: ${msg}`);
      errors.push({ id: post.id, error: msg });
      await patchFirestoreDoc(post.id, { status: "error", error: msg });
    }
  }

  return { processed: published, total_due: pending.length, errors };
}

async function patchFirestoreDoc(docId: string, fields: Record<string, string>) {
  const masks = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const url = `${FIRESTORE_BASE}/${IG_COLLECTION}/${docId}?${masks}`;

  const firestoreFields: Record<string, { stringValue: string }> = {};
  for (const [k, v] of Object.entries(fields)) {
    firestoreFields[k] = { stringValue: v };
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: firestoreFields }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[IG Cron] Firestore PATCH failed for ${docId} (${res.status}): ${text}`);
  }
}

export default async (req: Request, _context: Context) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET = fetch metrics, run cron, or check status
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Status: check config + pending posts (always available, even without env vars)
    if (action === "status") {
      const configOk = !!(IG_USER_ID && ACCESS_TOKEN);
      let tokenValid = false;
      let tokenError = "";
      if (configOk) {
        try {
          const check = await fetch(
            `${GRAPH_API}/${IG_USER_ID}?fields=username&access_token=${ACCESS_TOKEN}`
          );
          const checkData = await check.json();
          tokenValid = check.ok;
          if (!check.ok) tokenError = checkData.error?.message || "Token invalid";
        } catch (e: unknown) {
          tokenError = e instanceof Error ? e.message : "Fetch failed";
        }
      }

      let pendingCount = 0;
      let errorCount = 0;
      try {
        const fsRes = await fetch(`${FIRESTORE_BASE}/${IG_COLLECTION}?pageSize=100`);
        const fsData = await fsRes.json();
        if (fsData.documents) {
          for (const doc of fsData.documents as FirestoreDoc[]) {
            const status = doc.fields.status?.stringValue;
            if (status === "pending") pendingCount++;
            if (status === "error") errorCount++;
          }
        }
      } catch { /* ignore */ }

      return Response.json({
        config: configOk ? "ok" : "MISSING env vars (META_IG_USER_ID / META_IG_ACCESS_TOKEN)",
        token: configOk ? (tokenValid ? "valid" : `INVALID — ${tokenError}`) : "not checked",
        pending_posts: pendingCount,
        error_posts: errorCount,
      }, { headers: CORS_HEADERS });
    }

    if (!IG_USER_ID || !ACCESS_TOKEN) {
      return Response.json(
        { error: "Instagram API not configured — set META_IG_USER_ID and META_IG_ACCESS_TOKEN in Netlify env vars" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Cron: publish scheduled posts that are due
    if (action === "cron") {
      try {
        const result = await processScheduledPosts();
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
      }
    }

    // Default: fetch metrics
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

  if (!IG_USER_ID || !ACCESS_TOKEN) {
    return Response.json(
      { error: "Instagram API not configured" },
      { status: 500, headers: CORS_HEADERS }
    );
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

    // Poll until container is ready
    await waitForContainer(container.id);

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
