#!/usr/bin/env node
// Verifies SEO / social invariants on the Hugo output. Run after `pnpm build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPub = path.join(defaultRoot, "public");
export const BASE = "https://cardapiofc.com/";
export const EDITIONS = ["", "en-gb", "en-ie", "pt-br", "pt-pt", "es-ar", "en-us", "zh-cn", "ja"];
export const EDITION_LOCALES = {
  "": "en",
  "en-gb": "en-GB",
  "en-ie": "en-IE",
  "pt-br": "pt-BR",
  "pt-pt": "pt-PT",
  "es-ar": "es-AR",
  "en-us": "en-US",
  "zh-cn": "zh-CN",
  ja: "ja",
};
export const POPULATED_CHANNEL_EDITIONS = ["pt-br", "en-gb", "en-ie", "pt-pt", "es-ar"];
const BCP47 = /^(x-default|[a-z]{2}(-[A-Z]{2})?)$/;
const OG_MAX = 300000;
const SAMPLE = 5;

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const BLOCK_TAG_RE = /<\/?(?:p|div|li|br|h[1-6]|tr|td|th|section|article)\b[^>]*>/gi;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

export function decodeEntities(str) {
  return String(str).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, code) => {
    if (code[0] === "#") {
      const cp = code[1].toLowerCase() === "x"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[code] ?? m;
  });
}

export function normSpace(str) {
  return String(str).replace(/\s+/g, " ").trim();
}

export function htmlToText(html) {
  const withoutSvg = String(html).replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
  const withBlockSpaces = withoutSvg.replace(BLOCK_TAG_RE, " ");
  return normSpace(decodeEntities(withBlockSpaces.replace(/<[^>]+>/g, "")));
}

export function parseAttrs(attrStr) {
  const attrs = {};
  const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRe.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    if (name === "/" && m[2] === undefined && m[3] === undefined && m[4] === undefined) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function hasClass(classAttr, target) {
  return typeof classAttr === "string" && classAttr.split(/\s+/).includes(target);
}

function extractTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(parseAttrs(m[1] || ""));
  return out;
}

function extractJsonLdScripts(html) {
  const re = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    if ((attrs.type || "").toLowerCase() === "application/ld+json") out.push(m[2]);
  }
  return out;
}

function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/style>/gi, "");
}

export function extractElementsByClass(html, className) {
  const clean = stripNoise(html);
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const results = [];
  let active = null;
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || "";
    const selfClose = !isClose && (VOID_TAGS.has(tag) || /\/\s*$/.test(attrStr));

    if (!active) {
      if (!isClose && !selfClose && hasClass(parseAttrs(attrStr).class, className)) {
        active = { stack: [tag], innerStart: m.index + m[0].length };
      }
      continue;
    }

    if (isClose) {
      const idx = active.stack.lastIndexOf(tag);
      if (idx !== -1) active.stack.length = idx;
      if (active.stack.length === 0) {
        results.push(clean.slice(active.innerStart, m.index));
        active = null;
      }
    } else if (!selfClose) {
      active.stack.push(tag);
    }
  }
  return results;
}

export function extractVisibleFaqs(html) {
  const itemHtmls = extractElementsByClass(html, "cfc-faq__item");
  const allQuestions = extractElementsByClass(html, "cfc-faq__q");
  const allAnswers = extractElementsByClass(html, "cfc-faq__a");
  const errors = [];
  if (allQuestions.length !== itemHtmls.length || allAnswers.length !== itemHtmls.length) {
    errors.push(
      `FAQ DOM mismatch: ${itemHtmls.length} .cfc-faq__item(s), ${allQuestions.length} .cfc-faq__q(s), ${allAnswers.length} .cfc-faq__a(s)`
    );
  }
  const items = [];
  for (let i = 0; i < itemHtmls.length; i++) {
    const qs = extractElementsByClass(itemHtmls[i], "cfc-faq__q");
    const as = extractElementsByClass(itemHtmls[i], "cfc-faq__a");
    if (qs.length !== 1 || as.length !== 1) {
      errors.push(`FAQ item ${i + 1} expected 1 .cfc-faq__q and 1 .cfc-faq__a, found ${qs.length}/${as.length}`);
      continue;
    }
    const q = htmlToText(qs[0]);
    const a = htmlToText(as[0]);
    if (!q || !a) {
      errors.push(`FAQ item ${i + 1} has empty question or answer text`);
      continue;
    }
    items.push({ q, a });
  }
  return { items, errors };
}

