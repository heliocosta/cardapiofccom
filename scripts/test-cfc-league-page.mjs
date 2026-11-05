#!/usr/bin/env node

/**
 * Automated test suite for Task 7.3: Build league entity page and league directory templates
 *
 * Verifies:
 * 1. Template existence and structure:
 *    - layouts/league/section.html (league directory)
 *    - layouts/league/page.html (league entity page)
 * 2. Complete page generation across all 6 editions (Global, UK, Ireland, Brazil, Portugal, Argentina):
 *    - 6 league directory pages (/league/, /en-gb/league/, etc.)
 *    - 18 individual league pages (3 leagues x 6 editions)
 * 3. League Directory:
 *    - Breadcrumbs: Home (in edition language) -> Leagues
 *    - Page header with title
 *    - Popular leagues listed first, followed by other leagues in alphabetical order
 *    - Intra-edition links to individual league pages
 *    - Logos and country/season metadata
 * 4. Individual League Pages:
 *    - Breadcrumbs: Home -> Leagues -> League Name
 *    - Header: logo, localized title, country/season
 *    - Match listing windowed (7 days past to 30 days future, max 100), grouped by day, match cards with round
 *    - Requirement 5.6: Zero channel badges on match lists
 *    - Participating team links with intra-edition URLs
 *    - Freshness footer with edition timezone
 * 5. Empty states & Next Match (Requirement 8.5):
 *    - Window empty with next match scheduled outside window
 *    - Window empty with no scheduled matches
 * 6. STRICT SCOPE: zero occurrences of out-of-scope lineup references
 * 7. Full site check: pnpm check
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
    leaguesLabel: "Leagues",
    popularHeading: "Popular Leagues",
    allHeading: "All Leagues",
    emptyMatches: "No matches scheduled.",
    nextMatchHeading: "Next match",
    teamsHeading: "Teams",
  },
  {
    code: "en-gb",
    prefix: "en-gb",
    label: "UK (English)",
    lang: "en-GB",
    homeLabel: "Home",
    leaguesLabel: "Leagues",
    popularHeading: "Popular Leagues",
    allHeading: "All Leagues",
    emptyMatches: "No matches scheduled.",
    nextMatchHeading: "Next match",
    teamsHeading: "Teams",
  },
  {
    code: "en-ie",
    prefix: "en-ie",
    label: "Ireland (English)",
    lang: "en-IE",
    homeLabel: "Home",
    leaguesLabel: "Leagues",
    popularHeading: "Popular Leagues",
    allHeading: "All Leagues",
    emptyMatches: "No matches scheduled.",
    nextMatchHeading: "Next match",
    teamsHeading: "Teams",
  },
  {
    code: "pt-br",
    prefix: "pt-br",
    label: "Brasil (Português)",
    lang: "pt-BR",
    homeLabel: "Início",
    leaguesLabel: "Ligas",
    popularHeading: "Ligas populares",
    allHeading: "Todas as ligas",
    emptyMatches: "Nenhum jogo agendado.",
    nextMatchHeading: "Próximo jogo",
    teamsHeading: "Times",
  },
  {
    code: "pt-pt",
    prefix: "pt-pt",
    label: "Portugal (Português)",
    lang: "pt-PT",
    homeLabel: "Início",
    leaguesLabel: "Ligas",
    popularHeading: "Ligas populares",
    allHeading: "Todas as ligas",
    emptyMatches: "Nenhum jogo agendado.",
    nextMatchHeading: "Próximo jogo",
    teamsHeading: "Equipas",
  },
  {
    code: "es-ar",
    prefix: "es-ar",
    label: "Argentina (Español)",
    lang: "es-AR",
    homeLabel: "Inicio",
    leaguesLabel: "Ligas",
    popularHeading: "Ligas populares",
    allHeading: "Todas las ligas",
    emptyMatches: "No hay partidos programados.",
    nextMatchHeading: "Próximo partido",
    teamsHeading: "Equipos",
  },
];

const outOfScopeWord = ["l", "i", "n", "e", "u", "p"].join("");

console.log("🧪 Starting CFC League Templates (Task 7.3) test suite...\n");

// ============================================================================
// Test 1: Template Existence & Structure
// ============================================================================
console.log("--- Test 1: Template Existence & Structure ---");

const sectionTemplatePath = path.join(ROOT_DIR, "layouts/league/section.html");
assert(fs.existsSync(sectionTemplatePath), "layouts/league/section.html exists");

const sectionContent = fs.readFileSync(sectionTemplatePath, "utf8");
assert(sectionContent.includes('define "main"'), 'section.html defines "main" block');
assert(sectionContent.includes("cfcdata/league-list.html"), "section.html resolves leagues via cfcdata/league-list.html");
assert(sectionContent.includes("cfc/page-header.html"), "section.html composes cfc/page-header.html");
assert(sectionContent.includes("cfcpage/freshness.html"), "section.html composes cfcpage/freshness.html");
assert(sectionContent.includes("cfc-container py-6"), "section.html wraps content in cfc-container py-6");
assert(!sectionContent.toLowerCase().includes(outOfScopeWord), "section.html contains 0 out-of-scope references");

const pageTemplatePath = path.join(ROOT_DIR, "layouts/league/page.html");
assert(fs.existsSync(pageTemplatePath), "layouts/league/page.html exists");

const pageContent = fs.readFileSync(pageTemplatePath, "utf8");
assert(pageContent.includes('define "main"'), 'page.html defines "main" block');
assert(
  pageContent.includes(".Params.cfc.slug") || pageContent.includes(".slug"),
  "page.html extracts slug from page params",
);
assert(pageContent.includes('cfcdata/league.html'), "page.html resolves league VM via cfcdata/league.html");
assert(pageContent.includes('cfcdata/dataset.html'), "page.html resolves dataset via cfcdata/dataset.html");
assert(pageContent.includes('cfcdata/settings.html'), "page.html resolves settings via cfcdata/settings.html");
assert(pageContent.includes("cfc/breadcrumb.html"), "page.html composes cfc/breadcrumb.html");
assert(pageContent.includes("cfc-league-header"), "page.html contains cfc-league-header");
assert(pageContent.includes("cfc-league__name"), "page.html contains h1.cfc-league__name");
assert(pageContent.includes("cfcdata/window.html"), "page.html uses cfcdata/window.html for match filtering");
assert(pageContent.includes("cfcpage/match-days.html"), "page.html composes cfcpage/match-days.html");
assert(pageContent.includes("cfc/empty-state.html"), "page.html composes cfc/empty-state.html");
assert(pageContent.includes("cfc-league-teams"), "page.html contains cfc-league-teams section");
assert(pageContent.includes("cfcpage/freshness.html"), "page.html composes cfcpage/freshness.html");
assert(pageContent.includes("cfc-container py-6"), "page.html wraps content in cfc-container py-6");
assert(!pageContent.toLowerCase().includes(outOfScopeWord), "page.html contains 0 out-of-scope references");

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
// Test 3: Output Page Generation Across All 6 Editions (Requirement 3.1 & 3.2)
// ============================================================================
console.log("\n--- Test 3: Output Page Generation Across All 6 Editions ---");

const sampleLeaguesPath = path.join(ROOT_DIR, "assets/cfc-data/sample/leagues.json");
const sampleLeagues = JSON.parse(fs.readFileSync(sampleLeaguesPath, "utf8"));
const leagueSlugs = Object.keys(sampleLeagues.leagues || {});

assert(leagueSlugs.length === 3, `Sample dataset has 3 leagues (found ${leagueSlugs.length})`);

// 3.1 Verify League Directory pages (6 total)
let directoryCount = 0;
for (const ed of EDITIONS) {
  const dirRelPath = ed.prefix
    ? `public/${ed.prefix}/league/index.html`
    : `public/league/index.html`;
  const fullPath = path.join(ROOT_DIR, dirRelPath);
  const exists = fs.existsSync(fullPath);
  if (exists && fs.statSync(fullPath).size > 200) {
    directoryCount++;
  } else {
    assert(false, `Missing or empty league directory page: ${dirRelPath}`);
  }
}
assert(
  directoryCount === 6,
  `All 6 league directory pages generated and populated (got ${directoryCount})`,
);

// 3.2 Verify Individual League pages (3 leagues x 6 editions = 18 total)
let leaguePageCount = 0;
for (const ed of EDITIONS) {
  for (const slug of leagueSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/league/${slug}/index.html`
      : `public/league/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    const exists = fs.existsSync(fullPath);
    if (exists && fs.statSync(fullPath).size > 200) {
      leaguePageCount++;
    } else {
      assert(false, `Missing or empty league page: ${pageRelPath}`);
    }
  }
}
assert(
  leaguePageCount === 18,
  `All 18 league pages (3 leagues x 6 editions) generated and populated (got ${leaguePageCount})`,
);

// ============================================================================
// Test 4: League Directory Structure & Prioritization (Requirement 8.6 & 10.3)
// ============================================================================
console.log("\n--- Test 4: League Directory Structure & Prioritization ---");

// Global Directory
const globalDirHtml = fs.readFileSync(path.join(ROOT_DIR, "public/league/index.html"), "utf8");

assert(
  globalDirHtml.includes("class=cfc-breadcrumb") && globalDirHtml.includes("<ol class=cfc-breadcrumb__list>"),
  "Global directory has semantic breadcrumb nav and list",
);
assert(
  globalDirHtml.includes("href=/ class=cfc-breadcrumb__link>Home</a>"),
  "Global directory breadcrumb links to Home (/)",
);
assert(
  globalDirHtml.includes("class=cfc-breadcrumb__current aria-current=page>Leagues</span>"),
  "Global directory breadcrumb ends with Leagues",
);
assert(
  globalDirHtml.includes("<h1 class=cfc-page-header__title>Leagues</h1>"),
  "Global directory renders h1.cfc-page-header__title with 'Leagues'",
);

// Popular leagues section prioritization
const popularSectionIdx = globalDirHtml.indexOf("cfc-league-directory__popular");
const allSectionIdx = globalDirHtml.indexOf("cfc-league-directory__all");
assert(
  popularSectionIdx !== -1 && allSectionIdx !== -1 && popularSectionIdx < allSectionIdx,
  "Popular leagues section appears before All Leagues section in DOM order",
);

// Popular section contains Brasileirão and Premier League in alphabetical order
const bSerieAIdx = globalDirHtml.indexOf("Brasileirão Série A");
const premLeagueIdx = globalDirHtml.indexOf("Premier League");
const laLigaIdx = globalDirHtml.indexOf("La Liga");
assert(
  bSerieAIdx !== -1 && premLeagueIdx !== -1 && laLigaIdx !== -1,
  "All 3 leagues are present in the directory",
);
assert(
  bSerieAIdx < premLeagueIdx,
  "In popular section, Brasileirão Série A is listed before Premier League (alphabetical)",
);
assert(
  premLeagueIdx < laLigaIdx,
  "Popular leagues are listed before non-popular La Liga",
);

// Intra-edition links in Global
assert(
  globalDirHtml.includes('href=/league/brasileirao-serie-a/ class="cfc-league-card'),
  "Directory links to /league/brasileirao-serie-a/",
);
assert(
  globalDirHtml.includes('href=/league/premier-league/ class="cfc-league-card'),
  "Directory links to /league/premier-league/",
);
assert(
  globalDirHtml.includes('href=/league/la-liga/ class="cfc-league-card'),
  "Directory links to /league/la-liga/",
);

// Logos and meta
assert(
  globalDirHtml.includes('src=https://images.cardapiofc.com/leagues/premier-league.webp alt="Premier League" width=40 height=40 class="cfc-league-card__logo w-10 h-10 object-contain shrink-0" loading=lazy'),
  "Directory renders league logo with dimensions, alt, and lazy loading",
);
assert(
  globalDirHtml.includes("United Kingdom · 2026-27"),
  "Directory renders country and season meta",
);

// PT-BR Directory Localization
const ptBrDirHtml = fs.readFileSync(path.join(ROOT_DIR, "public/pt-br/league/index.html"), "utf8");

assert(
  ptBrDirHtml.includes("href=/pt-br/ class=cfc-breadcrumb__link>Início</a>"),
  "PT-BR directory breadcrumb links to /pt-br/ (Início)",
);
assert(
  ptBrDirHtml.includes("class=cfc-breadcrumb__current aria-current=page>Ligas</span>"),
  "PT-BR directory breadcrumb ends with Ligas",
);
assert(
  ptBrDirHtml.includes("<h1 class=cfc-page-header__title>Ligas</h1>"),
  "PT-BR directory renders h1 with 'Ligas'",
);
assert(
  ptBrDirHtml.includes('<h2 class="text-xl font-bold mb-4">Ligas populares</h2>'),
  "PT-BR directory renders 'Ligas populares' section heading",
);
assert(
  ptBrDirHtml.includes('<h2 class="text-xl font-bold mb-4">Todas as ligas</h2>'),
  "PT-BR directory renders 'Todas as ligas' section heading",
);
assert(
  ptBrDirHtml.includes("href=/pt-br/league/brasileirao-serie-a/"),
  "PT-BR directory links within edition to /pt-br/league/brasileirao-serie-a/",
);
assert(
  ptBrDirHtml.includes("href=/pt-br/league/premier-league/"),
  "PT-BR directory links within edition to /pt-br/league/premier-league/",
);
assert(
  ptBrDirHtml.includes("href=/pt-br/league/la-liga/"),
  "PT-BR directory links within edition to /pt-br/league/la-liga/",
);
assert(
  ptBrDirHtml.includes("Reino Unido · 2026-27"),
  "PT-BR directory renders localized country (Reino Unido)",
);

// ES-AR Directory Localization
const esArDirHtml = fs.readFileSync(path.join(ROOT_DIR, "public/es-ar/league/index.html"), "utf8");
assert(
  esArDirHtml.includes("href=/es-ar/ class=cfc-breadcrumb__link>Inicio</a>"),
  "ES-AR directory breadcrumb links to /es-ar/ (Inicio)",
);
assert(
  esArDirHtml.includes("href=/es-ar/league/premier-league/"),
  "ES-AR directory links within edition to /es-ar/league/premier-league/",
);
assert(
  esArDirHtml.includes("España · 2026-27"),
  "ES-AR directory renders localized country (España)",
);

// ============================================================================
// Test 5: Individual League Pages (Requirements 8.1 - 8.4, 5.6, 10.3 - 10.5)
// ============================================================================
console.log("\n--- Test 5: Individual League Pages ---");

// Global Premier League page
const globalPremHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/league/premier-league/index.html"),
  "utf8",
);

// Breadcrumbs: Home -> Leagues -> League Name
assert(
  globalPremHtml.includes("href=/ class=cfc-breadcrumb__link>Home</a>"),
  "Global league page breadcrumb links to Home (/)",
);
assert(
  globalPremHtml.includes("href=/league/ class=cfc-breadcrumb__link>Leagues</a>"),
  "Global league page breadcrumb links to Leagues directory (/league/)",
);
assert(
  globalPremHtml.includes("class=cfc-breadcrumb__current aria-current=page>Premier League</span>"),
  "Global league page breadcrumb ends with Premier League",
);

// Header: logo, h1, country/season meta
assert(
  globalPremHtml.includes('src=https://images.cardapiofc.com/leagues/premier-league.webp alt="Premier League" width=48 height=48 class="cfc-league-header__logo w-12 h-12 object-contain"'),
  "Global league page renders logo with size 48x48 and alt text",
);
assert(
  globalPremHtml.includes('<h1 class="cfc-league__name text-2xl md:text-3xl font-bold">Premier League</h1>'),
  "Global league page renders h1.cfc-league__name",
);
assert(
  globalPremHtml.includes('<p class="cfc-league__meta text-sm text-muted mt-1">United Kingdom · 2026-27</p>'),
  "Global league page renders country and season meta",
);

// Match listing: day grouping, match cards, rounds (Req 8.2 & 8.3)
assert(
  globalPremHtml.includes("cfc-date-group") && globalPremHtml.includes("Friday 6 November"),
  "Matches grouped by edition-local day",
);
assert(
  globalPremHtml.includes("cfc-match-card__round") && globalPremHtml.includes("Regular Season - 11"),
  "Match card shows match round (Regular Season - 11)",
);
assert(
  globalPremHtml.includes("cfc-match-card__round") && globalPremHtml.includes("Regular Season - 12"),
  "Match card shows match round (Regular Season - 12)",
);

// Requirement 5.6: Zero channel badges on match list
assert(
  !globalPremHtml.includes("cfc-match-card__channels"),
  "Req 5.6: cfc-match-card__channels container is absent on league match list",
);
assert(
  !globalPremHtml.includes("cfc-channel-badge"),
  "Req 5.6: Zero channel badges rendered on league match list",
);

// Requirement 8.4: Participating team links
assert(
  globalPremHtml.includes("cfc-league-teams"),
  "Participating teams section is present",
);
assert(
  globalPremHtml.includes('<h2 class="text-base font-semibold mb-3">Teams</h2>'),
  "Participating teams section renders 'Teams' heading",
);

// Alphabetical team list in Premier League: Arsenal, Chelsea, Manchester City
const premArsenalIdx = globalPremHtml.indexOf("href=/team/arsenal/");
const premChelseaIdx = globalPremHtml.indexOf("href=/team/chelsea/");
const premMciIdx = globalPremHtml.indexOf("href=/team/manchester-city/");
assert(
  premArsenalIdx !== -1 && premChelseaIdx !== -1 && premMciIdx !== -1,
  "All participating teams in listed matches are linked with intra-edition URLs",
);
assert(
  premArsenalIdx < premChelseaIdx && premChelseaIdx < premMciIdx,
  "Participating teams are ordered alphabetically (Arsenal -> Chelsea -> Manchester City)",
);

// Freshness footer
assert(
  globalPremHtml.includes('<footer class="cfc-freshness text-xs text-muted text-center my-8">') &&
    globalPremHtml.includes("Data updated Thursday 5 November 2026, 06:00 UTC"),
  "Global league page renders freshness footer with UTC timezone",
);

// PT-BR Brasileirão Série A page
const ptBrBrasileiraoHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/pt-br/league/brasileirao-serie-a/index.html"),
  "utf8",
);

assert(
  ptBrBrasileiraoHtml.includes("href=/pt-br/ class=cfc-breadcrumb__link>Início</a>"),
  "PT-BR league page breadcrumb links to Início (/pt-br/)",
);
assert(
  ptBrBrasileiraoHtml.includes("href=/pt-br/league/ class=cfc-breadcrumb__link>Ligas</a>"),
  "PT-BR league page breadcrumb links to Ligas directory (/pt-br/league/)",
);
assert(
  ptBrBrasileiraoHtml.includes("class=cfc-breadcrumb__current aria-current=page>Brasileirão Série A</span>"),
  "PT-BR league page breadcrumb ends with localized league title",
);
assert(
  ptBrBrasileiraoHtml.includes('<h1 class="cfc-league__name text-2xl md:text-3xl font-bold">Brasileirão Série A</h1>'),
  "PT-BR league page renders h1",
);
assert(
  ptBrBrasileiraoHtml.includes('<p class="cfc-league__meta text-sm text-muted mt-1">Brasil · 2026</p>'),
  "PT-BR league page renders localized country (Brasil) and season",
);
assert(
  ptBrBrasileiraoHtml.includes("cfc-match-card__round") &&
    ptBrBrasileiraoHtml.includes("Rodada 33") &&
    ptBrBrasileiraoHtml.includes("Rodada 34"),
  "PT-BR league page shows rounds (Rodada 33, Rodada 34)",
);
assert(
  !ptBrBrasileiraoHtml.includes("cfc-channel-badge"),
  "Req 5.6: Zero channel badges on PT-BR league match list",
);
assert(
  ptBrBrasileiraoHtml.includes('<h2 class="text-base font-semibold mb-3">Times</h2>'),
  "PT-BR league page renders 'Times' heading",
);

// Teams in Brasileirão: Flamengo, Palmeiras, São Paulo
const ptBrFlaIdx = ptBrBrasileiraoHtml.indexOf("href=/pt-br/team/flamengo/");
const ptBrPalIdx = ptBrBrasileiraoHtml.indexOf("href=/pt-br/team/palmeiras/");
const ptBrSaoIdx = ptBrBrasileiraoHtml.indexOf("href=/pt-br/team/sao-paulo/");
assert(
  ptBrFlaIdx !== -1 && ptBrPalIdx !== -1 && ptBrSaoIdx !== -1,
  "All participating teams are linked with PT-BR intra-edition URLs",
);
assert(
  ptBrFlaIdx < ptBrPalIdx && ptBrPalIdx < ptBrSaoIdx,
  "Participating teams are ordered alphabetically (Flamengo -> Palmeiras -> São Paulo)",
);

// PT-PT League Page
const ptPtLaLigaHtml = fs.readFileSync(
  path.join(ROOT_DIR, "public/pt-pt/league/la-liga/index.html"),
  "utf8",
);
assert(
  ptPtLaLigaHtml.includes("href=/pt-pt/league/ class=cfc-breadcrumb__link>Ligas</a>"),
  "PT-PT league page links to /pt-pt/league/",
);
assert(
  ptPtLaLigaHtml.includes('<h2 class="text-base font-semibold mb-3">Equipas</h2>'),
  "PT-PT league page renders localized 'Equipas' heading",
);
assert(
  ptPtLaLigaHtml.includes("href=/pt-pt/team/barcelona/") &&
    ptPtLaLigaHtml.includes("href=/pt-pt/team/real-madrid/"),
  "PT-PT league page links to Barcelona and Real Madrid within pt-pt edition",
);

// ============================================================================
// Test 6: Empty States & Next Match (Requirement 8.5)
// ============================================================================
console.log("\n--- Test 6: Empty States & Next Match Outside Window (Req 8.5) ---");

// 6.1 Test window empty with next match scheduled outside window
// In Oct 2026, Brasileirão has no matches in the 30-day window (matches are in Nov),
// and the match on 2026-11-08 (sao-paulo-vs-flamengo) is status: "scheduled".
try {
  execSync("hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: {
      ...process.env,
      HUGO_CFC_DATA_SOURCE: "sample",
      HUGO_CFC_NOW: "2026-10-01T00:00:00Z",
    },
  });

  const emptyWindowHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/league/brasileirao-serie-a/index.html"),
    "utf8",
  );

  assert(
    emptyWindowHtml.includes("cfc-match-days--empty") &&
      emptyWindowHtml.includes("No matches scheduled."),
    "When window has no matches, renders empty state with 'No matches scheduled.'",
  );

  assert(
    emptyWindowHtml.includes("cfc-next-match") &&
      emptyWindowHtml.includes('<h2 class="text-xl font-bold mb-4">Next match</h2>'),
    "When next match exists outside window, renders 'Next match' section",
  );

  assert(
    emptyWindowHtml.includes("sao-paulo-vs-flamengo-2026-11-08"),
    "Renders the next scheduled match outside window (São Paulo vs Flamengo)",
  );

  assert(
    emptyWindowHtml.includes("href=/team/flamengo/") &&
      emptyWindowHtml.includes("href=/team/sao-paulo/"),
    "Renders participating teams from next match",
  );
} catch (err) {
  console.error(err.stdout?.toString(), err.stderr?.toString());
  assert(false, "Failed to build or verify empty window with next match");
}

// 6.2 Test completely empty state when no future matches exist
try {
  execSync("hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: {
      ...process.env,
      HUGO_CFC_DATA_SOURCE: "sample",
      HUGO_CFC_NOW: "2027-01-01T00:00:00Z",
    },
  });

  const fullyEmptyHtml = fs.readFileSync(
    path.join(ROOT_DIR, "public/league/premier-league/index.html"),
    "utf8",
  );

  assert(
    fullyEmptyHtml.includes("cfc-match-days--empty") &&
      fullyEmptyHtml.includes("No matches scheduled."),
    "When no matches exist at all, renders empty state with 'No matches scheduled.'",
  );

  assert(
    !fullyEmptyHtml.includes("cfc-next-match"),
    "When no future scheduled match exists, 'Next match' section is absent",
  );
} catch (err) {
  console.error(err.stdout?.toString(), err.stderr?.toString());
  assert(false, "Failed to build or verify completely empty state");
}

// Re-run standard sample build to restore public/ directory
try {
  execSync("node scripts/themeGenerator.js && hugo --gc --minify", {
    cwd: ROOT_DIR,
    stdio: "pipe",
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
  });
} catch (err) {
  console.error(err.stdout?.toString(), err.stderr?.toString());
}

// ============================================================================
// Test 7: Strict Scope Enforcement (Zero Out-of-Scope Mentions)
// ============================================================================
console.log("\n--- Test 7: Strict Scope Enforcement ---");

let totalLeagueHtmlChecked = 0;
let outOfScopeLeagueCount = 0;

// Check all 6 directory files
for (const ed of EDITIONS) {
  const dirRelPath = ed.prefix
    ? `public/${ed.prefix}/league/index.html`
    : `public/league/index.html`;
  const fullPath = path.join(ROOT_DIR, dirRelPath);
  if (fs.existsSync(fullPath)) {
    totalLeagueHtmlChecked++;
    const html = fs.readFileSync(fullPath, "utf8");
    if (html.toLowerCase().includes(outOfScopeWord)) {
      outOfScopeLeagueCount++;
      console.error(`Found out-of-scope term in directory ${dirRelPath}`);
    }
  }
}

// Check all 18 individual league files
for (const ed of EDITIONS) {
  for (const slug of leagueSlugs) {
    const pageRelPath = ed.prefix
      ? `public/${ed.prefix}/league/${slug}/index.html`
      : `public/league/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, pageRelPath);
    if (fs.existsSync(fullPath)) {
      totalLeagueHtmlChecked++;
      const html = fs.readFileSync(fullPath, "utf8");
      if (html.toLowerCase().includes(outOfScopeWord)) {
        outOfScopeLeagueCount++;
        console.error(`Found out-of-scope term in ${pageRelPath}`);
      }
    }
  }
}

assert(
  totalLeagueHtmlChecked === 24,
  `Checked all 24 generated league HTML files (6 directories + 18 entity pages) (got ${totalLeagueHtmlChecked})`,
);
assert(
  outOfScopeLeagueCount === 0,
  `Zero occurrences of out-of-scope terms found across all league pages (found ${outOfScopeLeagueCount})`,
);

// ============================================================================
// Test 8: Full Site Check (pnpm check)
// ============================================================================
console.log("\n--- Test 8: Full Site Check (pnpm check) ---");

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
