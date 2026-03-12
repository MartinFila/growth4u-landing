import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Helpers ──────────────────────────────────────────────────

function stream(encoder: TextEncoder, controller: ReadableStreamDefaultController, type: string, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data as object })}\n\n`));
}

/** Extract text from Anthropic response content blocks */
function extractText(content: Array<{ type: string; text?: string }>): string {
  const block = content.find(b => b.type === "text");
  return block?.text || "";
}

/** Extract JSON from LLM response (handles ```json fences) */
function extractJson(raw: string): string {
  const m = raw.match(/```json\s*([\s\S]*?)```/);
  return m ? m[1].trim() : raw.trim();
}

/** Check if hostname is a private/internal IP */
function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".internal")) return true;
  if (hostname.startsWith("[") || hostname === "::1") return true;
  if (hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("169.254.")) return true;
  // 172.16.0.0/12 = 172.16.* through 172.31.*
  const parts = hostname.split(".");
  if (parts[0] === "172" && parts.length === 4) {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

async function serperSearch(query: string, num = 10): Promise<{ organic: Array<Record<string, string>> }> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { organic: [] };
  return res.json();
}

async function serperNews(query: string, num = 10): Promise<{ news: Array<Record<string, string>> }> {
  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { news: [] };
  return res.json();
}

async function crawl(url: string): Promise<{ text: string; pages: string[]; title: string; htmlPages: string[] }> {
  const pages: string[] = [];
  const htmlPages: string[] = [];
  let allText = "";
  let title = "";

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const html = await resp.text();
    htmlPages.push(html);

    // Extract <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    allText = text.slice(0, 8000);
    pages.push(resp.url);

    // Extract subpage links
    const linkRegex = /href=["']([^"']+)["']/gi;
    const origin = new URL(url).origin;
    const subpages: string[] = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (href.startsWith("/") && !href.startsWith("//")) {
        const full = origin + href;
        if (!subpages.includes(full) && full !== url && !full.includes("#")) {
          subpages.push(full);
        }
      }
    }

    for (const sub of subpages.slice(0, 3)) {
      try {
        const subResp = await fetch(sub, {
          headers: { "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(8_000),
        });
        const subHtml = await subResp.text();
        htmlPages.push(subHtml);
        const subText = subHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (subText.length > 100) {
          allText += "\n\n---\n\n" + subText.slice(0, 2000);
          pages.push(sub);
        }
      } catch (e) { console.warn("Subpage crawl failed:", sub, e); }
    }
  } catch (e) {
    console.warn("Crawl failed, using Serper fallback:", e);
    try {
      const results = await serperSearch(`site:${new URL(url).hostname}`, 10);
      allText = (results.organic || []).map(r => `${r.title}: ${r.snippet}`).join("\n").slice(0, 8000);
      pages.push(url + " (via serper fallback)");
    } catch (e2) { console.warn("Serper fallback also failed:", e2); }
  }

  return { text: allText.slice(0, 12000), pages, title, htmlPages };
}

// ── SEO Technical Audit (adapted from SanchoCMO seo-audit skill) ──

interface SeoSignals {
  // Meta tags
  title: { present: boolean; content: string; length: number };
  meta_description: { present: boolean; content: string; length: number };
  canonical: { present: boolean; url: string };
  meta_robots: { present: boolean; content: string };
  // Open Graph
  og_tags: { title: boolean; description: boolean; image: boolean };
  // Heading structure
  h1: { count: number; contents: string[] };
  h2_count: number;
  // Technical
  https: boolean;
  viewport: boolean;
  lang: string | null;
  schema_types: string[];
  // Images
  images: { total: number; with_alt: number; without_alt: number };
  // Links
  internal_links: number;
  external_links: number;
  // Server-side checks
  robots_txt: { accessible: boolean; content: string; has_sitemap_ref: boolean };
  sitemap: { accessible: boolean; url_count: number; urls: string[] };
  // Analytics & tracking
  analytics: {
    ga4: boolean;
    gtm: boolean;
    meta_pixel: boolean;
    hotjar: boolean;
    clarity: boolean;
    hubspot: boolean;
    intercom: boolean;
    segment: boolean;
    other_trackers: string[];
  };
}

