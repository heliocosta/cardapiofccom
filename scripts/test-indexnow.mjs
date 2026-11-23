#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectSitemapUrls,
  computeDiff,
  fingerprintHtml,
  readBaseUrl,
  redactKey,
  runSubmit,
  stripFreshnessFooters,
  unescapeXml,
  urlPriority,
  urlToPublicFile,
  validateKey,
  verifyLiveKey,
  writeKeyFile,
} from "./indexnow.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEXNOW_CLI = path.join(__dirname, "indexnow.mjs");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cfc-indexnow-test-"));
}

function buildHtml({
  title = "Match Title",
  description = "Match description",
  canonical = "https://cardapiofc.com/match/a-vs-b/",
  hreflangs = [{ lang: "en", href: "https://cardapiofc.com/match/a-vs-b/" }],
  ogImage = "https://cardapiofc.com/og/matches/a-vs-b.png",
  jsonLd = '{"@context":"https://schema.org","@type":"SportsEvent"}',
  cssHash = "aaa111",
  jsHash = "bbb222",
  consentConfig = "window.__cfcCfg={pv:1}",
  mainBody = "<h1>A vs B</h1><p>Channel: ESPN</p>",
  freshness = "<footer class=cfc-freshness><p>Data updated Sunday 22 November 2026, 21:33 UTC</p></footer>",
} = {}) {
  const altLinks = hreflangs
    .map((h) => `<link rel=alternate hreflang=${h.lang} href=${h.href}>`)
    .join("");
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width"><script data-cfc-consent-defaults>${consentConfig}</script><title>${title}</title><meta name=description content="${description}"><meta http-equiv=content-language content="en"><link rel=canonical href=${canonical}>${altLinks}<meta property="og:image" content="${ogImage}"><meta name="twitter:title" content="${title}"><script type=application/ld+json>${jsonLd}</script><link href=/css/style.${cssHash}.css rel=stylesheet><script defer src=/js/app.${jsHash}.js></script></head><body><header>Nav</header><main id=main>${mainBody}${freshness}</main><footer>Site footer</footer></body></html>`;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function createSiteFixture(dir, baseUrl, pages) {
  const urlsXml = Object.entries(pages)
    .map(([relPath, html]) => {
      const cleanRel = relPath.replace(/^\/+/, "");
      const fullUrl = baseUrl + cleanRel;
      const fileRel =
        cleanRel === "" || cleanRel.endsWith("/")
          ? `${cleanRel}index.html`
          : cleanRel;
      writeFile(path.join(dir, fileRel), html);
      return `<url><loc>${fullUrl}</loc><lastmod>2026-11-22T21:33:37+00:00</lastmod></url>`;
    })
    .join("");

  writeFile(
    path.join(dir, "sitemap.xml"),
    `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}</urlset>`
  );
}