export function bucket(rel) {
  const norm = rel.split(path.sep).join("/");
  const key = EDITIONS.find((e) => e && norm.startsWith(e + "/")) || "";
  const sub = key ? norm.slice(key.length + 1) : norm;
  const top = sub.split("/")[0];
  if (top === "channels") {
    if (sub === "channels/index.html") {
      return { key, kind: "channels-hub", bucketKey: `${key}|channels-hub` };
    }
    return { key, kind: "channel-detail", bucketKey: `${key}|channel-detail` };
  }
  if (["match", "team", "leagues", "faq", ""].includes(top) || norm === "index.html") {
    const kind = top || "home";
    return { key, kind, bucketKey: `${key}|${kind}` };
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifyHubAlternates(label, links, fail) {
  const expectedTotal = EDITIONS.length + 1;
  if (links.length !== expectedTotal) {
    fail(`${label}: expected ${expectedTotal} hreflang alternates (9 editions + x-default), found ${links.length}`);
  }
  const xd = links.find((a) => a.lang === "x-default");
  if (!xd || xd.href !== `${BASE}channels/`) {
    fail(`${label}: x-default must point to ${BASE}channels/, found ${xd?.href || "none"}`);
  }
  for (const e of EDITIONS) {
    const expectedLocale = EDITION_LOCALES[e];
    const expectedHref = `${BASE}${e ? e + "/" : ""}channels/`;
    if (!links.some((a) => a.lang === expectedLocale && a.href === expectedHref)) {
      fail(`${label}: missing reciprocal hreflang=${expectedLocale} -> ${expectedHref}`);
    }
  }
}

function verifyFaqParity(rel, html, graph, { required }, fail) {
  const { items: visibleFaqs, errors: faqParseErrors } = extractVisibleFaqs(html);
  for (const err of faqParseErrors) fail(`${rel}: ${err}`);
  const faqNodes = graph.filter((n) => n["@type"] === "FAQPage");
  if (faqNodes.length > 1) {
    fail(`${rel}: expected at most one FAQPage node, found ${faqNodes.length}`);
  }
  const faqNode = faqNodes[0];

  if (required && visibleFaqs.length === 0) {
    fail(`${rel}: expected visible .cfc-faq__item entries, found 0`);
  }
  if (visibleFaqs.length > 0 && !faqNode) {
    fail(`${rel}: has ${visibleFaqs.length} visible .cfc-faq__item(s) but JSON-LD is missing FAQPage`);
    return false;
  }
  if (visibleFaqs.length === 0 && faqNode) {
    fail(`${rel}: JSON-LD emits FAQPage but page has 0 visible .cfc-faq__item(s)`);
    return false;
  }
  if (!faqNode) return false;

  const mainEntity = Array.isArray(faqNode.mainEntity) ? faqNode.mainEntity : null;
  if (!mainEntity) {
    fail(`${rel}: FAQPage.mainEntity must be an array`);
    return true;
  }
  if (mainEntity.length !== visibleFaqs.length) {
    fail(`${rel}: FAQPage.mainEntity length (${mainEntity.length}) !== visible .cfc-faq__item count (${visibleFaqs.length})`);
    return true;
  }
  for (let i = 0; i < visibleFaqs.length; i++) {
    const ent = mainEntity[i];
    const jsonQ = normSpace(String(ent?.name ?? ""));
    const jsonA = normSpace(String(ent?.acceptedAnswer?.text ?? ""));
    if (visibleFaqs[i].q !== jsonQ) {
      fail(`${rel}: FAQ item ${i + 1} question mismatch (visible "${visibleFaqs[i].q}" !== JSON-LD "${jsonQ}")`);
    }
    if (visibleFaqs[i].a !== jsonA) {
      fail(`${rel}: FAQ item ${i + 1} answer mismatch (visible "${visibleFaqs[i].a}" !== JSON-LD "${jsonA}")`);
    }
  }
  return true;
}

function verifyBroadcastServiceNode(rel, bs, selfUrl, fail) {
  if (!bs.name || typeof bs.name !== "string") {
    fail(`${rel}: BroadcastService missing name`);
  }
  if (bs.url !== selfUrl) {
    fail(`${rel}: BroadcastService.url (${bs.url}) must match canonical URL (${selfUrl})`);
  }
  if (bs.sameAs === undefined) return;
  const sameAsList = Array.isArray(bs.sameAs) ? bs.sameAs : [bs.sameAs];
  if (sameAsList.length === 0) {
    fail(`${rel}: BroadcastService.sameAs array must not be empty when present`);
    return;
  }
  for (const rawUrl of sameAsList) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      fail(`${rel}: BroadcastService.sameAs contains non-string or empty URL`);
      continue;
    }
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      fail(`${rel}: BroadcastService.sameAs is not a valid URL: ${rawUrl}`);
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      fail(`${rel}: BroadcastService.sameAs must use http: or https: (${rawUrl})`);
    }
    if (parsed.hostname.toLowerCase().includes("cardapiofc.com")) {
      fail(`${rel}: BroadcastService.sameAs must be an external URL, not cardapiofc.com (${rawUrl})`);
    }
  }
}

