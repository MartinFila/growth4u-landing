import { summarizeDescription } from "./extract.js";
import { auditLlmsOutput } from "./quality.js";

const SECTION_ORDER = [
  "Core Pages",
  "Services",
  "Case Studies",
  "Resources",
  "Documentation",
  "Articles And Resources",
  "Company",
  "Other Pages"
];

export function generateLlmsFiles(crawlResult) {
  const pages = [...crawlResult.pages].sort((a, b) => scorePage(b, crawlResult.startUrl) - scorePage(a, crawlResult.startUrl));
  const site = crawlResult.site;
  const title = cleanMarkdownText(site.title || new URL(crawlResult.startUrl).hostname.replace(/^www\./, ""));
  const description = cleanMarkdownText(site.description || `Important pages discovered for ${new URL(crawlResult.startUrl).hostname}.`);
  const grouped = groupPages(pages);

  const llmsTxt = [
    `# ${title}`,
    "",
    `> ${description}`,
    "",
    `Source: ${crawlResult.startUrl}`,
    "",
    ...SECTION_ORDER.flatMap((section) => renderSection(section, grouped.get(section) || []))
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const llmsFullTxt = renderFullText(title, description, crawlResult.startUrl, pages);

  const result = {
    llmsTxt,
    llmsFullTxt,
    pages: pages.map((page) => ({
      url: page.url,
      title: page.title,
      description: page.description,
      section: categorizePage(page)
    })),
    stats: {
      crawledPages: pages.length,
      failedPages: crawlResult.errors.length,
      source: crawlResult.startUrl,
      renderedPages: crawlResult.stats?.renderedPages || 0,
      discoveredSpaRoutes: crawlResult.stats?.discoveredSpaRoutes || 0,
      spaShellsDetected: crawlResult.stats?.spaShellsDetected || 0
    },
    errors: crawlResult.errors
  };
  result.quality = auditLlmsOutput(result);
  return result;
}

export function categorizePage(page) {
  const url = new URL(page.url);
  const path = url.pathname.toLowerCase();
  const joined = `${path} ${page.title || ""} ${page.description || ""}`.toLowerCase();

  if (path === "/" || path === "") {
    return "Core Pages";
  }

  if (/(blog|news|article|articulo|insights?|whitepaper|webinar|podcast|events?|eventos?|categoria)/.test(joined)) {
    return "Articles And Resources";
  }

  if (
    /(servicios?|services?|pricing|precios?|product|producto|features?|funcionalidades|solutions?|soluciones?|platform|plataforma)/.test(
      joined
    )
  ) {
    return "Services";
  }

  if (
    /(recursos?|resources?|landing|lead-magnet|playbooks?|frameworks?|plantillas?|templates?|herramientas?|toolkits?|kit-|checklist|auditor|diagnostico|diagnóstico)/.test(
      joined
    )
  ) {
    return "Resources";
  }

  if (/(casos?-de-exito|case-stud|success-stor|clientes?|customers?|resultados?|bnext|bit2me|gocardless|criptan)/.test(joined)) {
    return "Case Studies";
  }

  if (/(docs?|documentation|documentacion|guide|guia|learn|tutorial|reference|api|developer|help|support|faq|knowledge)/.test(joined)) {
    return "Documentation";
  }

  if (/(about|company|empresa|equipo|team|careers?|trabaja|contact|contacto|press|legal|privacy|privacidad|terms|security)/.test(joined)) {
    return "Company";
  }

  return "Other Pages";
}

function groupPages(pages) {
  const grouped = new Map(SECTION_ORDER.map((section) => [section, []]));

  for (const page of pages) {
    grouped.get(categorizePage(page)).push(page);
  }

  return grouped;
}

function renderSection(section, pages) {
  if (!pages.length) {
    return [];
  }

  return [`## ${section}`, "", ...pages.map(formatPageLink), ""];
}

function formatPageLink(page) {
  const title = escapeLinkText(cleanMarkdownText(page.title || new URL(page.url).pathname || page.url));
  const description = cleanMarkdownText(summarizeDescription(page.description || page.text || ""));

  if (!description) {
    return `- [${title}](${page.url})`;
  }

  return `- [${title}](${page.url}): ${description}`;
}

function renderFullText(title, description, startUrl, pages) {
  const sections = [
    `# ${title} Full Content`,
    "",
    `> ${description}`,
    "",
    `Source: ${startUrl}`,
    ""
  ];

  for (const page of pages) {
    sections.push("---", "", `## ${cleanMarkdownText(page.title || page.url)}`, "", `URL: ${page.url}`);

    if (page.description) {
      sections.push(`Description: ${cleanMarkdownText(page.description)}`);
    }

    sections.push("", trimPageMarkdown(page.markdown || page.text || ""));
  }

  return sections.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function trimPageMarkdown(markdown) {
  const cleaned = String(markdown || "").trim();
  const maxLength = 8_000;
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}\n\n[Content truncated for this page.]`;
}

function scorePage(page, startUrl) {
  const url = new URL(page.url);
  const start = new URL(startUrl);
  const path = url.pathname.toLowerCase();
  const depth = path.split("/").filter(Boolean).length;
  let score = 100 - depth * 8;

  if (url.pathname === "/" || url.href === start.href) {
    score += 100;
  }
  if (/(docs?|guide|api|reference|pricing|product|features?|about)/.test(path)) {
    score += 35;
  }
  if (/(tag|category|author|page\/\d+|search|login|signin|signup|cart|checkout)/.test(path)) {
    score -= 45;
  }
  if ((page.description || "").length > 40) {
    score += 10;
  }

  return score;
}

function cleanMarkdownText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/[[\]<>]/g, "")
    .trim();
}

function escapeLinkText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}