function extractSeoSignals(html: string, url: string): Omit<SeoSignals, "robots_txt" | "sitemap"> {
  const parsedUrl = new URL(url);

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titleContent = titleMatch?.[1]?.trim() || "";

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const descContent = descMatch?.[1]?.trim() || "";

  // Canonical
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);

  // Meta robots
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i);

  // Open Graph
  const ogTitle = /<meta[^>]*property=["']og:title["']/i.test(html);
  const ogDesc = /<meta[^>]*property=["']og:description["']/i.test(html);
  const ogImage = /<meta[^>]*property=["']og:image["']/i.test(html);

  // Headings
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Contents = h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim());
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;

  // Schema.org / JSON-LD types
  const schemaTypes: string[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let schemaMatch;
  while ((schemaMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(schemaMatch[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"]) {
          const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
          schemaTypes.push(...types);
        }
      }
    } catch (e) { console.warn("Invalid JSON-LD:", e); }
  }

  // Images
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const withAlt = imgTags.filter(img => /alt=["'][^"']+["']/i.test(img)).length;

  // Links
  const linkMatches = html.match(/href=["']([^"']+)["']/gi) || [];
  const origin = parsedUrl.origin;
  let internal = 0, external = 0;
  for (const l of linkMatches) {
    const href = l.match(/href=["']([^"']+)["']/i)?.[1] || "";
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/") || href.startsWith(origin)) {
      internal++;
    } else if (href.startsWith("http")) {
      external++;
    }
  }

  // Viewport
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

  // Lang
  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);

  // Analytics & tracking detection (from SanchoCMO analytics-tracking skill)
  const hasGA4 = /gtag\(|G-[A-Z0-9]+|googletagmanager\.com\/gtag/i.test(html);
  const hasGTM = /GTM-[A-Z0-9]+|googletagmanager\.com\/gtm/i.test(html);
  const hasMetaPixel = /fbq\(|facebook\.com\/tr|connect\.facebook\.net\/en_US\/fbevents/i.test(html);
  const hasHotjar = /hotjar\.com|hj\(|_hjSettings/i.test(html);
  const hasClarity = /clarity\.ms|microsoft\.com\/clarity/i.test(html);
  const hasHubspot = /js\.hs-scripts\.com|hs-banner\.com|hubspot\.com/i.test(html);
  const hasIntercom = /intercom\.io|intercomSettings|Intercom\(/i.test(html);
  const hasSegment = /cdn\.segment\.com|analytics\.js|segment\.io/i.test(html);

  const otherTrackers: string[] = [];
  if (/plausible\.io/i.test(html)) otherTrackers.push("Plausible");
  if (/fathom\.js|usefathom\.com/i.test(html)) otherTrackers.push("Fathom");
  if (/mixpanel\.com|mixpanel\.init/i.test(html)) otherTrackers.push("Mixpanel");
  if (/amplitude\.com|amplitude\.init/i.test(html)) otherTrackers.push("Amplitude");
  if (/heap\.io|heap\.load/i.test(html)) otherTrackers.push("Heap");
  if (/posthog\.com|posthog\.init/i.test(html)) otherTrackers.push("PostHog");
  if (/crisp\.chat/i.test(html)) otherTrackers.push("Crisp");
  if (/drift\.com|driftt\.com/i.test(html)) otherTrackers.push("Drift");
  if (/tawk\.to/i.test(html)) otherTrackers.push("Tawk.to");
  if (/linkedin\.com\/insight|snap\.licdn\.com/i.test(html)) otherTrackers.push("LinkedIn Insight");
  if (/ads\.twitter\.com|static\.ads-twitter\.com/i.test(html)) otherTrackers.push("Twitter Ads");
  if (/googleads\.g\.doubleclick\.net|google-analytics\.com|adservice\.google/i.test(html)) otherTrackers.push("Google Ads");

  return {
    title: { present: !!titleContent, content: titleContent, length: titleContent.length },
    meta_description: { present: !!descContent, content: descContent, length: descContent.length },
    canonical: { present: !!canonicalMatch, url: canonicalMatch?.[1] || "" },
    meta_robots: { present: !!robotsMatch, content: robotsMatch?.[1] || "" },
    og_tags: { title: ogTitle, description: ogDesc, image: ogImage },
    h1: { count: h1Contents.length, contents: h1Contents },
    h2_count: h2Count,
    https: parsedUrl.protocol === "https:",
    viewport: hasViewport,
    lang: langMatch?.[1] || null,
    schema_types: schemaTypes,
    images: { total: imgTags.length, with_alt: withAlt, without_alt: imgTags.length - withAlt },
    internal_links: internal,
    external_links: external,
    analytics: {
      ga4: hasGA4,
      gtm: hasGTM,
      meta_pixel: hasMetaPixel,
      hotjar: hasHotjar,
      clarity: hasClarity,
      hubspot: hasHubspot,
      intercom: hasIntercom,
      segment: hasSegment,
      other_trackers: otherTrackers,
    },
  };
}

async function checkRobotsSitemap(origin: string): Promise<{ robots_txt: SeoSignals["robots_txt"]; sitemap: SeoSignals["sitemap"] }> {
  const results = {
    robots_txt: { accessible: false, content: "", has_sitemap_ref: false },
    sitemap: { accessible: false, url_count: 0, urls: [] as string[] },
  };

  // Check robots.txt
  try {
    const robotsResp = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5_000) });
    if (robotsResp.ok) {
      const content = await robotsResp.text();
      if (content.length < 50_000 && !content.includes("<!DOCTYPE") && !content.includes("<html")) {
        results.robots_txt = {
          accessible: true,
          content: content.slice(0, 2000),
          has_sitemap_ref: /sitemap/i.test(content),
        };
      }
    }
  } catch { /* timeout or network error */ }

  // Check sitemap.xml
  try {
    const sitemapResp = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5_000) });
    if (sitemapResp.ok) {
      const content = await sitemapResp.text();
      if (content.includes("<urlset") || content.includes("<sitemapindex")) {
        const urlMatches = content.match(/<loc>([^<]+)<\/loc>/gi) || [];
        const urls = urlMatches.map(m => m.replace(/<\/?loc>/gi, "")).slice(0, 50);
        results.sitemap = {
          accessible: true,
          url_count: urlMatches.length,
          urls,
        };
      }
    }
  } catch { /* timeout or network error */ }

  return results;
}

// ── Social Profile Extraction (adapted from SanchoCMO smart-discovery) ──

type SocialPlatform = "linkedin" | "instagram" | "facebook" | "twitter" | "youtube" | "tiktok";

interface DiscoveredProfile {
  platform: SocialPlatform;
  url: string;
  handle: string;
  confidence: "high" | "medium";
}

const SOCIAL_PATTERNS: Array<{
  platform: SocialPlatform;
  patterns: RegExp[];
  handleExtractor: (url: string) => string;
}> = [
  {
    platform: "linkedin",
    patterns: [/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+\/?/g],
    handleExtractor: (url) => url.match(/linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/)?.[1] || "",
  },
  {
    platform: "instagram",
    patterns: [/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?/g],
    handleExtractor: (url) => url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/)?.[1] || "",
  },
  {
    platform: "facebook",
    patterns: [/https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?/g],
    handleExtractor: (url) => url.match(/facebook\.com\/([a-zA-Z0-9._-]+)/)?.[1] || "",
  },
  {
    platform: "twitter",
    patterns: [/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/?/g],
    handleExtractor: (url) => url.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/)?.[1] || "",
  },
  {
    platform: "youtube",
    patterns: [/https?:\/\/(?:www\.)?youtube\.com\/(?:@[a-zA-Z0-9_-]+|channel\/[a-zA-Z0-9_-]+|c\/[a-zA-Z0-9_-]+)\/?/g],
    handleExtractor: (url) => {
      const m = url.match(/youtube\.com\/(?:@([a-zA-Z0-9_-]+)|channel\/([a-zA-Z0-9_-]+)|c\/([a-zA-Z0-9_-]+))/);
      return m?.[1] || m?.[2] || m?.[3] || "";
    },
  },
  {
    platform: "tiktok",
    patterns: [/https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+\/?/g],
    handleExtractor: (url) => url.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/)?.[1] || "",
  },
];

const EXCLUDED_HANDLES = new Set([
  "share", "sharer", "intent", "hashtag", "home", "watch", "results",
  "login", "signup", "about", "help", "settings", "explore", "trending",
  "channel", "user", "p", "reel", "stories", "direct",
]);

function extractSocialFromHtml(html: string, seen: Set<SocialPlatform>): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = [];
  for (const config of SOCIAL_PATTERNS) {
    if (seen.has(config.platform)) continue;
    for (const pattern of config.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[0].replace(/\/$/, "");
        const handle = config.handleExtractor(url);
        if (handle && !EXCLUDED_HANDLES.has(handle.toLowerCase())) {
          seen.add(config.platform);
          profiles.push({ platform: config.platform, url, handle, confidence: "high" });
          break;
        }
      }
    }
  }
  return profiles;
}

