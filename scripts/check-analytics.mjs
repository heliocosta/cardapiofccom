#!/usr/bin/env node
// Verifies analytics-consent invariants on the Hugo output. Run after `pnpm build`.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);

if (!fs.existsSync(pub)) {
  console.error("public/ not found. Run `pnpm build` first.");
  process.exit(1);
}

const EDITIONS = ["", "en-gb", "en-ie", "pt-br", "pt-pt", "es-ar"];

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

// params.toml [analytics] ga4_id (minimal parser)
const params = fs.readFileSync(path.join(root, "config/_default/params.toml"), "utf8");
const section = params.split(/^\[analytics\]\s*$/m)[1] || "";
const ga4 = ((section.split(/^\[/m)[0]).match(/^ga4_id\s*=\s*"([^"]*)"/m) || [])[1] ?? "";

// vocabulary event names (top-level keys of events.yaml)
const vocab = new Set(
  fs.readFileSync(path.join(root, "data/analytics/events.yaml"), "utf8")
    .split("\n").map((l) => l.match(/^([a-z_]+):\s*$/)).filter(Boolean).map((m) => m[1])
);

const files = walk(pub);
const htmls = files.filter((f) => f.endsWith(".html"));
const FORBIDDEN = ["googletagmanager.com/gtm.js", "googletagmanager.com/ns.html", "adsbygoogle.js", "cfc-ad", "cookie-box"];
let headBytes = 0;
const unknownEvents = new Set();
let privacyLinked = 0;

for (const f of htmls) {
  const rel = path.relative(pub, f);
  const html = fs.readFileSync(f, "utf8");
  if (rel === "404.html" || !html.includes("<head")) {
    // still scan for forbidden strings below
  }
  for (const bad of FORBIDDEN) if (html.includes(bad)) fail(`${rel}: forbidden string "${bad}"`);
  if (html.includes("<head") && !/http-equiv=["']?refresh/.test(html)) {
    const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
    const first = head.indexOf("<script");
    if (first < 0 || !head.slice(first).startsWith("<script data-cfc-consent-defaults")) {
      fail(`${rel}: consent defaults script is not the first <script> in <head>`);
    } else if (!headBytes) {
      const m = head.match(/<script data-cfc-consent-defaults>([\s\S]*?)<\/script>/);
      if (m) headBytes = zlib.gzipSync(m[1]).length;
    }
    const cfg = html.match(/id=["']?cfc-analytics-config["']?>([^<]*)<\/script>/);
    if (!cfg) fail(`${rel}: missing #cfc-analytics-config`);
    else {
      try {
        const v = JSON.parse(cfg[1]).ga4;
        if (v !== ga4) fail(`${rel}: ga4 "${v}" != params ga4_id "${ga4}"`);
      } catch { fail(`${rel}: unparsable #cfc-analytics-config`); }
    }
    if (!html.includes("data-cfc-consent-open")) fail(`${rel}: missing cookie settings control`);
    if (/href=["']?[^"'\s>]*privacy\//.test(html)) privacyLinked++;
    else fail(`${rel}: no link to privacy page`);
  }
  for (const m of html.matchAll(/data-cfc-event=["']?([a-z_]+)/g)) if (!vocab.has(m[1])) unknownEvents.add(m[1]);
}

for (const e of FORBIDDEN.slice(0, 0)) void e;
if (fs.existsSync(path.join(pub, "ads.txt"))) fail("public/ads.txt must not exist");
for (const e of EDITIONS.filter(Boolean)) if (fs.existsSync(path.join(pub, e, "ads.txt"))) fail(`public/${e}/ads.txt must not exist`);
for (const e of EDITIONS) {
  if (!fs.existsSync(path.join(pub, e, "privacy", "index.html"))) fail(`missing privacy page for edition "${e || "en"}"`);
}
if (fs.existsSync(path.join(pub, "analytics-fixture"))) fail("analytics-fixture must not be published");

const rt = files.filter((f) => /\/js\/cfc-analytics.*\.js$/.test(f));
if (!rt.length) fail("runtime bundle js/cfc-analytics*.js not found");
const rtBytes = rt.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(f)).length, 0);
if (headBytes + rtBytes > 6144) fail(`first-party analytics JS ${headBytes + rtBytes} B gzip exceeds 6144 B`);

if (unknownEvents.size) warnings.push(`data-cfc-event values not in vocabulary: ${[...unknownEvents].join(", ")}`);
warnings.forEach((w) => console.warn(`warning: ${w}`));

console.log(`Checked ${htmls.length} HTML files; analytics JS ${headBytes + rtBytes} B gzip (head ${headBytes}, runtime ${rtBytes}).`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  failures.slice(0, 40).forEach((m) => console.error(` - ${m}`));
  if (failures.length > 40) console.error(` ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("✅ analytics checks passed");
