#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

export const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;
export const DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow";
export const MAX_BATCH_SIZE = 10000;
export const DEFAULT_KEY_VERIFY_ATTEMPTS = 6;
export const DEFAULT_KEY_VERIFY_DELAYS_MS = [5000, 10000, 15000, 15000, 15000];
export const DEFAULT_VERIFICATION_RETRY_DELAY_MS = 15000;
export const DEFAULT_STATE_PATH = path.join(ROOT_DIR, ".tmp", "indexnow-state.json");
export const DEFAULT_PUBLIC_DIR = path.join(ROOT_DIR, "public");

const HUB_SEGMENTS = new Set(["matches", "leagues", "teams", "about", "faq", "privacy"]);
const EDITION_PREFIX_RE = /^[a-z]{2}(?:-[a-z]{2})?$/;
const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(url) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname += "/";
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function readBaseUrl(rootDir = ROOT_DIR) {
  const hugoTomlPath = path.join(rootDir, "hugo.toml");
  if (!fs.existsSync(hugoTomlPath)) {
    return "https://cardapiofc.com/";
  }
  const content = fs.readFileSync(hugoTomlPath, "utf8");
  const match = content.match(/^\s*baseURL\s*=\s*(?:"([^"]+)"|'([^']+)')/m);
  const raw = match ? (match[1] ?? match[2] ?? "").trim() : "";
  if (!raw) return "https://cardapiofc.com/";
  try {
    return normalizeBaseUrl(raw);
  } catch {
    return "https://cardapiofc.com/";
  }
}

export function validateKey(raw) {
  if (typeof raw !== "string") {
    throw new Error("INDEXNOW_KEY is missing or not a string.");
  }
  const key = raw.trim();
  if (!key) {
    throw new Error("INDEXNOW_KEY is empty.");
  }
  if (key.length < 8 || key.length > 128) {
    throw new Error(
      `INDEXNOW_KEY length (${key.length}) must be between 8 and 128 characters.`
    );
  }
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      "INDEXNOW_KEY contains invalid characters; only [a-zA-Z0-9-] are allowed."
    );
  }
  return key;
}

export function redactKey(text, key) {
  const str = text instanceof Error ? text.message : String(text ?? "");
  if (!key || typeof key !== "string" || key.length === 0) {
    return str;
  }
  return str.split(key).join("[REDACTED]");
}

export function unescapeXml(str) {
  return String(str).replace(
    /&(?:amp|lt|gt|quot|apos);/g,
    (entity) => XML_ENTITIES[entity]
  );
}