function extractSocialFromJsonLd(html: string, seen: Set<SocialPlatform>): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const sameAs = item.sameAs || [];
        const urls = Array.isArray(sameAs) ? sameAs : [sameAs];
        for (const url of urls) {
          if (typeof url !== "string") continue;
          for (const config of SOCIAL_PATTERNS) {
            if (seen.has(config.platform)) continue;
            for (const p of config.patterns) {
              p.lastIndex = 0;
              if (p.test(url)) {
                const handle = config.handleExtractor(url);
                if (handle && !EXCLUDED_HANDLES.has(handle.toLowerCase())) {
                  seen.add(config.platform);
                  profiles.push({ platform: config.platform, url: url.replace(/\/$/, ""), handle, confidence: "high" });
                }
              }
            }
          }
        }
      }
    } catch (e) { console.warn("Invalid JSON-LD:", e); }
  }
  return profiles;
}

/** Extract all social profiles from multiple HTML pages */
function discoverSocialProfiles(htmlPages: string[]): DiscoveredProfile[] {
  const seen = new Set<SocialPlatform>();
  const profiles: DiscoveredProfile[] = [];
  for (const html of htmlPages) {
    profiles.push(...extractSocialFromHtml(html, seen));
    profiles.push(...extractSocialFromJsonLd(html, seen));
  }
  return profiles;
}

// ── Analysis Prompt ──────────────────────────────────────────

function buildPrompt(url: string, brandName: string, content: string, serpData: string, geoData: string, socialData: string, sectorInfo: string, seoData?: string) {
  return `Eres un analista experto en confianza digital del Trust Engine de Growth4U. Analiza esta marca y genera un Trust Score Report.

## URL analizada: ${url}
## Marca: ${brandName}
## Sector/ICP: ${sectorInfo}

## Contenido extraído de la web:
${content}

## Datos de SERP (presencia en Google):
${serpData}

## Presencia en redes sociales y plataformas:
${socialData}

## Datos de GEO (presencia en LLMs):
${geoData}
${seoData ? `\n## Auditoría SEO técnica:\n${seoData}` : ""}

## Instrucciones

Evalúa la marca en estos 6 pilares del Trust Engine (0-100 cada uno):

### 1. Borrowed Trust (peso 20%)
Confianza prestada por terceros. ¿Quién habla de esta marca?
- Menciones en medios y prensa (usa media_mentions)
- Presencia en rankings, comparativas, listas del sector (usa category_search)
- Asociación con marcas/personas conocidas

### 2. SERP Trust (peso 20%)
¿Qué encuentra alguien que googlea esta marca?
- ¿Dominan la página 1 con su dominio? (usa stats.own_domain_in_top10)
- ¿Aparecen en búsquedas de categoría? (usa category_search)
- ¿Sentimiento positivo, neutro o negativo?
- ¿Hay review sites, foros, quejas?

### 3. Brand Assets Trust (peso 20%)
Activos de marca que generan confianza directa.
- Testimonios o casos de éxito visibles en la web
- Logos de clientes, social proof, premios
- Reviews en plataformas externas (G2, Capterra, Trustpilot)
- Presencia en redes sociales (LinkedIn, etc.) — usa social_presence
- **Visibilidad del Founder/CEO** (muy importante en B2B): ¿tiene LinkedIn activo? ¿aparece en búsquedas? Si hay datos de "Founder LinkedIn" en social_presence, evalúalo. Un founder invisible es un red flag en B2B.

### 4. GEO Presence (peso 10%)
¿Aparece cuando le preguntas a un LLM?
- ¿El LLM la recomienda? (usa geo_data.brand_mentioned_by_llm)
- ¿Qué competidores SÍ mencionan?
- ¿En qué fuentes falta?

### 5. Outbound Readiness (peso 15%)
¿Está preparada la web para convertir visitas en leads?
- Messaging claro en 5 segundos (evalúa H1 y title tag del seo_audit)
- CTAs claros, blog, lead magnets
- Meta description convincente que genere clicks (evalúa longitud y contenido del seo_audit)
- Open Graph configurado para que los shares en social se vean bien (evalúa og_tags del seo_audit)

### 6. Demand Engine (peso 15%)
Infraestructura técnica para captar y escalar demanda.
- Formularios, tech stack, landing pages, growth signals
- **SEO técnico** (usa seo_audit): ¿tiene robots.txt, sitemap.xml, canonical tags, schema markup, viewport mobile?
- **Indexabilidad**: ¿sitemap con URLs? ¿robots.txt bien configurado? ¿imágenes con alt text?
- **Analytics & tracking** (usa seo_audit.analytics): ¿tiene GA4/GTM, Meta Pixel, herramientas de behavior (Hotjar/Clarity), CRM/chat (HubSpot/Intercom)?
- Sin analytics = no mide nada = no puede optimizar. Red flag grave.
- Con GTM + GA4 + pixel de ads = infraestructura seria de medición
- Herramientas como HubSpot, Segment, Intercom indican madurez de demand gen
- Si no tiene sitemap.xml → red flag (Google no puede indexar eficientemente)
- Si no tiene schema markup → pierde rich snippets en SERP

## REGLAS DE SCORING (OBLIGATORIAS):
- Cada pilar: 0-100 basado SOLO en evidencia real de los datos proporcionados
- trust_score = PROMEDIO PONDERADO: borrowed_trust×0.20 + serp_trust×0.20 + brand_assets×0.20 + geo_presence×0.10 + outbound_readiness×0.15 + demand_engine×0.15
- Calcula trust_score matemáticamente, NO lo inventes
- Si hay 0 menciones en medios → borrowed_trust < 20
- Si hay 0 reviews externas → brand_assets < 30
- Si el dominio tiene >5 resultados propios en top 10 → serp_trust > 60
- Si la marca NO aparece en búsquedas de categoría → serp_trust < 40
- Si la LLM NO menciona la marca → geo_presence < 30
- Si tiene LinkedIn activo con followers → brand_assets +10
- Cada finding debe citar un dato concreto de la evidencia (URL, número, nombre de fuente)

## Formato OBLIGATORIO (JSON estricto):

\`\`\`json
{
  "company_name": "string",
  "business_type": "B2B | B2C | Mixed",
  "one_liner": "string — descripción en 1 línea de lo que hace la empresa",
  "trust_score": "number — CALCULADO como promedio ponderado, NO inventado",
  "pillars": {
    "borrowed_trust": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] },
    "serp_trust": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] },
    "brand_assets": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] },
    "geo_presence": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] },
    "outbound_readiness": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] },
    "demand_engine": { "score": "number 0-100", "findings": ["finding con dato concreto", "finding con dato concreto", "finding con dato concreto"] }
  },
  "top_gaps": ["gap 1", "gap 2", "gap 3"],
  "serp_highlight": "string — resumen de presencia en Google",
  "geo_highlight": "string — resumen de presencia en LLMs",
  "missing_sources": ["fuente donde debería estar pero no está"],
  "competitor_comparison": {
    "competitor_name": "string — nombre del competidor analizado",
    "competitor_advantage": "string — qué hace mejor el competidor en trust digital (sé específico con datos)",
    "brand_advantage": "string — qué hace mejor la marca analizada vs el competidor",
    "key_gap": "string — la diferencia más impactante, escrita de forma provocadora para el prospect"
  },
  "verdict": "string — veredicto final con recomendación prioritaria, mencionando al competidor si hay datos"
}
\`\`\`

IMPORTANTE:
- Sé brutalmente honesto. Usa SOLO datos reales de los inputs proporcionados.
- NO inventes hallazgos — si no hay datos, di "Sin evidencia encontrada" y pon score bajo.
- Cada empresa es diferente. El score DEBE variar según la evidencia real.
- Si hay datos del competidor, la comparativa debe ser PROVOCADORA: "Mientras tú tienes X, tu competidor tiene Y". El prospect necesita sentir la urgencia.
- Si NO hay datos del competidor, pon competitor_comparison como null.
- Responde SOLO con el JSON, sin texto adicional.`;
}

