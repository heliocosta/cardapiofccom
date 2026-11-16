// Fails when public/ approaches Cloudflare's 20,000 files/deployment free limit.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "public";
const LIMIT = 18000;
const MAX_BYTES = 25 * 1024 * 1024;
const EDITIONS = ["en-gb", "en-ie", "pt-br", "pt-pt", "es-ar"];
const KINDS = ["match", "team", "league"];

if (!existsSync(ROOT)) {
  console.error("public/ not found. Run `pnpm build` first.");
  process.exit(1);
}

const counts = {};
let total = 0;
const oversized = [];
const bump = (k) => (counts[k] = (counts[k] || 0) + 1);

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    total++;
    if (st.size > MAX_BYTES) oversized.push(relative(ROOT, p));
    const parts = relative(ROOT, p).split(sep);
    const edition = EDITIONS.includes(parts[0]) ? parts[0] : "en";
    const rest = EDITIONS.includes(parts[0]) ? parts[1] : parts[0];
    bump(`${edition} / ${KINDS.includes(rest) ? rest : "other"}`);
  }
})(ROOT);

console.log(`Output files: ${total} (limit ${LIMIT}, Cloudflare hard cap 20000)`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

let failed = false;
if (oversized.length) { console.error(`Files over 25 MiB:\n  ${oversized.join("\n  ")}`); failed = true; }
if (total >= LIMIT) {
  console.error(`Budget exceeded: ${total} >= ${LIMIT}. Shrink the dataset, partition editions into separate Workers projects, or upgrade to Workers Paid (see docs/operations/edge-delivery-runbook.md).`);
  failed = true;
}
process.exit(failed ? 1 : 0);