export function urlToPublicFile(url, baseUrl, publicDir) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const parsedBase = new URL(normalizedBase);
  const parsedUrl = new URL(url);

  const schemeEnd = url.indexOf("://");
  if (schemeEnd !== -1) {
    const pathStart = url.indexOf("/", schemeEnd + 3);
    if (pathStart !== -1) {
      const rawPath = url.slice(pathStart).split(/[?#]/)[0];
      for (const seg of rawPath.split("/")) {
        let decodedSeg = seg;
        try {
          decodedSeg = decodeURIComponent(seg);
        } catch {
          throw new Error(`Invalid percent-encoding in URL path: ${parsedUrl.pathname}`);
        }
        if (decodedSeg === "..") {
          throw new Error(`Path traversal segment is not allowed in URL: ${rawPath}`);
        }
      }
    }
  }

  if (parsedUrl.origin !== parsedBase.origin) {
    throw new Error(
      `URL origin mismatch: expected ${parsedBase.origin}, got ${parsedUrl.origin}`
    );
  }
  if (!parsedUrl.pathname.startsWith(parsedBase.pathname)) {
    throw new Error(
      `URL path outside baseURL (${parsedBase.pathname}): ${parsedUrl.pathname}`
    );
  }

  const rawRel = parsedUrl.pathname.slice(parsedBase.pathname.length);
  let decodedRel;
  try {
    decodedRel = decodeURIComponent(rawRel);
  } catch {
    throw new Error(`Invalid percent-encoding in URL path: ${parsedUrl.pathname}`);
  }
  if (decodedRel.includes("\0")) {
    throw new Error("Null byte encountered in URL path.");
  }

  const relNoLeading = decodedRel.replace(/^\/+/, "");
  const relFile =
    relNoLeading === "" || relNoLeading.endsWith("/")
      ? `${relNoLeading}index.html`
      : relNoLeading;

  const resolvedRoot = path.resolve(publicDir);
  const resolvedFile = path.resolve(resolvedRoot, relFile);
  if (
    resolvedFile !== resolvedRoot &&
    !resolvedFile.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Resolved file path escapes publicDir: ${relFile}`);
  }
  return resolvedFile;
}

function findTagEnd(str, start) {
  let quote = "";
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

function parseAttrs(openTag) {
  const attrs = Object.create(null);
  let i = openTag.search(/\s/);
  if (i === -1) return attrs;
  const len = openTag.length;

  while (i < len) {
    while (i < len && /[\s>/]/.test(openTag[i])) i++;
    if (i >= len) break;

    const nameStart = i;
    while (i < len && !/[\s=/>]/.test(openTag[i])) i++;
    const name = openTag.slice(nameStart, i).toLowerCase();

    while (i < len && /\s/.test(openTag[i])) i++;
    let val = "";
    if (i < len && openTag[i] === "=") {
      i++;
      while (i < len && /\s/.test(openTag[i])) i++;
      if (i < len && (openTag[i] === '"' || openTag[i] === "'")) {
        const q = openTag[i++];
        const valStart = i;
        while (i < len && openTag[i] !== q) i++;
        val = openTag.slice(valStart, i);
        if (i < len) i++;
      } else {
        const valStart = i;
        while (i < len && !/[\s>]/.test(openTag[i])) i++;
        val = openTag.slice(valStart, i);
      }
    }
    if (name && !(name in attrs)) {
      attrs[name] = val;
    }
  }
  return attrs;
}

function isTagNameBoundary(ch) {
  return !ch || /[\s>/]/.test(ch);
}

export function stripFreshnessFooters(html) {
  const lower = html.toLowerCase();
  let out = "";
  let pos = 0;

  while (pos < html.length) {
    const start = lower.indexOf("<footer", pos);
    if (start === -1) {
      out += html.slice(pos);
      break;
    }
    if (!isTagNameBoundary(lower[start + 7])) {
      out += html.slice(pos, start + 7);
      pos = start + 7;
      continue;
    }
    const tagEnd = findTagEnd(html, start);
    if (tagEnd === -1) {
      out += html.slice(pos);
      break;
    }
    const openTag = html.slice(start, tagEnd + 1);
    const attrs = parseAttrs(openTag);
    const classTokens = (attrs.class || "").toLowerCase().split(/\s+/);
    if (!classTokens.includes("cfc-freshness")) {
      out += html.slice(pos, tagEnd + 1);
      pos = tagEnd + 1;
      continue;
    }
    const closeIdx = lower.indexOf("</footer>", tagEnd + 1);
    if (closeIdx === -1) {
      out += html.slice(pos, tagEnd + 1);
      pos = tagEnd + 1;
      continue;
    }
    out += html.slice(pos, start);
    pos = closeIdx + 9;
  }
  return out;
}

export function extractSeoHead(html) {
  const lower = html.toLowerCase();
  let hs = -1;
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const idx = lower.indexOf("<head", searchFrom);
    if (idx === -1) return "";
    if (isTagNameBoundary(lower[idx + 5])) {
      hs = idx;
      break;
    }
    searchFrom = idx + 5;
  }
  if (hs === -1) return "";

  const headOpenEnd = findTagEnd(html, hs);
  if (headOpenEnd === -1) return "";
  const he = lower.indexOf("</head>", headOpenEnd + 1);
  if (he === -1) return "";

  const head = html.slice(headOpenEnd + 1, he);
  const lowerHead = head.toLowerCase();
  const parts = [];
  let i = 0;

  while (i < head.length) {
    const lt = head.indexOf("<", i);
    if (lt === -1) break;

    if (head.startsWith("<!--", lt)) {
      const commentEnd = head.indexOf("-->", lt + 4);
      if (commentEnd === -1) break;
      i = commentEnd + 3;
      continue;
    }

    if (lowerHead.startsWith("<title", lt) && isTagNameBoundary(lowerHead[lt + 6])) {
      const tagEnd = findTagEnd(head, lt);
      if (tagEnd === -1) break;
      const close = lowerHead.indexOf("</title>", tagEnd + 1);
      if (close === -1) {
        i = tagEnd + 1;
        continue;
      }
      parts.push(head.slice(lt, close + 8));
      i = close + 8;
      continue;
    }

    if (lowerHead.startsWith("<meta", lt) && isTagNameBoundary(lowerHead[lt + 5])) {
      const tagEnd = findTagEnd(head, lt);
      if (tagEnd === -1) break;
      const tag = head.slice(lt, tagEnd + 1);
      const attrs = parseAttrs(tag);
      const name = (attrs.name || "").toLowerCase();
      const prop = (attrs.property || "").toLowerCase();
      const httpEquiv = (attrs["http-equiv"] || "").toLowerCase();
      if (
        name === "description" ||
        name === "robots" ||
        name.startsWith("twitter:") ||
        prop.startsWith("og:") ||
        httpEquiv === "content-language"
      ) {
        parts.push(tag);
      }
      i = tagEnd + 1;
      continue;
    }

    if (lowerHead.startsWith("<link", lt) && isTagNameBoundary(lowerHead[lt + 5])) {
      const tagEnd = findTagEnd(head, lt);
      if (tagEnd === -1) break;
      const tag = head.slice(lt, tagEnd + 1);
      const attrs = parseAttrs(tag);
      const relTokens = (attrs.rel || "").toLowerCase().split(/\s+/);
      if (relTokens.includes("canonical") || relTokens.includes("alternate")) {
        parts.push(tag);
      }
      i = tagEnd + 1;
      continue;
    }

    if (lowerHead.startsWith("<script", lt) && isTagNameBoundary(lowerHead[lt + 7])) {
      const tagEnd = findTagEnd(head, lt);
      if (tagEnd === -1) break;
      const close = lowerHead.indexOf("</script>", tagEnd + 1);
      if (close === -1) {
        i = tagEnd + 1;
        continue;
      }
      const attrs = parseAttrs(head.slice(lt, tagEnd + 1));
      const mimeType = (attrs.type || "").toLowerCase().split(";")[0].trim();
      if (mimeType === "application/ld+json") {
        parts.push(head.slice(lt, close + 9));
      }
      i = close + 9;
      continue;
    }

    if (lowerHead.startsWith("<style", lt) && isTagNameBoundary(lowerHead[lt + 6])) {
      const tagEnd = findTagEnd(head, lt);
      if (tagEnd === -1) break;
      const close = lowerHead.indexOf("</style>", tagEnd + 1);
      if (close === -1) {
        i = tagEnd + 1;
        continue;
      }
      i = close + 8;
      continue;
    }

    i = lt + 1;
  }

  return parts.join("\n");
}

function extractMain(html) {
  const lower = html.toLowerCase();
  let ms = -1;
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const idx = lower.indexOf("<main", searchFrom);
    if (idx === -1) break;
    if (isTagNameBoundary(lower[idx + 5])) {
      ms = idx;
      break;
    }
    searchFrom = idx + 5;
  }
  if (ms === -1) return html;
  const openEnd = findTagEnd(html, ms);
  if (openEnd === -1) return html;
  const me = lower.indexOf("</main>", openEnd + 1);
  if (me === -1) return html;
  return html.slice(openEnd + 1, me);
}

export function fingerprintHtml(html) {
  const seoHead = extractSeoHead(html);
  const cleanedMain = stripFreshnessFooters(extractMain(html));
  return crypto
    .createHash("sha256")
    .update(seoHead)
    .update("\0")
    .update(cleanedMain)
    .digest("hex")
    .slice(0, 16);
}

function extractSitemapLocs(xml) {
  const locs = [];
  for (const block of xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
    const locMatch = block[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
    if (locMatch) locs.push(unescapeXml(locMatch[1]));
  }
  if (locs.length > 0) return locs;
  for (const locMatch of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    locs.push(unescapeXml(locMatch[1]));
  }
  return locs;
}

function extractUrlsetLocs(xml) {
  const locs = [];
  for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const locMatch = block[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
    if (locMatch) locs.push(unescapeXml(locMatch[1]));
  }
  return locs;
}

function validateAndDedupeUrls(rawUrls, normalizedBase) {
  const expectedHost = new URL(normalizedBase).host;
  const unique = new Set();
  for (const u of rawUrls) {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`Invalid URL in sitemap: ${u}`);
    }
    if (parsed.host !== expectedHost || !u.startsWith(normalizedBase)) {
      throw new Error(
        `Off-host or out-of-scope URL in sitemap (expected ${normalizedBase}): ${u}`
      );
    }
    unique.add(u);
  }

  return [...unique].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function collectSitemapUrls(publicDir, baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const rootSitemap = path.join(publicDir, "sitemap.xml");
  if (!fs.existsSync(rootSitemap)) {
    throw new Error(`Sitemap not found: ${rootSitemap}`);
  }

  const rootXml = fs.readFileSync(rootSitemap, "utf8");
  const rawUrls = [];

  if (/<sitemapindex\b/i.test(rootXml)) {
    const childSitemaps = extractSitemapLocs(rootXml);
    for (const childUrl of childSitemaps) {
      const childFile = urlToPublicFile(childUrl, normalizedBase, publicDir);
      if (!fs.existsSync(childFile)) {
        throw new Error(`Child sitemap missing for ${childUrl}: ${childFile}`);
      }
      const childXml = fs.readFileSync(childFile, "utf8");
      for (const u of extractUrlsetLocs(childXml)) {
        rawUrls.push(u);
      }
    }
  } else if (/<urlset\b/i.test(rootXml)) {
    for (const u of extractUrlsetLocs(rootXml)) {
      rawUrls.push(u);
    }
  } else {
    throw new Error(`Unrecognized sitemap format in ${rootSitemap}`);
  }

  return validateAndDedupeUrls(rawUrls, normalizedBase);
}

export async function collectLiveSitemapUrls(
  baseUrl,
  { fetchImpl = fetch } = {}
) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const expectedHost = new URL(normalizedBase).host;
  const rootSitemapUrl = `${normalizedBase}sitemap.xml`;
  const headers = {
    "User-Agent": "CardapioFC-IndexNow/1.0 (+https://cardapiofc.com)",
  };

  const rootRes = await fetchImpl(rootSitemapUrl, { method: "GET", headers });
  if (rootRes.status !== 200) {
    throw new Error(
      `Failed to fetch live sitemap ${rootSitemapUrl}: HTTP ${rootRes.status}`
    );
  }
  const rootXml = await rootRes.text();
  const rawUrls = [];

  if (/<sitemapindex\b/i.test(rootXml)) {
    const childSitemaps = extractSitemapLocs(rootXml);
    for (const childUrl of childSitemaps) {
      let parsedChild;
      try {
        parsedChild = new URL(childUrl);
      } catch {
        throw new Error(`Invalid child sitemap URL: ${childUrl}`);
      }
      if (parsedChild.host !== expectedHost || !childUrl.startsWith(normalizedBase)) {
        throw new Error(
          `Off-host or out-of-scope child sitemap URL (expected ${normalizedBase}): ${childUrl}`
        );
      }
    }

    const childXmlList = await Promise.all(
      childSitemaps.map(async (childUrl) => {
        const childRes = await fetchImpl(childUrl, { method: "GET", headers });
        if (childRes.status !== 200) {
          throw new Error(
            `Failed to fetch live child sitemap ${childUrl}: HTTP ${childRes.status}`
          );
        }
        return childRes.text();
      })
    );

    for (const childXml of childXmlList) {
      for (const u of extractUrlsetLocs(childXml)) {
        rawUrls.push(u);
      }
    }
  } else if (/<urlset\b/i.test(rootXml)) {
    for (const u of extractUrlsetLocs(rootXml)) {
      rawUrls.push(u);
    }
  } else {
    throw new Error(`Unrecognized live sitemap format at ${rootSitemapUrl}`);
  }

  return validateAndDedupeUrls(rawUrls, normalizedBase);
}

function toRelPath(url, baseUrl) {
  const parsedBase = new URL(normalizeBaseUrl(baseUrl));
  const parsedUrl = new URL(url);
  const rel = parsedUrl.pathname.slice(parsedBase.pathname.length);
  return "/" + rel + parsedUrl.search;
}

function toFullUrl(relPath, baseUrl) {
  if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
    return relPath;
  }
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return normalizedBase + relPath.replace(/^\/+/, "");
}

export async function buildSnapshot(
  publicDir,
  baseUrl,
  { concurrency = 32 } = {}
) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const allUrls = collectSitemapUrls(publicDir, normalizedBase);
  const urls = {};
  const missing = [];

  const workerCount = Math.max(1, Math.min(concurrency, allUrls.length || 1));
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= allUrls.length) break;
      const url = allUrls[idx];
      const filePath = urlToPublicFile(url, normalizedBase, publicDir);
      let html;
      try {
        html = await fs.promises.readFile(filePath, "utf8");
      } catch (err) {
        if (err && err.code === "ENOENT") {
          missing.push(url);
          continue;
        }
        throw err;
      }
      const relPath = toRelPath(url, normalizedBase);
      urls[relPath] = fingerprintHtml(html);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const sortedUrls = {};
  for (const key of Object.keys(urls).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    sortedUrls[key] = urls[key];
  }
  return { urls: sortedUrls, missing };
}

export function urlPriority(relPath) {
  const pathOnly = relPath.split(/[?#]/)[0];
  const segs = pathOnly.split("/").filter(Boolean);
  if (segs.length === 0) return 0;

  const hasEdition = EDITION_PREFIX_RE.test(segs[0]);
  const section = hasEdition ? segs[1] : segs[0];
  const tailLen = hasEdition ? segs.length - 1 : segs.length;

  if (!section) return 0;
  if (section === "match") return 1;
  if (section === "leagues") return tailLen > 1 ? 2 : 0;
  if (section === "team") return 3;
  if (tailLen === 1 && HUB_SEGMENTS.has(section)) return 0;
  return 4;
}

export function computeDiff(
  prevUrls = {},
  currUrls = {},
  { submitAll = false, baseUrl = "https://cardapiofc.com/" } = {}
) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const prev = prevUrls || {};
  const curr = currUrls || {};
  const added = [];
  const modified = [];
  const removed = [];
  const changes = [];

  for (const [relPath, hash] of Object.entries(curr)) {
    const url = toFullUrl(relPath, normalizedBase);
    if (!(relPath in prev)) {
      added.push(relPath);
      changes.push({ relPath, url, kind: "added", hash });
    } else if (prev[relPath] !== hash || submitAll) {
      modified.push(relPath);
      changes.push({ relPath, url, kind: "modified", hash });
    }
  }

  for (const relPath of Object.keys(prev)) {
    if (!(relPath in curr)) {
      const url = toFullUrl(relPath, normalizedBase);
      removed.push(relPath);
      changes.push({ relPath, url, kind: "removed", hash: null });
    }
  }

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  added.sort(cmp);
  modified.sort(cmp);
  removed.sort(cmp);
  changes.sort(
    (a, b) => urlPriority(a.relPath) - urlPriority(b.relPath) || cmp(a.relPath, b.relPath)
  );

  return { added, modified, removed, changes };
}

export function writeKeyFile({ key, publicDir = DEFAULT_PUBLIC_DIR }) {
  const validKey = validateKey(key);
  fs.mkdirSync(publicDir, { recursive: true });
  const filePath = path.join(publicDir, `${validKey}.txt`);
  fs.writeFileSync(filePath, validKey, "utf8");
  const written = fs.readFileSync(filePath, "utf8");
  const byteLen = fs.statSync(filePath).size;
  if (written !== validKey || byteLen !== Buffer.byteLength(validKey, "utf8")) {
    throw new Error("Written IndexNow key file failed verification check.");
  }
  return { filePath };
}

export async function verifyLiveKey({
  key,
  baseUrl,
  fetchImpl = fetch,
  attempts = DEFAULT_KEY_VERIFY_ATTEMPTS,
  retryDelaysMs = DEFAULT_KEY_VERIFY_DELAYS_MS,
  logger = console,
}) {
  const validKey = validateKey(key);
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const keyUrl = `${normalizedBase}${validKey}.txt`;
  const totalAttempts = Math.max(1, attempts);
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const res = await fetchImpl(keyUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "CardapioFC-IndexNow/1.0 (+https://cardapiofc.com)",
        },
      });

      if (res.status !== 200) {
        const loc = res.headers?.get?.("location");
        const detail = loc
          ? `HTTP ${res.status} (redirect to ${redactKey(loc, validKey)})`
          : `HTTP ${res.status}`;
        lastError = new Error(`Live IndexNow key verification failed: ${detail}`);
      } else {
        const contentType = (res.headers?.get?.("content-type") || "").toLowerCase();
        if (contentType.includes("text/html")) {
          throw new Error(
            `Live IndexNow key verification failed: unexpected Content-Type ${contentType}`
          );
        }
        if (!contentType.includes("text/plain")) {
          logger?.warn?.(
            `Warning: live IndexNow key file returned Content-Type "${contentType || "(missing)"}" instead of text/plain.`
          );
        }

        const body = await res.text();
        if (body !== validKey) {
          const hint = body.trim() === validKey
            ? "body has leading/trailing whitespace or newline"
            : `expected ${validKey.length} bytes, got ${body.length} bytes`;
          throw new Error(
            `Live IndexNow key verification failed: body mismatch (${hint})`
          );
        }

        return {
          ok: true,
          status: 200,
          keyLocation: redactKey(keyUrl, validKey),
        };
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("body mismatch") ||
          err.message.includes("unexpected Content-Type"))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < totalAttempts) {
      const delayMs =
        retryDelaysMs[attempt - 1] ??
        retryDelaysMs[retryDelaysMs.length - 1] ??
        0;
      await sleep(delayMs);
    }
  }

  throw new Error(redactKey(lastError?.message || "Live key check failed", validKey));
}

function parseRetryAfterMs(headerVal) {
  if (!headerVal) return null;
  const trimmed = String(headerVal).trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, 30000);
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, Math.min(parsedDate - Date.now(), 30000));
  }
  return null;
}

export async function submitBatch({
  endpoint = DEFAULT_ENDPOINT,
  host,
  key,
  keyLocation,
  urlList,
  fetchImpl = fetch,
  maxRetries = 3,
  baseDelayMs = 2000,
  verificationDelayMs = DEFAULT_VERIFICATION_RETRY_DELAY_MS,
}) {
  const validKey = validateKey(key);
  const body = JSON.stringify({
    host,
    key: validKey,
    keyLocation,
    urlList,
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "CardapioFC-IndexNow/1.0 (+https://cardapiofc.com)",
        },
        body,
      });
    } catch (err) {
      if (attempt >= maxRetries) {
        throw new Error(
          redactKey(
            `IndexNow POST network error after ${attempt + 1} attempts: ${err?.message || err}`,
            validKey
          )
        );
      }
      await sleep(Math.min(baseDelayMs * 2 ** attempt, 30000));
      continue;
    }

    if (res.status === 200 || res.status === 202) {
      try {
        await res.text();
      } catch {
        // Ignore body read error after successful status
      }
      return { status: res.status, attempts: attempt + 1 };
    }

    let snippet = "";
    try {
      snippet = redactKey((await res.text()).slice(0, 300).trim(), validKey);
    } catch {
      snippet = "";
    }
    const suffix = snippet ? `: ${snippet}` : "";

    if (res.status === 403 && snippet.includes("SiteVerificationNotCompleted")) {
      if (attempt >= maxRetries) {
        throw new Error(
          `IndexNow failed after ${attempt + 1} attempts with HTTP 403${suffix}`
        );
      }
      await sleep(Math.min(verificationDelayMs * (attempt + 1), 60000));
      continue;
    }

    if (res.status === 400 || res.status === 403 || res.status === 422) {
      throw new Error(`IndexNow rejected batch with HTTP ${res.status}${suffix}`);
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= maxRetries) {
        throw new Error(
          `IndexNow failed after ${attempt + 1} attempts with HTTP ${res.status}${suffix}`
        );
      }
      const retryAfterMs = parseRetryAfterMs(res.headers?.get?.("retry-after"));
      const delayMs =
        retryAfterMs !== null
          ? retryAfterMs
          : Math.min(baseDelayMs * 2 ** attempt, 30000);
      await sleep(delayMs);
      continue;
    }

    throw new Error(`IndexNow returned unexpected HTTP ${res.status}${suffix}`);
  }
}

function loadState(statePath, normalizedBase, logger) {
  if (!fs.existsSync(statePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      !parsed.urls ||
      typeof parsed.urls !== "object" ||
      Array.isArray(parsed.urls)
    ) {
      logger?.warn?.(`Ignoring invalid IndexNow state format at ${statePath}.`);
      return {};
    }
    if (parsed.baseUrl && normalizeBaseUrl(parsed.baseUrl) !== normalizedBase) {
      logger?.warn?.(
        `IndexNow state baseUrl changed (${parsed.baseUrl} -> ${normalizedBase}); resetting baseline.`
      );
      return {};
    }
    return parsed.urls;
  } catch (err) {
    logger?.warn?.(`Failed to read IndexNow state (${err.message}); resetting baseline.`);
    return {};
  }
}

function saveStateAtomic(statePath, normalizedBase, urls) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const payload = JSON.stringify(
    {
      version: 1,
      baseUrl: normalizedBase,
      updatedAt: new Date().toISOString(),
      urls,
    },
    null,
    2
  );
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, payload + "\n", "utf8");
  fs.renameSync(tmpPath, statePath);
}

function writeGithubOutputs(values) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return;
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}\n`);
  fs.appendFileSync(outFile, lines.join(""), "utf8");
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function submitUrlBatches({
  batches,
  endpoint,
  host,
  key,
  keyLocation,
  minDelayMs,
  maxRetries,
  baseDelayMs,
  verificationDelayMs,
  fetchImpl,
  logger,
  onBatchAccepted,
}) {
  let submittedCount = 0;
  let failedBatches = 0;
  let failureError = null;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (i > 0 && minDelayMs > 0) {
      await sleep(minDelayMs);
    }
    const urlList = batch.map((item) => (typeof item === "string" ? item : item.url));
    try {
      const res = await submitBatch({
        endpoint,
        host,
        key,
        keyLocation,
        urlList,
        fetchImpl,
        maxRetries,
        baseDelayMs,
        verificationDelayMs,
      });
      if (onBatchAccepted) {
        onBatchAccepted(batch);
      }
      submittedCount += batch.length;
      logger.log(
        `IndexNow batch ${i + 1}/${batches.length} accepted (HTTP ${res.status}, ${batch.length} URLs).`
      );
    } catch (err) {
      failedBatches = batches.length - i;
      failureError = err instanceof Error ? err : new Error(String(err));
      break;
    }
  }

  return { submittedCount, failedBatches, failureError };
}

function handleRunFailure(failureError, keyForRedact, softFail, logger) {
  const safeMsg = redactKey(failureError.message, keyForRedact);
  if (softFail) {
    const prefix = process.env.GITHUB_ACTIONS === "true" ? "::warning::" : "Warning: ";
    logger.warn(`${prefix}${safeMsg}`);
    return safeMsg;
  }
  throw new Error(safeMsg);
}

export async function runSubmit(options = {}) {
  const {
    key = process.env.INDEXNOW_KEY,
    publicDir = DEFAULT_PUBLIC_DIR,
    statePath = DEFAULT_STATE_PATH,
    baseUrl = readBaseUrl(ROOT_DIR),
    endpoint = DEFAULT_ENDPOINT,
    dryRun = false,
    submitAll = false,
    softFail = false,
    skipKeyCheck = false,
    batchSize = MAX_BATCH_SIZE,
    minDelayMs = 1000,
    keyVerifyAttempts = DEFAULT_KEY_VERIFY_ATTEMPTS,
    retryDelaysMs = DEFAULT_KEY_VERIFY_DELAYS_MS,
    maxRetries = 3,
    baseDelayMs = 2000,
    verificationDelayMs = DEFAULT_VERIFICATION_RETRY_DELAY_MS,
    fetchImpl = fetch,
    logger = console,
  } = options;

  const normalizedBase = normalizeBaseUrl(baseUrl);
  const effectiveBatchSize = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Number(batchSize) || MAX_BATCH_SIZE)
  );

  const prevUrls = loadState(statePath, normalizedBase, logger);
  const { urls: currUrls, missing } = await buildSnapshot(publicDir, normalizedBase);
  const totalUrls = Object.keys(currUrls).length;
  if (missing.length > 0) {
    logger.warn(
      `Warning: ${missing.length} URL(s) in sitemap are missing on disk in ${publicDir}.`
    );
  }

  const diff = computeDiff(prevUrls, currUrls, {
    submitAll,
    baseUrl: normalizedBase,
  });
  const batches = chunkArray(diff.changes, effectiveBatchSize);

  logger.log(
    `IndexNow snapshot: ${totalUrls} URLs indexed (${diff.added.length} added, ${diff.modified.length} modified, ${diff.removed.length} removed; ${diff.changes.length} to submit in ${batches.length} batch(es)).`
  );

  if (dryRun) {
    for (let i = 0; i < batches.length; i++) {
      logger.log(`  Dry-run batch ${i + 1}/${batches.length}: ${batches[i].length} URL(s)`);
    }
    const sample = diff.changes.slice(0, 5).map((c) => `${c.kind}: ${c.url}`);
    if (sample.length > 0) {
      logger.log(`  Sample changes:\n    ${sample.join("\n    ")}`);
    }
    writeGithubOutputs({
      state_changed: "false",
      submitted_count: 0,
      failed_batches: 0,
    });
    return {
      ok: true,
      dryRun: true,
      totalUrls,
      missing,
      diff,
      batches: batches.length,
      submittedCount: 0,
      failedBatches: 0,
      stateChanged: false,
    };
  }

  let validKey = "";
  let submittedCount = 0;
  let failedBatches = 0;
  let stateChanged = false;
  let failureError = null;

  try {
    validKey = validateKey(key);

    if (diff.changes.length === 0) {
      logger.log("No URL changes detected; skipping IndexNow submission.");
      writeGithubOutputs({
        state_changed: "false",
        submitted_count: 0,
        failed_batches: 0,
      });
      return {
        ok: true,
        dryRun: false,
        totalUrls,
        missing,
        diff,
        batches: 0,
        submittedCount: 0,
        failedBatches: 0,
        stateChanged: false,
      };
    }

    if (!skipKeyCheck) {
      await verifyLiveKey({
        key: validKey,
        baseUrl: normalizedBase,
        fetchImpl,
        attempts: keyVerifyAttempts,
        retryDelaysMs,
        logger,
      });
      logger.log("Live IndexNow key file verified (HTTP 200 exact match).");
    }

    const host = new URL(normalizedBase).host;
    const keyLocation = `${normalizedBase}${validKey}.txt`;
    const nextUrls = { ...prevUrls };

    const batchRes = await submitUrlBatches({
      batches,
      endpoint,
      host,
      key: validKey,
      keyLocation,
      minDelayMs,
      maxRetries,
      baseDelayMs,
      verificationDelayMs,
      fetchImpl,
      logger,
      onBatchAccepted: (batch) => {
        for (const item of batch) {
          if (item.kind === "removed") {
            delete nextUrls[item.relPath];
          } else {
            nextUrls[item.relPath] = item.hash;
          }
        }
      },
    });

    submittedCount = batchRes.submittedCount;
    failedBatches = batchRes.failedBatches;
    failureError = batchRes.failureError;

    if (submittedCount > 0) {
      saveStateAtomic(statePath, normalizedBase, nextUrls);
      stateChanged = true;
    }
  } catch (err) {
    failureError = err instanceof Error ? err : new Error(String(err));
  }

  writeGithubOutputs({
    state_changed: String(stateChanged),
    submitted_count: submittedCount,
    failed_batches: failedBatches,
  });

  if (failureError) {
    const safeMsg = handleRunFailure(failureError, validKey || key, softFail, logger);
    return {
      ok: false,
      dryRun: false,
      totalUrls,
      missing,
      diff,
      batches: batches.length,
      submittedCount,
      failedBatches,
      stateChanged,
      error: safeMsg,
    };
  }

  return {
    ok: true,
    dryRun: false,
    totalUrls,
    missing,
    diff,
    batches: batches.length,
    submittedCount,
    failedBatches: 0,
    stateChanged,
  };
}