function verifySampledPage(entry, { rootDir, urlToFile, fileToUrl, read, fail, warn, stats }) {
  const { f, rel, html, kind, edition, metaTags, linkTags } = entry;
  if (!metaTags.some((a) => (a["http-equiv"] || "").toLowerCase() === "content-language")) {
    fail(`${rel}: missing content-language meta tag`);
  }

  const alts = linkTags
    .filter((a) => (a.rel || "").toLowerCase().split(/\s+/).includes("alternate") && "hreflang" in a)
    .map((a) => ({ lang: a.hreflang || "", href: a.href || "" }));
  const ogLocaleAlts = metaTags.filter((a) => (a.property || "").toLowerCase() === "og:locale:alternate");
  const ogTypes = metaTags.filter((a) => (a.property || "").toLowerCase() === "og:type").map((a) => a.content || "");
  const ogImages = metaTags.filter((a) => (a.property || "").toLowerCase() === "og:image").map((a) => a.content || "");
  const self = fileToUrl(f);

  if (kind === "channel-detail") {
    if (alts.length !== 0) {
      fail(`${rel}: channel detail page must emit 0 hreflang alternate links, found ${alts.length}`);
    }
    if (ogLocaleAlts.length !== 0) {
      fail(`${rel}: channel detail page must emit 0 og:locale:alternate meta tags, found ${ogLocaleAlts.length}`);
    }
    if (ogTypes.length !== 1 || ogTypes[0] !== "article") {
      fail(`${rel}: channel detail page expected og:type "article", found ${JSON.stringify(ogTypes)}`);
    }
  } else {
    if (kind === "channels-hub") {
      verifyHubAlternates(`${rel} (channels hub)`, alts, fail);
      if (ogTypes.length !== 1 || ogTypes[0] !== "website") {
        fail(`${rel}: channels hub expected og:type "website", found ${JSON.stringify(ogTypes)}`);
      }
    }
    if (alts.length) {
      for (const a of alts) if (!BCP47.test(a.lang)) fail(`${rel}: hreflang "${a.lang}" is not a BCP 47 code`);
      const xd = alts.filter((a) => a.lang === "x-default");
      if (xd.length !== 1) fail(`${rel}: expected one x-default, found ${xd.length}`);
      else {
        const en = alts.find((a) => a.lang === "en");
        if (!en || en.href !== xd[0].href) fail(`${rel}: x-default must equal the Global (en) URL`);
      }
      if (!alts.some((a) => a.href === self)) fail(`${rel}: hreflang set does not include the page itself`);
      for (const a of alts) {
        const tf = urlToFile(a.href);
        if (!tf || !fs.existsSync(tf)) { fail(`${rel}: hreflang target missing: ${a.href}`); continue; }
        const back = extractTags(read(tf), "link").some(
          (la) => (la.rel || "").toLowerCase().split(/\s+/).includes("alternate") && "hreflang" in la && la.href === self
        );
        if (!back) fail(`${rel}: ${a.href} does not link back (non-reciprocal hreflang)`);
      }
    }
  }

  if (kind === "channels-hub" || kind === "channel-detail") {
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const titleText = titleMatch ? normSpace(decodeEntities(titleMatch[1])) : "";
    const descMeta = metaTags.find((a) => (a.name || "").toLowerCase() === "description");
    if (!titleText) fail(`${rel}: missing or empty <title>`);
    if (!descMeta || !normSpace(descMeta.content || "")) fail(`${rel}: missing or empty meta description`);

    const edCard = `og/editions/og-${edition || "global"}.png`;
    const expectedOg = BASE + (fs.existsSync(path.join(rootDir, "static", edCard)) ? edCard : "og/editions/og-global.png");
    if (ogImages.length !== 1 || ogImages[0] !== expectedOg) {
      fail(`${rel}: expected edition og:image ${expectedOg}, found ${JSON.stringify(ogImages)}`);
    }
  }

  const blocks = extractJsonLdScripts(html);
  if (blocks.length !== 1) { fail(`${rel}: expected one JSON-LD script, found ${blocks.length}`); return; }
  let data;
  try { data = JSON.parse(blocks[0]); } catch (e) { fail(`${rel}: invalid JSON-LD (${e.message})`); return; }
  const graph = data["@graph"] || [];
  const types = new Set(graph.map((n) => n["@type"]));
  const isLeagueHub = kind === "leagues" && (rel === "leagues/index.html" || EDITIONS.some((e) => e && rel === `${e}/leagues/index.html`));
  const need = kind === "match" ? ["SportsEvent", "BreadcrumbList", "FAQPage"]
    : kind === "team" ? ["SportsTeam", "BreadcrumbList"]
    : (kind === "leagues" && !isLeagueHub) ? ["SportsOrganization", "BreadcrumbList"]
    : kind === "faq" ? ["FAQPage", "BreadcrumbList"]
    : kind === "home" ? ["WebSite", "Organization"]
    : kind === "channels-hub" ? ["CollectionPage", "BreadcrumbList"]
    : kind === "channel-detail" ? ["BroadcastService", "BreadcrumbList"] : [];
  for (const t of need) if (!types.has(t)) fail(`${rel}: JSON-LD missing ${t}`);

  for (const n of graph) {
    if (n["@type"] === "SportsEvent") {
      for (const field of ["location", "image", "description", "endDate"]) {
        if (!n[field]) fail(`${rel}: SportsEvent missing ${field}`);
      }
    }
    if (n["@type"] === "Organization" && typeof n.logo === "string" && n.logo.endsWith(".svg")) {
      fail(`${rel}: Organization.logo must not be SVG (${n.logo})`);
    }
    if (n["@type"] === "MobileApplication" && !n.offers) {
      fail(`${rel}: MobileApplication missing offers`);
    }
    if (n["@type"] === "WebSite" && n.potentialAction) {
      fail(`${rel}: WebSite must not emit blocked SearchAction`);
    }
  }

  if (kind === "channels-hub") {
    stats.hubsChecked++;
    const col = graph.find((n) => n["@type"] === "CollectionPage");
    if (col) {
      if (!col.mainEntity || col.mainEntity["@type"] !== "ItemList" || !Array.isArray(col.mainEntity.itemListElement)) {
        fail(`${rel}: CollectionPage must have mainEntity of @type "ItemList" with itemListElement array`);
      } else if (
        typeof col.mainEntity.numberOfItems === "number" &&
        col.mainEntity.itemListElement.length !== col.mainEntity.numberOfItems
      ) {
        fail(`${rel}: CollectionPage ItemList numberOfItems (${col.mainEntity.numberOfItems}) !== itemListElement.length (${col.mainEntity.itemListElement.length})`);
      }
    }
  } else if (kind === "channel-detail") {
    stats.detailsChecked++;
    const bs = graph.find((n) => n["@type"] === "BroadcastService");
    if (bs) verifyBroadcastServiceNode(rel, bs, self, fail);
    if (verifyFaqParity(rel, html, graph, { required: false }, fail)) {
      stats.detailFaqPagesChecked++;
    }
  } else if (kind === "faq") {
    stats.faqPagesChecked++;
    verifyFaqParity(rel, html, graph, { required: true }, fail);
  }

  if (kind === "match" && !JSON.stringify(data).includes("BroadcastEvent")) {
    warn(`${rel}: no BroadcastEvent (no channels?)`);
  }
}

