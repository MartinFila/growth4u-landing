import type { Context } from "@netlify/functions";

const METRICOOL_TOKEN = process.env.METRICOOL_USER_TOKEN;
const METRICOOL_USER_ID = process.env.METRICOOL_USER_ID;
const METRICOOL_BLOG_ID = process.env.METRICOOL_BLOG_ID;
const METRICOOL_BASE = "https://app.metricool.com/api";

const LI_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
// Set this to a person URN or organization URN — auto-detected if not set
const LI_AUTHOR_URN = process.env.LINKEDIN_AUTHOR_URN;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const mcHeaders = () => ({
  "X-Mc-Auth": METRICOOL_TOKEN!,
});

const liHeaders = () => ({
  Authorization: `Bearer ${LI_ACCESS_TOKEN}`,
  "LinkedIn-Version": "202402",
  "X-Restli-Protocol-Version": "2.0.0",
});

// --- LinkedIn API: detect author URN ---
async function getAuthorUrn(): Promise<string> {
  if (LI_AUTHOR_URN) return LI_AUTHOR_URN;

  // Try to get the authenticated user's person URN
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${LI_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`LinkedIn userinfo failed (${res.status})`);
  const data = await res.json() as { sub?: string };
  if (data.sub) return `urn:li:person:${data.sub}`;
  throw new Error("Could not determine LinkedIn author URN");
}

// --- LinkedIn API: fetch posts + social metrics ---
async function fetchLinkedInMetrics() {
  const authorUrn = await getAuthorUrn();
  const encodedUrn = encodeURIComponent(authorUrn);

  // Fetch posts by this author (last 50)
  const postsUrl = `https://api.linkedin.com/rest/posts?author=${encodedUrn}&q=author&count=50&sortBy=LAST_MODIFIED`;
  const postsRes = await fetch(postsUrl, { headers: liHeaders() });

  if (!postsRes.ok) {
    const errText = await postsRes.text();
    throw new Error(`LinkedIn posts API failed (${postsRes.status}): ${errText}`);
  }

  const postsData = await postsRes.json() as {
    elements?: Array<{
      id?: string;
      commentary?: string;
      content?: { media?: { id?: string } };
      publishedAt?: number;
      lifecycleState?: string;
    }>;
  };
  const posts = postsData.elements || [];

  if (posts.length === 0) {
    return { authorUrn, posts: [] };
  }

  // Fetch social actions (likes, comments) for each post
  // Use the socialMetadata batch endpoint
  const statsMap = new Map<string, { likes: number; comments: number; shares: number; impressions: number; clicks: number }>();

  // Fetch stats via organizationalEntityShareStatistics if org, or shareStatistics if person
  if (authorUrn.includes("organization")) {
    // Organization share statistics — gives impressions, clicks, likes, comments, shares
    const statsUrl = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodedUrn}&count=50`;
    const statsRes = await fetch(statsUrl, { headers: liHeaders() });
    if (statsRes.ok) {
      const statsData = await statsRes.json() as {
        elements?: Array<{
          share?: string;
          totalShareStatistics?: {
            impressionCount?: number;
            clickCount?: number;
            likeCount?: number;
            commentCount?: number;
            shareCount?: number;
          };
        }>;
      };
      for (const el of statsData.elements || []) {
        if (el.share) {
          statsMap.set(el.share, {
            likes: el.totalShareStatistics?.likeCount || 0,
            comments: el.totalShareStatistics?.commentCount || 0,
            shares: el.totalShareStatistics?.shareCount || 0,
            impressions: el.totalShareStatistics?.impressionCount || 0,
            clicks: el.totalShareStatistics?.clickCount || 0,
          });
        }
      }
    }
  }

  // For each post, also try individual socialActions counts
  const enrichedPosts = await Promise.all(
    posts.slice(0, 20).map(async (post) => {
      const postId = post.id || "";
      let likes = 0, comments = 0, shares = 0;

      // Check if we already have stats from org stats
      const orgStats = statsMap.get(postId);
      if (orgStats) {
        return {
          id: postId,
          text: post.commentary || "",
          createdAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
          ...orgStats,
        };
      }

      // Otherwise, fetch individual social counts
      try {
        const encodedPostId = encodeURIComponent(postId);
        const socialUrl = `https://api.linkedin.com/rest/socialMetadata/${encodedPostId}`;
        const socialRes = await fetch(socialUrl, { headers: liHeaders() });
        if (socialRes.ok) {
          const social = await socialRes.json() as {
            reactionSummaries?: Array<{ count?: number }>;
            commentSummary?: { count?: number };
            totalShares?: number;
          };
          likes = (social.reactionSummaries || []).reduce((s: number, r: { count?: number }) => s + (r.count || 0), 0);
          comments = social.commentSummary?.count || 0;
          shares = social.totalShares || 0;
        }
      } catch {
        // Silently skip metrics for this post
      }

      return {
        id: postId,
        text: post.commentary || "",
        createdAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
        likes,
        comments,
        shares,
        impressions: 0,
        clicks: 0,
      };
    }),
  );

  return { authorUrn, posts: enrichedPosts };
}

