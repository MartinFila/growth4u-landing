import { fetchTextResource } from "./fetcher.js";
import { normalizeCrawlUrl } from "./security.js";

export async function loadRobotsPolicy(rootUrl, options = {}) {
  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  const fetcher = options.fetcher || fetchTextResource;

  try {
    const resource = await fetcher(new URL("/robots.txt", root), {
      maxBytes: 400_000,
      accept: "text/plain,*/*;q=0.5"
    });
    return parseRobotsPolicy(resource.text);
  } catch {
    return allowAllPolicy();
  }
}

export function parseRobotsPolicy(text) {
  const groups = [];
  let currentAgents = [];
  let currentRules = [];

  const commit = () => {
    if (currentAgents.length || currentRules.length) {
      groups.push({
        agents: currentAgents.map((agent) => agent.toLowerCase()),
        rules: currentRules
      });
    }
    currentAgents = [];
    currentRules = [];
  };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }

    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      if (currentRules.length) {
        commit();
      }
      currentAgents.push(value);
      continue;
    }

    if ((key === "allow" || key === "disallow") && currentAgents.length) {
      currentRules.push({
        type: key,
        path: value
      });
    }
  }

  commit();

  const matchingGroups = groups.filter((group) => group.agents.includes("*") || group.agents.includes("llms-txt-generator"));
  const rules = matchingGroups.flatMap((group) => group.rules);

  return {
    isAllowed(urlLike) {
      const url = urlLike instanceof URL ? urlLike : new URL(urlLike);
      const path = `${url.pathname}${url.search}`;
      let bestRule = null;

      for (const rule of rules) {
        if (!rule.path) {
          continue;
        }

        const pattern = robotsPatternToRegExp(rule.path);
        if (pattern.test(path) && (!bestRule || rule.path.length > bestRule.path.length)) {
          bestRule = rule;
        }
      }

      return !bestRule || bestRule.type === "allow";
    }
  };
}

export function parseRobotsSitemaps(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);
}

export function extractRobotsSitemapsForRoot(text, rootUrl) {
  const root = rootUrl instanceof URL ? rootUrl : new URL(rootUrl);
  return parseRobotsSitemaps(text)
    .map((sitemap) => normalizeCrawlUrl(sitemap, root))
    .filter(Boolean)
    .map((url) => url.href);
}

function allowAllPolicy() {
  return {
    isAllowed() {
      return true;
    }
  };
}

function robotsPatternToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$/g, "$");

  return new RegExp(`^${escaped}`);
}
