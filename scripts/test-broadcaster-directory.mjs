#!/usr/bin/env node
/**
 * scripts/test-broadcaster-directory.mjs
 *
 * Automated verification suite for the CardápioFC Broadcaster Directory feature.
 * Verifies:
 *   1. Current public/ build assertions (compatible with both sample and production builds)
 *   2. Isolated synthetic fixture build assertions (denylist exclusion, CTA/whitespace normalization,
 *      dynamic match-page linking, and combined broadcaster-budget overflow rejection)
 *
 * Usage:
 *   node scripts/test-broadcaster-directory.mjs
 *   node scripts/test-broadcaster-directory.mjs --skip-fixture
 *   node scripts/test-broadcaster-directory.mjs --pub-dir=path/to/dir
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  decodeEntities,
  normSpace,
  htmlToText,
  parseAttrs,
  extractElementsByClass,
  extractVisibleFaqs,
} from "./check-seo-social.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PUB_DIR = path.join(ROOT_DIR, "public");
const CFC_DATA_DIR = path.join(ROOT_DIR, "assets", "cfc-data");
const SAMPLE_DATA_DIR = path.join(CFC_DATA_DIR, "sample");
const FIXTURE_NAME = "__broadcaster_fixture__";
const FIXTURE_DIR = path.join(CFC_DATA_DIR, FIXTURE_NAME);
const FIXTURE_SAMPLE_REL = `cfc-data/${FIXTURE_NAME}/`;

export const SUITE_EDITIONS = [
  { code: "en", prefix: "", locale: "en", country: "", zoneLabel: "UTC", isGlobal: true },
  { code: "en-gb", prefix: "en-gb/", locale: "en-GB", country: "GB", zoneLabel: "UK time", isGlobal: false },
  { code: "en-ie", prefix: "en-ie/", locale: "en-IE", country: "IE", zoneLabel: "Irish time", isGlobal: false },
  { code: "pt-br", prefix: "pt-br/", locale: "pt-BR", country: "BR", zoneLabel: "horário de Brasília", isGlobal: false },
  { code: "pt-pt", prefix: "pt-pt/", locale: "pt-PT", country: "PT", zoneLabel: "hora de Portugal", isGlobal: false },
  { code: "es-ar", prefix: "es-ar/", locale: "es-AR", country: "AR", zoneLabel: "hora de Argentina", isGlobal: false },
  { code: "en-us", prefix: "en-us/", locale: "en-US", country: "US", zoneLabel: "US Eastern", isGlobal: false },
  { code: "zh-cn", prefix: "zh-cn/", locale: "zh-CN", country: "CN", zoneLabel: "北京时间", isGlobal: false },
  { code: "ja", prefix: "ja/", locale: "ja", country: "JP", zoneLabel: "日本時間", isGlobal: false },
];

const POPULATED_REGIONAL_EDITIONS = new Set(["pt-br", "en-gb", "en-ie", "pt-pt", "es-ar"]);
const PERSISTENT_FLAGSHIPS = [
  { ed: "pt-br", slug: "ge-tv" },
  { ed: "pt-br", slug: "tv-globo" },
  { ed: "pt-br", slug: "sportv" },
  { ed: "en-gb", slug: "sky-sports" },
];

const DENYLIST_SLUGS = new Set([
  "canal-a-confirmar",
  "nao-confirmado",
  "to-be-confirmed",
  "tba",
  "unknown",
]);
const DENYLIST_NAME_RE = /^(?:canal a confirmar|não confirmado|nao confirmado|to be confirmed|tba|tbd)$/i;
const CTA_SUFFIX_RE = /\((?:Watch it live|Ver ao vivo|Ver en vivo|Ver en directo|Míralo en vivo|Miralo en vivo|Live)\)\s*$/i;
const TEMPLATE_LEAK_RE = /(?:<no value>|&lt;no value&gt;|<nil>|&lt;nil&gt;)/i;

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function hasClass(classAttr, target) {
  return typeof classAttr === "string" && classAttr.split(/\s+/).includes(target);
}

function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/style>/gi, "");
}

function extractTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ raw: m[0], attrs: parseAttrs(m[1] || "") });
  }
  return out;
}

function extractElements(html, predicate) {
  const clean = stripNoise(html);
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const results = [];
  let active = null;
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || "";
    const selfClose = !isClose && (VOID_TAGS.has(tag) || /(?:^|\s)\/\s*$/.test(attrStr));

    if (!active) {
      if (!isClose) {
        const attrs = parseAttrs(attrStr);
        if (predicate(tag, attrs)) {
          if (selfClose) {
            results.push({ tag, attrs, innerHtml: "", outerHtml: m[0] });
          } else {
            active = {
              tag,
              attrs,
              stack: [tag],
              outerStart: m.index,
              innerStart: m.index + m[0].length,
            };
          }
        }
      }
      continue;
    }

    if (isClose) {
      const idx = active.stack.lastIndexOf(tag);
      if (idx !== -1) active.stack.length = idx;
      if (active.stack.length === 0) {
        results.push({
          tag: active.tag,
          attrs: active.attrs,
          innerHtml: clean.slice(active.innerStart, m.index),
          outerHtml: clean.slice(active.outerStart, m.index + m[0].length),
        });
        active = null;
      }
    } else if (!selfClose) {
      active.stack.push(tag);
    }
  }
  return results;
}

function extractElementsWithClass(html, className) {
  return extractElements(html, (_tag, attrs) => hasClass(attrs.class, className));
}

function extractAnchors(html) {
  return extractElements(html, (tag) => tag === "a");
}

function extractJsonLdGraph(html) {
  const re = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    if ((attrs.type || "").toLowerCase() === "application/ld+json") {
      blocks.push(m[2]);
    }
  }
  if (blocks.length !== 1) {
    return { error: `expected 1 JSON-LD script block, found ${blocks.length}`, graph: null };
  }
  try {
    const parsed = JSON.parse(blocks[0]);
    const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [];
    return { error: null, graph };
  } catch (err) {
    return { error: `invalid JSON-LD: ${err.message}`, graph: null };
  }
}

function verifyFaqParity(rel, html, { expectedCount = null, requireWhenPresent = true }, fail) {
  const { items: visibleFaqs, errors: parseErrors } = extractVisibleFaqs(html);
  for (const err of parseErrors) fail(`${rel}: ${err}`);

  if (expectedCount !== null && visibleFaqs.length !== expectedCount) {
    fail(`${rel}: expected ${expectedCount} visible .cfc-faq__item(s), found ${visibleFaqs.length}`);
  }

  const { error: ldErr, graph } = extractJsonLdGraph(html);
  if (ldErr) {
    fail(`${rel}: ${ldErr}`);
    return visibleFaqs;
  }

  const faqNodes = graph.filter((n) => n["@type"] === "FAQPage");
  if (faqNodes.length > 1) {
    fail(`${rel}: expected at most 1 FAQPage node, found ${faqNodes.length}`);
  }
  const faqNode = faqNodes[0];

  if (visibleFaqs.length > 0 && requireWhenPresent && !faqNode) {
    fail(`${rel}: renders ${visibleFaqs.length} visible .cfc-faq__item(s) but missing FAQPage JSON-LD`);
    return visibleFaqs;
  }
  if (visibleFaqs.length === 0 && faqNode) {
    fail(`${rel}: emits FAQPage JSON-LD with 0 visible .cfc-faq__item(s)`);
    return visibleFaqs;
  }
  if (!faqNode) return visibleFaqs;

  const mainEntity = Array.isArray(faqNode.mainEntity) ? faqNode.mainEntity : null;
  if (!mainEntity) {
    fail(`${rel}: FAQPage.mainEntity is not an array`);
    return visibleFaqs;
  }
  if (mainEntity.length !== visibleFaqs.length) {
    fail(`${rel}: FAQPage.mainEntity length (${mainEntity.length}) !== visible .cfc-faq__item count (${visibleFaqs.length})`);
    return visibleFaqs;
  }

  for (let i = 0; i < visibleFaqs.length; i++) {
    const jsonQ = normSpace(String(mainEntity[i]?.name ?? ""));
    const jsonA = normSpace(String(mainEntity[i]?.acceptedAnswer?.text ?? ""));
    if (visibleFaqs[i].q !== jsonQ) {
      fail(`${rel}: FAQ #${i + 1} question mismatch (visible "${visibleFaqs[i].q}" !== JSON-LD "${jsonQ}")`);
    }
    if (visibleFaqs[i].a !== jsonA) {
      fail(`${rel}: FAQ #${i + 1} answer mismatch (visible "${visibleFaqs[i].a}" !== JSON-LD "${jsonA}")`);
    }
  }
  return visibleFaqs;
}

function getTitle(html) {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normSpace(decodeEntities(m[1])) : "";
}

function getMetaDescription(html) {
  const metas = extractTags(html, "meta");
  const desc = metas.find((m) => (m.attrs.name || "").toLowerCase() === "description");
  return desc ? normSpace(desc.attrs.content || "") : "";
}

function checkNoTemplateLeaks(rel, html, fail) {
  if (TEMPLATE_LEAK_RE.test(html)) {
    fail(`${rel}: contains unresolved template placeholder (<no value> or <nil>)`);
  }
}

function isMatchDetailHtmlRel(rel) {
  const norm = rel.split(path.sep).join("/");
  return /^(?:[^/]+\/)?match\/[^/]+\/index\.html$/.test(norm);
}

function discoverChildSlugs(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const slugs = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const idx = path.join(dirPath, entry.name, "index.html");
    if (fs.existsSync(idx)) slugs.push(entry.name);
  }
  return slugs.sort();
}

function runHugoBuild({ sampleRelDir, destination, envVars = {} }) {
  const env = {
    ...process.env,
    HUGO_CFC_DATA_SOURCE: "sample",
    HUGO_CFC_DATA_SAMPLE: sampleRelDir,
    ...envVars,
  };
  const args = [
    "--minify",
    "--cleanDestinationDir",
    "--ignoreCache",
    "--destination",
    destination,
  ];
  const res = spawnSync("hugo", args, {
    cwd: ROOT_DIR,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    success: res.status === 0 && !res.error,
    code: res.status ?? 1,
    output: `${res.stdout || ""}\n${res.stderr || ""}${res.error ? `\n${res.error.message}` : ""}`,
  };
}

export function runCurrentBuildChecks({ pubDir = DEFAULT_PUB_DIR, rootDir = ROOT_DIR } = {}) {
  const failures = [];
  let checksPassed = 0;
  const pass = () => { checksPassed++; };
  const fail = (msg) => { failures.push(msg); };
  const expect = (cond, msg) => (cond ? pass() : fail(msg));

  if (!fs.existsSync(pubDir)) {
    fail(`Build output directory not found: ${pubDir}. Run pnpm build first.`);
    return { failures, checksPassed, stats: {} };
  }

  const read = (p) => fs.readFileSync(p, "utf8");
  const allPublicFiles = walkFiles(pubDir);
  const allHtmlFiles = allPublicFiles.filter((f) => f.endsWith(".html"));
  const allChannelsPageFiles = [];

  // 1. /channels/ hubs across all 9 editions + nav links + distinct title/description
  const hubTitles = new Map();
  const hubDescs = new Map();

  for (const ed of SUITE_EDITIONS) {
    const hubPath = path.join(pubDir, ed.prefix, "channels", "index.html");
    const rel = path.relative(pubDir, hubPath).split(path.sep).join("/");
    if (!fs.existsSync(hubPath)) {
      fail(`Missing /channels/ hub for edition "${ed.code}" (${rel})`);
      continue;
    }
    pass();
    allChannelsPageFiles.push(hubPath);
    const html = read(hubPath);
    checkNoTemplateLeaks(rel, html, fail);

    const title = getTitle(html);
    const desc = getMetaDescription(html);
    expect(title.length > 0, `${rel}: empty <title>`);
    expect(desc.length > 0, `${rel}: empty <meta name="description">`);

    if (title) {
      if (hubTitles.has(title)) fail(`${rel}: duplicate <title> "${title}" also used by ${hubTitles.get(title)}`);
      else hubTitles.set(title, ed.code);
    }
    if (desc) {
      if (hubDescs.has(desc)) fail(`${rel}: duplicate <meta name="description"> also used by ${hubDescs.get(desc)}`);
      else hubDescs.set(desc, ed.code);
    }

    const breadcrumbs = extractElementsWithClass(html, "cfc-breadcrumb");
    expect(breadcrumbs.length === 1, `${rel}: missing .cfc-breadcrumb`);

    const expectedChannelsHref = `/${ed.prefix}channels/`;
    const headers = extractElements(html, (tag) => tag === "header");
    const footers = extractElements(html, (tag, attrs) => tag === "footer" && !hasClass(attrs.class, "cfc-freshness"));
    const hasHeaderNav = headers.some((h) => extractAnchors(h.outerHtml).some((a) => a.attrs.href === expectedChannelsHref));
    const hasFooterNav = footers.some((f) => extractAnchors(f.outerHtml).some((a) => a.attrs.href === expectedChannelsHref));
    expect(hasHeaderNav, `${rel}: primary header nav missing link to ${expectedChannelsHref}`);
    expect(hasFooterNav, `${rel}: footer nav missing link to ${expectedChannelsHref}`);
  }

  expect(hubTitles.size === SUITE_EDITIONS.length, `Expected ${SUITE_EDITIONS.length} distinct hub <title> values, got ${hubTitles.size}`);
  expect(hubDescs.size === SUITE_EDITIONS.length, `Expected ${SUITE_EDITIONS.length} distinct hub <meta name="description"> values, got ${hubDescs.size}`);

  // 2. Zero child pages under Global public/channels/
  const globalChannelsDir = path.join(pubDir, "channels");
  if (fs.existsSync(globalChannelsDir)) {
    const globalEntries = walkFiles(globalChannelsDir).map((f) => path.relative(globalChannelsDir, f).split(path.sep).join("/"));
    const unexpected = globalEntries.filter((e) => e !== "index.html");
    expect(unexpected.length === 0, `Global public/channels/ must contain 0 child pages, found: ${unexpected.join(", ")}`);
  }

  // 3. Regional detail pages, zero duplicate normalized names, empty editions, edition switcher & timezone labels
  const populatedEditions = [];
  const emptyEditions = [];
  const detailPagesChecked = [];
  const detailFaqCounts = new Map();

  for (const ed of SUITE_EDITIONS) {
    if (ed.isGlobal) continue;
    const edChannelsDir = path.join(pubDir, ed.prefix, "channels");
    const slugs = discoverChildSlugs(edChannelsDir);
    const hubPath = path.join(edChannelsDir, "index.html");
    const hubRel = path.relative(pubDir, hubPath).split(path.sep).join("/");
    const hubHtml = fs.existsSync(hubPath) ? read(hubPath) : "";

    if (POPULATED_REGIONAL_EDITIONS.has(ed.code)) {
      expect(slugs.length > 0, `Populated edition "${ed.code}" must generate >= 1 channel detail page`);
    }

    if (slugs.length === 0) {
      emptyEditions.push(ed);
      if (hubHtml) {
        const cards = extractElementsWithClass(hubHtml, "cfc-broadcaster-card");
        expect(cards.length === 0, `${hubRel}: empty edition must render 0 .cfc-broadcaster-card items, found ${cards.length}`);
        const emptyMsgs = extractElementsWithClass(hubHtml, "cfc-empty-state__message");
        expect(emptyMsgs.length === 1, `${hubRel}: empty edition missing .cfc-empty-state__message`);
        if (emptyMsgs.length === 1) {
          const msgText = htmlToText(emptyMsgs[0].innerHtml);
          expect(msgText.length >= 10, `${hubRel}: empty-state message too short/empty ("${msgText}")`);
        }
        const emptyActions = extractElementsWithClass(hubHtml, "cfc-empty-state__action");
        expect(emptyActions.length === 1 && Boolean(emptyActions[0].attrs.href), `${hubRel}: empty-state missing guidance/app action link`);
      }
      continue;
    }

    populatedEditions.push({ ed, slugs });

    // Check hub cards match generated detail slugs and have 0 duplicate normalized names
    if (hubHtml) {
      const hubCards = extractElementsWithClass(hubHtml, "cfc-broadcaster-card");
      expect(
        hubCards.length === slugs.length,
        `${hubRel}: hub card count (${hubCards.length}) !== generated detail page count (${slugs.length})`
      );
      const hubNames = new Map();
      for (const card of hubCards) {
        const cardSlug = card.attrs["data-cfc-channel"] || "";
        expect(slugs.includes(cardSlug), `${hubRel}: hub card references missing detail slug "${cardSlug}"`);
        expect(card.attrs.href === `/${ed.prefix}channels/${cardSlug}/`, `${hubRel}: card href mismatch for "${cardSlug}": ${card.attrs.href}`);
        const titleEls = extractElementsWithClass(card.innerHtml, "cfc-broadcaster-card__title");
        const rawDecodedTitle = titleEls.length === 1 ? decodeEntities(titleEls[0].innerHtml) : "";
        expect(!/^\s|\s$/.test(rawDecodedTitle), `${hubRel}: hub card "${cardSlug}" has unstripped leading/trailing whitespace: "${rawDecodedTitle}"`);
        const rawTitle = titleEls.length === 1 ? htmlToText(titleEls[0].innerHtml) : "";
        expect(rawTitle.length > 0, `${hubRel}: hub card "${cardSlug}" missing title`);
        expect(!CTA_SUFFIX_RE.test(rawTitle), `${hubRel}: hub card "${cardSlug}" kept CTA suffix in "${rawTitle}"`);
        const norm = rawTitle.toLowerCase();
        if (hubNames.has(norm)) {
          fail(`${hubRel}: duplicate normalized hub display name "${rawTitle}" (${hubNames.get(norm)} vs ${cardSlug})`);
        } else {
          hubNames.set(norm, cardSlug);
        }
      }
    }

    // Check every detail page in this country
    const seenNames = new Map();
    for (const slug of slugs) {
      const detailPath = path.join(edChannelsDir, slug, "index.html");
      const rel = path.relative(pubDir, detailPath).split(path.sep).join("/");
      allChannelsPageFiles.push(detailPath);
      detailPagesChecked.push({ ed, slug, detailPath, rel });

      expect(!DENYLIST_SLUGS.has(slug), `${rel}: denylisted placeholder slug generated`);
      const html = read(detailPath);
      checkNoTemplateLeaks(rel, html, fail);

      // Display name normalization & uniqueness per country
      const h1s = extractElementsWithClass(html, "cfc-entity-header__title");
      expect(h1s.length === 1, `${rel}: expected 1 .cfc-entity-header__title`);
      const rawH1 = h1s.length === 1 ? decodeEntities(h1s[0].innerHtml) : "";
      expect(!/^\s|\s$/.test(rawH1), `${rel}: broadcaster <h1> has unstripped leading/trailing whitespace: "${rawH1}"`);
      const name = h1s.length === 1 ? htmlToText(h1s[0].innerHtml) : "";
      expect(name.length > 0, `${rel}: empty broadcaster <h1>`);
      expect(!DENYLIST_NAME_RE.test(name), `${rel}: denylisted placeholder name "${name}" generated`);
      expect(!CTA_SUFFIX_RE.test(name), `${rel}: unstripped CTA suffix in display name "${name}"`);
      const normName = name.toLowerCase();
      if (seenNames.has(normName)) {
        fail(`${ed.code}: duplicate normalized broadcaster name "${name}" on ${seenNames.get(normName)} and ${slug}`);
      } else {
        seenNames.set(normName, slug);
      }

      // .cfc-faq--numbered must NOT leak onto detail pages
      expect(!html.includes("cfc-faq--numbered"), `${rel}: .cfc-faq--numbered must only appear on /faq/`);

      // JSON-LD FAQ parity if visible FAQs exist
      const detailFaqs = verifyFaqParity(rel, html, { expectedCount: null, requireWhenPresent: true }, fail);
      detailFaqCounts.set(rel, detailFaqs.length);

      // Edition switcher: current points to /{ed}/channels/{slug}/; every other points to {prefix}channels/
      const switchers = extractElementsWithClass(html, "cfc-switcher");
      expect(switchers.length === 1, `${rel}: expected 1 .cfc-switcher`);
      if (switchers.length === 1) {
        const swLinks = extractElementsWithClass(switchers[0].innerHtml, "cfc-switcher__link");
        expect(swLinks.length === SUITE_EDITIONS.length, `${rel}: switcher expected ${SUITE_EDITIONS.length} links, found ${swLinks.length}`);
        for (const targetEd of SUITE_EDITIONS) {
          const link = swLinks.find((a) => a.attrs["data-cfc-target-edition"] === targetEd.code);
          if (!link) {
            fail(`${rel}: edition switcher missing target "${targetEd.code}"`);
            continue;
          }
          const expectedHref = targetEd.code === ed.code
            ? `/${ed.prefix}channels/${slug}/`
            : `/${targetEd.prefix}channels/`;
          expect(
            link.attrs.href === expectedHref,
            `${rel}: switcher link for "${targetEd.code}" expected "${expectedHref}", got "${link.attrs.href}"`
          );
        }
      }

      // Edition-local timezone labels on .cfc-freshness and any rendered schedule
      const freshness = extractElementsWithClass(html, "cfc-freshness");
      expect(freshness.length === 1, `${rel}: missing .cfc-freshness footer`);
      if (freshness.length === 1) {
        const freshText = htmlToText(freshness[0].innerHtml);
        expect(
          freshText.includes(ed.zoneLabel),
          `${rel}: .cfc-freshness missing edition timezone "${ed.zoneLabel}" (got "${freshText}")`
        );
      }

      const dateGroups = extractElementsWithClass(html, "cfc-date-group");
      if (dateGroups.length > 0) {
        const zoneBadges = extractElementsWithClass(html, "cfc-date-group__zone");
        expect(zoneBadges.length >= dateGroups.length, `${rel}: schedule date group missing .cfc-date-group__zone`);
        for (const zb of zoneBadges) {
          const zText = htmlToText(zb.innerHtml);
          expect(zText.includes(ed.zoneLabel), `${rel}: .cfc-date-group__zone missing "${ed.zoneLabel}" (got "${zText}")`);
        }
        const kickoffZones = extractElementsWithClass(html, "cfc-kickoff-time__zone");
        for (const kz of kickoffZones) {
          const kzText = htmlToText(kz.innerHtml);
          expect(kzText.includes(ed.zoneLabel), `${rel}: .cfc-kickoff-time__zone missing "${ed.zoneLabel}" (got "${kzText}")`);
        }
        const matchCards = extractElementsWithClass(html, "cfc-match-card");
        expect(matchCards.length > 0, `${rel}: .cfc-date-group present without .cfc-match-card links`);
        for (const mc of matchCards) {
          const href = mc.attrs.href || "";
          expect(href.startsWith(`/${ed.prefix}match/`), `${rel}: schedule match card href "${href}" wrong edition`);
          const targetMatchFile = path.join(pubDir, href.replace(/^\//, ""), "index.html");
          expect(fs.existsSync(targetMatchFile), `${rel}: schedule match card points to missing file ${href}`);
        }
      }
    }
  }

  // Global hub check: links to regional hubs and detail pages with 0 duplicate normalized names per country
  const globalHubPath = path.join(pubDir, "channels", "index.html");
  if (fs.existsSync(globalHubPath)) {
    const globalHubHtml = read(globalHubPath);
    const groups = extractElementsWithClass(globalHubHtml, "cfc-broadcaster-group");
    expect(groups.length === populatedEditions.length, `Global /channels/ expected ${populatedEditions.length} country groups, got ${groups.length}`);
    for (const grp of groups) {
      const hubLinks = extractElementsWithClass(grp.innerHtml, "cfc-section-head__action");
      expect(hubLinks.length === 1 && /^\/[a-z-]+\/channels\/$/.test(hubLinks[0].attrs.href || ""), `Global /channels/ group missing regional hub link`);
      const cards = extractElementsWithClass(grp.innerHtml, "cfc-broadcaster-card");
      const seen = new Set();
      for (const card of cards) {
        const href = card.attrs.href || "";
        expect(/^\/[a-z-]+\/channels\/[a-z0-9-]+\/$/.test(href), `Global /channels/ card must link to regional detail URL, got "${href}"`);
        expect(fs.existsSync(path.join(pubDir, href.replace(/^\//, ""), "index.html")), `Global /channels/ card links to missing page ${href}`);
        const t = extractElementsWithClass(card.innerHtml, "cfc-broadcaster-card__title");
        const name = t.length === 1 ? htmlToText(t[0].innerHtml) : "";
        expect(name.length > 0 && !CTA_SUFFIX_RE.test(name), `Global /channels/ card invalid name "${name}"`);
        const norm = name.toLowerCase();
        expect(!seen.has(norm), `Global /channels/ duplicate name "${name}" inside country group`);
        seen.add(norm);
      }
    }
  }

  // 4. Persistent flagship broadcasters
  for (const { ed, slug } of PERSISTENT_FLAGSHIPS) {
    const p = path.join(pubDir, ed, "channels", slug, "index.html");
    const rel = path.relative(pubDir, p).split(path.sep).join("/");
    if (!fs.existsSync(p)) {
      fail(`Persistent flagship broadcaster missing: ${rel}`);
      continue;
    }
    pass();
    const html = read(p);

    const editorial = extractElementsWithClass(html, "cfc-broadcaster-editorial");
    expect(editorial.length === 1, `${rel}: flagship missing editorial overview (.cfc-broadcaster-editorial)`);
    if (editorial.length === 1) {
      const pEls = extractElements(editorial[0].innerHtml, (tag) => tag === "p");
      const text = pEls.length > 0 ? htmlToText(pEls[0].innerHtml) : "";
      expect(text.length >= 20, `${rel}: flagship editorial overview too short/empty ("${text}")`);
    }

    const emptyMatchDays = extractElementsWithClass(html, "cfc-match-days--empty");
    const dateGroups = extractElementsWithClass(html, "cfc-date-group");
    const hasValidSchedule = dateGroups.length > 0;
    const hasValidEmptySchedule =
      emptyMatchDays.length === 1 &&
      extractElementsWithClass(emptyMatchDays[0].innerHtml, "cfc-empty-state__message")
        .some((el) => htmlToText(el.innerHtml).length >= 10);
    expect(
      hasValidSchedule || hasValidEmptySchedule,
      `${rel}: flagship must render either valid upcoming schedule or clean empty-schedule message`
    );

    const visibleFaqCount = detailFaqCounts.has(rel)
      ? detailFaqCounts.get(rel)
      : verifyFaqParity(rel, html, { expectedCount: null, requireWhenPresent: true }, fail).length;
    expect(visibleFaqCount > 0, `${rel}: flagship expected >= 1 visible broadcaster FAQ item`);

    const { error: ldErr, graph } = extractJsonLdGraph(html);
    if (!ldErr && graph) {
      expect(graph.some((n) => n["@type"] === "BroadcastService"), `${rel}: missing BroadcastService JSON-LD`);
      expect(graph.some((n) => n["@type"] === "BreadcrumbList"), `${rel}: missing BreadcrumbList JSON-LD`);
    }
  }

  // 5. /faq/ across all 9 editions: "Included Broadcasters & Services" + 12-item 1:1 FAQPage parity
  const faqFiles = [];
  for (const ed of SUITE_EDITIONS) {
    const faqPath = path.join(pubDir, ed.prefix, "faq", "index.html");
    const rel = path.relative(pubDir, faqPath).split(path.sep).join("/");
    if (!fs.existsSync(faqPath)) {
      fail(`Missing /faq/ page: ${rel}`);
      continue;
    }
    pass();
    faqFiles.push(faqPath);
    const html = read(faqPath);
    checkNoTemplateLeaks(rel, html, fail);

    expect(html.includes("cfc-faq--numbered"), `${rel}: missing .cfc-faq--numbered container`);
    const faqItems = verifyFaqParity(rel, html, { expectedCount: 12, requireWhenPresent: true }, fail);
    if (ed.code === "pt-br") {
      const q12Text = faqItems.map((it) => `${it.q} ${it.a}`).join("\n");
      for (const flagshipName of ["TV Globo", "GE TV", "SporTV", "Premiere", "CazéTV"]) {
        expect(q12Text.includes(flagshipName), `${rel}: Brazilian FAQ Q12 missing flagship "${flagshipName}"`);
      }
    }

    const broadcastersSection = extractElementsWithClass(html, "cfc-faq-broadcasters");
    expect(broadcastersSection.length === 1, `${rel}: missing .cfc-faq-broadcasters section`);
    if (broadcastersSection.length === 1) {
      const secHtml = broadcastersSection[0].innerHtml;
      const expectedHubHref = `/${ed.prefix}channels/`;
      const actionLinks = extractElementsWithClass(secHtml, "cfc-section-head__action");
      expect(
        actionLinks.some((a) => a.attrs.href === expectedHubHref),
        `${rel}: .cfc-faq-broadcasters missing /channels/ link "${expectedHubHref}"`
      );
      const chips = extractElementsWithClass(secHtml, "cfc-broadcaster-chip");
      if (ed.isGlobal || !emptyEditions.some((e) => e.code === ed.code)) {
        expect(chips.length > 0, `${rel}: .cfc-faq-broadcasters expected broadcaster chips, found 0`);
        for (const chip of chips) {
          const href = chip.attrs.href || "";
          expect(/^\/[a-z-]+\/channels\/[a-z0-9-]+\/$/.test(href), `${rel}: chip invalid href "${href}"`);
          expect(fs.existsSync(path.join(pubDir, href.replace(/^\//, ""), "index.html")), `${rel}: chip points to missing page ${href}`);
        }
      } else {
        expect(chips.length === 0, `${rel}: empty edition FAQ must render 0 chips`);
        const emptyMsgs = extractElementsWithClass(secHtml, "cfc-empty-state__message");
        expect(
          emptyMsgs.length === 1 && htmlToText(emptyMsgs[0].innerHtml).length >= 10,
          `${rel}: empty edition FAQ broadcasters section missing empty-state message`
        );
      }
    }
  }

  // 6. Dynamic match-page channel linking across public/match/*/index.html & public/{ed}/match/*/index.html
  const linkedMatchesByEdition = Object.fromEntries(SUITE_EDITIONS.map((e) => [e.code, 0]));
  let totalMatchPagesChecked = 0;

  for (const ed of SUITE_EDITIONS) {
    const matchSectionDir = path.join(pubDir, ed.prefix, "match");
    const matchSlugs = discoverChildSlugs(matchSectionDir);
    expect(matchSlugs.length > 0, `Edition "${ed.code}" must have >= 1 match page under ${ed.prefix}match/`);

    for (const mSlug of matchSlugs) {
      totalMatchPagesChecked++;
      const mPath = path.join(matchSectionDir, mSlug, "index.html");
      const rel = path.relative(pubDir, mPath).split(path.sep).join("/");
      const html = read(mPath);

      const broadcastSections = extractElementsWithClass(html, "cfc-broadcast");
      expect(broadcastSections.length === 1, `${rel}: expected 1 .cfc-broadcast panel`);
      if (broadcastSections.length !== 1) continue;

      const cards = extractElementsWithClass(broadcastSections[0].innerHtml, "cfc-channel-card");
      for (const card of cards) {
        const actions = extractElementsWithClass(card.innerHtml, "cfc-channel-card__action");
        expect(
          actions.length === 1 && Boolean(actions[0].attrs.href),
          `${rel}: .cfc-channel-card missing intact .cfc-channel-card__action CTA`
        );

        const chLinks = extractElementsWithClass(card.innerHtml, "cfc-channel-card__link");
        if (chLinks.length > 0) {
          expect(chLinks.length === 1, `${rel}: expected at most 1 .cfc-channel-card__link per card`);
          const link = chLinks[0];
          const href = link.attrs.href || "";
          const matchUrl = href.match(/^\/([a-z-]+)\/channels\/([a-z0-9-]+)\/$/);
          expect(Boolean(matchUrl), `${rel}: .cfc-channel-card__link invalid href "${href}"`);
          if (matchUrl) {
            const [, linkEd, linkSlug] = matchUrl;
            if (!ed.isGlobal) {
              expect(linkEd === ed.code, `${rel}: regional match channel link "${href}" escaped edition "${ed.code}"`);
            }
            expect(!DENYLIST_SLUGS.has(linkSlug), `${rel}: denylisted channel slug "${linkSlug}" must not be linked`);
            const linkText = htmlToText(link.innerHtml);
            expect(!DENYLIST_NAME_RE.test(linkText), `${rel}: denylisted channel name "${linkText}" must not be linked`);
            expect(
              fs.existsSync(path.join(pubDir, href.replace(/^\//, ""), "index.html")),
              `${rel}: .cfc-channel-card__link points to missing detail page "${href}"`
            );
          }
          linkedMatchesByEdition[ed.code]++;
        } else {
          const plainNames = extractElements(
            card.innerHtml,
            (tag, attrs) => tag === "span" && hasClass(attrs.class, "cfc-channel-card__name")
          );
          expect(plainNames.length === 1, `${rel}: unlinked .cfc-channel-card must render plain <span class="cfc-channel-card__name">`);
        }
      }
    }
  }

  expect(linkedMatchesByEdition.en > 0, `Global match pages must contain >= 1 confirmed linked broadcaster`);
  for (const { ed } of populatedEditions) {
    if (POPULATED_REGIONAL_EDITIONS.has(ed.code)) {
      expect(
        linkedMatchesByEdition[ed.code] > 0,
        `Populated regional edition "${ed.code}" match pages must contain >= 1 confirmed linked broadcaster`
      );
    }
  }

  // 7. Explicit numeric width & height on ALL broadcaster logo <img> tags across hubs, detail pages, and /faq/
  const logoInspectionFiles = [...new Set([...allChannelsPageFiles, ...faqFiles])];
  let logoImgCount = 0;
  for (const f of logoInspectionFiles) {
    const rel = path.relative(pubDir, f).split(path.sep).join("/");
    const html = read(f);
    const imgs = extractTags(html, "img");
    for (const img of imgs) {
      const isBroadcasterLogo = hasClass(img.attrs.class, "cfc-broadcaster-logo");
      if (isBroadcasterLogo) logoImgCount++;
      const w = img.attrs.width || "";
      const h = img.attrs.height || "";
      expect(
        /^[1-9]\d*$/.test(w) && /^[1-9]\d*$/.test(h),
        `${rel}: <img> lacks explicit numeric width/height (width="${w}", height="${h}", class="${img.attrs.class || ""}")`
      );
    }
  }
  expect(logoImgCount > 0, `Expected > 0 .cfc-broadcaster-logo <img> elements across hubs, detail pages, and /faq/`);

  // 8. 0 occurrences of cfc-channel-badge or cfc-match-card__channels outside public/**/match/**
  let nonMatchChecked = 0;
  for (const f of allHtmlFiles) {
    const rel = path.relative(pubDir, f).split(path.sep).join("/");
    if (isMatchDetailHtmlRel(rel)) continue;
    nonMatchChecked++;
    const html = read(f);
    if (html.includes("cfc-channel-badge") || html.includes("cfc-match-card__channels")) {
      fail(`${rel}: forbidden cfc-channel-badge / cfc-match-card__channels outside match detail pages`);
    }
  }
  expect(nonMatchChecked > 0, `Expected non-match HTML files in ${pubDir}`);

  // 9. cloudflare/redirect-rules.json exact /channels & /channels/ rules
  const redirectPath = path.join(rootDir, "cloudflare", "redirect-rules.json");
  if (!fs.existsSync(redirectPath)) {
    fail(`Missing cloudflare/redirect-rules.json`);
  } else {
    try {
      const cfg = JSON.parse(read(redirectPath));
      const rules = Array.isArray(cfg?.rules) ? cfg.rules : [];
      expect(rules.length === 8, `cloudflare/redirect-rules.json expected 8 country rules, found ${rules.length}`);
      for (const rule of rules) {
        const expr = String(rule?.expression || "");
        const desc = rule?.description || "(unnamed rule)";
        expect(expr.includes('http.request.uri.path eq "/channels"'), `${desc}: missing exact eq "/channels"`);
        expect(expr.includes('http.request.uri.path eq "/channels/"'), `${desc}: missing exact eq "/channels/"`);
        expect(!/starts_with\s*\([^)]*["']\/channels/i.test(expr), `${desc}: must NEVER use starts_with on /channels`);
      }
    } catch (err) {
      fail(`cloudflare/redirect-rules.json invalid JSON: ${err.message}`);
    }
  }

  // 10. Total public/ file count < 20,000 & zero per-broadcaster PNGs under static/og/
  const totalPublicFiles = allPublicFiles.length;
  expect(totalPublicFiles < 20000, `public/ total file count ${totalPublicFiles} must be < 20,000`);

  const ogDir = path.join(rootDir, "static", "og");
  if (!fs.existsSync(ogDir)) {
    fail(`Missing static/og directory`);
  } else {
    const ogFiles = walkFiles(ogDir).map((f) => path.relative(ogDir, f).split(path.sep).join("/"));
    const unexpectedChannelOg = ogFiles.filter((rel) => /(?:^|\/)(?:channels?|broadcasters?)(?:\/|\b)/i.test(rel));
    expect(
      unexpectedChannelOg.length === 0,
      `static/og/ must contain 0 per-broadcaster PNGs, found: ${unexpectedChannelOg.join(", ")}`
    );
    const expectedEditionPngs = [
      "editions/og-global.png",
      "editions/og-en-gb.png",
      "editions/og-en-ie.png",
      "editions/og-pt-br.png",
      "editions/og-pt-pt.png",
      "editions/og-es-ar.png",
      "editions/og-en-us.png",
      "editions/og-zh-cn.png",
      "editions/og-ja.png",
    ];
    for (const png of expectedEditionPngs) {
      expect(fs.existsSync(path.join(ogDir, png)), `Missing expected edition OG image static/og/${png}`);
    }
  }

  return {
    failures,
    checksPassed,
    stats: {
      totalPublicFiles,
      populatedEditions: populatedEditions.map((p) => p.ed.code),
      emptyEditions: emptyEditions.map((e) => e.code),
      detailPagesChecked: detailPagesChecked.length,
      matchPagesChecked: totalMatchPagesChecked,
      logoImgCount,
      nonMatchChecked,
    },
  };
}

export function runSyntheticFixtureTests() {
  const failures = [];
  let checksPassed = 0;
  const pass = () => { checksPassed++; };
  const fail = (msg) => { failures.push(msg); };
  const expect = (cond, msg) => (cond ? pass() : fail(msg));

  const tempDest = path.join(os.tmpdir(), `cfc-broadcaster-fixture-${process.pid}-${Date.now()}`);
  const cleanup = () => {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    fs.rmSync(tempDest, { recursive: true, force: true });
  };

  const onSignal = () => {
    cleanup();
    process.exit(1);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  // Clean up any stale temp directory before starting
  cleanup();

  try {
    fs.cpSync(SAMPLE_DATA_DIR, FIXTURE_DIR, { recursive: true });

    const indexPath = path.join(FIXTURE_DIR, "index.json");
    const matchesPath = path.join(FIXTURE_DIR, "matches.json");
    const brPath = path.join(FIXTURE_DIR, "channels", "BR.json");

    const indexJson = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const matchesJson = JSON.parse(fs.readFileSync(matchesPath, "utf8"));
    const brJson = JSON.parse(fs.readFileSync(brPath, "utf8"));

    // 1. Add denylisted placeholder channels
    brJson.channels["canal-a-confirmar"] = {
      id: "canal-a-confirmar",
      name: "Canal a confirmar",
      type: "tv",
    };
    brJson.channels["nao-confirmado"] = {
      id: "nao-confirmado",
      name: "Não confirmado",
      type: "tv",
    };
    brJson.channels["to-be-confirmed"] = {
      id: "to-be-confirmed",
      name: "To be confirmed",
      type: "tv",
    };

    // 2. Add 3 un-overridden synthetic channels with whitespace & CTA suffixes
    brJson.channels["fixture-watch-live"] = {
      id: "fixture-watch-live",
      name: "  Fixture Watch Live (Watch it live)  ",
      type: "streaming",
    };
    brJson.channels["fixture-ver-ao-vivo"] = {
      id: "fixture-ver-ao-vivo",
      name: "Fixture Ao Vivo (Ver ao vivo)",
      type: "streaming",
    };
    brJson.channels["fixture-miralo"] = {
      id: "fixture-miralo",
      name: "  Fixture Miralo (Míralo en vivo)  ",
      type: "streaming",
    };

    // 3. Dynamically pick a sample match present in BR.json.matches (prefer upcoming/live)
    const upcomingStatuses = new Set(["scheduled", "live", "halftime", "postponed", "suspended"]);
    const brMatchSlugs = Object.keys(brJson.matches || {});
    const targetMatchSlug =
      brMatchSlugs.find((s) => upcomingStatuses.has(matchesJson.matches?.[s]?.status)) ||
      brMatchSlugs[0];

    expect(Boolean(targetMatchSlug), "Fixture BR.json must contain at least 1 match slug");
    if (!targetMatchSlug) {
      return { failures, checksPassed, stats: {} };
    }

    const existingList = Array.isArray(brJson.matches[targetMatchSlug]) ? brJson.matches[targetMatchSlug] : [];
    for (const extraId of ["nao-confirmado", "fixture-watch-live"]) {
      if (!existingList.includes(extraId)) existingList.push(extraId);
    }
    brJson.matches[targetMatchSlug] = existingList;

    fs.writeFileSync(brPath, JSON.stringify(brJson, null, 2), "utf8");

    // 4. Recompute sha256 + bytes for channels/BR.json in fixture index.json
    const brBuf = fs.readFileSync(brPath);
    const brSha = crypto.createHash("sha256").update(brBuf).digest("hex").toLowerCase();
    indexJson.files["channels/BR.json"] = {
      sha256: brSha,
      bytes: brBuf.length,
    };
    fs.writeFileSync(indexPath, JSON.stringify(indexJson, null, 2), "utf8");

    // 5. Run normal fixture build into temp destination
    const normalBuild = runHugoBuild({
      sampleRelDir: FIXTURE_SAMPLE_REL,
      destination: tempDest,
    });
    expect(normalBuild.success, `Synthetic fixture build failed:\n${normalBuild.output}`);

    const budgetLogMatch = normalBuild.output.match(
      /broadcaster-directory:\s+estimated total files\s+(\d+)\/(\d+)\s+\(broadcasters\s+(\d+):\s+(\d+)\s+hubs\s+\+\s+(\d+)\s+detail,\s+base\s+(\d+)\)/
    );
    expect(Boolean(budgetLogMatch), `Fixture build missing broadcaster-directory budget log:\n${normalBuild.output}`);
    const baseCount = budgetLogMatch ? Number(budgetLogMatch[6]) : 0;
    const combinedCount = budgetLogMatch ? Number(budgetLogMatch[1]) : 0;
    expect(baseCount > 0 && combinedCount > baseCount, `Invalid parsed budget counts: base=${baseCount}, combined=${combinedCount}`);

    if (normalBuild.success) {
      // 6a. Denylist exclusion assertions
      const ptBrHubHtml = fs.readFileSync(path.join(tempDest, "pt-br", "channels", "index.html"), "utf8");
      const ptBrFaqHtml = fs.readFileSync(path.join(tempDest, "pt-br", "faq", "index.html"), "utf8");
      const globalHubHtml = fs.readFileSync(path.join(tempDest, "channels", "index.html"), "utf8");
      const globalFaqHtml = fs.readFileSync(path.join(tempDest, "faq", "index.html"), "utf8");
      const ptBrFaqBroadcasters = extractElementsWithClass(ptBrFaqHtml, "cfc-faq-broadcasters").map((e) => e.outerHtml).join("\n");
      const globalFaqBroadcasters = extractElementsWithClass(globalFaqHtml, "cfc-faq-broadcasters").map((e) => e.outerHtml).join("\n");

      const deniedChecks = [
        { slug: "canal-a-confirmar", label: "Canal a confirmar" },
        { slug: "nao-confirmado", label: "Não confirmado" },
        { slug: "to-be-confirmed", label: "To be confirmed" },
      ];
      for (const d of deniedChecks) {
        expect(
          !fs.existsSync(path.join(tempDest, "pt-br", "channels", d.slug, "index.html")),
          `Fixture denylisted slug "${d.slug}" must not generate a detail page`
        );
        for (const [surfaceName, content] of [
          ["pt-br/channels/index.html", ptBrHubHtml],
          ["pt-br/faq/index.html (.cfc-faq-broadcasters)", ptBrFaqBroadcasters],
          ["channels/index.html", globalHubHtml],
          ["faq/index.html (.cfc-faq-broadcasters)", globalFaqBroadcasters],
        ]) {
          expect(
            !content.toLowerCase().includes(d.slug) && !htmlToText(content).toLowerCase().includes(d.label.toLowerCase()),
            `Fixture denylisted entry "${d.slug}" / "${d.label}" leaked into ${surfaceName}`
          );
        }
      }

      // 6b. CTA suffix & whitespace normalization assertions
      const normalizedSynthetic = [
        { slug: "fixture-watch-live", expectedName: "Fixture Watch Live", forbiddenSuffix: "(Watch it live)" },
        { slug: "fixture-ver-ao-vivo", expectedName: "Fixture Ao Vivo", forbiddenSuffix: "(Ver ao vivo)" },
        { slug: "fixture-miralo", expectedName: "Fixture Miralo", forbiddenSuffix: "(Míralo en vivo)" },
      ];
      for (const item of normalizedSynthetic) {
        const detailFile = path.join(tempDest, "pt-br", "channels", item.slug, "index.html");
        expect(fs.existsSync(detailFile), `Fixture normalized synthetic channel missing detail page: ${item.slug}`);
        if (!fs.existsSync(detailFile)) continue;

        const detailHtml = fs.readFileSync(detailFile, "utf8");
        const h1Els = extractElementsWithClass(detailHtml, "cfc-entity-header__title");
        const actualName = h1Els.length === 1 ? decodeEntities(h1Els[0].innerHtml) : "";
        expect(
          actualName === item.expectedName,
          `Fixture "${item.slug}" <h1> expected exact "${item.expectedName}" (no whitespace/suffix), got "${actualName}"`
        );
        expect(
          !detailHtml.includes(item.forbiddenSuffix),
          `Fixture "${item.slug}" detail page still contains forbidden CTA suffix "${item.forbiddenSuffix}"`
        );
        const hubCardEls = extractElementsWithClass(ptBrHubHtml, "cfc-broadcaster-card")
          .filter((c) => c.attrs["data-cfc-channel"] === item.slug);
        expect(hubCardEls.length === 1, `Fixture pt-br hub expected 1 card for "${item.slug}", found ${hubCardEls.length}`);
        if (hubCardEls.length === 1) {
          const hubTitleEl = extractElementsWithClass(hubCardEls[0].innerHtml, "cfc-broadcaster-card__title")[0];
          const hubTitle = hubTitleEl ? decodeEntities(hubTitleEl.innerHtml) : "";
          expect(
            hubTitle === item.expectedName,
            `Fixture pt-br hub card "${item.slug}" expected "${item.expectedName}", got "${hubTitle}"`
          );
        }
        if (item.slug === "fixture-watch-live" && upcomingStatuses.has(matchesJson.matches?.[targetMatchSlug]?.status)) {
          const matchCardLinks = extractElementsWithClass(detailHtml, "cfc-match-card").map((m) => m.attrs.href);
          expect(
            matchCardLinks.includes(`/pt-br/match/${targetMatchSlug}/`),
            `Fixture "${item.slug}" detail schedule should include upcoming match "/pt-br/match/${targetMatchSlug}/"`
          );
        }
      }

      // 6c. Mutated match page assertions (pt-br and Global)
      for (const matchRel of [
        path.join("pt-br", "match", targetMatchSlug, "index.html"),
        path.join("match", targetMatchSlug, "index.html"),
      ]) {
        const mFile = path.join(tempDest, matchRel);
        expect(fs.existsSync(mFile), `Fixture mutated match page missing: ${matchRel}`);
        if (!fs.existsSync(mFile)) continue;
        const mHtml = fs.readFileSync(mFile, "utf8");
        const cards = extractElementsWithClass(mHtml, "cfc-channel-card");

        // Denied nao-confirmado -> plain unlinked <span>, no .cfc-channel-card__link
        const deniedCard = cards.find((c) =>
          extractElementsWithClass(c.innerHtml, "cfc-channel-card__action")
            .some((a) => a.attrs["data-cfc-channel"] === "nao-confirmado")
        );
        expect(Boolean(deniedCard), `${matchRel}: missing card for mutated "nao-confirmado"`);
        if (deniedCard) {
          expect(
            extractElementsWithClass(deniedCard.innerHtml, "cfc-channel-card__link").length === 0,
            `${matchRel}: denylisted "nao-confirmado" must NOT have .cfc-channel-card__link`
          );
          const spans = extractElements(
            deniedCard.innerHtml,
            (tag, attrs) => tag === "span" && hasClass(attrs.class, "cfc-channel-card__name")
          );
          expect(spans.length === 1, `${matchRel}: denylisted "nao-confirmado" must render plain <span class="cfc-channel-card__name">`);
        }

        // Normalized fixture-watch-live -> linked via .cfc-channel-card__link with clean stripped name
        const liveCard = cards.find((c) =>
          extractElementsWithClass(c.innerHtml, "cfc-channel-card__action")
            .some((a) => a.attrs["data-cfc-channel"] === "fixture-watch-live")
        );
        expect(Boolean(liveCard), `${matchRel}: missing card for mutated "fixture-watch-live"`);
        if (liveCard) {
          const links = extractElementsWithClass(liveCard.innerHtml, "cfc-channel-card__link");
          expect(links.length === 1, `${matchRel}: "fixture-watch-live" must be linked via .cfc-channel-card__link`);
          if (links.length === 1) {
            expect(
              links[0].attrs.href === "/pt-br/channels/fixture-watch-live/",
              `${matchRel}: "fixture-watch-live" expected href "/pt-br/channels/fixture-watch-live/", got "${links[0].attrs.href}"`
            );
            const linkText = decodeEntities(links[0].innerHtml);
            expect(
              linkText === "Fixture Watch Live",
              `${matchRel}: "fixture-watch-live" expected clean text "Fixture Watch Live", got "${linkText}"`
            );
          }
        }
      }
    }

    // 7. Combined Budget Overflow Failure Check (HUGO_CFC_FILE_BUDGET = base + 1)
    if (baseCount > 0) {
      const overflowLimit = String(baseCount + 1);
      const overflowBuild = runHugoBuild({
        sampleRelDir: FIXTURE_SAMPLE_REL,
        destination: tempDest,
        envVars: { HUGO_CFC_FILE_BUDGET: overflowLimit },
      });
      expect(
        !overflowBuild.success && overflowBuild.code !== 0,
        `Budget overflow build with HUGO_CFC_FILE_BUDGET=${overflowLimit} should exit non-zero (base=${baseCount}, combined=${combinedCount})`
      );
      expect(
        overflowBuild.output.includes("broadcaster-directory:") && overflowBuild.output.includes("file budget exceeded"),
        `Budget overflow output must report "broadcaster-directory:" file budget exceeded:\n${overflowBuild.output}`
      );
      expect(
        !overflowBuild.output.includes("data-pages: file budget exceeded"),
        `Budget overflow should pass data-pages budget.html (${baseCount} <= ${overflowLimit}) and fail in broadcaster-budget.html:\n${overflowBuild.output}`
      );
    }

    return {
      failures,
      checksPassed,
      stats: {
        targetMatchSlug,
        baseCount,
        combinedCount,
      },
    };
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    cleanup();
  }
}

function parseCliArgs(argv) {
  let pubDir = DEFAULT_PUB_DIR;
  let skipFixture = false;
  for (const arg of argv) {
    if (arg === "--skip-fixture") skipFixture = true;
    else if (arg.startsWith("--pub-dir=")) pubDir = path.resolve(ROOT_DIR, arg.slice("--pub-dir=".length));
  }
  return { pubDir, skipFixture };
}

const isMain =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const { pubDir, skipFixture } = parseCliArgs(process.argv.slice(2));
  console.log("Running CardápioFC Broadcaster Directory Verification Suite...");

  const currentRes = runCurrentBuildChecks({ pubDir, rootDir: ROOT_DIR });
  console.log(
    `Current build (${path.relative(ROOT_DIR, pubDir) || "public"}): ${currentRes.checksPassed} checks passed, ${currentRes.failures.length} failed ` +
      `(files=${currentRes.stats.totalPublicFiles ?? 0}, populated=${(currentRes.stats.populatedEditions || []).join(",")}, ` +
      `empty=${(currentRes.stats.emptyEditions || []).join(",")}, details=${currentRes.stats.detailPagesChecked ?? 0}, ` +
      `matches=${currentRes.stats.matchPagesChecked ?? 0}, logos=${currentRes.stats.logoImgCount ?? 0}).`
  );

  let fixtureRes = { failures: [], checksPassed: 0, stats: {} };
  if (!skipFixture) {
    fixtureRes = runSyntheticFixtureTests();
    console.log(
      `Synthetic fixture & budget overflow: ${fixtureRes.checksPassed} checks passed, ${fixtureRes.failures.length} failed ` +
        `(match=${fixtureRes.stats.targetMatchSlug || "n/a"}, base=${fixtureRes.stats.baseCount || 0}, combined=${fixtureRes.stats.combinedCount || 0}).`
    );
  }

  const allFailures = [...currentRes.failures, ...fixtureRes.failures];
  if (allFailures.length > 0) {
    console.error(`\n❌ Broadcaster directory test suite failed (${allFailures.length} failure(s)):`);
    allFailures.slice(0, 50).forEach((m) => console.error(` - ${m}`));
    if (allFailures.length > 50) console.error(` ... and ${allFailures.length - 50} more`);
    process.exit(1);
  }

  console.log("✅ All broadcaster directory checks passed!");
}