function verifySitemaps({ pubDir, urlToFile, read, channelDetailUrlsByEdition, fail, stats }) {
  const idx = path.join(pubDir, "sitemap.xml");
  const channelDetailLocRe = new RegExp(`^${escapeRe(BASE)}(?:[^/]+/)?channels/.+`);
  if (!fs.existsSync(idx)) { fail("sitemap.xml missing"); return; }

  const x = read(idx);
  if (!x.includes("<sitemapindex")) fail("sitemap.xml is not a sitemap index");
  const indexLocs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
  for (const e of EDITIONS) {
    const expectedSm = `${BASE}${e || "en"}/sitemap.xml`;
    if (!indexLocs.includes(expectedSm)) {
      fail(`sitemap.xml index missing edition sitemap: ${expectedSm}`);
    }
  }

  for (const smLoc of indexLocs) {
    const f = urlToFile(smLoc);
    if (!f || !fs.existsSync(f)) { fail(`sitemap index entry missing: ${smLoc}`); continue; }
    stats.sitemapsChecked++;
    const smRel = path.relative(pubDir, f).split(path.sep).join("/");
    const sm = read(f);
    if (sm.includes("<priority>0</priority>")) fail(`${smRel}: contains <priority>0</priority>`);
    if (!sm.includes('hreflang="x-default"') && !sm.includes("hreflang=x-default")) fail(`${smRel}: missing x-default hreflang`);
    for (const bad of ["/search/", "/favourites/", "/my_agenda/", "/settings/"]) {
      if (sm.includes(bad)) fail(`${smRel}: contains noindex URL (${bad})`);
    }

    const smEdMatch = smRel.match(/^([^/]+)\/sitemap\.xml$/);
    const smEd = smEdMatch ? (smEdMatch[1] === "en" ? "" : smEdMatch[1]) : null;
    const expectedHubLoc = smEd !== null ? `${BASE}${smEd ? smEd + "/" : ""}channels/` : null;

    let hubCount = 0;
    const sitemapDetailLocs = new Set();

    for (const urlMatch of sm.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const block = urlMatch[1];
      const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) { fail(`${smRel}: <url> block missing <loc>`); continue; }
      const locUrl = decodeEntities(locMatch[1]);
      const xhtmlLinks = [...block.matchAll(/<xhtml:link\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)]
        .map((m) => parseAttrs(m[1]))
        .map((a) => ({ lang: a.hreflang || "", href: a.href || "" }));

      if (expectedHubLoc && locUrl === expectedHubLoc) {
        hubCount++;
        verifyHubAlternates(`${smRel} (/channels/ hub <url>)`, xhtmlLinks, fail);
      } else if (channelDetailLocRe.test(locUrl)) {
        if (xhtmlLinks.length !== 0) {
          fail(`${smRel}: channel detail <url> ${locUrl} must contain 0 <xhtml:link> tags, found ${xhtmlLinks.length}`);
        }
        if (smEd === "") {
          fail(`${smRel}: Global sitemap must contain 0 channel detail <loc> entries, found ${locUrl}`);
        } else if (smEd !== null) {
          const expectedPrefix = `${BASE}${smEd}/channels/`;
          if (!locUrl.startsWith(expectedPrefix)) {
            fail(`${smRel}: channel detail <loc> ${locUrl} does not match edition prefix ${expectedPrefix}`);
          } else if (sitemapDetailLocs.has(locUrl)) {
            fail(`${smRel}: duplicate channel detail <loc> ${locUrl}`);
          } else {
            sitemapDetailLocs.add(locUrl);
          }
        }
      }
    }

    if (expectedHubLoc && hubCount !== 1) {
      fail(`${smRel}: expected exactly 1 /channels/ hub <loc> (${expectedHubLoc}), found ${hubCount}`);
    }
    if (smEd !== null && smEd !== "") {
      const generatedSet = channelDetailUrlsByEdition.get(smEd) || new Set();
      for (const genUrl of generatedSet) {
        if (!sitemapDetailLocs.has(genUrl)) fail(`${smRel}: missing generated channel detail page ${genUrl}`);
      }
      for (const smUrl of sitemapDetailLocs) {
        if (!generatedSet.has(smUrl)) fail(`${smRel}: lists channel detail ${smUrl} not found in public/${smEd}/channels/`);
      }
      if (POPULATED_CHANNEL_EDITIONS.includes(smEd) && sitemapDetailLocs.size === 0) {
        fail(`${smRel}: populated regional edition "${smEd}" must have non-empty channel detail <loc> entries`);
      }
    }
  }
}

