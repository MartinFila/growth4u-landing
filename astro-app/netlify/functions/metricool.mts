import type { Context } from "@netlify/functions";

const METRICOOL_TOKEN = process.env.METRICOOL_USER_TOKEN;
const METRICOOL_USER_ID = process.env.METRICOOL_USER_ID;
const METRICOOL_BLOG_ID = process.env.METRICOOL_BLOG_ID;
const METRICOOL_BASE = "https://app.metricool.com/api";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface ScheduleRequest {
  text: string;
  imageUrl: string;
  publicationDate: { dateTime: string; timezone: string };
}

async function normalizeImage(imageUrl: string): Promise<string> {
  const url = `${METRICOOL_BASE}/actions/normalize/image/url?url=${encodeURIComponent(imageUrl)}&blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;
  const res = await fetch(url, {
    headers: { "X-Mc-Auth": METRICOOL_TOKEN! },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Normalize failed (${res.status}): ${text}`);
  }
  // Response may be plain text (mediaId) or JSON
  try {
    const data = JSON.parse(text);
    return data.mediaId || data.id || String(data);
  } catch {
    return text.trim();
  }
}

async function schedulePost(
  text: string,
  mediaId: string,
  publicationDate: { dateTime: string; timezone: string },
): Promise<Record<string, unknown>> {
  const url = `${METRICOOL_BASE}/v2/scheduler/posts?blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;

  const body = {
    text,
    providers: [{ network: "LINKEDIN" }],
    publicationDate,
    autoPublish: true,
    draft: false,
    media: [mediaId],
    mediaAltText: [],
    descendants: [],
    firstCommentText: "",
    shortener: false,
    smartLinkData: { ids: [] },
    linkedinData: {
      documentTitle: "",
      publishImagesAsPDF: false,
      previewIncluded: true,
      type: "IMAGE",
      poll: null,
    },
    twitterData: { tags: [] },
    facebookData: { type: "IMAGE", title: "", boost: 0, boostPayer: null, boostBeneficiary: null },
    instagramData: { type: "IMAGE", collaborators: [], carouselTags: {}, showReelOnFeed: true, boost: 0 },
    pinterestData: { boardId: null, pinTitle: "", pinLink: "", pinNewFormat: false },
    youtubeData: { title: "", type: "VIDEO", privacy: "PUBLIC", tags: [], category: "", madeForKids: false },
    tiktokData: { disableComment: false, disableDuet: false, disableStitch: false, privacyOption: "PUBLIC" },
    blueskyData: { postLanguages: [] },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Mc-Auth": METRICOOL_TOKEN!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Schedule failed (${res.status}): ${responseText}`);
  }
  // Response may be empty on success (204-like) or JSON
  if (!responseText) return { scheduled: true };
  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    return { scheduled: true, raw: responseText };
  }
}

async function getScheduledPosts(): Promise<Record<string, unknown>> {
  const url = `${METRICOOL_BASE}/v2/scheduler/posts?blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}&status=PENDING`;
  const res = await fetch(url, {
    headers: { "X-Mc-Auth": METRICOOL_TOKEN! },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch posts failed (${res.status}): ${text}`);
  }
  if (!text) return { posts: [] };
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { posts: [], raw: text };
  }
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!METRICOOL_TOKEN || !METRICOOL_USER_ID || !METRICOOL_BLOG_ID) {
    return Response.json(
      { error: "Metricool API not configured" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // GET = list scheduled posts
  if (req.method === "GET") {
    try {
      const data = await getScheduledPosts();
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
    const body = (await req.json()) as ScheduleRequest;
    const { text, imageUrl, publicationDate } = body;

    if (!text || !imageUrl || !publicationDate) {
      return Response.json(
        { error: "text, imageUrl, and publicationDate are required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Step 1: normalize image to get mediaId
    const mediaId = await normalizeImage(imageUrl);

    // Step 2: schedule the post
    const result = await schedulePost(text, mediaId, publicationDate);

    return Response.json(
      { success: true, data: result },
      { headers: CORS_HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
};
