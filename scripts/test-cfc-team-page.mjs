#!/usr/bin/env node

/**
 * Automated test suite for Task 7.2: Build team entity page template
 *
 * Verifies:
 * 1. Template existence and structure: layouts/team/page.html
 * 2. Complete page generation across all 6 editions (Global, UK, Ireland, Brazil, Portugal, Argentina)
 *    (8 teams x 6 editions = 48 pages)
 * 3. Section listing suppression (/team/index.html absent across all editions)
 * 4. Page header and breadcrumbs: Home (in edition language) -> Team title
 * 5. Team crest: size lg, localized team name in h1, fallback initials, country display
 * 6. Upcoming matches section: window <= 10, day grouping, match cards, intra-edition links
 * 7. Requirement 5.6: Zero channel badges on team pages
 * 8. Empty state when team has no upcoming matches (no_upcoming_matches)
 * 9. Recent results section: window <= 5 finished matches with scores, omitted when none
 * 10. Participating league links: intra-edition URLs and localized league names
 * 11. Freshness footer: localized timestamp with edition timezone
 * 12. STRICT SCOPE: zero occurrences of out-of-scope lineup references
 * 13. Full site check: pnpm check
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
    upcomingHeading: "Upcoming Matches",
    emptyUpcoming: "No upcoming matches scheduled.",
    recentHeading: "Recent Results",
  },
  {
    code: "en-gb",
    prefix: "en-gb",
    label: "UK (English)",
    lang: "en-GB",
    homeLabel: "Home",
    upcomingHeading: "Upcoming Fixtures",
    emptyUpcoming: "No upcoming matches scheduled.",
    recentHeading: "Recent Results",
  },
  {
    code: "en-ie",
    prefix: "en-ie",
    label: "Ireland (English)",
    lang: "en-IE",
    homeLabel: "Home",
    upcomingHeading: "Upcoming Fixtures",
    emptyUpcoming: "No upcoming matches scheduled.",
    recentHeading: "Recent Results",
  },
  {
    code: "pt-br",
    prefix: "pt-br",
    label: "Brasil (Português)",
    lang: "pt-BR",
    homeLabel: "Início",
    upcomingHeading: "Próximos jogos",
    emptyUpcoming: "Nenhum próximo jogo agendado.",
    recentHeading: "Resultados recentes",
  },
  {
    code: "pt-pt",
    prefix: "pt-pt",
    label: "Portugal (Português)",
    lang: "pt-PT",
    homeLabel: "Início",
    upcomingHeading: "Próximos jogos",
    emptyUpcoming: "Nenhum próximo jogo agendado.",
    recentHeading: "Resultados recentes",
  },
  {
    code: "es-ar",
    prefix: "es-ar",
    label: "Argentina (Español)",
    lang: "es-AR",
    homeLabel: "Inicio",
    upcomingHeading: "Próximos partidos",
    emptyUpcoming: "No hay próximos partidos programados.",
    recentHeading: "Resultados recientes",
  },
];

console.log(
  "🧪 Starting CFC Team Entity Page Template (Task 7.2) test suite...\n",
);

// ============================================================================
// Test 1: Template Existence & Structure
// ============================================================================
console.log(
  "--- Test 1: Template Existence & Structure (layouts/team/page.html) ---",
);

const templatePath = path.join(ROOT_DIR, "layouts/team/page.html");
assert(fs.existsSync(templatePath), "layouts/team/page.html exists");

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
  templateContent.includes('partialCached "cfcdata/team.html"'),
  'Template resolves team VM using partialCached "cfcdata/team.html"',
);
assert(
  templateContent.includes('partialCached "cfcdata/dataset.html"'),
  'Template resolves dataset using partialCached "cfcdata/dataset.html"',
);
assert(
  templateContent.includes('partialCached "cfcdata/settings.html"'),
  'Template resolves settings using partialCached "cfcdata/settings.html"',
);
assert(
  templateContent.includes("cfc/breadcrumb.html"),
  "Template composes cfc/breadcrumb.html",
);
assert(
  templateContent.includes("cfc/team-crest.html"),
  "Template composes cfc/team-crest.html",
);
assert(
  templateContent.includes('size" "lg"') || templateContent.includes('size: "lg"') || templateContent.includes('size" "lg"'),
  "Template invokes team crest with size lg",
);
assert(
  templateContent.includes("cfc-team__name"),
  "Template has h1 with class cfc-team__name",
);
assert(
  templateContent.includes("cfcdata/window.html"),
  "Template uses cfcdata/window.html for match filtering",
);
assert(
  templateContent.includes("upcoming_matches"),
  "Template references upcoming_matches i18n key",
);
assert(
  templateContent.includes("no_upcoming_matches"),
  "Template references no_upcoming_matches i18n key",
);
assert(
  templateContent.includes("recent_results"),
  "Template references recent_results i18n key",
);
assert(
  templateContent.includes("cfcpage/match-days.html"),
  "Template composes cfcpage/match-days.html",
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

const sampleTeamsPath = path.join(
  ROOT_DIR,
  "assets/cfc-data/sample/teams.json",
);
const sampleTeams = JSON.parse(fs.readFileSync(sampleTeamsPath, "utf8"));
const teamSlugs = Object.keys(sampleTeams.teams || {});

assert(
  teamSlugs.length === 8,
  `Sample dataset has 8 teams (found ${teamSlugs.length})`,
);

let teamPageCount = 0;
for (const ed of EDITIONS) {
  for (const slug of teamSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/team/${slug}/index.html`
      : `public/team/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    const exists = fs.existsSync(fullPath);
    if (exists && fs.statSync(fullPath).size > 200) {
      teamPageCount++;
    } else {
      assert(false, `Missing or empty team page: ${pageRelPath}`);
    }
  }
}

assert(
  teamPageCount === 48,
  `All 48 team pages (8 teams x 6 editions) generated and populated (got ${teamPageCount})`,
);

// Section listing suppression check: /team/index.html must not exist
assert(
  !fs.existsSync(path.join(ROOT_DIR, "public/team/index.html")),
  "public/team/index.html is suppressed",
);
for (const ed of EDITIONS) {
  if (ed.prefix) {
    assert(
      !fs.existsSync(
        path.join(ROOT_DIR, `public/${ed.prefix}/team/index.html`),
      ),
      `public/${ed.prefix}/team/index.html is suppressed`,
    );
  }
}

// ============================================================================
// Test 4: Header, Crest & Breadcrumb Trail (Req 7.1, 10.3, 10.4, 10.5)
// ============================================================================
console.log("\n--- Test 4: Header, Crest & Breadcrumb Trail ---");

// Global team: Arsenal
const globalArsenalHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/team/arsenal/index.html"),
  "utf8",
);

assert(
  globalArsenalHtml.includes("class=cfc-breadcrumb") &&
    globalArsenalHtml.includes("<ol class=cfc-breadcrumb__list>"),
  "Global team has semantic breadcrumb nav and list",
);
assert(
  globalArsenalHtml.includes("href=/ class=cfc-breadcrumb__link>Home</a>"),
  "Global team breadcrumbs start with link to Home (/)",
);
assert(
  globalArsenalHtml.includes(
    "class=cfc-breadcrumb__current aria-current=page>Arsenal</span>",
  ),
  "Global team breadcrumbs end with current team title (Arsenal)",
);
assert(
  globalArsenalHtml.includes("cfc-team-crest cfc-team-crest--lg"),
  "Global team renders crest in size lg",
);
assert(
  globalArsenalHtml.includes("alt=Arsenal"),
  "Global team renders crest with alt=Arsenal",
);
assert(
  globalArsenalHtml.includes("cfc-team-crest__initials aria-hidden=true>ARS</span>"),
  "Global team renders crest initials ARS",
);
assert(
  globalArsenalHtml.includes('<h1 class="cfc-team__name text-2xl md:text-3xl font-bold">Arsenal</h1>'),
  "Global team renders h1.cfc-team__name with team name",
);
assert(
  globalArsenalHtml.includes('<p class="cfc-team__country text-sm text-muted mt-1">United Kingdom</p>'),
  "Global team displays localized country name (United Kingdom)",
);

// Regional PT-BR team: Flamengo
const ptBrFlamengoHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/pt-br/team/flamengo/index.html"),
  "utf8",
);

assert(
  ptBrFlamengoHtml.includes("href=/pt-br/ class=cfc-breadcrumb__link>Início</a>"),
  "PT-BR team breadcrumbs link to edition home (/pt-br/)",
);
assert(
  ptBrFlamengoHtml.includes("class=cfc-breadcrumb__current aria-current=page>Flamengo</span>"),
  "PT-BR team breadcrumbs end with localized team title (Flamengo)",
);
assert(
  ptBrFlamengoHtml.includes('<h1 class="cfc-team__name text-2xl md:text-3xl font-bold">Flamengo</h1>'),
  "PT-BR team renders localized h1.cfc-team__name",
);
assert(
  ptBrFlamengoHtml.includes("cfc-team-crest__initials aria-hidden=true>FLA</span>"),
  "PT-BR team renders crest initials FLA",
);
assert(
  ptBrFlamengoHtml.includes('<p class="cfc-team__country text-sm text-muted mt-1">Brasil</p>'),
  "PT-BR team displays localized country name (Brasil)",
);

// Regional ES-AR team: Barcelona
const esArBarcelonaHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/es-ar/team/barcelona/index.html"),
  "utf8",
);

assert(
  esArBarcelonaHtml.includes("href=/es-ar/ class=cfc-breadcrumb__link>Inicio</a>"),
  "ES-AR team breadcrumbs link to edition home (/es-ar/)",
);
assert(
  esArBarcelonaHtml.includes("class=cfc-breadcrumb__current aria-current=page>Barcelona</span>"),
  "ES-AR team breadcrumbs end with localized team title (Barcelona)",
);
assert(
  esArBarcelonaHtml.includes("cfc-team-crest__initials aria-hidden=true>FCB</span>"),
  "ES-AR team renders Spanish shortName initials FCB",
);

// ============================================================================
// Test 5: Upcoming Matches Section (Req 7.2, 5.6)
// ============================================================================
console.log("\n--- Test 5: Upcoming Matches Section ---");

for (const ed of EDITIONS) {
  const sampleSlug = "arsenal";
  const pageRelPath = ed.prefix
    ? `public/${ed.prefix}/team/${sampleSlug}/index.html`
    : `public/team/${sampleSlug}/index.html`;
  const html = fs.readFileSync(path.join(ROOT_DIR, pageRelPath), "utf8");

  assert(
    html.includes(`<h2 class="text-xl font-bold mb-4">${ed.upcomingHeading}</h2>`),
    `${ed.label} renders upcoming matches heading "${ed.upcomingHeading}"`,
  );
  assert(
    html.includes("cfc-match-days"),
    `${ed.label} renders cfc-match-days container`,
  );
  assert(
    html.includes("cfc-date-group"),
    `${ed.label} groups matches by date`,
  );
}

// Intra-edition match card links check
assert(
  globalArsenalHtml.includes("href=/match/manchester-city-vs-arsenal-2026-11-06/"),
  "Global Arsenal page links to match within Global edition",
);
assert(
  ptBrFlamengoHtml.includes("href=/pt-br/match/flamengo-vs-palmeiras-2026-11-07/"),
  "PT-BR Flamengo page links to match within PT-BR edition",
);
assert(
  esArBarcelonaHtml.includes("href=/es-ar/match/real-madrid-vs-barcelona-2026-11-08/"),
  "ES-AR Barcelona page links to match within ES-AR edition",
);

// REQUIREMENT 5.6: Zero channel badges on team pages
let channelBadgesOnTeamPages = 0;
for (const ed of EDITIONS) {
  for (const slug of teamSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/team/${slug}/index.html`
      : `public/team/${slug}/index.html`;
    const html = fs.readFileSync(path.join(ROOT_DIR, pageRelPath), "utf8");
    if (html.includes("cfc-channel-badge")) {
      channelBadgesOnTeamPages++;
      console.error(`Found channel badge on team page: ${pageRelPath}`);
    }
  }
}

assert(
  channelBadgesOnTeamPages === 0,
  `Req 5.6: Zero channel badges found across all 48 team pages (found ${channelBadgesOnTeamPages})`,
);

// ============================================================================
// Test 6: Empty State When Team Has No Upcoming Matches (Req 7.4)
// ============================================================================
console.log("\n--- Test 6: Empty State for Teams with No Upcoming Matches ---");

// Test probe verifying cfcpage/match-days.html empty state with localized emptyMessage
const probeLayoutPath = path.join(
  ROOT_DIR,
  "layouts/_cfc_probe_team_empty.html",
);
const probeContentPathEn = path.join(
  ROOT_DIR,
  "content/en/_cfc_probe_team_empty.md",
);
const probeContentPathPt = path.join(
  ROOT_DIR,
  "content/pt-br/_cfc_probe_team_empty.md",
);
const probeContentPathEs = path.join(
  ROOT_DIR,
  "content/es-ar/_cfc_probe_team_empty.md",
);

try {
  fs.writeFileSync(
    probeLayoutPath,
    `{{- $emptySlugs := slice -}}
<div id="probe-team-empty">
  <h2 class="text-xl font-bold mb-4">{{ i18n "upcoming_matches" }}</h2>
  {{ partial "cfcpage/match-days.html" (dict "matches" $emptySlugs "emptyMessage" (i18n "no_upcoming_matches") "headingLevel" 3 "showLeague" true) }}
</div>`,
    "utf8",
  );

  const frontMatter = (langTitle) => `---
title: "${langTitle}"
layout: _cfc_probe_team_empty
---`;

  fs.writeFileSync(probeContentPathEn, frontMatter("Probe Empty EN"), "utf8");
  fs.writeFileSync(probeContentPathPt, frontMatter("Probe Empty PT"), "utf8");
  fs.writeFileSync(probeContentPathEs, frontMatter("Probe Empty ES"), "utf8");

  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });

  const probeEnHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/_cfc_probe_team_empty/index.html"),
    "utf8",
  );
  assert(
    probeEnHtml.includes("cfc-match-days--empty") &&
      probeEnHtml.includes("cfc-empty-state") &&
      probeEnHtml.includes("No upcoming matches scheduled."),
    'Empty upcoming matches renders localized empty state in English ("No upcoming matches scheduled.")',
  );

  const probePtHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/pt-br/_cfc_probe_team_empty/index.html"),
    "utf8",
  );
  assert(
    probePtHtml.includes("cfc-match-days--empty") &&
      probePtHtml.includes("cfc-empty-state") &&
      probePtHtml.includes("Nenhum próximo jogo agendado."),
    'Empty upcoming matches renders localized empty state in Portuguese ("Nenhum próximo jogo agendado.")',
  );

  const probeEsHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/es-ar/_cfc_probe_team_empty/index.html"),
    "utf8",
  );
  assert(
    probeEsHtml.includes("cfc-match-days--empty") &&
      probeEsHtml.includes("cfc-empty-state") &&
      probeEsHtml.includes("No hay próximos partidos programados."),
    'Empty upcoming matches renders localized empty state in Spanish ("No hay próximos partidos programados.")',
  );
} finally {
  if (fs.existsSync(probeLayoutPath)) fs.unlinkSync(probeLayoutPath);
  if (fs.existsSync(probeContentPathEn)) fs.unlinkSync(probeContentPathEn);
  if (fs.existsSync(probeContentPathPt)) fs.unlinkSync(probeContentPathPt);
  if (fs.existsSync(probeContentPathEs)) fs.unlinkSync(probeContentPathEs);

  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });
}

// ============================================================================
// Test 7: Recent Results Section (Req 7.2)
// ============================================================================
console.log("\n--- Test 7: Recent Results Section ---");

// Arsenal and Chelsea played a finished match in sample data: arsenal-vs-chelsea-2026-11-06 (2 - 1)
assert(
  globalArsenalHtml.includes('<h2 class="text-xl font-bold mt-8 mb-4">Recent Results</h2>'),
  "Global Arsenal page renders Recent Results heading",
);
assert(
  globalArsenalHtml.includes("cfc-match-card--finished"),
  "Recent results renders finished match card",
);
assert(
  globalArsenalHtml.includes("2 - 1"),
  "Recent results displays finished score 2 - 1",
);
assert(
  globalArsenalHtml.includes("cfc-match-card__badge--finished") &&
    globalArsenalHtml.includes("FT"),
  "Recent results displays FT finished badge",
);

// Portuguese check on Chelsea page
const ptBrChelseaHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/pt-br/team/chelsea/index.html"),
  "utf8",
);
assert(
  ptBrChelseaHtml.includes('<h2 class="text-xl font-bold mt-8 mb-4">Resultados recentes</h2>'),
  "PT-BR Chelsea page renders localized Recent Results heading",
);
assert(
  ptBrChelseaHtml.includes("2 - 1"),
  "PT-BR Chelsea page displays score 2 - 1",
);

// Teams with 0 finished matches should NOT render recent results section
assert(
  !ptBrFlamengoHtml.includes("Resultados recentes"),
  "Team with no finished matches (Flamengo) does NOT render Recent Results heading",
);
assert(
  !esArBarcelonaHtml.includes("Resultados recientes"),
  "Team with no finished matches (Barcelona) does NOT render Recent Results heading",
);

// ============================================================================
// Test 8: Participating League Links (Req 7.3, 10.3, 10.5)
// ============================================================================
console.log("\n--- Test 8: Participating League Links ---");

// Arsenal plays in premier-league
assert(
  globalArsenalHtml.includes('<h2 class="text-base font-semibold mb-3">Leagues</h2>') &&
    globalArsenalHtml.includes('href=/league/premier-league/ class="inline-block px-3 py-1 text-sm font-medium border border-border rounded-full hover:bg-theme-light transition">Premier League</a>'),
  "Global Arsenal page links to Premier League (/league/premier-league/)",
);

// PT-BR Flamengo plays in brasileirao-serie-a
assert(
  ptBrFlamengoHtml.includes('<h2 class="text-base font-semibold mb-3">Ligas</h2>') &&
    ptBrFlamengoHtml.includes('href=/pt-br/league/brasileirao-serie-a/ class="inline-block px-3 py-1 text-sm font-medium border border-border rounded-full hover:bg-theme-light transition">Brasileirão Série A</a>'),
  "PT-BR Flamengo page links to Brasileirão Série A within PT-BR edition (/pt-br/league/brasileirao-serie-a/)",
);

// ES-AR Barcelona plays in la-liga
assert(
  esArBarcelonaHtml.includes('<h2 class="text-base font-semibold mb-3">Ligas</h2>') &&
    esArBarcelonaHtml.includes('href=/es-ar/league/la-liga/ class="inline-block px-3 py-1 text-sm font-medium border border-border rounded-full hover:bg-theme-light transition">La Liga</a>'),
  "ES-AR Barcelona page links to La Liga within ES-AR edition (/es-ar/league/la-liga/)",
);

// ============================================================================
// Test 9: Freshness Footer (Req 4.6)
// ============================================================================
console.log("\n--- Test 9: Freshness Footer ---");

assert(
  globalArsenalHtml.includes('<footer class="cfc-freshness text-xs text-muted text-center my-8">') &&
    globalArsenalHtml.includes("Data updated Thursday 5 November 2026, 06:00 UTC"),
  "Global team page displays freshness footer with UTC timestamp",
);

assert(
  ptBrFlamengoHtml.includes('<footer class="cfc-freshness text-xs text-muted text-center my-8">') &&
    ptBrFlamengoHtml.includes("Dados atualizados em quinta-feira, 5 de novembro de 2026, 03:00 horário de Brasília"),
  "PT-BR team page displays freshness footer with Brasília timezone",
);

assert(
  esArBarcelonaHtml.includes('<footer class="cfc-freshness text-xs text-muted text-center my-8">') &&
    esArBarcelonaHtml.includes("Datos actualizados jueves 5 de noviembre de 2026, 03:00 hora de Argentina"),
  "ES-AR team page displays freshness footer with Argentina timezone",
);

// ============================================================================
// Test 10: Strict Scope Enforcement (Zero Out-of-Scope Mentions)
// ============================================================================
console.log("\n--- Test 10: Strict Scope Enforcement ---");

let totalTeamHtmlChecked = 0;
let outOfScopeTeamCount = 0;

for (const ed of EDITIONS) {
  for (const slug of teamSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/team/${slug}/index.html`
      : `public/team/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    if (fs.existsSync(fullPath)) {
      totalTeamHtmlChecked++;
      const html = fs.readFileSync(fullPath, "utf8");
      if (html.toLowerCase().includes(outOfScopeWord)) {
        outOfScopeTeamCount++;
        console.error(`Found out-of-scope term in ${pageRelPath}`);
      }
    }
  }
}

assert(
  totalTeamHtmlChecked === 48,
  `Checked all 48 generated team HTML files for out-of-scope terms (checked ${totalTeamHtmlChecked})`,
);
assert(
  outOfScopeTeamCount === 0,
  `Zero occurrences of out-of-scope terms found across all team pages (found ${outOfScopeTeamCount})`,
);

// ============================================================================
// Test 11: Full Site Check (pnpm check)
// ============================================================================
console.log("\n--- Test 11: Full Site Check (pnpm check) ---");

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
