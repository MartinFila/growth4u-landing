import { XMLParser } from "fast-xml-parser";
import { fetchTextResource } from "./fetcher.js";
import { extractRobotsSitemapsForRoot } from "./robots.js";
import { hasBlockedExtension, isInternalPageUrl, normalizeCrawlUrl } from "./security.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true
});

export async function discoverSitemapUrls(rootUrl, options = {}) {
  const { maxUrls = 200, fetcher = fetchTextResource } = options;
  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  const sitemapQueue = new Set([new URL("/sitemap.xml", root).href]);
  const seenSitemaps = new Set();
  const discovered = [];
  const seenUrls = new Set();

  try {
    const robots = await fetcher(new URL("/robots.txt", root), {
      maxBytes: 400_000,
      accept: "text/plain,*/*;q=0.5"
    });
    for (const sitemap of extractRobotsSitemapsForRoot(robots.text, root)) {
      sitemapQueue.add(sitemap);
    }
  } catch {
    // robots.txt is optional.
  }

  while (sitemapQueue.size && discovered.length < maxUrls) {
    const sitemapUrl = sitemapQueue.values().next().value;
    sitemapQueue.delete(sitemapUrl);

    if (seenSitemaps.has(sitemapUrl)) {
      continue;
    }
    seenSitemaps.add(sitemapUrl);

    try {
      const resource = await fetcher(sitemapUrl, {
        maxBytes: 4_000_000,
        accept: "application/xml,text/xml,text/plain,*/*;q=0.5"
      });

      const parsed = parseSitemap(resource.text);

      for (const nestedSitemap of parsed.sitemaps) {
        if (!seenSitemaps.has(nestedSitemap) && sitemapQueue.size < 50) {
          sitemapQueue.add(nestedSitemap);
        }
      }

      for (const loc of parsed.urls) {
        const normalized = normalizeCrawlUrl(loc, root);
        if (!normalized || seenUrls.has(normalized.href)) {
          continue;
        }

        if (!isInternalPageUrl(normalized, root) || hasBlockedExtension(normalized.pathname)) {
          continue;
        }

        seenUrls.add(normalized.href);
        discovered.push(normalized.href);

        if (discovered.length >= maxUrls) {
          break;
        }
      }
    } catch {
      // Some sites advertise stale sitemap URLs. Keep crawling with what works.
    }
  }

  return discovered;
}

export function parseSitemap(xml) {
  const data = parser.parse(xml);
  const urls = [];
  const sitemaps = [];

  for (const entry of toArray(data?.urlset?.url)) {
    if (entry?.loc) {
      urls.push(String(entry.loc));
    }
  }

  for (const entry of toArray(data?.sitemapindex?.sitemap)) {
    if (entry?.loc) {
      sitemaps.push(String(entry.loc));
    }
  }

  return { urls, sitemaps };
}

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
