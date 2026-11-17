#!/usr/bin/env node
// Verifies SEO / social invariants on the Hugo output. Run after `pnpm build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const BASE = "https://cardapiofc.com/";
const EDITIONS = ["", "en-gb", "en-ie", "pt-br", "pt-pt", "es-ar", "en-us", "zh-cn", "ja"];
const BCP47 = /^(x-default|[a-z]{2}(-[A-Z]{2})?)$/;
const OG_MAX = 300000;
const SAMPLE = 5;

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);

if (!fs.existsSync(pub)) {
  console.error("public/ not found. Run `pnpm build` first.");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const urlToFile = (u) => {
  if (!u.startsWith(BASE)) return null;
  const rel = u.slice(BASE.length).split(/[?#]/)[0];
  return path.join(pub, rel.endsWith("/") || rel === "" ? rel + "index.html" : rel);
};
const fileToUrl = (f) => {
  const rel = path.relative(pub, f).split(path.sep).join("/");
  return BASE + rel.replace(/index\.html$/, "");
};
const read = (f) => fs.readFileSync(f, "utf8");
const attr = "[\"']?([^\"'\\s>]+)";

const canonRe = new RegExp(`<link rel=["']?canonical["']? href=${attr}`, "g");
const altRe = new RegExp(`<link rel=["']?alternate["']? hreflang=${attr}["']? href=${attr}`, "g");
const ogRe = new RegExp(`<meta property=["']?og:image["']? content=${attr}`, "g");
const ldRe = /<script type=["']?application\/ld\+json["']?>([\s\S]*?)<\/script>/g;

const all = walk(pub);
const htmls = all.filter((f) => f.endsWith(".html"));
const ogUrls = new Set();
const sampled = [];
const perKind = {};

for (const f of htmls) {
  const rel = path.relative(pub, f);
  if (rel === "404.html" || rel.endsWith("/404.html")) continue;
  const html = read(f);
  if (/http-equiv=["']?refresh/.test(html)) continue; // alias redirect pages
  if (/<meta name=["']?robots["']? content=["']?noindex/.test(html)) continue;
  if (!html.includes("<head")) continue;

  const canons = [...html.matchAll(canonRe)].map((m) => m[1]);
  if (canons.length !== 1) fail(`${rel}: expected exactly one canonical, found ${canons.length}`);
  else if (canons[0] !== fileToUrl(f)) fail(`${rel}: canonical ${canons[0]} is not self-referencing (${fileToUrl(f)})`);

  for (const m of html.matchAll(ogRe)) ogUrls.add(m[1]);

  const key = EDITIONS.find((e) => e && rel.startsWith(e + path.sep)) || "";
  const kind = rel.replace(key ? key + path.sep : "", "").split(path.sep)[0];
  if (["match", "team", "league", ""].includes(kind) || rel === "index.html") {
    const k = `${key}|${kind || "home"}`;
    perKind[k] = (perKind[k] || 0) + 1;
    if (perKind[k] <= SAMPLE) sampled.push({ f, rel, html, kind: kind || "home", edition: key });
  }
}

// hreflang + JSON-LD on sampled pages
for (const { f, rel, html, kind } of sampled) {
  const alts = [...html.matchAll(altRe)].map((m) => ({ lang: m[1], href: m[2] }));
  if (alts.length) {
    for (const a of alts) if (!BCP47.test(a.lang)) fail(`${rel}: hreflang "${a.lang}" is not a BCP 47 code`);
    const xd = alts.filter((a) => a.lang === "x-default");
    if (xd.length !== 1) fail(`${rel}: expected one x-default, found ${xd.length}`);
    else {
      const en = alts.find((a) => a.lang === "en");
      if (!en || en.href !== xd[0].href) fail(`${rel}: x-default must equal the Global (en) URL`);
    }
    const self = fileToUrl(f);
    if (!alts.some((a) => a.href === self)) fail(`${rel}: hreflang set does not include the page itself`);
    for (const a of alts) {
      const tf = urlToFile(a.href);
      if (!tf || !fs.existsSync(tf)) { fail(`${rel}: hreflang target missing: ${a.href}`); continue; }
      const back = [...read(tf).matchAll(altRe)].some((m) => m[2] === self);
      if (!back) fail(`${rel}: ${a.href} does not link back (non-reciprocal hreflang)`);
    }
  }

  const blocks = [...html.matchAll(ldRe)];
  if (blocks.length !== 1) { fail(`${rel}: expected one JSON-LD script, found ${blocks.length}`); continue; }
  let data;
  try { data = JSON.parse(blocks[0][1]); } catch (e) { fail(`${rel}: invalid JSON-LD (${e.message})`); continue; }
  const types = new Set((data["@graph"] || []).map((n) => n["@type"]));
  const need = kind === "match" ? ["SportsEvent", "BreadcrumbList", "FAQPage"]
    : kind === "team" ? ["SportsTeam", "BreadcrumbList"]
    : kind === "league" ? ["SportsOrganization", "BreadcrumbList"]
    : kind === "home" ? ["WebSite", "Organization"] : [];
  for (const t of need) if (!types.has(t)) fail(`${rel}: JSON-LD missing ${t}`);
  if (kind === "match" && !JSON.stringify(data).includes("BroadcastEvent")) warnings.push(`${rel}: no BroadcastEvent (no channels?)`);
}

// social images
for (const u of ogUrls) {
  const f = urlToFile(u);
  if (!f || !fs.existsSync(f)) { fail(`og:image does not exist: ${u}`); continue; }
  if (fs.statSync(f).size > OG_MAX) fail(`og:image over ${OG_MAX} bytes: ${u}`);
}

// sitemap, robots, llms
const idx = path.join(pub, "sitemap.xml");
if (!fs.existsSync(idx)) fail("sitemap.xml missing");
else {
  const x = read(idx);
  if (!x.includes("<sitemapindex")) fail("sitemap.xml is not a sitemap index");
  for (const m of x.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const f = urlToFile(m[1]);
    if (!f || !fs.existsSync(f)) fail(`sitemap index entry missing: ${m[1]}`);
  }
}
const robots = path.join(pub, "robots.txt");
if (!fs.existsSync(robots)) fail("robots.txt missing");
else if (!read(robots).includes(`Sitemap: ${BASE}sitemap.xml`)) fail("robots.txt does not reference the sitemap index");
for (const n of ["llms.txt", "llms-full.txt"]) {
  const f = path.join(pub, n);
  if (!fs.existsSync(f) || fs.statSync(f).size < 50) fail(`${n} missing or empty`);
}

warnings.forEach((w) => console.warn(`warning: ${w}`));
console.log(`Checked ${htmls.length} HTML files (${sampled.length} sampled in depth, ${ogUrls.size} og:image files).`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  failures.slice(0, 40).forEach((m) => console.error(` - ${m}`));
  if (failures.length > 40) console.error(` ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("✅ seo-social checks passed");
