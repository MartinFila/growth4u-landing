import dns from "node:dns/promises";
import net from "node:net";

const dnsCache = new Map();

export function normalizeInputUrl(input) {
  if (typeof input !== "string") {
    throw new Error("URL must be a string.");
  }

  let value = input.trim();
  if (!value) {
    throw new Error("Enter a website URL.");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  url.hash = "";
  normalizeUrlParts(url);
  return url;
}

export function normalizeCrawlUrl(candidate, base) {
  let url;
  try {
    url = candidate instanceof URL ? new URL(candidate.href) : new URL(candidate, base);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }

  normalizeUrlParts(url);
  return url;
}

export function sameSiteHostname(candidateHostname, rootHostname) {
  const candidate = candidateHostname.toLowerCase().replace(/^www\./, "");
  const root = rootHostname.toLowerCase().replace(/^www\./, "");
  return candidate === root;
}

export function isInternalPageUrl(candidate, root) {
  const rootUrl = root instanceof URL ? root : new URL(root);
  const url = candidate instanceof URL ? candidate : new URL(candidate);

  if (!["http:", "https:"].includes(url.protocol)) {
    return false;
  }

  if (!sameSiteHostname(url.hostname, rootUrl.hostname)) {
    return false;
  }

  return !hasBlockedExtension(url.pathname);
}

export function hasBlockedExtension(pathname) {
  return /\.(?:7z|avi|bmp|css|csv|doc|docx|eot|gif|gz|ico|jpeg|jpg|js|json|map|mov|mp3|mp4|mpeg|otf|pdf|png|ppt|pptx|rar|rss|svg|tar|tgz|ttf|webm|webp|woff|woff2|xls|xlsx|zip)$/i.test(
    pathname
  );
}

export function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test")
  );
}

export function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();

    if (normalized.startsWith("::ffff:")) {
      return isPrivateIp(normalized.replace("::ffff:", ""));
    }

    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("2001:db8:")
    );
  }

  return false;
}

export async function assertPublicUrl(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(urlLike);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("This hostname is not allowed.");
  }

  if (net.isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) {
      throw new Error("Private and local IP addresses are not allowed.");
    }
    return url;
  }

  let addresses = dnsCache.get(url.hostname);
  if (!addresses) {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    dnsCache.set(url.hostname, addresses);
  }

  if (!addresses.length) {
    throw new Error("Hostname did not resolve.");
  }

  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("This hostname resolves to a private or local address.");
  }

  return url;
}

function normalizeUrlParts(url) {
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  if ([...url.searchParams.keys()].length === 0) {
    url.search = "";
  }
}
