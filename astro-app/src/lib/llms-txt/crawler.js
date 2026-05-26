import { discoverSitemapUrls } from "./sitemap.js";
import { extractPage } from "./extract.js";
import { fetchTextResource } from "./fetcher.js";
import { isInternalPageUrl, normalizeCrawlUrl, normalizeInputUrl } from "./security.js";
import { generateLlmsFiles } from "./generator.js";
import { loadRobotsPolicy } from "./robots.js";

export async function generateFromWebsite(inputUrl, options = {}) {
  const crawlResult = await crawlSite(inputUrl, options);
  return generateLlmsFiles(crawlResult);
}

export async function crawlSite(inputUrl, options = {}) {
  const maxPages = clampNumber(options.maxPages ?? 40, 1, 100);
  const startUrl = normalizeInputUrl(inputUrl);
  const fetcher = options.fetcher || fetchTextResource;
  const queue = [];
  const queued = new Set();
  const pages = [];
  const errors = [];
  const robotsPolicy = await loadRobotsPolicy(startUrl, { fetcher });

  const addToQueue = (candidate) => {
    const normalized = normalizeCrawlUrl(candidate, startUrl);
    if (!normalized || queued.has(normalized.href) || !isInternalPageUrl(normalized, startUrl)) {
      return;
    }

    if (!robotsPolicy.isAllowed(normalized)) {
      return;
    }

    queued.add(normalized.href);
    queue.push({
      url: normalized.href,
      score: scoreCandidateUrl(normalized, startUrl)
    });
    queue.sort((a, b) => b.score - a.score);
  };

  addToQueue(startUrl);

  const sitemapUrls = await discoverSitemapUrls(startUrl, { maxUrls: maxPages * 3, fetcher }).catch(() => []);
  for (const sitemapUrl of sitemapUrls) {
    addToQueue(sitemapUrl);
  }

  while (queue.length && pages.length < maxPages) {
    const nextUrl = queue.shift().url;

    try {
      const resource = await fetcher(nextUrl);
      if (!isSupportedContent(resource.contentType, resource.url)) {
        continue;
      }

      const page = extractPage(resource.text, resource.url, resource.contentType);
      if (!page.text && !page.markdown) {
        continue;
      }

      pages.push(page);

      for (const link of page.links) {
        if (queue.length + queued.size > maxPages * 8) {
          break;
        }
        addToQueue(link);
      }
    } catch (error) {
      errors.push({
        url: nextUrl,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!pages.length) {
    const reason = errors[0]?.message || "No readable HTML pages were found.";
    throw new Error(`Could not generate files for this site. ${reason}`);
  }

  return {
    startUrl: startUrl.href,
    site: deriveSiteInfo(pages, startUrl),
    pages: dedupePages(pages).slice(0, maxPages),
    errors
  };
}

function deriveSiteInfo(pages, startUrl) {
  const home = pages.find((page) => new URL(page.url).pathname === "/") || pages[0];
  const hostname = startUrl.hostname.replace(/^www\./, "");

  return {
    title: extractSiteTitle(home?.title || hostname, hostname),
    description: home?.description || `Important pages discovered for ${hostname}.`
  };
}

function extractSiteTitle(rawTitle, fallback) {
  const title = String(rawTitle || "").trim();
  if (!title) {
    return fallback;
  }

  const separators = [" | ", " - ", " -- ", " :: ", " / "];
  for (const separator of separators) {
    if (title.includes(separator)) {
      const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);
      const shortest = [...parts].sort((a, b) => a.length - b.length)[0];
      if (shortest && shortest.length <= 48) {
        return shortest;
      }
    }
  }

  return title.length > 80 ? fallback : title;
}

function dedupePages(pages) {
  const seen = new Set();
  const unique = [];

  for (const page of pages) {
    const normalized = normalizeCrawlUrl(page.url);
    if (!normalized || seen.has(normalized.href)) {
      continue;
    }

    seen.add(normalized.href);
    unique.push({ ...page, url: normalized.href });
  }

  return unique;
}

function isSupportedContent(contentType, resourceUrl) {
  const type = contentType.toLowerCase();
  const pathname = new URL(resourceUrl).pathname.toLowerCase();

  return (
    type.includes("text/html") ||
    type.includes("application/xhtml") ||
    type.includes("text/plain") ||
    type.includes("text/markdown") ||
    pathname.endsWith(".html") ||
    pathname.endsWith(".htm") ||
    pathname.endsWith(".md") ||
    !pathname.includes(".")
  );
}

function scoreCandidateUrl(candidateUrl, startUrl) {
  const url = candidateUrl instanceof URL ? candidateUrl : new URL(candidateUrl);
  const root = startUrl instanceof URL ? startUrl : new URL(startUrl);
  const path = decodeURIComponent(url.pathname.toLowerCase());
  const search = url.search.toLowerCase();
  const segments = path.split("/").filter(Boolean);
  const joined = `${path} ${search}`;
  let score = 100 - segments.length * 6;

  if (path === "/" || url.href === root.href) {
    score += 120;
  }

  if (/(servicios?|services?|products?|producto|features?|pricing|precios?|solutions?|soluciones?|platform|plataforma)/.test(joined)) {
    score += 80;
  }

  if (/(docs?|documentation|documentacion|guides?|guias?|learn|recursos?|resources?|playbooks?|frameworks?|templates?|plantillas?|tools?|herramientas?)/.test(joined)) {
    score += 70;
  }

  if (/(case-stud|success-stor|casos?-de-exito|customers?|clientes?|resultados?)/.test(joined)) {
    score += 65;
  }

  if (/(about|company|empresa|equipo|team|contact|contacto|security|trust|confianza)/.test(joined)) {
    score += 40;
  }

  if (/(blog|articles?|articulos?|news|insights?)/.test(joined)) {
    score += 20;
  }

  if (/(ai|ia|seo|geo|llm|chatgpt|perplexity|growth|marketing|fintech|trust)/.test(joined)) {
    score += 15;
  }

  if (/(categoria|category|tag|author|archivo|archive|page\/\d+|search|buscar|feed|rss|login|signin|signup|admin|cart|checkout|privacy|privacidad|terms|legal|cookies|404)/.test(joined)) {
    score -= 90;
  }

  if (search) {
    score -= 25;
  }

  return score;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}