export async function runSubmitLive(options = {}) {
  const {
    key = process.env.INDEXNOW_KEY,
    baseUrl = readBaseUrl(ROOT_DIR),
    endpoint = DEFAULT_ENDPOINT,
    urls = null,
    batchSize = MAX_BATCH_SIZE,
    minDelayMs = 1000,
    keyVerifyAttempts = DEFAULT_KEY_VERIFY_ATTEMPTS,
    retryDelaysMs = DEFAULT_KEY_VERIFY_DELAYS_MS,
    maxRetries = 3,
    baseDelayMs = 2000,
    verificationDelayMs = DEFAULT_VERIFICATION_RETRY_DELAY_MS,
    skipKeyCheck = false,
    softFail = false,
    fetchImpl = fetch,
    logger = console,
  } = options;

  const normalizedBase = normalizeBaseUrl(baseUrl);
  const effectiveBatchSize = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Number(batchSize) || MAX_BATCH_SIZE)
  );
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  let validKey = "";
  let totalUrls = 0;
  let batches = [];
  let submittedCount = 0;
  let failedBatches = 0;
  let failureError = null;

  try {
    validKey = validateKey(key);

    if (!skipKeyCheck) {
      await verifyLiveKey({
        key: validKey,
        baseUrl: normalizedBase,
        fetchImpl,
        attempts: keyVerifyAttempts,
        retryDelaysMs,
        logger,
      });
      logger.log("Live IndexNow key file verified (HTTP 200 exact match).");
    }

    const rawTargetUrls =
      Array.isArray(urls) && urls.length > 0
        ? validateAndDedupeUrls(
            urls.map((u) => new URL(u).toString()),
            normalizedBase
          )
        : await collectLiveSitemapUrls(normalizedBase, { fetchImpl });

    const sortedUrls = [...rawTargetUrls].sort((a, b) => {
      const ra = toRelPath(a, normalizedBase);
      const rb = toRelPath(b, normalizedBase);
      return urlPriority(ra) - urlPriority(rb) || cmp(ra, rb);
    });

    totalUrls = sortedUrls.length;
    batches = chunkArray(sortedUrls, effectiveBatchSize);

    logger.log(
      `IndexNow live submission: ${totalUrls} URL(s) in ${batches.length} batch(es).`
    );

    if (totalUrls === 0) {
      return {
        ok: true,
        totalUrls: 0,
        batches: 0,
        submittedCount: 0,
        failedBatches: 0,
      };
    }

    const host = new URL(normalizedBase).host;
    const keyLocation = `${normalizedBase}${validKey}.txt`;
    const batchRes = await submitUrlBatches({
      batches,
      endpoint,
      host,
      key: validKey,
      keyLocation,
      minDelayMs,
      maxRetries,
      baseDelayMs,
      verificationDelayMs,
      fetchImpl,
      logger,
    });

    submittedCount = batchRes.submittedCount;
    failedBatches = batchRes.failedBatches;
    failureError = batchRes.failureError;
  } catch (err) {
    failureError = err instanceof Error ? err : new Error(String(err));
  }

  if (failureError) {
    const safeMsg = handleRunFailure(failureError, validKey || key, softFail, logger);
    return {
      ok: false,
      totalUrls,
      batches: batches.length,
      submittedCount,
      failedBatches,
      error: safeMsg,
    };
  }

  return {
    ok: true,
    totalUrls,
    batches: batches.length,
    submittedCount,
    failedBatches: 0,
  };
}