// --- Metricool: check connection ---
async function checkConnection(): Promise<{ connected: boolean; org?: string; hasLinkedInApi?: boolean }> {
  const result: { connected: boolean; org?: string; hasLinkedInApi?: boolean } = {
    connected: false,
    hasLinkedInApi: !!LI_ACCESS_TOKEN,
  };

  // Check LinkedIn API directly if token exists
  if (LI_ACCESS_TOKEN) {
    try {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${LI_ACCESS_TOKEN}` },
      });
      if (res.ok) {
        const data = await res.json() as { name?: string };
        result.connected = true;
        result.org = data.name || "LinkedIn";
        return result;
      }
    } catch {
      // Fall through to Metricool check
    }
  }

  // Fallback: check Metricool
  if (METRICOOL_TOKEN && METRICOOL_USER_ID && METRICOOL_BLOG_ID) {
    const url = `${METRICOOL_BASE}/admin/simpleProfiles?blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;
    const res = await fetch(url, { headers: mcHeaders() });
    if (res.ok) {
      result.connected = true;
      result.org = "LinkedIn (via Metricool)";
    }
  }

  return result;
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET = connection check or metrics
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ?action=metrics → fetch posts + engagement from LinkedIn API
    if (action === "metrics") {
      if (!LI_ACCESS_TOKEN) {
        return Response.json(
          { error: "LINKEDIN_ACCESS_TOKEN not configured" },
          { status: 500, headers: CORS_HEADERS },
        );
      }
      try {
        const data = await fetchLinkedInMetrics();
        return Response.json(data, { headers: CORS_HEADERS });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
      }
    }

    // Default GET = connection check
    try {
      const status = await checkConnection();
      return Response.json(status, { headers: CORS_HEADERS });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json({ connected: false, error: message }, { headers: CORS_HEADERS });
    }
  }

  if (!METRICOOL_TOKEN || !METRICOOL_USER_ID || !METRICOOL_BLOG_ID) {
    return Response.json(
      { error: "Metricool API not configured for posting." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  // POST = schedule a LinkedIn post via Metricool (publish "now" = schedule 2 min from now)
  try {
    const body = await req.json() as { text: string; imageUrl?: string };
    const { text, imageUrl } = body;

    if (!text) {
      return Response.json(
        { error: "text is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Normalize image if provided
    let mediaIds: string[] = [];
    if (imageUrl) {
      const normalizeUrl = `${METRICOOL_BASE}/actions/normalize/image/url?url=${encodeURIComponent(imageUrl)}&blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;
      const normRes = await fetch(normalizeUrl, { headers: mcHeaders() });
      const normText = await normRes.text();
      if (!normRes.ok) {
        throw new Error(`Image normalize failed (${normRes.status}): ${normText}`);
      }
      let mediaId: string;
      try {
        const d = JSON.parse(normText);
        mediaId = d.mediaId || d.id || String(d);
      } catch {
        mediaId = normText.trim();
      }
      mediaIds = [mediaId];
    }

    // Schedule 5 minutes from now for "publish now"
    const publishDate = new Date(Date.now() + 5 * 60 * 1000);
    const dateTime = publishDate.toISOString().replace(/\.\d{3}Z$/, "");
    const timezone = "UTC";

    const scheduleUrl = `${METRICOOL_BASE}/v2/scheduler/posts?blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;
    const scheduleBody = {
      text,
      providers: [{ network: "LINKEDIN" }],
      publicationDate: { dateTime, timezone },
      autoPublish: true,
      draft: false,
      media: mediaIds,
      mediaAltText: [],
      descendants: [],
      firstCommentText: "",
      shortener: false,
      smartLinkData: { ids: [] },
      linkedinData: {
        documentTitle: "",
        publishImagesAsPDF: false,
        previewIncluded: true,
        type: imageUrl ? "IMAGE" : "NONE",
        poll: null,
      },
      twitterData: { tags: [] },
      facebookData: { type: "IMAGE", title: "", boostPayer: null, boostBeneficiary: null },
      instagramData: { type: "POST", collaborators: [], carouselTags: {}, showReelOnFeed: true },
      pinterestData: { boardId: null, pinTitle: "", pinLink: "", pinNewFormat: false },
      youtubeData: { title: "", type: "VIDEO", privacy: "PUBLIC", tags: [], category: "", madeForKids: false },
      tiktokData: { disableComment: false, disableDuet: false, disableStitch: false, privacyOption: "PUBLIC_TO_EVERYONE" },
      blueskyData: { postLanguages: [] },
    };

    const res = await fetch(scheduleUrl, {
      method: "POST",
      headers: {
        ...mcHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(scheduleBody),
    });

    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(`Schedule failed (${res.status}): ${responseText}`);
    }

    let result: Record<string, unknown> = { published: true };
    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { published: true, raw: responseText };
      }
    }

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
