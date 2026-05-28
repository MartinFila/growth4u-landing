import * as cheerio from "cheerio";
import { cleanText } from "./extract.js";
import { hasBlockedExtension, isInternalPageUrl, normalizeCrawlUrl } from "./security.js";

const routeCache = new Map();

export function looksLikeSpaShell(html, page = {}) {
  const source = String(html || "");
  const bodyText = cleanText(source.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, ""));
  const usefulTextLength = cleanText(page.text || "").length;

  if (/you need to enable javascript|enable javascript to run this app|javascript is required/i.test(source)) {
    return true;
  }

  if (/\b(id|class)=["'][^"']*(?:root|app|__next|nuxt|svelte|ember|angular)[^"']*["']/i.test(source) && usefulTextLength < 500) {
    return true;
  }

  if (/<script\b[^>]+(?:type=["']module["']|src=)/i.test(source) && usefulTextLength < 350 && bodyText.length < 2_500) {
    return true;
  }

  return false;
}

export async function discoverSpaRoutes(html, pageUrl, options = {}) {
  const {
    fetcher,
    rootUrl = pageUrl,
    maxScripts = 5,
    maxRoutes = 40,
    maxScriptBytes = 1_000_000
  } = options;

  if (!fetcher || !html) {
    return [];
  }

  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  const base = pageUrl instanceof URL ? pageUrl : new URL(pageUrl);
  const scripts = extractScriptUrls(html, base, root).slice(0, maxScripts);
  const routes = [];
  const seen = new Set();

  const addRoute = (candidate) => {
    const normalized = normalizeRouteCandidate(candidate, base, root);
    if (!normalized || seen.has(normalized.href)) {
      return;
    }
    seen.add(normalized.href);
    routes.push(normalized.href);
  };

  for (const scriptUrl of scripts) {
    const cacheKey = scriptUrl.href;
    let candidates = routeCache.get(cacheKey);

    if (!candidates) {
      try {
        const resource = await fetcher(scriptUrl, {
          maxBytes: maxScriptBytes,
          timeoutMs: 8_000,
          accept: "application/javascript,text/javascript,text/plain,*/*;q=0.5"
        });
        candidates = extractRouteCandidates(resource.text);
      } catch {
        candidates = [];
      }
      routeCache.set(cacheKey, candidates);
    }

    for (const candidate of candidates) {
      addRoute(candidate);
      if (routes.length >= maxRoutes) {
        return routes;
      }
    }
  }

  return routes;
}

function extractScriptUrls(html, baseUrl, rootUrl) {
  const $ = cheerio.load(html);
  const urls = [];
  const seen = new Set();

  $("script[src], link[rel='modulepreload'][href], link[rel='preload'][as='script'][href]").each((_, element) => {
    const raw = $(element).attr("src") || $(element).attr("href");
    const normalized = normalizeCrawlUrl(raw, baseUrl);
    if (!normalized || seen.has(normalized.href) || !sameOrigin(normalized, rootUrl)) {
      return;
    }

    if (!/\.(?:js|mjs|cjs)(?:$|\?)/i.test(normalized.pathname)) {
      return;
    }

    seen.add(normalized.href);
    urls.push(normalized);
  });

  return urls;
}

function extractRouteCandidates(scriptText) {
  const source = String(scriptText || "");
  const candidates = new Set();
  const quotedPathPattern = /["'`]((?:\/[a-z0-9][a-z0-9._~!$&'()*+,;=:@/%-]{0,180})|(?:https?:\/\/[^"'`\s<>{}|\\^]{5,220}))["'`]/gi;

  for (const match of source.matchAll(quotedPathPattern)) {
    const value = match[1];
    if (isLikelyRoute(value)) {
      candidates.add(value);
    }
  }

  return [...candidates];
}

function normalizeRouteCandidate(candidate, baseUrl, rootUrl) {
  if (!candidate || candidate.startsWith("//")) {
    return null;
  }

  if (/[{}[\]\\^`]/.test(candidate) || /(?:^|\/):\w+/.test(candidate) || candidate.includes("*")) {
    return null;
  }

  const normalized = normalizeCrawlUrl(candidate, baseUrl);
  if (!normalized || !isInternalPageUrl(normalized, rootUrl)) {
    return null;
  }

  if (hasBlockedExtension(normalized.pathname) || isLowValueRoute(normalized.pathname)) {
    return null;
  }

  return normalized;
}

function isLikelyRoute(value) {
  if (!value || value.length > 220 || value.includes("\\") || value.includes("{")) {
    return false;
  }

  if (/^\/(?:assets?|static|_next|build|dist|images?|img|fonts?|css|js|api|cdn-cgi)\//i.test(value)) {
    return false;
  }

  if (/\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mp4|png|svg|webp|woff2?)($|\?)/i.test(value)) {
    return false;
  }

  return /^https?:\/\//i.test(value) || /^\/[a-z0-9][a-z0-9._~!$&'()*+,;=:@/%-]*$/i.test(value);
}

function isLowValueRoute(pathname) {
  return /(?:^|\/)(?:login|signin|signup|register|admin|dashboard|account|cart|checkout|privacy|privacidad|terms|legal|cookies|search|buscar)(?:\/|$)/i.test(
    pathname
  );
}

function sameOrigin(candidate, rootUrl) {
  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  return candidate.protocol === root.protocol && candidate.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "");
}
