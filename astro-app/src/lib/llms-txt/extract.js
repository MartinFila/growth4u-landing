import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { normalizeCrawlUrl } from "./security.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

turndown.remove(["script", "style", "noscript", "iframe", "canvas", "svg"]);

export function extractPage(resourceText, pageUrl, contentType = "text/html") {
  const url = new URL(pageUrl);

  if (isPlainTextContent(contentType)) {
    const text = cleanText(resourceText);
    return {
      url: url.href,
      title: titleFromUrl(url),
      description: firstSentence(text),
      headings: [],
      markdown: text,
      text,
      links: []
    };
  }

  const $ = cheerio.load(resourceText);
  const links = extractLinks($, url);

  $("script, style, noscript, iframe, canvas, svg, form").remove();
  $("header, footer, nav, aside, [aria-hidden='true']").remove();

  const title = firstNonEmpty(
    $("meta[property='og:title']").attr("content"),
    $("meta[name='twitter:title']").attr("content"),
    $("title").first().text(),
    $("h1").first().text(),
    titleFromUrl(url)
  );

  const contentRoot = firstExistingSelection($, ["main", "article", "[role='main']", ".content", "#content"]) || $("body");
  const headings = contentRoot
    .find("h1, h2, h3")
    .map((_, element) => cleanInline($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 10);

  const rawDescription = firstNonEmpty(
    $("meta[name='description']").attr("content"),
    $("meta[property='og:description']").attr("content"),
    $("meta[name='twitter:description']").attr("content"),
    contentRoot.find("p").first().text(),
    headings[0]
  );

  let markdown = turndown.turndown(contentRoot.html() || $("body").html() || "");
  markdown = cleanMarkdown(markdown);

  const text = cleanText(contentRoot.text());

  return {
    url: url.href,
    title: cleanInline(title),
    description: summarizeDescription(rawDescription || firstSentence(text)),
    headings,
    markdown,
    text,
    links
  };
}

export function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function cleanInline(value) {
  return cleanText(value).replace(/\s*[|:]\s*$/, "");
}

export function summarizeDescription(value, maxLength = 180) {
  const text = cleanInline(value);
  if (text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, Math.max(80, lastSpace)).trim()}...`;
}

function cleanMarkdown(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*Skip to content\s*$/gim, "")
    .trim();
}

function extractLinks($, baseUrl) {
  const links = [];
  const seen = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || /^(?:mailto|tel|javascript):/i.test(href)) {
      return;
    }

    const normalized = normalizeCrawlUrl(href, baseUrl);
    if (!normalized || seen.has(normalized.href)) {
      return;
    }

    seen.add(normalized.href);
    links.push(normalized.href);
  });

  return links;
}

function firstExistingSelection($, selectors) {
  for (const selector of selectors) {
    const selection = $(selector).first();
    if (selection.length && cleanText(selection.text()).length > 80) {
      return selection;
    }
  }

  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanInline(value);
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function firstSentence(value) {
  const text = cleanInline(value);
  const match = text.match(/^(.{40,220}?[.!?])\s/);
  return summarizeDescription(match ? match[1] : text);
}

function titleFromUrl(url) {
  if (url.pathname === "/" || !url.pathname) {
    return url.hostname.replace(/^www\./, "");
  }

  const segment = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || url.hostname);
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\.\w+$/, "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPlainTextContent(contentType) {
  const type = contentType.toLowerCase();
  return type.includes("text/plain") || type.includes("text/markdown");
}