export function runSeoChecks({ pubDir = defaultPub, rootDir = defaultRoot } = {}) {
  const failures = [];
  const warnings = [];
  const fail = (m) => failures.push(m);
  const warn = (m) => warnings.push(m);

  const stats = {
    htmlCount: 0,
    sampledCount: 0,
    ogCount: 0,
    hubsChecked: 0,
    detailsChecked: 0,
    detailFaqPagesChecked: 0,
    faqPagesChecked: 0,
    sitemapsChecked: 0,
  };

  if (!fs.existsSync(pubDir)) {
    fail("public/ not found. Run `pnpm build` first.");
    return { failures, warnings, stats };
  }

  const read = (f) => fs.readFileSync(f, "utf8");
  const urlToFile = (u) => {
    if (!u.startsWith(BASE)) return null;
    const rel = u.slice(BASE.length).split(/[?#]/)[0];
    return path.join(pubDir, rel.endsWith("/") || rel === "" ? rel + "index.html" : rel);
  };
  const fileToUrl = (f) => {
    const rel = path.relative(pubDir, f).split(path.sep).join("/");
    return BASE + rel.replace(/index\.html$/, "");
  };

  const all = walk(pubDir);
  const htmls = all.filter((f) => f.endsWith(".html"));
  stats.htmlCount = htmls.length;

  const ogUrls = new Set();
  const sampled = [];
  const perKind = {};
  const channelHubUrlsFound = new Set();
  const channelDetailUrlsByEdition = new Map(EDITIONS.map((e) => [e, new Set()]));

  for (const f of htmls) {
    const rel = path.relative(pubDir, f).split(path.sep).join("/");
    if (rel === "404.html" || rel.endsWith("/404.html")) continue;
    const html = read(f);
    if (!/<head\b/i.test(html)) continue;

    const metaTags = extractTags(html, "meta");
    if (metaTags.some((a) => (a["http-equiv"] || "").toLowerCase() === "refresh")) continue;
    if (metaTags.some((a) => (a.name || "").toLowerCase() === "robots" && (a.content || "").toLowerCase().includes("noindex"))) continue;

    const linkTags = extractTags(html, "link");
    const canons = linkTags
      .filter((a) => (a.rel || "").toLowerCase().split(/\s+/).includes("canonical") && a.href)
      .map((a) => a.href);
    const selfUrl = fileToUrl(f);
    if (canons.length !== 1) fail(`${rel}: expected exactly one canonical, found ${canons.length}`);
    else if (canons[0] !== selfUrl) fail(`${rel}: canonical ${canons[0]} is not self-referencing (${selfUrl})`);

    for (const a of metaTags) {
      if ((a.property || "").toLowerCase() === "og:image" && a.content) ogUrls.add(a.content);
    }

    const b = bucket(rel);
    if (b) {
      if (b.kind === "channels-hub") {
        channelHubUrlsFound.add(selfUrl);
      } else if (b.kind === "channel-detail") {
        if (b.key === "") fail(`${rel}: Global edition must not generate broadcaster detail pages`);
        else channelDetailUrlsByEdition.get(b.key).add(selfUrl);
      }
      perKind[b.bucketKey] = (perKind[b.bucketKey] || 0) + 1;
      if (perKind[b.bucketKey] <= SAMPLE) {
        sampled.push({ f, rel, html, kind: b.kind, edition: b.key, metaTags, linkTags });
      }
    }
  }
  stats.sampledCount = sampled.length;
  stats.ogCount = ogUrls.size;

  for (const e of EDITIONS) {
    const hubUrl = `${BASE}${e ? e + "/" : ""}channels/`;
    if (!channelHubUrlsFound.has(hubUrl)) {
      fail(`Missing /channels/ hub HTML page for edition "${e || "en"}" (${hubUrl})`);
    }
  }

  for (const entry of sampled) {
    verifySampledPage(entry, { rootDir, urlToFile, fileToUrl, read, fail, warn, stats });
  }

  // social images
  for (const u of ogUrls) {
    const f = urlToFile(u);
    if (!f || !fs.existsSync(f)) { fail(`og:image does not exist: ${u}`); continue; }
    if (fs.statSync(f).size > OG_MAX) fail(`og:image over ${OG_MAX} bytes: ${u}`);
  }
  if (fs.existsSync(path.join(pubDir, "og", ".cache"))) fail("public/og/.cache must not exist in build output");
  if (fs.existsSync(path.join(pubDir, "league"))) fail("public/league/ meta-refresh aliases must not exist in build output");

  verifySitemaps({ pubDir, urlToFile, read, channelDetailUrlsByEdition, fail, stats });

  const robots = path.join(pubDir, "robots.txt");
  if (!fs.existsSync(robots)) fail("robots.txt missing");
  else if (!read(robots).includes(`Sitemap: ${BASE}sitemap.xml`)) fail("robots.txt does not reference the sitemap index");
  for (const n of ["llms.txt", "llms-full.txt"]) {
    const f = path.join(pubDir, n);
    if (!fs.existsSync(f) || fs.statSync(f).size < 50) fail(`${n} missing or empty`);
  }

  return { failures, warnings, stats };
}

const isMain = process.argv[1] && fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  if (!fs.existsSync(defaultPub)) {
    console.error("public/ not found. Run `pnpm build` first.");
    process.exit(1);
  }
  const { failures, warnings, stats } = runSeoChecks({ pubDir: defaultPub, rootDir: defaultRoot });
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  console.log(`Checked ${stats.htmlCount} HTML files (${stats.sampledCount} sampled in depth, ${stats.ogCount} og:image files).`);
  console.log(`Broadcaster SEO verified: ${stats.hubsChecked} channels hubs, ${stats.detailsChecked} sampled detail pages (${stats.detailFaqPagesChecked} with FAQ parity), ${stats.faqPagesChecked} /faq/ pages with FAQ parity, ${stats.sitemapsChecked} edition sitemaps.`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    failures.slice(0, 40).forEach((m) => console.error(` - ${m}`));
    if (failures.length > 40) console.error(` ... and ${failures.length - 40} more`);
    process.exit(1);
  }
  console.log("✅ seo-social checks passed");
}
