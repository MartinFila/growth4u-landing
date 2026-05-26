import { assertPublicUrl, normalizeCrawlUrl } from "./security.js";

const USER_AGENT = "llms-txt-generator/1.0 (+https://github.com/MartinFila/llm-txt-generator)";

export async function fetchTextResource(inputUrl, options = {}) {
  const {
    maxBytes = 2_500_000,
    timeoutMs = 12_000,
    maxRedirects = 5,
    accept = "text/html,application/xhtml+xml,application/xml,text/xml,text/plain,text/markdown;q=0.9,*/*;q=0.5"
  } = options;

  let current = inputUrl instanceof URL ? new URL(inputUrl.href) : new URL(inputUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicUrl(current);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error("Request timed out."));
    }, timeoutMs);

    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect from ${current.href} did not include a Location header.`);
        }

        const next = normalizeCrawlUrl(location, current);
        if (!next) {
          throw new Error(`Redirect from ${current.href} points to an unsupported URL.`);
        }

        current = next;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}.`);
      }

      return {
        url: current.href,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        text: await readLimitedText(response, maxBytes)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Too many redirects while fetching ${inputUrl}.`);
}

async function readLimitedText(response, maxBytes) {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("Response body is too large.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response body is too large.");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}
