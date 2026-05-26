export function auditLlmsOutput(result) {
  const llmsTxt = String(result.llmsTxt || "");
  const links = parseLlmsLinks(llmsTxt);
  const sections = [...llmsTxt.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
  const findings = [];
  const checks = [];

  const addCheck = (id, label, passed, severity, message) => {
    checks.push({ id, label, passed });
    if (!passed) {
      findings.push({ severity, message });
    }
  };

  addCheck("h1", "Starts with one H1 title", /^#\s+\S+/m.test(llmsTxt), "high", "The file needs a clear H1 site title.");
  addCheck(
    "summary",
    "Includes a blockquote summary",
    /^>\s+\S+/m.test(llmsTxt),
    "medium",
    "Add a concise blockquote summary so LLMs understand the site quickly."
  );
  addCheck("links", "Includes useful page links", links.length > 0, "high", "No page links were generated.");
  addCheck("sections", "Groups links into sections", sections.length > 0, "medium", "Group links under meaningful H2 sections.");

  const duplicateUrls = links.length - new Set(links.map((link) => link.url)).size;
  addCheck("duplicates", "Has no duplicate URLs", duplicateUrls === 0, "medium", `${duplicateUrls} duplicate URL(s) found.`);

  const emptyDescriptions = links.filter((link) => !link.description).length;
  addCheck(
    "descriptions",
    "Every link has a description",
    emptyDescriptions === 0,
    "medium",
    `${emptyDescriptions} link(s) are missing descriptions.`
  );

  const soft404s = links.filter((link) => /(?:404|not found|pagina no encontrada|página no encontrada)/i.test(`${link.title} ${link.description}`));
  addCheck("soft404", "Contains no obvious 404 pages", soft404s.length === 0, "high", `${soft404s.length} likely 404 page(s) were included.`);

  const otherPages = links.filter((link) => link.section === "Other Pages").length;
  addCheck(
    "specific-sections",
    "Avoids generic Other Pages grouping",
    otherPages === 0 || otherPages / Math.max(links.length, 1) <= 0.15,
    "low",
    `${otherPages} link(s) are in Other Pages. Improve classification or URL selection.`
  );

  const shortDescriptions = links.filter((link) => link.description && link.description.length < 35).length;
  addCheck(
    "description-depth",
    "Descriptions are specific enough",
    shortDescriptions === 0,
    "low",
    `${shortDescriptions} description(s) are very short.`
  );

  const noisyDescriptions = links.filter((link) => /cookie|javascript|subscribe|newsletter|skip to content/i.test(link.description)).length;
  addCheck("low-noise", "Descriptions avoid UI noise", noisyDescriptions === 0, "medium", `${noisyDescriptions} noisy description(s) found.`);

  addCheck(
    "publishable-size",
    "llms.txt is compact enough to publish",
    llmsTxt.length > 150 && llmsTxt.length < 50_000,
    "medium",
    "Keep llms.txt concise. Use llms-full.txt for full page content."
  );

  const usefulSectionNames = ["Services", "Documentation", "Resources", "Case Studies", "Articles And Resources", "Company"];
  const usefulSections = sections.filter((section) => usefulSectionNames.includes(section)).length;
  addCheck(
    "ai-seo-coverage",
    "Includes AI-useful content sections",
    usefulSections > 0,
    "medium",
    "Include pages that explain services/products, resources/docs, proof, and articles."
  );

  const score = Math.max(
    0,
    Math.round(
      100 -
        findings.reduce((total, finding) => {
          if (finding.severity === "high") return total + 20;
          if (finding.severity === "medium") return total + 10;
          return total + 5;
        }, 0)
    )
  );

  return {
    score,
    grade: gradeForScore(score),
    metrics: {
      characters: llmsTxt.length,
      links: links.length,
      sections: sections.length,
      duplicateUrls,
      emptyDescriptions,
      soft404s: soft404s.length,
      otherPages,
      shortDescriptions,
      noisyDescriptions
    },
    checks,
    findings
  };
}

function parseLlmsLinks(llmsTxt) {
  const links = [];
  let currentSection = "";

  for (const line of llmsTxt.split(/\r?\n/)) {
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const linkMatch = line.match(/^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/);
    if (linkMatch) {
      links.push({
        section: currentSection,
        title: linkMatch[1].trim(),
        url: linkMatch[2].trim(),
        description: (linkMatch[3] || "").trim()
      });
    }
  }

  return links;
}

function gradeForScore(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "needs-review";
  return "weak";
}