async function startMockServer(handler) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    await handler(req, res, body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return {
    baseUrl: `http://127.0.0.1:${addr.port}/`,
    endpoint: `http://127.0.0.1:${addr.port}/indexnow`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// 1. validateKey
test("validateKey accepts valid 8..128 alphanumeric/hyphen keys", () => {
  assert.equal(validateKey("abcd1234"), "abcd1234");
  assert.equal(
    validateKey("0123456789abcdef0123456789abcdef"),
    "0123456789abcdef0123456789abcdef"
  );
  assert.equal(validateKey("a1-B2-c3-D4"), "a1-B2-c3-D4");
  assert.equal(validateKey("x".repeat(128)), "x".repeat(128));
});

test("validateKey rejects invalid keys without echoing secret", () => {
  const invalid = [
    undefined,
    null,
    "",
    "   ",
    "abc1234",
    "x".repeat(129),
    "abcd 1234",
    "abcd.1234",
    "abcd/1234",
    "abcd_1234",
    "abcd\n1234",
  ];
  for (const val of invalid) {
    assert.throws(() => validateKey(val), (err) => {
      if (typeof val === "string" && val.trim().length > 0) {
        assert.ok(!err.message.includes(val), "Error must not echo key value");
      }
      return err instanceof Error;
    });
  }
});

// 2. writeKeyFile
test("writeKeyFile creates exact key file with no trailing newline", () => {
  const dir = makeTempDir();
  try {
    const key = "a1b2c3d4e5f6g7h8";
    const { filePath } = writeKeyFile({ key, publicDir: dir });
    assert.equal(filePath, path.join(dir, `${key}.txt`));
    const buf = fs.readFileSync(filePath);
    assert.equal(buf.length, key.length);
    assert.equal(buf.toString("utf8"), key);
    assert.ok(!buf.toString("utf8").endsWith("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 3. fingerprintHtml & helpers
test("fingerprintHtml ignores cfc-freshness footer, asset hashes, and consent script", () => {
  const base = buildHtml();
  const changedFreshnessUnquoted = buildHtml({
    freshness: "<footer class=cfc-freshness><p>Data updated Monday 23 November 2026, 05:00 UTC</p></footer>",
  });
  const changedFreshnessQuoted = buildHtml({
    freshness: '<footer class="cfc-freshness extra"><p>Data updated Tuesday</p></footer>',
  });
  const changedAssetsAndConsent = buildHtml({
    cssHash: "zzz999",
    jsHash: "yyy888",
    consentConfig: "window.__cfcCfg={pv:2}",
  });

  const fpBase = fingerprintHtml(base);
  assert.equal(fpBase.length, 16);
  assert.equal(fingerprintHtml(changedFreshnessUnquoted), fpBase);
  assert.equal(fingerprintHtml(changedFreshnessQuoted), fpBase);
  assert.equal(fingerprintHtml(changedAssetsAndConsent), fpBase);
});

test("fingerprintHtml changes on substantive main or SEO head changes", () => {
  const fpBase = fingerprintHtml(buildHtml());
  const mutations = [
    { mainBody: "<h1>A vs B</h1><p>Channel: Prime Video</p>" },
    { title: "Updated Match Title" },
    { description: "Updated match description" },
    { ogImage: "https://cardapiofc.com/og/matches/new.png" },
    {
      hreflangs: [
        { lang: "en", href: "https://cardapiofc.com/match/a-vs-b/" },
        { lang: "pt-BR", href: "https://cardapiofc.com/pt-br/match/a-vs-b/" },
      ],
    },
    { jsonLd: '{"@context":"https://schema.org","@type":"SportsEvent","name":"Updated"}' },
  ];
  for (const m of mutations) {
    assert.notEqual(
      fingerprintHtml(buildHtml(m)),
      fpBase,
      `Expected fingerprint change for ${Object.keys(m).join(",")}`
    );
  }
});

test("stripFreshnessFooters preserves regular footers", () => {
  const input = '<div>hi</div><footer class="cfc-freshness"><p>ts</p></footer><footer>keep</footer>';
  assert.equal(stripFreshnessFooters(input), "<div>hi</div><footer>keep</footer>");
});

// 4. collectSitemapUrls + computeDiff + urlPriority
test("collectSitemapUrls parses sitemapindex and urlset, deduplicates, and rejects off-host URLs", () => {
  const dir = makeTempDir();
  try {
    const base = "https://cardapiofc.com/";
    writeFile(
      path.join(dir, "sitemap.xml"),
      `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://cardapiofc.com/en/sitemap.xml</loc></sitemap><sitemap><loc>https://cardapiofc.com/pt-br/sitemap.xml</loc></sitemap></sitemapindex>`
    );
    writeFile(
      path.join(dir, "en/sitemap.xml"),
      `<urlset><url><loc>https://cardapiofc.com/</loc></url><url><loc>https://cardapiofc.com/match/a/&amp;b</loc></url><url><loc>https://cardapiofc.com/</loc></url></urlset>`
    );
    writeFile(
      path.join(dir, "pt-br/sitemap.xml"),
      `<urlset><url><loc>https://cardapiofc.com/pt-br/</loc></url></urlset>`
    );

    const urls = collectSitemapUrls(dir, base);
    assert.deepEqual(urls, [
      "https://cardapiofc.com/",
      "https://cardapiofc.com/match/a/&b",
      "https://cardapiofc.com/pt-br/",
    ]);
    assert.equal(unescapeXml("&amp;&lt;&gt;&quot;&apos;"), "&<>\"'");

    // Single urlset with off-host URL must throw
    const badDir = makeTempDir();
    try {
      writeFile(
        path.join(badDir, "sitemap.xml"),
        `<urlset><url><loc>https://evil.example.com/phish/</loc></url></urlset>`
      );
      assert.throws(() => collectSitemapUrls(badDir, base), /Off-host/);
    } finally {
      fs.rmSync(badDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("computeDiff detects added, modified, removed and sorts by priority", () => {
  const prev = {
    "/team/arsenal/": "h1",
    "/match/old-match/": "h2",
    "/leagues/premier-league/": "h3",
    "/": "h4",
  };
  const curr = {
    "/": "h4-changed",
    "/team/arsenal/": "h1",
    "/leagues/premier-league/": "h3-changed",
    "/match/new-match/": "h5",
    "/pt-br/": "h6",
    "/leagues/": "h7",
  };
  const diff = computeDiff(prev, curr, { baseUrl: "https://cardapiofc.com/" });
  assert.deepEqual(diff.added, ["/leagues/", "/match/new-match/", "/pt-br/"]);
  assert.deepEqual(diff.modified, ["/", "/leagues/premier-league/"]);
  assert.deepEqual(diff.removed, ["/match/old-match/"]);

  assert.equal(urlPriority("/"), 0);
  assert.equal(urlPriority("/pt-br/leagues/"), 0);
  assert.equal(urlPriority("/match/x/"), 1);
  assert.equal(urlPriority("/pt-br/match/x/"), 1);
  assert.equal(urlPriority("/leagues/premier-league/"), 2);
  assert.equal(urlPriority("/team/arsenal/"), 3);

  assert.deepEqual(
    diff.changes.map((c) => c.relPath),
    [
      "/",
      "/leagues/",
      "/pt-br/",
      "/match/new-match/",
      "/match/old-match/",
      "/leagues/premier-league/",
    ]
  );
});

// 5. verifyLiveKey
test("verifyLiveKey checks HTTP 200, text/plain, exact key match, and rejects 404/302/newline", async () => {
  const key = "0123456789abcdef0123456789abcdef";
  let mode = "ok";
  const server = await startMockServer(async (req, res) => {
    if (req.url === `/${key}.txt`) {
      if (mode === "ok") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(key);
      } else if (mode === "newline") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(key + "\n");
      } else if (mode === "redirect") {
        res.writeHead(302, { Location: "/en-gb/" });
        res.end();
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
      return;
    }
    res.writeHead(404).end();
  });

  try {
    const okRes = await verifyLiveKey({
      key,
      baseUrl: server.baseUrl,
      attempts: 1,
      retryDelaysMs: [1],
    });
    assert.equal(okRes.ok, true);
    assert.ok(!okRes.keyLocation.includes(key));

    mode = "newline";
    await assert.rejects(
      () =>
        verifyLiveKey({
          key,
          baseUrl: server.baseUrl,
          attempts: 1,
          retryDelaysMs: [1],
        }),
      /whitespace or newline/
    );

    mode = "redirect";
    await assert.rejects(
      () =>
        verifyLiveKey({
          key,
          baseUrl: server.baseUrl,
          attempts: 1,
          retryDelaysMs: [1],
        }),
      /HTTP 302/
    );

    mode = "404";
    await assert.rejects(
      () =>
        verifyLiveKey({
          key,
          baseUrl: server.baseUrl,
          attempts: 2,
          retryDelaysMs: [1],
        }),
      /HTTP 404/
    );
  } finally {
    await server.close();
  }
});

// 6. Batching, Content-Type, payload verification, and 429/503 retries
test("runSubmit sends valid payload, batches correctly, and retries 429/503", async () => {
  const dir = makeTempDir();
  const statePath = path.join(dir, "state/indexnow-state.json");
  const pubDir = path.join(dir, "public");
  const key = "fedcba9876543210fedcba9876543210";

  const pages = {
    "/": buildHtml({ mainBody: "<h1>Home</h1>" }),
    "/match/m1/": buildHtml({ mainBody: "<h1>M1</h1>" }),
    "/match/m2/": buildHtml({ mainBody: "<h1>M2</h1>" }),
    "/leagues/epl/": buildHtml({ mainBody: "<h1>EPL</h1>" }),
    "/team/afc/": buildHtml({ mainBody: "<h1>AFC</h1>" }),
  };

  let postCalls = 0;
  const receivedPayloads = [];
  const server = await startMockServer(async (req, res, body) => {
    if (req.method === "GET" && req.url === `/${key}.txt`) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(key);
      return;
    }
    if (req.method === "POST" && req.url === "/indexnow") {
      postCalls++;
      assert.equal(
        req.headers["content-type"],
        "application/json; charset=utf-8"
      );
      const parsed = JSON.parse(body);
      if (postCalls === 1) {
        res.writeHead(429, { "Retry-After": "0" });
        res.end("rate limited");
        return;
      }
      if (postCalls === 2) {
        res.writeHead(503);
        res.end("unavailable");
        return;
      }
      receivedPayloads.push(parsed);
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(404).end();
  });

  try {
    createSiteFixture(pubDir, server.baseUrl, pages);
    const result = await runSubmit({
      key,
      publicDir: pubDir,
      statePath,
      baseUrl: server.baseUrl,
      endpoint: server.endpoint,
      batchSize: 2,
      minDelayMs: 0,
      baseDelayMs: 1,
      retryDelaysMs: [1],
      logger: { log() {}, warn() {} },
    });

    assert.equal(result.ok, true);
    assert.equal(result.submittedCount, 5);
    assert.equal(result.stateChanged, true);
    assert.equal(receivedPayloads.length, 3);
    assert.deepEqual(
      receivedPayloads.map((p) => p.urlList.length),
      [2, 2, 1]
    );
    const expectedHost = new URL(server.baseUrl).host;
    for (const p of receivedPayloads) {
      assert.equal(p.host, expectedHost);
      assert.equal(p.key, key);
      assert.equal(p.keyLocation, `${server.baseUrl}${key}.txt`);
    }
    assert.ok(fs.existsSync(statePath));
    const saved = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(saved.version, 1);
    assert.equal(Object.keys(saved.urls).length, 5);
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 7. Transactional partial failure & retry of remaining batch only
test("runSubmit commits only succeeded batches on partial failure and retries remainder next run", async () => {
  const dir = makeTempDir();
  const statePath = path.join(dir, "indexnow-state.json");
  const pubDir = path.join(dir, "public");
  const key = "11223344556677889900aabbccddeeff";

  const pages = {
    "/": buildHtml({ mainBody: "<h1>Home</h1>" }),
    "/match/m1/": buildHtml({ mainBody: "<h1>M1</h1>" }),
    "/team/t1/": buildHtml({ mainBody: "<h1>T1</h1>" }),
    "/team/t2/": buildHtml({ mainBody: "<h1>T2</h1>" }),
  };

  let failSecondBatch = true;
  const acceptedUrls = [];
  const server = await startMockServer(async (req, res, body) => {
    if (req.method === "GET" && req.url === `/${key}.txt`) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(key);
      return;
    }
    if (req.method === "POST" && req.url === "/indexnow") {
      const parsed = JSON.parse(body);
      if (failSecondBatch && parsed.urlList.some((u) => u.includes("/team/"))) {
        res.writeHead(429, { "Retry-After": "0" });
        res.end("throttled");
        return;
      }
      acceptedUrls.push(...parsed.urlList);
      res.writeHead(202);
      res.end();
      return;
    }
    res.writeHead(404).end();
  });

  try {
    createSiteFixture(pubDir, server.baseUrl, pages);

    const first = await runSubmit({
      key,
      publicDir: pubDir,
      statePath,
      baseUrl: server.baseUrl,
      endpoint: server.endpoint,
      batchSize: 2,
      minDelayMs: 0,
      maxRetries: 1,
      baseDelayMs: 1,
      retryDelaysMs: [1],
      softFail: true,
      logger: { log() {}, warn() {} },
    });

    assert.equal(first.ok, false);
    assert.equal(first.submittedCount, 2);
    assert.equal(first.failedBatches, 1);
    assert.equal(first.stateChanged, true);

    const midState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.deepEqual(Object.keys(midState.urls).sort(), ["/", "/match/m1/"]);

    // Second run: batch 2 succeeds; ONLY the 2 remaining team URLs should be posted
    failSecondBatch = false;
    acceptedUrls.length = 0;

    const second = await runSubmit({
      key,
      publicDir: pubDir,
      statePath,
      baseUrl: server.baseUrl,
      endpoint: server.endpoint,
      batchSize: 2,
      minDelayMs: 0,
      baseDelayMs: 1,
      retryDelaysMs: [1],
      logger: { log() {}, warn() {} },
    });

    assert.equal(second.ok, true);
    assert.equal(second.submittedCount, 2);
    assert.deepEqual(acceptedUrls, [
      `${server.baseUrl}team/t1/`,
      `${server.baseUrl}team/t2/`,
    ]);

    const finalState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(Object.keys(finalState.urls).length, 4);
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INDEXNOW_CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

// 8. CLI subprocess: --dry-run, --soft-fail vs strict fail, and key redaction
test("CLI --dry-run, --soft-fail, strict fail, and key redaction behave as specified", async () => {
  const dir = makeTempDir();
  const statePath = path.join(dir, "dry-state.json");
  const pubDir = path.join(dir, "public");
  const key = "secretkey-1234-5678-90ab-cdef";
  let postHits = 0;

  const server = await startMockServer(async (req, res) => {
    if (req.method === "GET" && req.url === `/${key}.txt`) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(key);
      return;
    }
    if (req.method === "POST") {
      postHits++;
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end(`Forbidden for key=${key}`);
      return;
    }
    res.writeHead(404).end();
  });

  try {
    createSiteFixture(pubDir, server.baseUrl, {
      "/": buildHtml({ mainBody: "<h1>Home</h1>" }),
    });

    // --dry-run without INDEXNOW_KEY: 0 POSTs, no state file created
    const dryRes = await runCli(
      [
        "submit",
        "--dry-run",
        `--public-dir=${pubDir}`,
        `--state=${statePath}`,
        `--base-url=${server.baseUrl}`,
        `--endpoint=${server.endpoint}`,
      ],
      { INDEXNOW_KEY: "" }
    );
    assert.equal(dryRes.status, 0, dryRes.stderr);
    assert.equal(postHits, 0);
    assert.equal(fs.existsSync(statePath), false);

    // --soft-fail exits 0 on 403 and redacts key
    const softRes = await runCli(
      [
        "submit",
        "--soft-fail",
        `--public-dir=${pubDir}`,
        `--state=${statePath}`,
        `--base-url=${server.baseUrl}`,
        `--endpoint=${server.endpoint}`,
      ],
      { INDEXNOW_KEY: key }
    );
    assert.equal(softRes.status, 0, softRes.stderr);
    assert.equal(postHits, 1);
    assert.equal(fs.existsSync(statePath), false);
    const softOutput = softRes.stdout + softRes.stderr;
    assert.ok(!softOutput.includes(key), "Raw key must be redacted from logs");
    assert.ok(softOutput.includes("[REDACTED]"));

    // Strict mode exits 1 on 403 and redacts key
    const strictRes = await runCli(
      [
        "submit",
        `--public-dir=${pubDir}`,
        `--state=${statePath}`,
        `--base-url=${server.baseUrl}`,
        `--endpoint=${server.endpoint}`,
      ],
      { INDEXNOW_KEY: key }
    );
    assert.equal(strictRes.status, 1);
    const strictOutput = strictRes.stdout + strictRes.stderr;
    assert.ok(!strictOutput.includes(key), "Raw key must be redacted on failure");
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 9. Sanity check readBaseUrl & urlToPublicFile
test("readBaseUrl and urlToPublicFile resolve project settings and guard traversal", () => {
  const repoRoot = path.resolve(__dirname, "..");
  assert.equal(readBaseUrl(repoRoot), "https://cardapiofc.com/");
  assert.equal(
    urlToPublicFile("https://cardapiofc.com/", "https://cardapiofc.com/", "/tmp/pub"),
    path.resolve("/tmp/pub/index.html")
  );
  assert.equal(
    urlToPublicFile("https://cardapiofc.com/pt-br/match/x/", "https://cardapiofc.com/", "/tmp/pub"),
    path.resolve("/tmp/pub/pt-br/match/x/index.html")
  );
  assert.throws(() =>
    urlToPublicFile("https://cardapiofc.com/%2e%2e/etc/passwd", "https://cardapiofc.com/", "/tmp/pub")
  );
  assert.equal(redactKey("err key=secret1234", "secret1234"), "err key=[REDACTED]");
});

// Runner
let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} test(s) passed.`);
process.exit(failed ? 1 : 0);
