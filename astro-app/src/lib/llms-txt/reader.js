import { cleanInline, cleanText, summarizeDescription } from "./extract.js";
import { assertPublicUrl, isInternalPageUrl, normalizeCrawlUrl } from "./security.js";

const DEFAULT_READER_BASE_URL = "https://r.jina.ai/http://";

export async function fetchRenderedPage(pageUrl, options = {}) {
  const {
    fetcher,
    rootUrl,
    readerBaseUrl = process.env.LLMS_TXT_READER_BASE_URL || DEFAULT_READER_BASE_URL,
    maxBytes = 1_500_000,
    timeoutMs = 14_000
  } = options;

  if (!fetcher) {
    throw new Error("A fetcher is required for rendered fallback.");
  }

  const target = pageUrl instanceof URL ? new URL(pageUrl.href) : new URL(pageUrl);
  await assertPublicUrl(target);

  const readerUrl = buildReaderUrl(target, readerBaseUrl);
  const resource = await fetcher(readerUrl, {
    maxBytes,
    timeoutMs,
    accept: "text/plain,text/markdown,*/*;q=0.5"
  });

  return parseReaderResponse(resource.text, target, rootUrl || target);
}

export function parseReaderResponse(responseText, pageUrl, rootUrl) {
  const url = pageUrl instanceof URL ? pageUrl : new URL(pageUrl);
  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  const text = String(responseText || "").replace(/\r/g, "");
  const title = firstLineValue(text, "Title") || titleFromUrl(url);
  const source = firstLineValue(text, "URL Source") || url.href;
  const markdown = extractMarkdownContent(text);
  const plainText = cleanText(stripMarkdown(markdown));
  const headings = extractHeadings(markdown);

  return {
    url: normalizeCrawlUrl(source, url)?.href || url.href,
    title: cleanInline(title),
    description: summarizeDescription(firstContentParagraph(markdown) || plainText),
    headings,
    markdown: cleanReaderMarkdown(markdown),
    text: plainText,
    links: extractMarkdownLinks(markdown, url, root),
    source: "rendered"
  };
}

export function buildReaderUrl(targetUrl, readerBaseUrl = DEFAULT_READER_BASE_URL) {
  const base = String(readerBaseUrl || DEFAULT_READER_BASE_URL).replace(/\/?$/, "/");
  const url = targetUrl instanceof URL ? targetUrl.href : String(targetUrl);
  return `${base}${url}`;
}

function firstLineValue(text, label) {
  const match = text.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "im"));
  return cleanInline(match?.[1] || "");
}

function extractMarkdownContent(text) {
  const marker = "Markdown Content:";
  const index = text.indexOf(marker);
  if (index === -1) {
    return cleanReaderMarkdown(text);
  }

  return cleanReaderMarkdown(text.slice(index + marker.length));
}

function cleanReaderMarkdown(value) {
  return String(value || "")
    .replace(/^\s*Warning:\s+.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]+/g, " ");
}

function extractHeadings(markdown) {
  return [...String(markdown || "").matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((match) => cleanInline(match[1]))
    .filter(Boolean)
    .slice(0, 10);
}

function firstContentParagraph(markdown) {
  for (const block of String(markdown || "").split(/\n{2,}/)) {
    const cleaned = cleanText(stripMarkdown(block));
    if (cleaned.length >= 40 && !/^image\s+\d+/i.test(cleaned)) {
      return cleaned;
    }
  }
  return "";
}

function extractMarkdownLinks(markdown, baseUrl, rootUrl) {
  const links = [];
  const seen = new Set();
  const add = (candidate) => {
    const normalized = normalizeCrawlUrl(candidate, baseUrl);
    if (!normalized || seen.has(normalized.href) || !isInternalPageUrl(normalized, rootUrl)) {
      return;
    }
    seen.add(normalized.href);
    links.push(normalized.href);
  };

  for (const match of String(markdown || "").matchAll(/\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    add(match[1]);
  }

  for (const match of String(markdown || "").matchAll(/https?:\/\/[^\s)>"']+/g)) {
    add(match[0]);
  }

  return links;
}

function titleFromUrl(url) {
  if (url.pathname === "/" || !url.pathname) {
    return url.hostname.replace(/^www\./, "");
  }

  return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || url.hostname)
    .replace(/[-_]+/g, " ")
    .replace(/\.\w+$/, "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