function parseCliArgs(argv) {
  const flags = {};
  const positionals = [];
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command: positionals[0] || "", flags };
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const rawKey = process.env.INDEXNOW_KEY || "";

  if (command === "write-key") {
    const publicDir = flags["public-dir"]
      ? path.resolve(flags["public-dir"])
      : DEFAULT_PUBLIC_DIR;
    const { filePath } = writeKeyFile({ key: rawKey, publicDir });
    console.log(`Wrote IndexNow key file: ${redactKey(filePath, rawKey.trim())}`);
    return;
  }

  if (command === "verify-key") {
    const baseUrl = flags["base-url"] || readBaseUrl(ROOT_DIR);
    const attempts = flags.attempts ? Number(flags.attempts) : DEFAULT_KEY_VERIFY_ATTEMPTS;
    const res = await verifyLiveKey({
      key: rawKey,
      baseUrl,
      attempts,
      logger: console,
    });
    console.log(
      `IndexNow live key verified: HTTP ${res.status} at ${res.keyLocation}`
    );
    return;
  }

  if (command === "submit") {
    await runSubmit({
      key: rawKey,
      publicDir: flags["public-dir"]
        ? path.resolve(flags["public-dir"])
        : DEFAULT_PUBLIC_DIR,
      statePath: flags.state
        ? path.resolve(flags.state)
        : DEFAULT_STATE_PATH,
      baseUrl: flags["base-url"] || readBaseUrl(ROOT_DIR),
      endpoint: flags.endpoint || DEFAULT_ENDPOINT,
      dryRun: Boolean(flags["dry-run"]),
      submitAll: Boolean(flags.all),
      softFail: Boolean(flags["soft-fail"]),
      skipKeyCheck: Boolean(flags["skip-key-check"]),
      batchSize: flags["batch-size"] ? Number(flags["batch-size"]) : MAX_BATCH_SIZE,
      minDelayMs: flags["min-delay-ms"] !== undefined ? Number(flags["min-delay-ms"]) : 1000,
      logger: console,
    });
    return;
  }

  if (command === "submit-live") {
    const explicitUrls =
      typeof flags.url === "string" && flags.url.trim()
        ? [flags.url.trim()]
        : null;
    await runSubmitLive({
      key: rawKey,
      baseUrl: flags["base-url"] || readBaseUrl(ROOT_DIR),
      endpoint: flags.endpoint || DEFAULT_ENDPOINT,
      urls: explicitUrls,
      softFail: Boolean(flags["soft-fail"]),
      skipKeyCheck: Boolean(flags["skip-key-check"]),
      batchSize: flags["batch-size"] ? Number(flags["batch-size"]) : MAX_BATCH_SIZE,
      minDelayMs: flags["min-delay-ms"] !== undefined ? Number(flags["min-delay-ms"]) : 1000,
      logger: console,
    });
    return;
  }

  console.error(
    "Usage: node scripts/indexnow.mjs <write-key|verify-key|submit|submit-live> [options]"
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  main().catch((err) => {
    const msg = redactKey(err?.message || String(err), process.env.INDEXNOW_KEY || "");
    console.error(`Error: ${msg}`);
    process.exit(1);
  });
}
