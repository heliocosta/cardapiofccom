#!/usr/bin/env node

/**
 * Automated test suite for Task 7.1: Build match entity page template
 *
 * Verifies:
 * 1. Template existence and structure: layouts/match/section.html
 * 2. Complete page generation across all 6 editions (Global, UK, Ireland, Brazil, Portugal, Argentina)
 * 3. Page header and breadcrumb trail: Home -> League -> Match title
 * 4. Match hero: crests, localized team names, links to /team/..., link to /league/...,
 *    kickoff time or status/score, round, venue
 * 5. Channel listings: country grouped in Global, local only in Regional, empty prompt when none
 * 6. Edition links: cross-links with hreflang in Regional when other countries broadcast, suppressed in Global
 * 7. Freshness footer: localized timestamp with edition time zone
 * 8. Downstream FAQ hook: optional cfcpage/faq-section.html integration
 * 9. Downstream contract: .Params.cfc / cfcdata/page-entity.html integration
 * 10. STRICT SCOPE: zero occurrences of out-of-scope lineup/formation references
 * 11. Full site check: pnpm check
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

const EDITIONS = [
  {
    code: "en",
    prefix: "",
    label: "Global (English)",
    lang: "en",
    homeLabel: "Home",
  },
  {
    code: "en-gb",
    prefix: "en-gb",
    label: "UK (English)",
    lang: "en-GB",
    homeLabel: "Home",
  },
  {
    code: "en-ie",
    prefix: "en-ie",
    label: "Ireland (English)",
    lang: "en-IE",
    homeLabel: "Home",
  },
  {
    code: "pt-br",
    prefix: "pt-br",
    label: "Brasil (Português)",
    lang: "pt-BR",
    homeLabel: "Início",
  },
  {
    code: "pt-pt",
    prefix: "pt-pt",
    label: "Portugal (Português)",
    lang: "pt-PT",
    homeLabel: "Início",
  },
  {
    code: "es-ar",
    prefix: "es-ar",
    label: "Argentina (Español)",
    lang: "es-AR",
    homeLabel: "Inicio",
  },
];

console.log(
  "🧪 Starting CFC Match Entity Page Template (Task 7.1) test suite...\n",
);

// ============================================================================
// Test 1: Template Existence & Structure
// ============================================================================
console.log(
  "--- Test 1: Template Existence & Structure (layouts/match/section.html) ---",
);

const templatePath = path.join(ROOT_DIR, "layouts/match/section.html");
assert(fs.existsSync(templatePath), "layouts/match/section.html exists");

const templateContent = fs.readFileSync(templatePath, "utf8");

assert(
  templateContent.includes('define "main"'),
  'Template defines "main" block',
);
assert(
  templateContent.includes(".Params.cfc.slug") ||
    templateContent.includes(".slug"),
  "Template extracts slug from page params",
);
assert(
  templateContent.includes('partialCached "cfcdata/match.html"'),
  'Template resolves match VM using partialCached "cfcdata/match.html"',
);
assert(
  templateContent.includes("cfc/page-header.html"),
  "Template composes cfc/page-header.html",
);
assert(
  templateContent.includes("cfcpage/match-hero.html"),
  "Template composes cfcpage/match-hero.html",
);
assert(
  templateContent.includes("cfcpage/channels.html"),
  "Template composes cfcpage/channels.html",
);
assert(
  templateContent.includes("cfcpage/edition-links.html"),
  "Template composes cfcpage/edition-links.html",
);
assert(
  templateContent.includes("_partials/cfcpage/faq-section.html"),
  "Template includes downstream FAQ section hook via templates.Exists",
);
assert(
  templateContent.includes("cfcpage/freshness.html"),
  "Template composes cfcpage/freshness.html",
);
assert(
  templateContent.includes("cfc-container py-6"),
  "Template wraps content in cfc-container py-6",
);

// Out of scope verification: zero occurrences of forbidden word
const outOfScopeWord = ["l", "i", "n", "e", "u", "p"].join("");
assert(
  !templateContent.toLowerCase().includes(outOfScopeWord),
  "Template contains 0 out-of-scope references",
);

// ============================================================================
// Test 2: Standard Production/Sample Build Execution
// ============================================================================
console.log("\n--- Test 2: Execute Hugo Build with Sample Data ---");

try {
  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });
  assert(true, "Hugo build completed successfully with return code 0");
} catch (err) {
  console.error(err.stdout?.toString(), err.stderr?.toString());
  assert(false, "Hugo build failed during execution");
}

// ============================================================================
// Test 3: Output Page Generation Across All 6 Editions (Requirement 3.1)
// ============================================================================
console.log("\n--- Test 3: Output Page Generation Across All 6 Editions ---");

const sampleMatchesPath = path.join(
  ROOT_DIR,
  "assets/cfc-data/sample/matches.json",
);
const sampleMatches = JSON.parse(fs.readFileSync(sampleMatchesPath, "utf8"));
const matchSlugs = Object.keys(sampleMatches.matches || {});

assert(
  matchSlugs.length === 8,
  `Sample dataset has 8 matches (found ${matchSlugs.length})`,
);

let matchPageCount = 0;
for (const ed of EDITIONS) {
  for (const slug of matchSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/match/${slug}/index.html`
      : `public/match/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    const exists = fs.existsSync(fullPath);
    if (exists && fs.statSync(fullPath).size > 200) {
      matchPageCount++;
    } else {
      assert(false, `Missing or empty match page: ${pageRelPath}`);
    }
  }
}

assert(
  matchPageCount === 48,
  `All 48 match pages (8 matches x 6 editions) generated and populated (got ${matchPageCount})`,
);

// Section listing suppression check: /match/index.html must not exist
assert(
  !fs.existsSync(path.join(ROOT_DIR, "public/match/index.html")),
  "public/match/index.html is suppressed",
);
for (const ed of EDITIONS) {
  if (ed.prefix) {
    assert(
      !fs.existsSync(
        path.join(ROOT_DIR, `public/${ed.prefix}/match/index.html`),
      ),
      `public/${ed.prefix}/match/index.html is suppressed`,
    );
  }
}

// ============================================================================
// Test 4: Page Header & Breadcrumb Trail (Req 10.3, 10.4, 10.5)
// ============================================================================
console.log("\n--- Test 4: Page Header & Breadcrumb Trail ---");

// Global match: arsenal-vs-chelsea-2026-11-06
const globalHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/match/arsenal-vs-chelsea-2026-11-06/index.html"),
  "utf8",
);

assert(
  globalHtml.includes("<header class=cfc-page-header>"),
  "Global match contains cfc-page-header",
);
assert(
  globalHtml.includes(
    "<h1 class=cfc-page-header__title>Arsenal vs Chelsea</h1>",
  ),
  "Global match has correct h1 title",
);
assert(
  globalHtml.includes("class=cfc-breadcrumb") &&
    globalHtml.includes("<ol class=cfc-breadcrumb__list>"),
  "Global match has semantic breadcrumb nav and list",
);
assert(
  globalHtml.includes("href=/ class=cfc-breadcrumb__link>Home</a>"),
  "Global match breadcrumbs start with link to Home (/)",
);
assert(
  globalHtml.includes(
    "href=/league/premier-league/ class=cfc-breadcrumb__link>Premier League</a>",
  ),
  "Global match breadcrumbs contain link to League (/league/premier-league/)",
);
assert(
  globalHtml.includes(
    "class=cfc-breadcrumb__current aria-current=page>Arsenal vs Chelsea</span>",
  ),
  "Global match breadcrumbs end with current match title",
);

// Regional PT-BR match: sao-paulo-vs-flamengo-2026-11-08
const ptBrHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/pt-br/match/sao-paulo-vs-flamengo-2026-11-08/index.html",
  ),
  "utf8",
);

assert(
  ptBrHtml.includes(
    "<h1 class=cfc-page-header__title>São Paulo vs Flamengo</h1>",
  ),
  "PT-BR match has localized team names in h1",
);
assert(
  ptBrHtml.includes("href=/pt-br/ class=cfc-breadcrumb__link>Início</a>"),
  "PT-BR match breadcrumbs link to edition home (/pt-br/)",
);
assert(
  ptBrHtml.includes(
    "href=/pt-br/league/brasileirao-serie-a/ class=cfc-breadcrumb__link>Brasileirão Série A</a>",
  ),
  "PT-BR match breadcrumbs link to localized league in current edition (/pt-br/league/brasileirao-serie-a/)",
);
assert(
  ptBrHtml.includes(
    "class=cfc-breadcrumb__current aria-current=page>São Paulo vs Flamengo</span>",
  ),
  "PT-BR match breadcrumbs end with localized match title",
);

// Regional ES-AR match: real-madrid-vs-barcelona-2026-11-08
const esArHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/es-ar/match/real-madrid-vs-barcelona-2026-11-08/index.html",
  ),
  "utf8",
);
assert(
  esArHtml.includes("href=/es-ar/ class=cfc-breadcrumb__link>Inicio</a>"),
  "ES-AR match breadcrumbs link to edition home (/es-ar/)",
);
assert(
  esArHtml.includes(
    "href=/es-ar/league/la-liga/ class=cfc-breadcrumb__link>La Liga</a>",
  ),
  "ES-AR match breadcrumbs link to edition league (/es-ar/league/la-liga/)",
);

// ============================================================================
// Test 5: Match Hero Component (Req 4.1, 4.2, 4.3, 4.4, 4.5, 10.3)
// ============================================================================
console.log("\n--- Test 5: Match Hero Component ---");

// Hero in Global finished match
assert(
  globalHtml.includes("cfc-match-hero--finished"),
  "Global hero has finished status modifier",
);
assert(
  globalHtml.includes('href=/team/arsenal/ class="cfc-match-hero__team-name') &&
    globalHtml.includes('href=/team/chelsea/ class="cfc-match-hero__team-name'),
  "Global hero links to both team pages",
);
assert(
  globalHtml.includes("cfc-team-crest--lg") &&
    globalHtml.includes("alt=Arsenal") &&
    globalHtml.includes("alt=Chelsea"),
  "Global hero renders lg crests with non-decorative team names",
);
assert(
  globalHtml.includes(
    'class="cfc-match-hero__score text-2xl md:text-3xl font-bold font-secondary mb-1">2 - 1</div>',
  ),
  "Finished match displays score (2 - 1)",
);
assert(
  globalHtml.includes("cfc-match-card__badge--finished"),
  "Finished match displays finished status badge",
);
assert(
  globalHtml.includes("Emirates Stadium, London"),
  "Global match displays venue name and city",
);
assert(
  globalHtml.includes("Round Regular Season - 11"),
  "Global match displays round number",
);

// Live match: flamengo-vs-palmeiras-2026-11-07
const liveHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/match/flamengo-vs-palmeiras-2026-11-07/index.html",
  ),
  "utf8",
);
assert(
  liveHtml.includes("cfc-match-hero--live"),
  "Live match hero has live status modifier",
);
assert(
  liveHtml.includes("cfc-match-card__pulse"),
  "Live match hero includes pulse animation indicator",
);
assert(
  liveHtml.includes(
    'class="cfc-match-hero__score text-2xl md:text-3xl font-bold font-secondary mt-1">1 - 1</div>',
  ),
  "Live match displays live score (1 - 1)",
);

// Halftime match: manchester-city-vs-arsenal-2026-11-06
const halftimeHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/match/manchester-city-vs-arsenal-2026-11-06/index.html",
  ),
  "utf8",
);
assert(
  halftimeHtml.includes("cfc-match-hero--halftime"),
  "Halftime match hero has halftime status modifier",
);
assert(
  halftimeHtml.includes("HT"),
  "Halftime match hero displays halftime status badge",
);
assert(
  halftimeHtml.includes("1 - 0"),
  "Halftime match hero displays halftime score",
);

// Scheduled match in Global (UTC) vs Regional (Time Zone & Offset)
const scheduledGlobalHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/match/sao-paulo-vs-flamengo-2026-11-08/index.html",
  ),
  "utf8",
);
assert(
  scheduledGlobalHtml.includes("class=cfc-kickoff-time__zone>") &&
    scheduledGlobalHtml.includes("UTC</span>"),
  "Global scheduled match displays kickoff with UTC zone label",
);

assert(
  ptBrHtml.includes(
    "class=cfc-kickoff-time__zone> horário de Brasília <span class=cfc-kickoff-time__offset>(UTC−3)</span></span>",
  ),
  "PT-BR scheduled match displays kickoff converted to edition time zone with offset",
);

// Postponed match without score: real-madrid-vs-barcelona-2026-11-08
const postponedHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/match/real-madrid-vs-barcelona-2026-11-08/index.html",
  ),
  "utf8",
);
assert(
  postponedHtml.includes("cfc-match-hero--postponed") &&
    postponedHtml.includes("cfc-match-card__badge--warning"),
  "Postponed match displays warning status badge",
);
assert(
  !postponedHtml.includes("cfc-match-hero__score"),
  "Postponed match does not render empty score container",
);

// ============================================================================
// Test 6: Channel Listings (Req 5.1, 5.2, 5.3, 5.5)
// ============================================================================
console.log("\n--- Test 6: Channel Listings ---");

// Global match with broadcasters across multiple countries
assert(
  globalHtml.includes("Where to watch in United Kingdom"),
  "Global channel listing groups by United Kingdom",
);
assert(
  globalHtml.includes("Where to watch in Ireland"),
  "Global channel listing groups by Ireland",
);
assert(
  globalHtml.includes("Where to watch in Brazil"),
  "Global channel listing groups by Brazil",
);
assert(
  globalHtml.includes("Where to watch in Portugal"),
  "Global channel listing groups by Portugal",
);
assert(
  globalHtml.includes("Where to watch in Argentina"),
  "Global channel listing groups by Argentina",
);
assert(
  globalHtml.includes("cfc-channel-badge--md"),
  "Channel badges rendered in size md",
);
assert(
  globalHtml.includes('rel="noopener nofollow"') &&
    globalHtml.includes("target=_blank"),
  'Channel links have rel="noopener nofollow" and target="_blank"',
);

// Regional UK match: only UK channels listed
const enGbMatchHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/en-gb/match/arsenal-vs-chelsea-2026-11-06/index.html",
  ),
  "utf8",
);
assert(
  enGbMatchHtml.includes("Where to watch in United Kingdom"),
  "UK match has localized single-country heading",
);
assert(
  !enGbMatchHtml.includes("Where to watch in Brazil") &&
    !enGbMatchHtml.includes("Where to watch in Portugal"),
  "UK match does NOT list channels for other countries in channels section",
);
assert(
  enGbMatchHtml.includes("Sky Sports Main Event"),
  "UK match lists Sky Sports",
);
assert(enGbMatchHtml.includes("discovery+"), "UK match lists discovery+");

// Regional Brazil match: only Brazil channels listed
assert(
  ptBrHtml.includes("Onde assistir em Brasil"),
  "PT-BR match has localized single-country heading",
);
assert(ptBrHtml.includes("SporTV"), "PT-BR match lists SporTV");
assert(ptBrHtml.includes("Premiere"), "PT-BR match lists Premiere");
assert(
  !ptBrHtml.includes("Sky Sports"),
  "PT-BR match does NOT list foreign channels in channels section",
);

// Empty broadcaster state (real-madrid-vs-barcelona-2026-11-08 has no broadcasters in sample)
assert(
  postponedHtml.includes(
    "No confirmed broadcaster — check the CardápioFC app.",
  ),
  "Global match with no broadcasters displays empty-state message",
);

const ptBrNoBroadcasterHtml = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "public/pt-br/match/real-madrid-vs-barcelona-2026-11-08/index.html",
  ),
  "utf8",
);
assert(
  ptBrNoBroadcasterHtml.includes(
    "Sem transmissão confirmada — consulte o app CardápioFC.",
  ),
  "PT-BR match with no broadcasters displays localized empty-state message",
);

// ============================================================================
// Test 7: Edition Cross-Links (Req 5.4)
// ============================================================================
console.log("\n--- Test 7: Edition Cross-Links ---");

// Regional UK match: broadcasts also exist in Brazil, Portugal, Argentina, Ireland
const editionLinksMatch = enGbMatchHtml.match(
  /<aside class="?cfc-edition-links[\s\S]*?<\/aside>/,
);
const editionLinksHtml = editionLinksMatch ? editionLinksMatch[0] : "";

assert(
  editionLinksHtml.length > 0,
  "Regional UK match renders cfc-edition-links container",
);
assert(
  editionLinksHtml.includes("Watch in other countries"),
  "Regional UK match has edition links heading",
);
assert(
  editionLinksHtml.includes(
    "href=/pt-br/match/arsenal-vs-chelsea-2026-11-06/ hreflang=pt-br lang=pt-br",
  ) && editionLinksHtml.includes("Brazil"),
  "Regional UK match links to Brazil edition with hreflang",
);
assert(
  editionLinksHtml.includes(
    "href=/es-ar/match/arsenal-vs-chelsea-2026-11-06/ hreflang=es-ar lang=es-ar",
  ) && editionLinksHtml.includes("Argentina"),
  "Regional UK match links to Argentina edition with hreflang",
);
assert(
  !editionLinksHtml.includes(
    "href=/en-gb/match/arsenal-vs-chelsea-2026-11-06/",
  ),
  "Regional UK match does NOT link to itself in edition cross-links",
);

// Global edition: edition links are suppressed
assert(
  !globalHtml.includes("cfc-edition-links"),
  "Global edition suppresses edition cross-links",
);

// ============================================================================
// Test 8: Freshness Footer (Req 4.6)
// ============================================================================
console.log("\n--- Test 8: Freshness Footer ---");

assert(
  globalHtml.includes(
    '<footer class="cfc-freshness text-xs text-muted text-center my-8">',
  ) && globalHtml.includes("Data updated Thursday 5 November 2026, 06:00 UTC"),
  "Global match displays freshness footer with UTC timestamp",
);

assert(
  ptBrHtml.includes(
    '<footer class="cfc-freshness text-xs text-muted text-center my-8">',
  ) &&
    ptBrHtml.includes(
      "Dados atualizados em quinta-feira, 5 de novembro de 2026, 03:00 horário de Brasília",
    ),
  "PT-BR match displays freshness footer converted to Brasília timezone",
);

// ============================================================================
// Test 9: Downstream FAQ Section Hook Integration
// ============================================================================
console.log("\n--- Test 9: Downstream FAQ Section Hook Integration ---");

const testFaqPartialPath = path.join(
  ROOT_DIR,
  "layouts/_partials/cfcpage/faq-section.html",
);

try {
  fs.writeFileSync(
    testFaqPartialPath,
    '<section class="cfc-match-faq" data-test="faq-hook"><h2 class="text-xl font-bold">Frequently Asked Questions</h2><p>FAQ Hook is working</p></section>',
    "utf8",
  );

  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });

  const updatedGlobalHtml = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "public/match/arsenal-vs-chelsea-2026-11-06/index.html",
    ),
    "utf8",
  );

  assert(
    updatedGlobalHtml.includes("data-test=faq-hook") &&
      updatedGlobalHtml.includes("Frequently Asked Questions"),
    "Downstream FAQ hook renders content when _partials/cfcpage/faq-section.html exists",
  );
} finally {
  if (fs.existsSync(testFaqPartialPath)) {
    fs.unlinkSync(testFaqPartialPath);
  }
  // Re-run build without the test FAQ hook
  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });
}

// Verify that without the file, the hook renders nothing
const cleanGlobalHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/match/arsenal-vs-chelsea-2026-11-06/index.html"),
  "utf8",
);
assert(
  !cleanGlobalHtml.includes("data-test=faq-hook"),
  "FAQ section is omitted cleanly when partial does not exist",
);

// ============================================================================
// Test 10: Downstream Contract Integration (cfcdata/page-entity.html)
// ============================================================================
console.log(
  "\n--- Test 10: Downstream Contract Integration (cfcdata/page-entity.html) ---",
);

const probeLayoutPath = path.join(
  ROOT_DIR,
  "layouts/_cfc_probe_match_contract.html",
);
const probeContentPath = path.join(
  ROOT_DIR,
  "content/en/_cfc_probe_match_contract.md",
);

try {
  fs.writeFileSync(
    probeLayoutPath,
    `{{- $entity := partial "cfcdata/page-entity.html" . -}}
<div id="probe-output" data-kind="{{ $entity.kind }}" data-slug="{{ $entity.match.slug }}" data-channels-count="{{ len $entity.channels }}">
{{ $entity.match.title }}
</div>`,
    "utf8",
  );

  fs.writeFileSync(
    probeContentPath,
    `---
title: "Probe Match Contract"
layout: _cfc_probe_match_contract
params:
  cfc:
    kind: "match"
    slug: "arsenal-vs-chelsea-2026-11-06"
---`,
    "utf8",
  );

  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });

  const probeHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/_cfc_probe_match_contract/index.html"),
    "utf8",
  );

  assert(
    probeHtml.includes("data-kind=match"),
    'Contract entity returns kind="match"',
  );
  assert(
    probeHtml.includes("data-slug=arsenal-vs-chelsea-2026-11-06"),
    "Contract entity matches requested match slug",
  );
  assert(
    probeHtml.includes("data-channels-count=5"),
    "Contract entity resolves channels (5 country groups for Global)",
  );
  assert(
    probeHtml.includes("Arsenal vs Chelsea"),
    "Contract entity provides resolved match title",
  );
} finally {
  if (fs.existsSync(probeLayoutPath)) fs.unlinkSync(probeLayoutPath);
  if (fs.existsSync(probeContentPath)) fs.unlinkSync(probeContentPath);
  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });
}

// ============================================================================
// Test 11: Strict Scope Enforcement (Zero Out-of-Scope Mentions)
// ============================================================================
console.log("\n--- Test 11: Strict Scope Enforcement ---");

let totalHtmlFilesChecked = 0;
let outOfScopeCount = 0;

for (const ed of EDITIONS) {
  for (const slug of matchSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/match/${slug}/index.html`
      : `public/match/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    if (fs.existsSync(fullPath)) {
      totalHtmlFilesChecked++;
      const html = fs.readFileSync(fullPath, "utf8");
      if (html.toLowerCase().includes(outOfScopeWord)) {
        outOfScopeCount++;
        console.error(`Found out-of-scope term in ${pageRelPath}`);
      }
    }
  }
}

assert(
  totalHtmlFilesChecked === 48,
  `Checked all 48 generated match HTML files for out-of-scope terms (checked ${totalHtmlFilesChecked})`,
);
assert(
  outOfScopeCount === 0,
  `Zero occurrences of out-of-scope terms found across all match pages (found ${outOfScopeCount})`,
);

// ============================================================================
// Test 12: Full Site Check (pnpm check)
// ============================================================================
console.log("\n--- Test 12: Full Site Check (pnpm check) ---");

try {
  const checkOut = execSync("pnpm check", {
    cwd: ROOT_DIR,
    stdio: "pipe",
  }).toString();
  assert(
    checkOut.includes("All site checks passed"),
    "pnpm check passed with 0 errors",
  );
} catch (err) {
  console.error(err.stdout?.toString(), err.stderr?.toString());
  assert(false, "pnpm check failed");
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n============================================================");
console.log(
  `Test Results: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`,
);
console.log("============================================================\n");

process.exit(failedTests > 0 ? 1 : 0);