// ── Main Handler ─────────────────────────────────────────────

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  let body: { url?: string; name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
  if (!body.url?.trim()) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

  const fullUrl = body.url.startsWith("http") ? body.url : `https://${body.url}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fullUrl);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // SSRF protection
  const hostname = parsedUrl.hostname;
  if (isPrivateHost(hostname)) {
    return new Response(JSON.stringify({ error: "Private URLs not allowed" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const domain = hostname.replace("www.", "");
  const domainPrefix = domain.split(".")[0];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const anthropic = new Anthropic();

        // Step 1: Crawl
        stream(encoder, controller, "step", { step: "crawl", message: `Crawling ${fullUrl}...` });
        const { text: content, pages, title, htmlPages } = await crawl(fullUrl);
        for (const p of pages) {
          stream(encoder, controller, "detail", { message: `  GET ${p}` });
        }
        stream(encoder, controller, "detail", { message: `  ✓ ${content.length} chars extraídos` });
        if (title) {
          stream(encoder, controller, "detail", { message: `  Title: "${title}"` });
        }

        // Step 1.5: SEO Technical Audit (from SanchoCMO seo-audit skill)
        stream(encoder, controller, "step", { step: "seo", message: "Auditoría SEO técnica..." });
        const seoHtml = htmlPages[0] || "";
        const seoSignals = extractSeoSignals(seoHtml, fullUrl);
        const { robots_txt, sitemap } = await checkRobotsSitemap(new URL(fullUrl).origin);
        const seoData: SeoSignals = { ...seoSignals, robots_txt, sitemap };

        // Stream SEO findings
        const seoIcon = (ok: boolean) => ok ? "✅" : "❌";
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.https)} HTTPS` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.title.present)} Title (${seoData.title.length} chars): "${seoData.title.content.slice(0, 60)}"` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.meta_description.present)} Meta description (${seoData.meta_description.length} chars)` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.h1.count === 1)} H1 tags: ${seoData.h1.count}${seoData.h1.count > 0 ? ` → "${seoData.h1.contents[0]?.slice(0, 50)}"` : ""}` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.canonical.present)} Canonical tag` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.viewport)} Viewport meta` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.og_tags.title && seoData.og_tags.image)} Open Graph (title: ${seoData.og_tags.title}, desc: ${seoData.og_tags.description}, img: ${seoData.og_tags.image})` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.schema_types.length > 0)} Schema.org: ${seoData.schema_types.length > 0 ? seoData.schema_types.join(", ") : "ninguno"}` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.robots_txt.accessible)} robots.txt${seoData.robots_txt.accessible ? ` (sitemap ref: ${seoData.robots_txt.has_sitemap_ref ? "SÍ" : "NO"})` : ""}` });
        stream(encoder, controller, "detail", { message: `  ${seoIcon(seoData.sitemap.accessible)} sitemap.xml${seoData.sitemap.accessible ? ` (${seoData.sitemap.url_count} URLs)` : ""}` });
        stream(encoder, controller, "detail", { message: `  Imágenes: ${seoData.images.total} total, ${seoData.images.with_alt} con alt, ${seoData.images.without_alt} sin alt` });
        stream(encoder, controller, "detail", { message: `  Links internos: ${seoData.internal_links} | externos: ${seoData.external_links}` });
        if (seoData.lang) stream(encoder, controller, "detail", { message: `  Idioma: ${seoData.lang}` });
        // Analytics detection
        const trackers = [
          seoData.analytics.ga4 && "GA4",
          seoData.analytics.gtm && "GTM",
          seoData.analytics.meta_pixel && "Meta Pixel",
          seoData.analytics.hotjar && "Hotjar",
          ...seoData.analytics.other_trackers,
        ].filter(Boolean);
        stream(encoder, controller, "detail", { message: `  ${seoIcon(trackers.length > 0)} Analytics: ${trackers.length > 0 ? trackers.join(", ") : "ninguno detectado"}` });

        // Step 2: Detect brand name + sector + ICP + region + competitor (single LLM call)
        stream(encoder, controller, "step", { step: "sector", message: "Detectando marca, sector, mercado y competencia..." });
        const contextForSector = `URL: ${domain}\nTitle: ${title}\nContent: ${content.slice(0, 2000)}`;
        const sectorResp = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: `Analiza esta empresa:\n${contextForSector}\n\nIMPORTANTE: Identifica el mercado geográfico principal (país/región) donde opera esta empresa basándote en el idioma del sitio, la moneda, el TLD del dominio, y cualquier pista del contenido.\n\nPara "category_search_query", incluye SIEMPRE el país/región. Ej: "mejores agencias de growth marketing en España", "best CRM software in Mexico".\n\nPara "geo_query", incluye el país/región. Ej: "¿cuáles son las mejores agencias de growth marketing en España?".\n\nNOTA: No incluyas "top_competitor" aquí, lo detectaremos después con datos SERP reales.\n\nResponde SOLO JSON:\n\`\`\`json\n{"brand_name": "nombre real de la empresa", "founder_name": "nombre completo del fundador/CEO si se puede inferir del contenido, o cadena vacía si no", "sector": "sector/industria en español", "region": "mercado geográfico principal donde opera (ej: España, México, Global, DACH)", "category_search_query": "búsqueda con país incluido que haría un buyer en Google para encontrar este tipo de solución", "geo_query": "pregunta natural con país incluido que haría un buyer a ChatGPT", "icp": "perfil del buyer ideal, ej: Director de Marketing en empresas tech B2B en España", "top_competitor": {"name": "", "website": ""}}\n\`\`\`` }],
        });
        const sectorRaw = extractJson(extractText(sectorResp.content));

        let sectorInfo: { brand_name: string; founder_name: string; sector: string; region: string; category_search_query: string; geo_query: string; icp: string; top_competitor: { name: string; website: string } };
        try {
          sectorInfo = JSON.parse(sectorRaw);
        } catch {
          sectorInfo = {
            brand_name: domainPrefix,
            founder_name: "",
            sector: "desconocido",
            region: "desconocido",
            category_search_query: `mejores ${domainPrefix} alternativas`,
            geo_query: `¿cuáles son las mejores herramientas como ${domainPrefix}?`,
            icp: "desconocido",
            top_competitor: { name: "", website: "" },
          };
        }

        const brandName = sectorInfo.brand_name || domainPrefix;
        stream(encoder, controller, "detail", { message: `  Marca: ${brandName}` });
        if (sectorInfo.founder_name) {
          stream(encoder, controller, "detail", { message: `  Founder: ${sectorInfo.founder_name}` });
        }
        stream(encoder, controller, "detail", { message: `  Sector: ${sectorInfo.sector}` });
        stream(encoder, controller, "detail", { message: `  Mercado: ${sectorInfo.region}` });
        stream(encoder, controller, "detail", { message: `  ICP: ${sectorInfo.icp}` });
        stream(encoder, controller, "detail", { message: `  Búsqueda categoría: ${sectorInfo.category_search_query}` });
        if (sectorInfo.top_competitor?.name) {
          stream(encoder, controller, "detail", { message: `  Competidor principal: ${sectorInfo.top_competitor.name} (${sectorInfo.top_competitor.website})` });
        }

        // Step 3: SERP — Brand queries + Category queries
        const serpQueries = [
          { label: "Búsqueda de marca", q: `"${brandName}"` },
          { label: "Menciones terceros", q: `"${brandName}" -site:${domain}` },
          { label: "Reviews y comparativas", q: `"${brandName}" (review OR comparativa OR vs OR alternativa OR opiniones)` },
          { label: "Búsqueda de categoría", q: sectorInfo.category_search_query },
          { label: "Indexación del sitio", q: `site:${domain}` },
        ];

        // Run all SERP queries in parallel for speed
        stream(encoder, controller, "step", { step: "serp", message: `Ejecutando ${serpQueries.length} búsquedas SERP en paralelo...` });
        const serpPromises = serpQueries.map(sq => serperSearch(sq.q, 10));
        const serpDataResults = await Promise.all(serpPromises);

        const serpResults: Record<string, Array<Record<string, string>>> = {};
        for (let i = 0; i < serpQueries.length; i++) {
          const sq = serpQueries[i];
          const results = serpDataResults[i].organic || [];
          serpResults[sq.label] = results;
          stream(encoder, controller, "step", { step: "serp", message: `SERP: ${sq.label}` });
          stream(encoder, controller, "detail", { message: `  Query: ${sq.q}` });
          stream(encoder, controller, "detail", { message: `  ${results.length} resultados encontrados` });
          for (const r of results.slice(0, 5)) {
            stream(encoder, controller, "detail", { message: `  → ${r.title?.slice(0, 70)}` });
            stream(encoder, controller, "detail", { message: `    ${r.link}` });
          }
          if (results.length > 5) {
            stream(encoder, controller, "detail", { message: `  ... +${results.length - 5} más` });
          }
        }

        // Check if brand appears in category search results
        const categoryResults = serpResults["Búsqueda de categoría"] || [];
        const brandInCategory = categoryResults.some(r =>
          r.title?.toLowerCase().includes(brandName.toLowerCase()) ||
          r.link?.includes(domain) ||
          r.snippet?.toLowerCase().includes(brandName.toLowerCase())
        );
        stream(encoder, controller, "detail", { message: `  ✓ Marca en resultados de categoría: ${brandInCategory ? "SÍ" : "NO"}` });

        stream(encoder, controller, "step", { step: "serp", message: "Google News..." });
        const newsData = await serperNews(`"${brandName}"`, 10);
        const newsResults = newsData.news || [];
        stream(encoder, controller, "detail", { message: `  ${newsResults.length} noticias encontradas` });
        for (const n of newsResults.slice(0, 3)) {
          stream(encoder, controller, "detail", { message: `  → [${n.source || "?"}] ${n.title?.slice(0, 60)}` });
        }

        // Step 4: Social profiles (HTML first, Serper fallback) + review platforms
        stream(encoder, controller, "step", { step: "social", message: "Extrayendo perfiles sociales del sitio web..." });

        // Phase 1: Extract social links from crawled HTML (high confidence)
        const discoveredProfiles = discoverSocialProfiles(htmlPages);
        for (const p of discoveredProfiles) {
          stream(encoder, controller, "detail", { message: `  ✅ ${p.platform} (del sitio): ${p.url}` });
        }

        // Phase 2: Serper fallback for social platforms NOT found in HTML
        // Uses domain instead of brand name to avoid homonym confusion
        const foundPlatforms = new Set(discoveredProfiles.map(p => p.platform));
        const socialFallbacks: Array<{ platform: string; q: string }> = [];
        if (!foundPlatforms.has("linkedin")) socialFallbacks.push({ platform: "LinkedIn", q: `site:linkedin.com/company "${domain}"` });
        if (!foundPlatforms.has("twitter")) socialFallbacks.push({ platform: "Twitter/X", q: `site:twitter.com "${domain}" OR site:x.com "${domain}"` });
        if (!foundPlatforms.has("youtube")) socialFallbacks.push({ platform: "YouTube", q: `site:youtube.com "${domain}" OR site:youtube.com "${brandName}"` });
        if (!foundPlatforms.has("instagram")) socialFallbacks.push({ platform: "Instagram", q: `site:instagram.com "${domain}"` });

        // Phase 3: Review platforms (always via Serper — not in HTML)
        const reviewChecks = [
          { platform: "G2", q: `site:g2.com "${brandName}"` },
          { platform: "Trustpilot", q: `site:trustpilot.com "${brandName}"` },
          { platform: "Capterra", q: `site:capterra.com "${brandName}"` },
          { platform: "Crunchbase", q: `site:crunchbase.com "${brandName}"` },
        ];

        // Phase 4: Founder LinkedIn visibility (B2B trust signal)
        const founderName = sectorInfo.founder_name;
        if (founderName) {
          socialFallbacks.push({ platform: "Founder LinkedIn", q: `site:linkedin.com/in "${founderName}" "${brandName}"` });
        }

        // Run all Serper checks in parallel (fallback socials + reviews + founder)
        const allChecks = [...socialFallbacks, ...reviewChecks];
        if (socialFallbacks.length > 0) {
          stream(encoder, controller, "step", { step: "social", message: `Buscando ${socialFallbacks.length} perfiles no encontrados en HTML + reviews${founderName ? " + founder" : ""}...` });
        } else {
          stream(encoder, controller, "step", { step: "social", message: "Verificando plataformas de reviews..." });
        }

        const checkPromises = allChecks.map(c => serperSearch(c.q, 3));
        const checkResults = await Promise.all(checkPromises);

        const socialPresence: Record<string, { found: boolean; url?: string; snippet?: string; confidence?: string }> = {};

        // Add HTML-discovered profiles (high confidence)
        for (const p of discoveredProfiles) {
          socialPresence[p.platform] = { found: true, url: p.url, confidence: "high" };
        }

        // Add Serper results (fallback socials + reviews)
        for (let i = 0; i < allChecks.length; i++) {
          const check = allChecks[i];
          const results = checkResults[i].organic || [];
          const found = results.length > 0;
          const isFallback = i < socialFallbacks.length;
          socialPresence[check.platform] = {
            found,
            url: results[0]?.link,
            snippet: results[0]?.snippet?.slice(0, 100),
            confidence: isFallback ? "medium" : undefined,
          };
          const icon = found ? "✅" : "❌";
          const source = isFallback ? " (Serper)" : "";
          stream(encoder, controller, "detail", { message: `  ${icon} ${check.platform}${source}: ${found ? results[0]?.link : "No encontrado"}` });
        }

        const ownDomainCount = (serpResults["Búsqueda de marca"] || []).filter(r => r.link?.includes(domain)).length;
        const indexedPages = (serpResults["Indexación del sitio"] || []).length;
        const serpData = {
          brand_search: (serpResults["Búsqueda de marca"] || []).slice(0, 10).map(r => ({ title: r.title, link: r.link, snippet: r.snippet })),
          media_mentions: (serpResults["Menciones terceros"] || []).slice(0, 10).map(r => ({ title: r.title, link: r.link, snippet: r.snippet })),
          review_mentions: (serpResults["Reviews y comparativas"] || []).slice(0, 10).map(r => ({ title: r.title, link: r.link, snippet: r.snippet })),
          category_search: categoryResults.slice(0, 10).map(r => ({ title: r.title, link: r.link, snippet: r.snippet })),
          indexed_pages: (serpResults["Indexación del sitio"] || []).slice(0, 10).map(r => ({ title: r.title, link: r.link })),
          news_mentions: newsResults.slice(0, 10).map(r => ({ title: r.title, source: r.source })),
          social_presence: socialPresence,
          stats: {
            own_domain_in_top10: ownDomainCount,
            indexed_pages_found: indexedPages,
            third_party_mentions: (serpResults["Menciones terceros"] || []).length,
            review_site_mentions: (serpResults["Reviews y comparativas"] || []).length,
            news_mentions: newsResults.length,
            brand_in_category_results: brandInCategory,
          },
        };

        stream(encoder, controller, "step", { step: "serp", message: "Resumen SERP" });
        stream(encoder, controller, "detail", { message: `  Dominio propio en top 10: ${ownDomainCount} resultados` });
        stream(encoder, controller, "detail", { message: `  Páginas indexadas: ${indexedPages}+ encontradas` });
        stream(encoder, controller, "detail", { message: `  Menciones terceros: ${serpData.stats.third_party_mentions} resultados` });
        stream(encoder, controller, "detail", { message: `  Reviews/comparativas: ${serpData.stats.review_site_mentions} resultados` });
        stream(encoder, controller, "detail", { message: `  Noticias: ${serpData.stats.news_mentions} resultados` });
        stream(encoder, controller, "detail", { message: `  Aparece en búsqueda de categoría: ${brandInCategory ? "SÍ" : "NO"}` });

        // Step 5: GEO
        stream(encoder, controller, "step", { step: "geo", message: `GEO: Preguntando a LLM — "${sectorInfo.geo_query}"` });

        const geoResp1 = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Actúa como un ${sectorInfo.icp}. Responde esta pregunta: "${sectorInfo.geo_query}"\n\nMenciona las empresas/soluciones que recomendarías, basándote en fuentes reales como G2, Capterra, Gartner, blogs especializados, etc.\n\nJSON:\n\`\`\`json\n{"recommendations": [{"name": "X", "reason": "why", "sources_cited": ["source"]}], "source_types_used": ["G2", "etc"]}\n\`\`\`` }],
        });
        const raw1 = extractJson(extractText(geoResp1.content));
        let recommendations: { recommendations: Array<{ name: string; reason: string; sources_cited: string[] }>; source_types_used: string[] };
        try { recommendations = JSON.parse(raw1); } catch { recommendations = { recommendations: [], source_types_used: [] }; }

        const brandLower = brandName.toLowerCase();
        const brandMentioned = recommendations.recommendations.some(r => r.name.toLowerCase().includes(brandLower));
        for (const r of recommendations.recommendations.slice(0, 5)) {
          const icon = r.name.toLowerCase().includes(brandLower) ? "✅" : "❌";
          stream(encoder, controller, "detail", { message: `  ${icon} ${r.name} — ${r.reason.slice(0, 80)}` });
        }

        stream(encoder, controller, "step", { step: "geo", message: "Analizando fuentes necesarias para LLMs..." });
        const geoResp2 = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Si alguien pregunta a ChatGPT: "${sectorInfo.geo_query}", ¿qué fuentes necesitaría "${brandName}" para ser recomendada?\n\nJSON:\n\`\`\`json\n{"required_sources": [{"source_type": "tipo", "specific_example": "ejemplo", "priority": "alta|media|baja"}]}\n\`\`\`` }],
        });
        const raw2 = extractJson(extractText(geoResp2.content));
        let requiredSources: { required_sources: Array<{ source_type: string; specific_example: string; priority: string }> };
        try { requiredSources = JSON.parse(raw2); } catch { requiredSources = { required_sources: [] }; }

        for (const src of requiredSources.required_sources.slice(0, 5)) {
          const icon = src.priority === "alta" ? "🔴" : src.priority === "media" ? "🟡" : "🟢";
          stream(encoder, controller, "detail", { message: `  ${icon} [${src.priority}] ${src.specific_example || src.source_type}` });
        }

        const geoData = {
          sector_query: sectorInfo.geo_query,
          brand_mentioned_by_llm: brandMentioned,
          competitors_mentioned: recommendations.recommendations.filter(r => !r.name.toLowerCase().includes(brandLower)).map(r => r.name).slice(0, 5),
          recommendations: recommendations.recommendations.slice(0, 5),
          source_types_llm_uses: recommendations.source_types_used,
          required_sources_to_rank: requiredSources.required_sources.slice(0, 8),
        };

        stream(encoder, controller, "detail", {
          message: `  ✓ Marca mencionada por LLM: ${brandMentioned ? "SÍ" : "NO"}`,
        });

        // Step 6: Competitor mini-analysis — find real competitor from SERP + GEO data
        let competitorData: { name: string; website: string; brand_serp: number; category_serp: boolean; indexed_pages: number; has_g2: boolean; has_trustpilot: boolean; social_profiles: number } | null = null;

        stream(encoder, controller, "step", { step: "competitor", message: "Buscando competidor principal desde SERP + GEO..." });
        const skipDomains = ["g2.com", "capterra.com", "clutch.co", "trustpilot.com", "linkedin.com", "facebook.com", "twitter.com", "x.com", "youtube.com", "wikipedia.org", "medium.com", "reddit.com", "hubspot.com", "google.com", "bing.com", "pinterest.com", "tiktok.com", "quora.com", "amazon.com", "indeed.com", "glassdoor.com", "sortlist.com", "appvizer.com", "comparably.com", "goodfirms.co", "themanifest.com", "designrush.com", "agency-list.com", "agencyspotter.com"];
        const candidateDomains: Array<{ name: string; website: string; url: string; source: string }> = [];

        // Source 1: Category SERP results
        for (const r of categoryResults) {
          const link = r.link || "";
          if (!link.includes(domain) && link.match(/^https?:\/\/[^/]+/)) {
            try {
              const compUrl = new URL(link);
              const compDom = compUrl.hostname.replace(/^www\./, "");
              if (!skipDomains.some(sd => compDom.includes(sd)) && !candidateDomains.some(c => c.website === compDom)) {
                const rawName = r.title?.split(/[-–|·:]/)[0]?.trim() || compDom;
                candidateDomains.push({ name: rawName, website: compDom, url: link, source: "category_serp" });
              }
            } catch { /* skip invalid URLs */ }
          }
        }

        // Source 2: GEO competitors (from Step 5 LLM recommendations)
        const geoCompetitors = geoData.competitors_mentioned || [];
        if (geoCompetitors.length > 0) {
          stream(encoder, controller, "detail", { message: `  ${geoCompetitors.length} competidores detectados por GEO: ${geoCompetitors.join(", ")}` });
          // Search SERP for each GEO competitor to get their real website
          const geoSearches = geoCompetitors.slice(0, 5).map(name =>
            serperSearch(`"${name}" ${sectorInfo.sector} ${sectorInfo.region}`, 3)
          );
          const geoSearchResults = await Promise.all(geoSearches);
          for (let i = 0; i < geoCompetitors.length && i < 5; i++) {
            const name = geoCompetitors[i];
            const results = geoSearchResults[i].organic || [];
            for (const r of results) {
              const link = r.link || "";
              if (!link.includes(domain) && link.match(/^https?:\/\/[^/]+/)) {
                try {
                  const compUrl = new URL(link);
                  const compDom = compUrl.hostname.replace(/^www\./, "");
                  if (!skipDomains.some(sd => compDom.includes(sd)) && !candidateDomains.some(c => c.website === compDom)) {
                    candidateDomains.push({ name, website: compDom, url: link, source: "geo" });
                    break; // one result per GEO competitor is enough
                  }
                } catch { /* skip */ }
              }
            }
          }
        }

        // Source 3: Additional SERP query for alternatives/competitors
        const altQuery = `"${brandName}" alternativas competidores ${sectorInfo.region}`;
        stream(encoder, controller, "detail", { message: `  Buscando alternativas: ${altQuery}` });
        const altResults = await serperSearch(altQuery, 10);
        for (const r of (altResults.organic || [])) {
          const link = r.link || "";
          if (!link.includes(domain) && link.match(/^https?:\/\/[^/]+/)) {
            try {
              const compUrl = new URL(link);
              const compDom = compUrl.hostname.replace(/^www\./, "");
              if (!skipDomains.some(sd => compDom.includes(sd)) && !candidateDomains.some(c => c.website === compDom)) {
                const rawName = r.title?.split(/[-–|·:]/)[0]?.trim() || compDom;
                candidateDomains.push({ name: rawName, website: compDom, url: link, source: "alternatives_serp" });
              }
            } catch { /* skip */ }
          }
        }

        // Pick the best competitor using LLM from all sources
        let comp: { name: string; website: string } = { name: "", website: "" };
        if (candidateDomains.length > 0) {
          const candidateList = candidateDomains.slice(0, 15).map(c => `- ${c.name} (${c.website}) [${c.source}]`).join("\n");
          stream(encoder, controller, "detail", { message: `  ${candidateDomains.length} candidatos totales (SERP + GEO + alternativas)` });

          try {
            const compResp = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 200,
              messages: [{ role: "user", content: `"${brandName}" es una empresa de ${sectorInfo.sector} en ${sectorInfo.region}.\n\nEstos son posibles competidores de múltiples fuentes (SERP de categoría, recomendaciones de LLMs, búsqueda de alternativas):\n${candidateList}\n\nElige el competidor MÁS DIRECTO, RELEVANTE y CONOCIDO en el mercado — debe ser una empresa del MISMO tipo de solución/servicio en el mismo mercado geográfico. Prefiere empresas reconocidas en la industria sobre pequeñas desconocidas. NO elijas directorios, blogs, medios, o empresas de otro sector.\n\nJSON:\n\`\`\`json\n{"name": "nombre", "website": "dominio.com"}\n\`\`\`` }],
            });
            const compParsed = JSON.parse(extractJson(extractText(compResp.content)));
            if (compParsed.name && compParsed.website) {
              comp = compParsed;
            }
          } catch {
            // Fallback to first candidate
            comp = candidateDomains[0];
          }
        }

        // If still no competitor, try the LLM's original suggestion
        if (!comp.name && sectorInfo.top_competitor?.name) {
          comp = sectorInfo.top_competitor;
        }

        if (comp.name) {
          stream(encoder, controller, "detail", { message: `  Competidor seleccionado: ${comp.name} (${comp.website})` });
        }

        if (comp?.name && comp?.website) {
          stream(encoder, controller, "step", { step: "competitor", message: `Analizando competidor: ${comp.name}...` });
          const compDomain = comp.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

          // Run 3 competitor queries in parallel (reuse category results from Step 3)
          const [compBrand, compSite, compReviews] = await Promise.all([
            serperSearch(`"${comp.name}"`, 10),
            serperSearch(`site:${compDomain}`, 10),
            Promise.all([
              serperSearch(`site:g2.com "${comp.name}"`, 3),
              serperSearch(`site:trustpilot.com "${comp.name}"`, 3),
            ]),
          ]);

          const compOwnDomain = (compBrand.organic || []).filter(r => r.link?.includes(compDomain)).length;
          const compInCategory = categoryResults.some(r =>
            r.title?.toLowerCase().includes(comp.name.toLowerCase()) ||
            r.link?.includes(compDomain) ||
            r.snippet?.toLowerCase().includes(comp.name.toLowerCase())
          );

          // Count social profiles from competitor's brand SERP
          const socialDomains = ["linkedin.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "facebook.com"];
          const compSocialCount = (compBrand.organic || []).filter(r =>
            socialDomains.some(sd => r.link?.includes(sd))
          ).length;

          competitorData = {
            name: comp.name,
            website: comp.website,
            brand_serp: compOwnDomain,
            category_serp: compInCategory,
            indexed_pages: (compSite.organic || []).length,
            has_g2: (compReviews[0].organic || []).length > 0,
            has_trustpilot: (compReviews[1].organic || []).length > 0,
            social_profiles: compSocialCount,
          };

          stream(encoder, controller, "detail", { message: `  Dominio propio en SERP: ${competitorData.brand_serp} resultados` });
          stream(encoder, controller, "detail", { message: `  En búsqueda de categoría: ${competitorData.category_serp ? "SÍ" : "NO"}` });
          stream(encoder, controller, "detail", { message: `  Páginas indexadas: ${competitorData.indexed_pages}+` });
          stream(encoder, controller, "detail", { message: `  G2: ${competitorData.has_g2 ? "SÍ" : "NO"} | Trustpilot: ${competitorData.has_trustpilot ? "SÍ" : "NO"}` });
          stream(encoder, controller, "detail", { message: `  Perfiles sociales en SERP: ${competitorData.social_profiles}` });
        }

        // Step 7: Final analysis
        stream(encoder, controller, "step", { step: "analysis", message: "Generando Trust Score Report..." });
        const founderStr = founderName ? `\n\n## Founder/CEO: ${founderName}\n${JSON.stringify(socialPresence["Founder LinkedIn"] || { found: false })}` : "";
        const sectorInfoStr = `Sector: ${sectorInfo.sector} | Mercado: ${sectorInfo.region} | ICP: ${sectorInfo.icp} | Categoría: ${sectorInfo.category_search_query}`;
        const competitorStr = competitorData ? `\n\n## Datos del competidor principal: ${competitorData.name}\n${JSON.stringify(competitorData)}` : "";
        const prompt = buildPrompt(fullUrl, brandName, content, JSON.stringify(serpData), JSON.stringify(geoData), JSON.stringify(socialPresence), sectorInfoStr + founderStr + competitorStr, JSON.stringify(seoData));
        const analysisResp = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        });

        const rawAnalysis = extractJson(extractText(analysisResp.content));

        let result;
        try {
          result = JSON.parse(rawAnalysis);
        } catch {
          stream(encoder, controller, "error", { message: "Error parseando respuesta del análisis. Reintentando..." });
          try {
            const retryResp = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 3000,
              messages: [{ role: "user", content: prompt + "\n\nTu respuesta anterior no fue JSON válido. Responde ÚNICAMENTE con JSON válido, sin texto antes ni después." }],
            });
            const retryRaw = extractJson(extractText(retryResp.content));
            result = JSON.parse(retryRaw);
          } catch {
            stream(encoder, controller, "error", { message: "No se pudo parsear el análisis tras 2 intentos." });
            controller.close();
            return;
          }
        }

        // Server-side trust_score recalculation (don't trust LLM math)
        const p = result.pillars;
        if (p) {
          const calculated = Math.round(
            (p.borrowed_trust?.score || 0) * 0.20 +
            (p.serp_trust?.score || 0) * 0.20 +
            (p.brand_assets?.score || 0) * 0.20 +
            (p.geo_presence?.score || 0) * 0.10 +
            (p.outbound_readiness?.score || 0) * 0.15 +
            (p.demand_engine?.score || 0) * 0.15
          );
          if (result.trust_score !== calculated) {
            stream(encoder, controller, "detail", { message: `  Score corregido: LLM dijo ${result.trust_score}, calculado real: ${calculated}` });
            result.trust_score = calculated;
          }
        }

        stream(encoder, controller, "result", { data: result });

        // Update GHL contact with trust_score (fire-and-forget)
        if (body.email?.trim() && result.trust_score != null) {
          const ghlApiKey = process.env.GHL_API_KEY;
          const ghlLocationId = process.env.GHL_LOCATION_ID;
          if (ghlApiKey && ghlLocationId) {
            (async () => {
              try {
                // 1. Find contact by email
                const searchResp = await fetch(
                  `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&query=${encodeURIComponent(body.email!.trim())}`,
                  {
                    headers: {
                      "Authorization": `Bearer ${ghlApiKey}`,
                      "Version": "2021-07-28",
                    },
                    signal: AbortSignal.timeout(5_000),
                  }
                );
                const searchData = await searchResp.json();
                const contactId = searchData?.contacts?.[0]?.id;
                if (!contactId) return;

                // 2. Update contact with trust_score custom field
                await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
                  method: "PUT",
                  headers: {
                    "Authorization": `Bearer ${ghlApiKey}`,
                    "Content-Type": "application/json",
                    "Version": "2021-07-28",
                  },
                  body: JSON.stringify({
                    customFields: [
                      { id: "M743ieZHoFWSBBRliMB6", value: result.trust_score },
                    ],
                  }),
                  signal: AbortSignal.timeout(5_000),
                });
              } catch (err) {
                console.warn("GHL trust_score update failed:", err);
              }
            })();
          }
        }

      } catch (err) {
        stream(encoder, controller, "error", { message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
};
