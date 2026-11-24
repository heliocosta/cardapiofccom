#!/usr/bin/env node

/**
 * End-to-end verification suite for the CardápioFC Editorial Blog feature.
 *
 * Covers:
 *   1. Built 9-edition blog hubs and launch seed articles (HTML, media, SEO, JSON-LD, analytics, nav, zero leaks)
 *   2. Isolated temp Hugo fixture for dynamic template behavior (related posts ordering, empty state,
 *      draft exclusion, missing-cover fallback, lastmod > date, edition-switcher hub fallback)
 *   3. Edge cache headers (static/_headers) and geo-routing rules (cloudflare/redirect-rules.json)
 *   4. Pre-build contract validator (scripts/validate-blog.mjs) pass + negative fixture failures
 *   5. Synthetic threshold tests for scripts/check-file-count.mjs and layouts/_partials/cfcdata/blog-budget.html
 *
 * Usage:
 *   node scripts/test-editorial-blog.mjs
 *   node scripts/test-editorial-blog.mjs --build
 *   node scripts/test-editorial-blog.mjs --pub-dir=path/to/public
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE,
  EDITIONS,
  EDITION_LOCALES,
  decodeEntities,
  extractElementsByClass,
  extractVisibleFaqs,
  htmlToText,
  normSpace,
  parseAttrs,
} from "./check-seo-social.mjs";
import { validateBlog } from "./validate-blog.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PUB_DIR = path.join(ROOT_DIR, "public");
const SEED_SLUG = "where-to-watch-live-football-official-channels-guide";
const SEED_IMAGE_REL = "images/blog/where-to-watch-live-football-official-channels-guide.png";
const OG_MAX_BYTES = 300000;

const BANNED_HTML_LINK_RE = /href\s*=\s*["']?[^"'\s>]*\/(?:categories|tags|authors)(?:\/|["'\s>#?]|$)/i;
const BANNED_FA_RE = /\bfa-[a-z0-9-]+|\b(?:fab|fas|far)\s+fa-/i;
const BANNED_CHANNEL_CLASS_RE = /\b(?:cfc-channel-badge|cfc-match-card__channels)\b/;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function parseCliArgs(argv) {
  let pubDir = DEFAULT_PUB_DIR;
  let forceBuild = false;
  for (const arg of argv) {
    if (arg === "--build") {
      forceBuild = true;
    } else if (arg.startsWith("--pub-dir=")) {
      pubDir = path.resolve(process.cwd(), arg.slice("--pub-dir=".length));
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }
  return { pubDir, forceBuild };
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function extractTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(parseAttrs(m[1] || ""));
  }
  return out;
}

function extractJsonLdGraph(html) {
  const re = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi;
  const nodes = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    if ((attrs.type || "").toLowerCase() === "application/ld+json") {
      const parsed = JSON.parse(m[2]);
      if (Array.isArray(parsed["@graph"])) {
        nodes.push(...parsed["@graph"]);
      } else if (Array.isArray(parsed)) {
        nodes.push(...parsed);
      } else {
        nodes.push(parsed);
      }
    }
  }
  return nodes;
}

function extractAnalyticsConfig(html) {
  const re = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    if (attrs.id === "cfc-analytics-config") {
      return JSON.parse(m[2]);
    }
  }
  return null;
}

function readJpegDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8, `Expected JPEG file: ${filePath}`);
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) break;
    while (offset < buf.length && buf[offset] === 0xff) offset++;
    if (offset >= buf.length) break;
    const marker = buf[offset++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > buf.length) break;
    const segLen = buf.readUInt16BE(offset);
    if (segLen < 2 || offset + segLen > buf.length) break;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof && segLen >= 7) {
      return {
        height: buf.readUInt16BE(offset + 3),
        width: buf.readUInt16BE(offset + 5),
      };
    }
    offset += segLen;
  }
  throw new Error(`Could not parse JPEG SOF dimensions: ${filePath}`);
}

function readWebpDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(
    buf.length >= 30 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP",
    `Expected WebP file: ${filePath}`
  );
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 " && buf.length >= 30) {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X" && buf.length >= 30) {
    return {
      width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
      height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
    };
  }
  throw new Error(`Unsupported WebP chunk "${chunk}" in ${filePath}`);
}

function ensureSampleBuildIfNeeded(pubDir, forceBuild) {
  const seedHtml = path.join(pubDir, "blog", SEED_SLUG, "index.html");
  if (!forceBuild && fs.existsSync(seedHtml)) {
    return;
  }
  if (pubDir !== DEFAULT_PUB_DIR && !forceBuild) {
    throw new Error(`Missing built blog output at ${seedHtml}`);
  }
  const env = { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" };
  const gen = spawnSync("node", ["scripts/themeGenerator.js"], {
    cwd: ROOT_DIR,
    env,
    encoding: "utf8",
  });
  assert.equal(gen.status, 0, `themeGenerator.js failed:\n${gen.stderr}\n${gen.stdout}`);
  const hugo = spawnSync(
    "hugo",
    ["--gc", "--minify", "--cleanDestinationDir", "--forceSyncStatic", "--destination", pubDir],
    {
      cwd: ROOT_DIR,
      env,
      encoding: "utf8",
    }
  );
  assert.equal(hugo.status, 0, `Hugo sample build failed:\n${hugo.stderr}\n${hugo.stdout}`);
}

function runHugoFixture({ contentDir, destDir, customBroadcasterBudgetCombined = null, envOverrides = {} }) {
  const statsPath = path.join(ROOT_DIR, "hugo_stats.json");
  const origStats = fs.existsSync(statsPath) ? fs.readFileSync(statsPath) : null;
  const tmpMetaDir = makeTempDir("cfc-blog-cfg-");

  try {
    const cfgDir = path.join(tmpMetaDir, "config");
    fs.cpSync(path.join(ROOT_DIR, "config"), cfgDir, { recursive: true });
    const langPath = path.join(cfgDir, "_default", "languages.toml");
    const langRaw = fs
      .readFileSync(langPath, "utf8")
      .replace(
        /contentDir\s*=\s*"content\/([^"]+)"/g,
        (_, ed) => `contentDir = "${path.join(contentDir, ed).replace(/\\/g, "/")}"`
      );
    fs.writeFileSync(langPath, langRaw, "utf8");

    const args = [
      "--source",
      ROOT_DIR,
      "--configDir",
      cfgDir,
      "--destination",
      destDir,
      "--environment",
      "development",
      "--ignoreCache",
    ];

    if (customBroadcasterBudgetCombined !== null) {
      const tmpLayouts = path.join(tmpMetaDir, "layouts");
      fs.cpSync(path.join(ROOT_DIR, "layouts"), tmpLayouts, { recursive: true });
      writeFile(
        path.join(tmpLayouts, "_partials", "cfcdata", "broadcaster-budget.html"),
        `{{ return (dict "combined" ${customBroadcasterBudgetCombined} "total" ${customBroadcasterBudgetCombined} "budget" 18000) }}\n`
      );
      args.push("--layoutDir", tmpLayouts);
    }

    return spawnSync("hugo", args, {
      cwd: ROOT_DIR,
      env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample", ...envOverrides },
      encoding: "utf8",
    });
  } finally {
    if (origStats !== null) {
      fs.writeFileSync(statsPath, origStats);
    }
    fs.rmSync(tmpMetaDir, { recursive: true, force: true });
  }
}

function seedNineEditionHubs(contentDir) {
  for (const ed of EDITIONS) {
    const code = ed || "en";
    writeFile(
      path.join(contentDir, code, "blog", "_index.md"),
      `---\ntitle: "Blog (${code})"\ndescription: "Editorial blog for ${code}"\ntranslationKey: "blog-hub"\n---\n`
    );
  }
}

function makeValidBlogFixtureRepo(rootDir) {
  fs.cpSync(path.join(ROOT_DIR, "config"), path.join(rootDir, "config"), { recursive: true });
  fs.cpSync(path.join(ROOT_DIR, "content"), path.join(rootDir, "content"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "assets", "images", "blog"), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT_DIR, "assets", SEED_IMAGE_REL),
    path.join(rootDir, "assets", SEED_IMAGE_REL)
  );
}

// ============================================================================
// 1. Built 9-edition blog hubs, seed articles, and shared image pipeline
// ============================================================================

test("built public/images/blog/ contains exactly 5 shared fingerprinted assets", ({ pubDir }) => {
  const blogImgDir = path.join(pubDir, "images", "blog");
  assert.ok(fs.existsSync(blogImgDir), `Missing ${blogImgDir}`);
  const files = fs.readdirSync(blogImgDir).sort();
  assert.equal(
    files.length,
    5,
    `Expected exactly 5 shared fingerprinted files in public/images/blog/, found ${files.length}: ${files.join(", ")}`
  );

  const webps = files.filter((f) => f.endsWith(".webp"));
  const jpgs = files.filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"));
  assert.equal(webps.length, 4, `Expected 4 WebP variants, found ${webps.length}`);
  assert.equal(jpgs.length, 1, `Expected 1 JPEG OG image, found ${jpgs.length}`);

  const webpDims = webps.map((f) => readWebpDimensions(path.join(blogImgDir, f)));
  const expectedDims = ["480x270", "640x360", "800x450", "1200x675"];
  const actualDims = webpDims.map((d) => `${d.width}x${d.height}`).sort();
  assert.deepEqual(actualDims, [...expectedDims].sort(), `Unexpected WebP dimensions: ${actualDims.join(", ")}`);

  const ogPath = path.join(blogImgDir, jpgs[0]);
  const ogBytes = fs.statSync(ogPath).size;
  assert.ok(ogBytes > 0 && ogBytes <= OG_MAX_BYTES, `OG JPEG size ${ogBytes} exceeds ${OG_MAX_BYTES} bytes`);
  const ogDims = readJpegDimensions(ogPath);
  assert.equal(ogDims.width, 1200, `OG JPEG width expected 1200, got ${ogDims.width}`);
  assert.equal(ogDims.height, 630, `OG JPEG height expected 630, got ${ogDims.height}`);
});

test("built 9-edition blog hubs satisfy HTML, card media, SEO, JSON-LD, analytics, nav, and leak invariants", ({ pubDir }) => {
  const referencedCardSrcs = new Set();

  for (const ed of EDITIONS) {
    const edCode = ed || "en";
    const prefix = ed ? `${ed}/` : "";
    const hubFile = path.join(pubDir, prefix, "blog", "index.html");
    assert.ok(fs.existsSync(hubFile), `Missing blog hub HTML: ${hubFile}`);
    const html = fs.readFileSync(hubFile, "utf8");

    // Zero banned syntax/classes/links
    assert.ok(!BANNED_HTML_LINK_RE.test(html), `${prefix}blog/index.html contains banned taxonomy/author link`);
    assert.ok(!BANNED_FA_RE.test(html), `${prefix}blog/index.html contains banned FontAwesome class`);
    assert.ok(!BANNED_CHANNEL_CLASS_RE.test(html), `${prefix}blog/index.html contains banned match channel badge class`);

    // 2-level breadcrumb in HTML
    const breadcrumbItems = extractElementsByClass(html, "cfc-breadcrumb__item");
    assert.equal(breadcrumbItems.length, 2, `${prefix}blog/index.html expected 2 breadcrumb items, got ${breadcrumbItems.length}`);

    // Page hero + app-download CTA
    assert.equal(extractElementsByClass(html, "cfc-page-hero").length, 1, `${prefix}blog/index.html missing .cfc-page-hero`);
    assert.ok(extractElementsByClass(html, "cfc-app-download").length >= 1, `${prefix}blog/index.html missing .cfc-app-download`);

    // Primary and footer nav include edition's /blog/
    const expectedBlogHref = `/${prefix}blog/`;
    const mainMenu = extractElementsByClass(html, "cfc-header__menu")[0] || "";
    const footerMenu = extractElementsByClass(html, "cfc-menu--footer")[0] || "";
    assert.ok(mainMenu.includes(`href=${expectedBlogHref}`) || mainMenu.includes(`href="${expectedBlogHref}"`), `${prefix}blog/ primary nav missing ${expectedBlogHref}`);
    assert.ok(footerMenu.includes(`href=${expectedBlogHref}`) || footerMenu.includes(`href="${expectedBlogHref}"`), `${prefix}blog/ footer nav missing ${expectedBlogHref}`);

    // Card grid & seed card invariants
    const cards = extractElementsByClass(html, "cfc-blog-card");
    assert.ok(cards.length >= 1, `${prefix}blog/index.html expected >= 1 .cfc-blog-card`);
    const cardHtml = cards[0];
    assert.ok(extractElementsByClass(cardHtml, "cfc-blog-card__pillar").length === 1, `${prefix}blog/ card missing pillar label`);
    assert.ok(extractElementsByClass(cardHtml, "cfc-blog-card__meta-item").length >= 2, `${prefix}blog/ card missing date + reading time`);
    assert.ok(/<time\b[^>]*datetime=/i.test(cardHtml), `${prefix}blog/ card missing <time datetime=...>`);

    const cardImgs = extractTags(cardHtml, "img");
    assert.equal(cardImgs.length, 1, `${prefix}blog/ card expected 1 <img>`);
    const img = cardImgs[0];
    assert.equal(img.width, "800", `${prefix}blog/ card img width expected 800, got ${img.width}`);
    assert.equal(img.height, "450", `${prefix}blog/ card img height expected 450, got ${img.height}`);
    assert.ok(img.src && img.src.startsWith("/images/blog/") && img.src.endsWith(".webp"), `${prefix}blog/ card img src must be /images/blog/*.webp, got ${img.src}`);
    assert.ok(img.srcset && img.srcset.includes("1x") && img.srcset.includes("2x"), `${prefix}blog/ card img missing 1x/2x srcset`);
    assert.ok(img.alt && img.alt.trim().length > 0, `${prefix}blog/ card img missing alt`);
    referencedCardSrcs.add(img.src);

    // Open Graph & JSON-LD
    const metas = extractTags(html, "meta");
    const ogType = metas.find((m) => m.property === "og:type");
    assert.equal(ogType?.content, "website", `${prefix}blog/ og:type expected website, got ${ogType?.content}`);

    const graph = extractJsonLdGraph(html);
    const blogNode = graph.find((n) => n["@type"] === "Blog");
    const bcNode = graph.find((n) => n["@type"] === "BreadcrumbList");
    assert.ok(blogNode, `${prefix}blog/ JSON-LD missing Blog node`);
    assert.ok(Array.isArray(blogNode.blogPost) && blogNode.blogPost.length >= 1, `${prefix}blog/ JSON-LD Blog.blogPost empty`);
    assert.ok(bcNode && bcNode.itemListElement?.length === 2, `${prefix}blog/ JSON-LD BreadcrumbList must have 2 items`);

    // Analytics pageType
    const cfg = extractAnalyticsConfig(html);
    assert.equal(cfg?.pageType, "blog", `${prefix}blog/ analytics pageType expected "blog", got ${cfg?.pageType}`);
    assert.equal(cfg?.edition, edCode, `${prefix}blog/ analytics edition expected "${edCode}"`);
  }

  // Shared image across all 9 editions (1 unique card src)
  assert.equal(referencedCardSrcs.size, 1, `Expected 1 shared card image URL across all 9 editions, found ${referencedCardSrcs.size}`);
});

test("built 9-edition seed articles satisfy layout, hero media, FAQ parity, SEO/OG, JSON-LD, switcher, and analytics invariants", ({ pubDir }) => {
  const referencedHeroSrcs = new Set();
  const referencedOgUrls = new Set();

  for (const ed of EDITIONS) {
    const edCode = ed || "en";
    const prefix = ed ? `${ed}/` : "";
    const articleFile = path.join(pubDir, prefix, "blog", SEED_SLUG, "index.html");
    assert.ok(fs.existsSync(articleFile), `Missing seed article HTML: ${articleFile}`);
    const html = fs.readFileSync(articleFile, "utf8");

    // Zero banned syntax/classes/links
    assert.ok(!BANNED_HTML_LINK_RE.test(html), `${prefix}blog/${SEED_SLUG}/ contains banned taxonomy/author link`);
    assert.ok(!BANNED_FA_RE.test(html), `${prefix}blog/${SEED_SLUG}/ contains banned FontAwesome class`);
    assert.ok(!BANNED_CHANNEL_CLASS_RE.test(html), `${prefix}blog/${SEED_SLUG}/ contains banned match channel badge class`);

    // 3-level breadcrumb in HTML
    const breadcrumbItems = extractElementsByClass(html, "cfc-breadcrumb__item");
    assert.equal(breadcrumbItems.length, 3, `${prefix}blog/${SEED_SLUG}/ expected 3 breadcrumb items, got ${breadcrumbItems.length}`);

    // Pillar label, published date, reading time, prose, app-download CTA, back link
    const pillarEls = extractElementsByClass(html, "cfc-blog-article__pillar");
    assert.equal(pillarEls.length, 1, `${prefix}blog/${SEED_SLUG}/ missing .cfc-blog-article__pillar`);
    const pillarText = normSpace(htmlToText(pillarEls[0]));
    assert.ok(pillarText.length > 0, `${prefix}blog/${SEED_SLUG}/ empty pillar label`);

    assert.equal(extractElementsByClass(html, "cfc-blog-meta__published").length, 1, `${prefix}blog/${SEED_SLUG}/ missing published meta`);
    assert.equal(extractElementsByClass(html, "cfc-blog-meta__reading").length, 1, `${prefix}blog/${SEED_SLUG}/ missing reading time meta`);
    assert.equal(extractElementsByClass(html, "cfc-blog-prose").length, 1, `${prefix}blog/${SEED_SLUG}/ missing .cfc-blog-prose`);
    assert.ok(extractElementsByClass(html, "cfc-app-download").length >= 1, `${prefix}blog/${SEED_SLUG}/ missing .cfc-app-download`);

    const backLinks = extractTags(extractElementsByClass(html, "cfc-blog-back")[0] || "", "a");
    assert.equal(backLinks.length, 1, `${prefix}blog/${SEED_SLUG}/ missing .cfc-blog-back link`);
    assert.equal(backLinks[0].href, `/${prefix}blog/`, `${prefix}blog/${SEED_SLUG}/ back link expected /${prefix}blog/, got ${backLinks[0].href}`);

    // Hero WebP image: 1200x675, eager, decoding=async, 640w/1200w srcset, localized alt
    const heroHtml = extractElementsByClass(html, "cfc-blog-hero")[0] || "";
    const heroImgs = extractTags(heroHtml, "img");
    assert.equal(heroImgs.length, 1, `${prefix}blog/${SEED_SLUG}/ expected 1 hero <img>`);
    const heroImg = heroImgs[0];
    assert.equal(heroImg.width, "1200", `${prefix}blog/${SEED_SLUG}/ hero width expected 1200`);
    assert.equal(heroImg.height, "675", `${prefix}blog/${SEED_SLUG}/ hero height expected 675`);
    assert.equal(heroImg.loading, "eager", `${prefix}blog/${SEED_SLUG}/ hero loading expected eager`);
    assert.equal(heroImg.decoding, "async", `${prefix}blog/${SEED_SLUG}/ hero decoding expected async`);
    assert.ok(heroImg.src.startsWith("/images/blog/") && heroImg.src.endsWith(".webp"), `${prefix}blog/${SEED_SLUG}/ hero src must be /images/blog/*.webp`);
    assert.ok(heroImg.srcset.includes("640w") && heroImg.srcset.includes("1200w"), `${prefix}blog/${SEED_SLUG}/ hero srcset missing 640w/1200w`);
    assert.ok(heroImg.alt && heroImg.alt.trim().length > 0, `${prefix}blog/${SEED_SLUG}/ hero img missing alt`);
    referencedHeroSrcs.add(heroImg.src);

    // Edition switcher links directly to each edition's seed article
    const switcherHtml = extractElementsByClass(html, "cfc-switcher__dropdown")[0] || "";
    const switcherLinks = extractTags(switcherHtml, "a");
    assert.equal(switcherLinks.length, 9, `${prefix}blog/${SEED_SLUG}/ switcher expected 9 edition links`);
    for (const targetEd of EDITIONS) {
      const tCode = targetEd || "en";
      const tPrefix = targetEd ? `${targetEd}/` : "";
      const expectedTarget = `/${tPrefix}blog/${SEED_SLUG}/`;
      const found = switcherLinks.find((l) => l["data-cfc-target-edition"] === tCode);
      assert.equal(found?.href, expectedTarget, `${prefix}blog/${SEED_SLUG}/ switcher for ${tCode} expected ${expectedTarget}, got ${found?.href}`);
    }

    // Open Graph article tags & 1200x630 <= 300KB JPEG OG image
    const metas = extractTags(html, "meta");
    const getMeta = (prop) => metas.find((m) => m.property === prop)?.content;
    assert.equal(getMeta("og:type"), "article", `${prefix}blog/${SEED_SLUG}/ og:type expected article`);
    assert.ok(getMeta("article:published_time"), `${prefix}blog/${SEED_SLUG}/ missing article:published_time`);
    assert.ok(getMeta("article:modified_time"), `${prefix}blog/${SEED_SLUG}/ missing article:modified_time`);
    assert.equal(getMeta("article:section"), pillarText, `${prefix}blog/${SEED_SLUG}/ article:section must match pillar label`);
    assert.equal(getMeta("og:image:width"), "1200", `${prefix}blog/${SEED_SLUG}/ og:image:width expected 1200`);
    assert.equal(getMeta("og:image:height"), "630", `${prefix}blog/${SEED_SLUG}/ og:image:height expected 630`);

    const ogUrl = getMeta("og:image");
    assert.ok(ogUrl && ogUrl.startsWith(`${BASE}images/blog/`) && ogUrl.endsWith(".jpg"), `${prefix}blog/${SEED_SLUG}/ og:image must be shared JPEG under ${BASE}images/blog/, got ${ogUrl}`);
    referencedOgUrls.add(ogUrl);
    const ogDiskPath = path.join(pubDir, ogUrl.slice(BASE.length));
    assert.ok(fs.existsSync(ogDiskPath), `Missing OG JPEG on disk: ${ogDiskPath}`);
    assert.ok(fs.statSync(ogDiskPath).size <= OG_MAX_BYTES, `OG JPEG exceeds ${OG_MAX_BYTES} bytes`);

    // JSON-LD: BlogPosting + 3-level BreadcrumbList + verbatim FAQPage
    const graph = extractJsonLdGraph(html);
    const bp = graph.find((n) => n["@type"] === "BlogPosting");
    const bc = graph.find((n) => n["@type"] === "BreadcrumbList");
    const faqNode = graph.find((n) => n["@type"] === "FAQPage");
    assert.ok(bp, `${prefix}blog/${SEED_SLUG}/ missing BlogPosting JSON-LD`);
    assert.equal(bp.image, ogUrl, `${prefix}blog/${SEED_SLUG}/ BlogPosting.image must match og:image`);
    assert.equal(bp.articleSection, pillarText, `${prefix}blog/${SEED_SLUG}/ BlogPosting.articleSection must match pillar label`);
    assert.ok(bp.datePublished && bp.dateModified, `${prefix}blog/${SEED_SLUG}/ BlogPosting missing dates`);
    assert.ok(bc && bc.itemListElement?.length === 3, `${prefix}blog/${SEED_SLUG}/ BreadcrumbList must have 3 items`);
    assert.ok(faqNode && Array.isArray(faqNode.mainEntity) && faqNode.mainEntity.length >= 1, `${prefix}blog/${SEED_SLUG}/ missing FAQPage JSON-LD`);

    const { items: visibleFaqs, errors: faqErrs } = extractVisibleFaqs(html);
    assert.deepEqual(faqErrs, [], `${prefix}blog/${SEED_SLUG}/ FAQ DOM errors: ${faqErrs.join("; ")}`);
    assert.equal(visibleFaqs.length, faqNode.mainEntity.length, `${prefix}blog/${SEED_SLUG}/ visible FAQ count !== FAQPage.mainEntity length`);
    for (let i = 0; i < visibleFaqs.length; i++) {
      assert.equal(visibleFaqs[i].q, normSpace(faqNode.mainEntity[i].name), `${prefix}blog/${SEED_SLUG}/ FAQ question ${i + 1} mismatch`);
      assert.equal(visibleFaqs[i].a, normSpace(faqNode.mainEntity[i].acceptedAnswer.text), `${prefix}blog/${SEED_SLUG}/ FAQ answer ${i + 1} mismatch`);
    }

    // Analytics pageType
    const cfg = extractAnalyticsConfig(html);
    assert.equal(cfg?.pageType, "article", `${prefix}blog/${SEED_SLUG}/ analytics pageType expected "article", got ${cfg?.pageType}`);
    assert.equal(cfg?.edition, edCode, `${prefix}blog/${SEED_SLUG}/ analytics edition expected "${edCode}"`);
  }

  assert.equal(referencedHeroSrcs.size, 1, `Expected 1 shared hero image URL across all 9 editions, found ${referencedHeroSrcs.size}`);
  assert.equal(referencedOgUrls.size, 1, `Expected 1 shared OG JPEG URL across all 9 editions, found ${referencedOgUrls.size}`);
});

// ============================================================================
// 2. Dynamic template behaviors via isolated temp Hugo fixture
// ============================================================================

test("isolated Hugo fixture verifies related-posts ordering, empty state, drafts, missing-cover fallback, lastmod > date, and switcher hub fallback", () => {
  const contentDir = makeTempDir("cfc-blog-fixture-src-");
  const destDir = makeTempDir("cfc-blog-fixture-out-");
  try {
    seedNineEditionHubs(contentDir);

    const writePost = (ed, slug, fm, body = "Official football broadcast guide body paragraph.") => {
      const yaml = Object.entries(fm)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      writeFile(path.join(contentDir, ed, "blog", `${slug}.md`), `---\n${yaml}\n---\n\n${body}\n`);
    };

    // 5 published posts in Global `en` + 1 draft post
    writePost("en", "alpha-guide", {
      title: "Alpha Watch Guide",
      description: "Alpha description",
      date: "2026-11-20T10:00:00Z",
      lastmod: "2026-11-22T15:30:00Z",
      translationKey: "blog-alpha-guide",
      pillar: "watch-guides",
      image: SEED_IMAGE_REL,
      image_alt: "Alpha alt",
      draft: false,
    });
    writePost("en", "beta-rights", {
      title: "Beta Rights Post",
      description: "Beta description",
      date: "2026-11-21T10:00:00Z",
      lastmod: "2026-11-21T10:00:00Z",
      translationKey: "blog-beta-rights",
      pillar: "rights-changes",
      image: SEED_IMAGE_REL,
      image_alt: "Beta alt",
      draft: false,
    });
    writePost("en", "gamma-watch", {
      title: "Gamma Watch Guide",
      description: "Gamma description",
      date: "2026-11-22T10:00:00Z",
      lastmod: "2026-11-22T10:00:00Z",
      translationKey: "blog-gamma-watch",
      pillar: "watch-guides",
      image: SEED_IMAGE_REL,
      image_alt: "Gamma alt",
      draft: false,
    });
    writePost("en", "delta-watch", {
      title: "Delta Watch Guide",
      description: "Delta description",
      date: "2026-11-23T10:00:00Z",
      lastmod: "2026-11-23T10:00:00Z",
      translationKey: "blog-delta-watch",
      pillar: "watch-guides",
      image: SEED_IMAGE_REL,
      image_alt: "Delta alt",
      draft: false,
    });
    writePost("en", "epsilon-missing-cover", {
      title: "Epsilon Missing Cover",
      description: "Epsilon description",
      date: "2026-11-24T10:00:00Z",
      lastmod: "2026-11-24T10:00:00Z",
      translationKey: "blog-epsilon-missing-cover",
      pillar: "market-analysis",
      image: "images/blog/non-existent-cover.png",
      image_alt: "Missing cover alt",
      draft: false,
    });
    writePost("en", "zeta-draft", {
      title: "Zeta Draft Post",
      description: "Draft description",
      date: "2026-11-25T10:00:00Z",
      lastmod: "2026-11-25T10:00:00Z",
      translationKey: "blog-zeta-draft",
      pillar: "watch-guides",
      image: SEED_IMAGE_REL,
      image_alt: "Draft alt",
      draft: true,
    });

    // pt-br has ONLY a draft post -> tests empty state + draft exclusion
    writePost("pt-br", "pt-draft-only", {
      title: "PT Draft Only",
      description: "PT Draft description",
      date: "2026-11-25T10:00:00Z",
      lastmod: "2026-11-25T10:00:00Z",
      translationKey: "blog-pt-draft-only",
      pillar: "watch-guides",
      image: SEED_IMAGE_REL,
      image_alt: "PT Draft alt",
      draft: true,
    });

    const buildRes = runHugoFixture({ contentDir, destDir });
    assert.equal(buildRes.status, 0, `Temp Hugo fixture build failed:\n${buildRes.stderr}\n${buildRes.stdout}`);

    // Drafts excluded from output & sitemap
    assert.ok(!fs.existsSync(path.join(destDir, "blog", "zeta-draft", "index.html")), "Draft post must not emit HTML");
    assert.ok(!fs.existsSync(path.join(destDir, "pt-br", "blog", "pt-draft-only", "index.html")), "PT draft post must not emit HTML");
    const enSitemap = fs.readFileSync(path.join(destDir, "en", "sitemap.xml"), "utf8");
    assert.ok(!enSitemap.includes("zeta-draft"), "Draft post must not appear in sitemap.xml");

    // Global hub newest-first card order (epsilon Nov 24, delta Nov 23, gamma Nov 22, beta Nov 21, alpha Nov 20)
    const hubHtml = fs.readFileSync(path.join(destDir, "blog", "index.html"), "utf8");
    const hubCards = extractElementsByClass(hubHtml, "cfc-blog-card");
    assert.equal(hubCards.length, 5, `Expected 5 published cards in fixture hub, got ${hubCards.length}`);
    const hubOrder = hubCards.map((c) => decodeEntities(htmlToText(extractElementsByClass(c, "cfc-blog-card__title")[0] || "")));
    assert.deepEqual(
      hubOrder,
      ["Epsilon Missing Cover", "Delta Watch Guide", "Gamma Watch Guide", "Beta Rights Post", "Alpha Watch Guide"],
      `Unexpected newest-first card order: ${hubOrder.join(" | ")}`
    );

    // Alpha post: lastmod > date rendered, related posts = [Delta Watch Guide, Gamma Watch Guide, Epsilon Missing Cover], switcher fallback to /pt-br/blog/
    const alphaHtml = fs.readFileSync(path.join(destDir, "blog", "alpha-guide", "index.html"), "utf8");
    assert.equal(extractElementsByClass(alphaHtml, "cfc-blog-meta__updated").length, 1, "lastmod > date must render .cfc-blog-meta__updated");

    const relatedHtml = extractElementsByClass(alphaHtml, "cfc-blog-related")[0] || "";
    const relatedCards = extractElementsByClass(relatedHtml, "cfc-blog-card");
    assert.equal(relatedCards.length, 3, `Expected max 3 related cards, got ${relatedCards.length}`);
    const relatedTitles = relatedCards.map((c) => decodeEntities(htmlToText(extractElementsByClass(c, "cfc-blog-card__title")[0] || "")));
    assert.deepEqual(
      relatedTitles,
      ["Delta Watch Guide", "Gamma Watch Guide", "Epsilon Missing Cover"],
      `Related posts must prioritize same pillar (watch-guides) newest-first before other pillars; got: ${relatedTitles.join(" | ")}`
    );

    const alphaSwitcher = extractElementsByClass(alphaHtml, "cfc-switcher__dropdown")[0] || "";
    const ptSwitchLink = extractTags(alphaSwitcher, "a").find((l) => l["data-cfc-target-edition"] === "pt-br");
    assert.equal(ptSwitchLink?.href, "/pt-br/blog/", `Untranslated edition switcher link expected /pt-br/blog/, got ${ptSwitchLink?.href}`);

    // Epsilon missing-cover post: no .cfc-blog-hero, og:image falls back to edition card
    const epsilonHtml = fs.readFileSync(path.join(destDir, "blog", "epsilon-missing-cover", "index.html"), "utf8");
    assert.equal(extractElementsByClass(epsilonHtml, "cfc-blog-hero").length, 0, "Missing-cover post must omit .cfc-blog-hero");
    const epsilonOgImg = extractTags(epsilonHtml, "meta").find((m) => m.property === "og:image")?.content;
    assert.equal(epsilonOgImg, `${BASE}og/editions/og-global.png`, `Missing-cover og:image expected fallback ${BASE}og/editions/og-global.png, got ${epsilonOgImg}`);

    // pt-br hub empty state
    const ptHubHtml = fs.readFileSync(path.join(destDir, "pt-br", "blog", "index.html"), "utf8");
    assert.equal(extractElementsByClass(ptHubHtml, "cfc-blog-grid").length, 0, "Empty edition hub must not render .cfc-blog-grid");
    assert.equal(extractElementsByClass(ptHubHtml, "cfc-empty-state").length, 1, "Empty edition hub must render .cfc-empty-state");
  } finally {
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 3. Edge headers & geo-routing rules
// ============================================================================

test("static/_headers configures immutable 1-year caching for /images/blog/*", () => {
  const headersPath = path.join(ROOT_DIR, "static", "_headers");
  assert.ok(fs.existsSync(headersPath), "Missing static/_headers");
  const raw = fs.readFileSync(headersPath, "utf8");
  assert.match(
    raw,
    /(?:^|\r?\n)\/images\/blog\/\*\s*\r?\n\s*Cache-Control:\s*public,\s*max-age=31536000,\s*immutable\b/,
    "static/_headers missing `/images/blog/*` `Cache-Control: public, max-age=31536000, immutable` rule"
  );
});

test("cloudflare/redirect-rules.json matches /blog, /blog/, and /blog/* across all 8 rules with crawler/opt-out exclusions", () => {
  const redirectPath = path.join(ROOT_DIR, "cloudflare", "redirect-rules.json");
  assert.ok(fs.existsSync(redirectPath), "Missing cloudflare/redirect-rules.json");
  const parsed = JSON.parse(fs.readFileSync(redirectPath, "utf8"));
  assert.ok(Array.isArray(parsed.rules), "redirect-rules.json missing rules array");
  assert.equal(parsed.rules.length, 8, `Expected 8 regional rules, found ${parsed.rules.length}`);

  const expectedCountries = ["GB", "IE", "BR", "PT", "AR", "US", "CN", "JP"];
  const seenCountries = [];
  for (const rule of parsed.rules) {
    const expr = String(rule.expression || "");
    const countryMatch = expr.match(/ip\.src\.country eq "([A-Z]{2})"/);
    assert.ok(countryMatch, `Rule missing ip.src.country: ${rule.description}`);
    seenCountries.push(countryMatch[1]);

    assert.ok(expr.includes('http.request.uri.path eq "/blog"'), `${rule.description}: missing eq "/blog"`);
    assert.ok(expr.includes('http.request.uri.path eq "/blog/"'), `${rule.description}: missing eq "/blog/"`);
    assert.ok(expr.includes('starts_with(http.request.uri.path, "/blog/")'), `${rule.description}: missing starts_with("/blog/")`);

    for (const bot of ["Googlebot", "bingbot", "OAI-SearchBot", "GPTBot", "PerplexityBot", "ClaudeBot"]) {
      assert.ok(expr.includes(`http.user_agent contains "${bot}"`), `${rule.description}: missing bot exclusion ${bot}`);
    }
    assert.ok(expr.includes('not http.request.uri.query contains "edition="'), `${rule.description}: missing edition= query opt-out`);
    assert.ok(expr.includes('not http.cookie contains "cfc_edition="'), `${rule.description}: missing cfc_edition= cookie opt-out`);
  }
  assert.deepEqual(seenCountries.sort(), [...expectedCountries].sort(), `Unexpected country rule set: ${seenCountries.join(", ")}`);
});

// ============================================================================
// 4. Contract validator (scripts/validate-blog.mjs) pass & negative fixtures
// ============================================================================

test("scripts/validate-blog.mjs passes on repo and rejects invalid negative fixtures", () => {
  const repoResult = validateBlog({ rootDir: ROOT_DIR });
  assert.equal(repoResult.ok, true, `validateBlog failed on repo: ${repoResult.errors.join("; ")}`);
  assert.equal(repoResult.stats.editions, 9);
  assert.ok(repoResult.stats.publishedArticles >= 1);

  const cliPass = spawnSync("node", [path.join(ROOT_DIR, "scripts", "validate-blog.mjs")], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  assert.equal(cliPass.status, 0, `validate-blog.mjs CLI failed:\n${cliPass.stderr}\n${cliPass.stdout}`);

  const negativeCases = [
    {
      name: "missing edition article",
      mutate: (dir) => {
        fs.unlinkSync(path.join(dir, "content", "ja", "blog", `${SEED_SLUG}.md`));
      },
      expectErr: /missing in 1 edition.*ja/i,
    },
    {
      name: "invalid pillar",
      mutate: (dir) => {
        const p = path.join(dir, "content", "en", "blog", `${SEED_SLUG}.md`);
        fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace('pillar: "watch-guides"', 'pillar: "rumors"'));
      },
      expectErr: /invalid "pillar"/i,
    },
    {
      name: "missing cover image",
      mutate: (dir) => {
        fs.unlinkSync(path.join(dir, "assets", SEED_IMAGE_REL));
      },
      expectErr: /cover image does not exist/i,
    },
    {
      name: "lastmod earlier than date",
      mutate: (dir) => {
        const p = path.join(dir, "content", "en", "blog", `${SEED_SLUG}.md`);
        fs.writeFileSync(
          p,
          fs.readFileSync(p, "utf8").replace(/lastmod:\s*"?2026-11-24T12:00:00Z"?/, 'lastmod: "2026-11-23T12:00:00Z"')
        );
      },
      expectErr: /lastmod.*must be >= "date"/i,
    },
    {
      name: "mismatched translationKey",
      mutate: (dir) => {
        const p = path.join(dir, "content", "pt-br", "blog", `${SEED_SLUG}.md`);
        fs.writeFileSync(
          p,
          fs.readFileSync(p, "utf8").replace(
            `translationKey: "blog-${SEED_SLUG}"`,
            'translationKey: "blog-different-key"'
          )
        );
      },
      expectErr: /mismatched translationKey/i,
    },
    {
      name: "banned taxonomy link and fa- class",
      mutate: (dir) => {
        const p = path.join(dir, "content", "en", "blog", `${SEED_SLUG}.md`);
        fs.appendFileSync(p, '\nSee [tags](/tags/football/) <i class="fa-solid fa-tv"></i>.\n');
      },
      expectErr: /banned taxonomy\/author link|banned FontAwesome/i,
    },
  ];

  for (const nc of negativeCases) {
    const tmpRepo = makeTempDir("cfc-validate-neg-");
    try {
      makeValidBlogFixtureRepo(tmpRepo);
      nc.mutate(tmpRepo);
      const res = validateBlog({ rootDir: tmpRepo });
      assert.equal(res.ok, false, `Expected validateBlog failure for ${nc.name}`);
      assert.ok(
        res.errors.some((e) => nc.expectErr.test(e)),
        `Expected error matching ${nc.expectErr} for ${nc.name}, got: ${res.errors.join(" | ")}`
      );
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  }
});

// ============================================================================
// 5. Synthetic threshold tests: check-file-count.mjs and blog-budget.html
// ============================================================================

test("scripts/check-file-count.mjs enforces <18,000 pass, 18,001-20,000 warning, >20,000 error, missing dir error, and llms-full.txt bytes", () => {
  const scriptPath = path.join(ROOT_DIR, "scripts", "check-file-count.mjs");
  const missingDir = path.join(os.tmpdir(), `cfc-missing-dir-${process.pid}-${Date.now()}`);
  const missingRes = spawnSync("node", [scriptPath, `--dir=${missingDir}`], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  assert.notEqual(missingRes.status, 0, "Missing directory must exit non-zero");

  const tmpOut = makeTempDir("cfc-file-count-");
  try {
    // Seed 5 files including llms-full.txt (123 bytes) -> < 18,000 pass without warning
    const llmsContent = "x".repeat(123);
    writeFile(path.join(tmpOut, "llms-full.txt"), llmsContent);
    for (let i = 0; i < 4; i++) {
      writeFile(path.join(tmpOut, "blog", `p${i}.html`), "a");
    }

    const passRes = spawnSync("node", [scriptPath, `--dir=${tmpOut}`], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
    assert.equal(passRes.status, 0, `Under-budget check failed:\n${passRes.stderr}\n${passRes.stdout}`);
    assert.ok(!passRes.stdout.includes("::warning::"), "Under-budget run must not emit ::warning::");
    assert.ok(passRes.stdout.includes("llms-full.txt: 123 bytes"), `Missing llms-full.txt byte report:\n${passRes.stdout}`);

    // Populate up to 18,001 files total -> ::warning:: + exit 0
    const populateTo = (startIdx, endIdx) => {
      const numBuckets = 20;
      for (let b = 0; b < numBuckets; b++) {
        fs.mkdirSync(path.join(tmpOut, `b${b}`), { recursive: true });
      }
      for (let i = startIdx; i < endIdx; i++) {
        const fd = fs.openSync(path.join(tmpOut, `b${i % numBuckets}`, `f${i}`), "w");
        fs.closeSync(fd);
      }
    };

    populateTo(5, 18001);
    const warnRes = spawnSync("node", [scriptPath, `--dir=${tmpOut}`], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
    assert.equal(warnRes.status, 0, `18,001 warning band should exit 0:\n${warnRes.stderr}\n${warnRes.stdout}`);
    assert.ok(warnRes.stdout.includes("::warning::"), `18,001 files must emit ::warning::\n${warnRes.stdout}`);

    // Populate up to 20,001 files total -> ::error:: + exit 1
    populateTo(18001, 20001);
    const failRes = spawnSync("node", [scriptPath, `--dir=${tmpOut}`], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
    assert.equal(failRes.status, 1, `20,001 hard limit should exit 1, got ${failRes.status}`);
    assert.ok(failRes.stderr.includes("::error::"), `20,001 files must emit ::error::\n${failRes.stderr}`);
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test("layouts/_partials/cfcdata/blog-budget.html warns at 18,001-20,000, errors >20,000, and honors HUGO_CFC_FILE_BUDGET override", () => {
  const runBudgetCase = ({ broadcasterCombined, envOverrides = {} }) => {
    const contentDir = makeTempDir("cfc-blog-budget-src-");
    const destDir = makeTempDir("cfc-blog-budget-out-");
    try {
      seedNineEditionHubs(contentDir);
      writeFile(
        path.join(contentDir, "en", "blog", "budget-seed.md"),
        `---\ntitle: "Budget Seed"\ndescription: "Budget test"\ndate: 2026-11-24T12:00:00Z\nlastmod: 2026-11-24T12:00:00Z\ntranslationKey: "blog-budget-seed"\npillar: "watch-guides"\nimage: "${SEED_IMAGE_REL}"\nimage_alt: "Budget alt"\ndraft: false\n---\n\nBody text.\n`
      );
      const res = runHugoFixture({
        contentDir,
        destDir,
        customBroadcasterBudgetCombined: broadcasterCombined,
        envOverrides,
      });
      return {
        status: res.status,
        output: `${res.stdout || ""}\n${res.stderr || ""}`,
      };
    } finally {
      fs.rmSync(contentDir, { recursive: true, force: true });
      fs.rmSync(destDir, { recursive: true, force: true });
    }
  };

  // Blog adds 9 hubs + 1 post + 5 images = 15 files.
  // 1) 18500 + 15 = 18515 (between 18,001 and 20,000) -> warnf without failing
  const warnCase = runBudgetCase({ broadcasterCombined: 18500 });
  assert.equal(warnCase.status, 0, `Expected warning build (18,515) to exit 0:\n${warnCase.output}`);
  assert.ok(
    warnCase.output.includes("editorial-blog: file budget warning: estimated 18515 files exceeds soft budget 18000"),
    `Missing soft-budget warning log:\n${warnCase.output}`
  );

  // 2) 20050 + 15 = 20065 (> 20,000 hard limit) -> errorf exit non-zero
  const hardFailCase = runBudgetCase({ broadcasterCombined: 20050 });
  assert.notEqual(hardFailCase.status, 0, `Expected >20,000 build (20,065) to exit non-zero:\n${hardFailCase.output}`);
  assert.ok(
    hardFailCase.output.includes("editorial-blog: file budget exceeded: estimated 20065 files exceeds hard limit 20000"),
    `Missing hard-limit errorf log:\n${hardFailCase.output}`
  );

  // 3) 500 + 15 = 515 with HUGO_CFC_FILE_BUDGET=400 -> errorf exit non-zero
  const envOverrideCase = runBudgetCase({
    broadcasterCombined: 500,
    envOverrides: { HUGO_CFC_FILE_BUDGET: "400" },
  });
  assert.notEqual(envOverrideCase.status, 0, `Expected HUGO_CFC_FILE_BUDGET=400 override to exit non-zero:\n${envOverrideCase.output}`);
  assert.ok(
    envOverrideCase.output.includes("editorial-blog: file budget exceeded: estimated 515 files exceeds budget 400"),
    `Missing HUGO_CFC_FILE_BUDGET override errorf log:\n${envOverrideCase.output}`
  );
});

// ============================================================================
// Runner
// ============================================================================

async function main() {
  const { pubDir, forceBuild } = parseCliArgs(process.argv.slice(2));
  ensureSampleBuildIfNeeded(pubDir, forceBuild);

  console.log(`Running CardápioFC Editorial Blog E2E Test Suite (${tests.length} test groups)...`);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn({ pubDir });
      passed++;
      console.log(`✅ PASS: ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`❌ FAIL: ${t.name}`);
      console.error(err?.stack || err?.message || err);
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed (total ${tests.length}).`);
  if (failed > 0) {
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
