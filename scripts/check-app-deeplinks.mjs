#!/usr/bin/env node
// Verifies app-deeplinks invariants on the Hugo output. Run after `pnpm build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const EDITIONS = ["", "en-gb", "en-ie", "pt-br", "pt-pt", "es-ar", "en-us", "zh-cn", "ja"];
const PAGES = ["search", "favourites", "my_agenda", "settings"];
const MAX_INDEX = 1048576; // 1 MB
const failures = [];
const fail = (m) => failures.push(m);

if (!fs.existsSync(pub)) {
  console.error("public/ not found. Run `pnpm build` first.");
  process.exit(1);
}

// 1. Search index per edition
for (const ed of EDITIONS) {
  const idx = path.join(pub, ed, "search", "search-index.json");
  const label = ed || "en";
  if (!fs.existsSync(idx)) { fail(`missing search-index.json for ${label}`); continue; }
  const sz = fs.statSync(idx).size;
  if (sz >= MAX_INDEX) fail(`${label}: search-index.json (${sz} B) >= 1 MB`);
  try {
    const arr = JSON.parse(fs.readFileSync(idx, "utf8"));
    if (!Array.isArray(arr) || arr.length === 0) fail(`${label}: search-index.json is empty`);
  } catch (e) { fail(`${label}: invalid search-index.json (${e.message})`); }
}

// 2. Mobile association files
const aasaPath = path.join(pub, ".well-known", "apple-app-site-association");
if (!fs.existsSync(aasaPath)) fail("missing .well-known/apple-app-site-association");
else {
  try {
    const aasa = JSON.parse(fs.readFileSync(aasaPath, "utf8"));
    const txt = JSON.stringify(aasa);
    if (!txt.includes("G3QW878YXD.br.com.cardapiofutebol")) fail("AASA missing expected appID");
  } catch (e) { fail(`invalid AASA JSON (${e.message})`); }
}

const alPath = path.join(pub, ".well-known", "assetlinks.json");
if (!fs.existsSync(alPath)) fail("missing .well-known/assetlinks.json");
else {
  try {
    const al = JSON.parse(fs.readFileSync(alPath, "utf8"));
    if (!JSON.stringify(al).includes("br.com.cardapiofutebol")) fail("assetlinks.json missing package_name");
  } catch (e) { fail(`invalid assetlinks.json (${e.message})`); }
}

// 3. Search & landing pages + smart banner meta across all 6 editions
for (const ed of EDITIONS) {
  const label = ed || "en";
  for (const p of PAGES) {
    const f = path.join(pub, ed, p, "index.html");
    if (!fs.existsSync(f)) { fail(`missing /${ed ? ed + "/" : ""}${p}/index.html`); continue; }
    const html = fs.readFileSync(f, "utf8");
    if (!/name=["']?apple-itunes-app["']?/.test(html)) fail(`${label}/${p}: missing apple-itunes-app meta`);
  }
  const home = path.join(pub, ed, "index.html");
  if (fs.existsSync(home)) {
    const html = fs.readFileSync(home, "utf8");
    if (!/name=["']?apple-itunes-app["']?/.test(html)) fail(`${label}/home: missing apple-itunes-app meta`);
  }
}

// 4. Redirect manifest
const redir = path.join(root, "data", "cfc", "redirects.yaml");
if (!fs.existsSync(redir)) fail("missing data/cfc/redirects.yaml");
else {
  const txt = fs.readFileSync(redir, "utf8");
  if (!txt.includes("/favorites") || !txt.includes("/reminder")) fail("redirects.yaml missing /favorites or /reminder");
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  failures.forEach((m) => console.error(` - ${m}`));
  process.exit(1);
}
console.log("✅ app-deeplinks checks passed");
