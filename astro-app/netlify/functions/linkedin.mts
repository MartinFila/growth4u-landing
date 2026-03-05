import type { Context } from "@netlify/functions";

const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const LI_HEADERS = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  "LinkedIn-Version": "202401",
  "X-Restli-Protocol-Version": "2.0.0",
};

interface PostRequest {
  text: string;
  imageUrl: string;
}

// Get the authenticated user's person URN
async function getPersonUrn(): Promise<string> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const data = await res.json();
  if (!res.ok || !data.sub) {
    throw new Error(`Failed to get user info (${res.status}): ${JSON.stringify(data)}`);
  }
  return `urn:li:person:${data.sub}`;
}

// Step 1: Register image upload with LinkedIn
async function initializeImageUpload(authorUrn: string): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: LI_HEADERS,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Initialize upload failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return {
    uploadUrl: data.value.uploadUrl,
    imageUrn: data.value.image,
  };
}

// Step 2: Upload image binary to LinkedIn
async function uploadImageBinary(uploadUrl: string, imageUrl: string): Promise<void> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download image from ${imageUrl}`);
  }
  const imageBuffer = await imageRes.arrayBuffer();

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image upload failed (${res.status}): ${text}`);
  }
}

// Step 3: Create post with image
async function createPost(authorUrn: string, text: string, imageUrn: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: LI_HEADERS,
    body: JSON.stringify({
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          title: "Growth4U",
          id: imageUrn,
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (res.status === 201) {
    const postId = res.headers.get("x-restli-id") || "created";
    return { published: true, postId };
  }

  const responseText = await res.text();
  throw new Error(`Create post failed (${res.status}): ${responseText}`);
}

// Create text-only post
async function createTextPost(authorUrn: string, text: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: LI_HEADERS,
    body: JSON.stringify({
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (res.status === 201) {
    const postId = res.headers.get("x-restli-id") || "created";
    return { published: true, postId };
  }

  const responseText = await res.text();
  throw new Error(`Create post failed (${res.status}): ${responseText}`);
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!ACCESS_TOKEN) {
    return Response.json(
      { error: "LinkedIn API not configured. Set LINKEDIN_ACCESS_TOKEN." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // GET = check connection status
  if (req.method === "GET") {
    try {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
      if (res.ok) {
        const data = await res.json();
        return Response.json(
          { connected: true, org: data.name || data.email || "LinkedIn" },
          { headers: CORS_HEADERS },
        );
      }
      return Response.json(
        { connected: false, error: `Status ${res.status}` },
        { headers: CORS_HEADERS },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json({ connected: false, error: message }, { headers: CORS_HEADERS });
    }
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json()) as PostRequest;
    const { text, imageUrl } = body;

    if (!text) {
      return Response.json(
        { error: "text is required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Get the authenticated user's URN
    const authorUrn = await getPersonUrn();

    let result: Record<string, unknown>;

    if (imageUrl) {
      const { uploadUrl, imageUrn } = await initializeImageUpload(authorUrn);
      await uploadImageBinary(uploadUrl, imageUrl);
      result = await createPost(authorUrn, text, imageUrn);
    } else {
      result = await createTextPost(authorUrn, text);
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
