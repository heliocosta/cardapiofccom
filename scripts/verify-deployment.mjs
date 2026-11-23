// Smoke tests for a deployed or previewed site: node scripts/verify-deployment.mjs --url=https://cardapiofc.com
const arg = process.argv.find((a) => a.startsWith("--url="));
const base = (arg ? arg.slice(6) : "http://localhost:8787").replace(/\/$/, "");
let failed = 0;
const get = (p) => fetch(base + p, { redirect: "manual" });
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + detail}`);
  if (!ok) failed++;
};

let r = await get("/definitely-missing-page/");
check("404 page for missing path", r.status === 404, `status ${r.status}`);

for (const [from, to] of [["/favorites", "/favourites"], ["/reminder", "/my_agenda"], ["/pt/jogos/x", "/pt-br/"], ["/en/matches/x", "/"]]) {
  r = await get(from);
  const loc = r.headers.get("location") || "";
  check(`301 ${from} -> ${to}`, r.status === 301 && loc.endsWith(to), `got ${r.status} ${loc}`);
}

for (const p of ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]) {
  r = await get(p);
  check(`JSON content-type ${p}`, (r.headers.get("content-type") || "").includes("application/json"), r.headers.get("content-type"));
}

r = await get("/");
check("HTML revalidates", (r.headers.get("cache-control") || "").includes("must-revalidate"), r.headers.get("cache-control"));
const html = await r.text();
const asset = html.match(/(?:href|src)="(\/(?:css|js)\/[^"]+)"/);
if (asset) {
  r = await get(asset[1]);
  check(`immutable asset ${asset[1]}`, (r.headers.get("cache-control") || "").includes("immutable"), r.headers.get("cache-control"));
}

const indexNowKey = (process.env.INDEXNOW_KEY || "").trim();
if (indexNowKey) {
  r = await get(`/${indexNowKey}.txt`);
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const body = r.status === 200 ? await r.text() : "";
  check(
    "IndexNow key file",
    r.status === 200 && ct.includes("text/plain") && body === indexNowKey,
    `status ${r.status}, content-type ${ct}, len ${body.length}/${indexNowKey.length}`
  );
}

console.log(failed ? `${failed} check(s) failed` : "All checks passed");
process.exit(failed ? 1 : 0);
