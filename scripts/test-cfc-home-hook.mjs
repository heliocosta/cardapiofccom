#!/usr/bin/env node

/**
 * Automated test suite for Task 7.4: Implement home page match listing hook
 *
 * Verifies:
 * 1. Hook Slot Integration:
 *    - layouts/_partials/hooks/home-main.html exists and is the slot owner
 *    - layouts/_partials/cfc/date-group.html supports disableSort
 *    - layouts/_partials/cfcpage/match-days.html supports popularFirst
 * 2. Strict Scope Enforcement:
 *    - Zero lineup links, buttons, or references anywhere in home-main.html or rendered home pages
 * 3. Match Listing & Time Window (Req 9.1, 9.2, 9.3, 9.4):
 *    - Windowed matches rendered across all 6 editions (Global, UK, Ireland, Brazil, Portugal, Argentina)
 *    - Match cards inside container with correct headings and team crests
 *    - Dates grouped in ascending chronological day order
 *    - Popular leagues ordered before regular leagues within each day while preserving kickoff order
 *    - Requirement 5.6: Zero channel badges on home page match lists
 *    - Empty state with link to league directory when no matches in window
 *    - Truncation link to league directory when matches exceed max cap
 *    - Freshness footer at bottom of home page
 * 4. Site Invariants:
 *    - Full site check (pnpm check) passes
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
    emptyMsg: "No matches scheduled for today.",
    seeAllLeagues: "See all leagues",
    leagueDirUrl: "/league/",
    tzLabel: "UTC",
  },
  {
    code: "en-gb",
    prefix: "en-gb",
    label: "UK (English)",
    lang: "en-GB",
    emptyMsg: "No matches scheduled for today.",
    seeAllLeagues: "See all leagues",
    leagueDirUrl: "/en-gb/league/",
    tzLabel: "UK time",
  },
  {
    code: "en-ie",
    prefix: "en-ie",
    label: "Ireland (English)",
    lang: "en-IE",
    emptyMsg: "No matches scheduled for today.",
    seeAllLeagues: "See all leagues",
    leagueDirUrl: "/en-ie/league/",
    tzLabel: "Irish time",
  },
  {
    code: "pt-br",
    prefix: "pt-br",
    label: "Brasil (Português)",
    lang: "pt-BR",
    emptyMsg: "Nenhum jogo agendado para hoje.",
    seeAllLeagues: "Ver todas as ligas",
    leagueDirUrl: "/pt-br/league/",
    tzLabel: "horário de Brasília",
  },
  {
    code: "pt-pt",
    prefix: "pt-pt",
    label: "Portugal (Português)",
    lang: "pt-PT",
    emptyMsg: "Nenhum jogo agendado para hoje.",
    seeAllLeagues: "Ver todas as ligas",
    leagueDirUrl: "/pt-pt/league/",
    tzLabel: "hora de Portugal",
  },
  {
    code: "es-ar",
    prefix: "es-ar",
    label: "Argentina (Español)",
    lang: "es-AR",
    emptyMsg: "No hay partidos programados para hoy.",
    seeAllLeagues: "Ver todas las ligas",
    leagueDirUrl: "/es-ar/league/",
    tzLabel: "hora de Argentina",
  },
];

const outOfScopeWord = ["l", "i", "n", "e", "u", "p"].join("");

console.log("🧪 Starting CFC Home Hook (Task 7.4) test suite...\n");

// ============================================================================
// Test 1: File Existence & Hook Slot Setup
// ============================================================================
console.log("--- Test 1: File Existence & Hook Slot Verification ---");

const hookFile = path.join(ROOT_DIR, "layouts/_partials/hooks/home-main.html");
assert(
  fs.existsSync(hookFile),
  "layouts/_partials/hooks/home-main.html exists",
);

const homeFile = path.join(ROOT_DIR, "layouts/home.html");
assert(fs.existsSync(homeFile), "layouts/home.html exists");
const homeContent = fs.readFileSync(homeFile, "utf8");
assert(
  homeContent.includes('name" "home-main"'),
  'layouts/home.html dispatches hook slot "home-main"',
);

const dateGroupFile = path.join(
  ROOT_DIR,
  "layouts/_partials/cfc/date-group.html",
);
assert(
  fs.existsSync(dateGroupFile),
  "layouts/_partials/cfc/date-group.html exists",
);
const dateGroupContent = fs.readFileSync(dateGroupFile, "utf8");
assert(
  dateGroupContent.includes("disableSort"),
  "cfc/date-group.html supports disableSort option",
);

const matchDaysFile = path.join(
  ROOT_DIR,
  "layouts/_partials/cfcpage/match-days.html",
);
assert(
  fs.existsSync(matchDaysFile),
  "layouts/_partials/cfcpage/match-days.html exists",
);
const matchDaysContent = fs.readFileSync(matchDaysFile, "utf8");
assert(
  matchDaysContent.includes("popularFirst"),
  "cfcpage/match-days.html supports popularFirst option",
);

// ============================================================================
// Test 2: Strict Scope Enforcement (Lineups OUT OF SCOPE)
// ============================================================================
console.log("\n--- Test 2: Strict Scope Enforcement (Lineup Absence) ---");

const hookContent = fs.readFileSync(hookFile, "utf8");
// Exclude comments when checking for functional lineup references
const hookClean = hookContent.replace(
  /\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g,
  "",
);
assert(
  !hookClean.toLowerCase().includes(outOfScopeWord),
  "home-main.html has zero functional lineup references",
);

// ============================================================================
// Test 3: Standard Build with Sample Dataset
// ============================================================================
console.log(
  "\n--- Test 3: Standard Build Execution (HUGO_CFC_DATA_SOURCE=sample) ---",
);

try {
  execSync(
    "node scripts/themeGenerator.js && hugo --gc --minify --cleanDestinationDir",
    {
      cwd: ROOT_DIR,
      env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
      stdio: "pipe",
    },
  );
  assert(true, "Hugo build succeeded with sample dataset");
} catch (err) {
  assert(false, `Hugo build failed: ${err.message}`);
}

// ============================================================================
// Test 4: All 6 Home Pages Generated & Match Listing Rendered
// ============================================================================
console.log(
  "\n--- Test 4: All 6 Edition Home Pages & Match Card Verification ---",
);

const publicDir = path.join(ROOT_DIR, "public");

for (const ed of EDITIONS) {
  const homePath = path.join(publicDir, ed.prefix, "index.html");
  assert(
    fs.existsSync(homePath),
    `Home page exists for ${ed.label}: ${path.relative(ROOT_DIR, homePath)}`,
  );

  const html = fs.readFileSync(homePath, "utf8");

  // Verify language attribute
  const langMatch = html.match(
    new RegExp(`<html[^>]*\\blang=["']?${ed.lang}["']?`, "i"),
  );
  assert(
    Boolean(langMatch),
    `HTML lang attribute matches ${ed.lang} for ${ed.label}`,
  );

  // Verify match cards are rendered
  const matchCardMatches =
    html.match(/<a[^>]*class=[^>]*\bcfc-match-card\b/g) || [];
  assert(
    matchCardMatches.length >= 8,
    `Renders at least 8 match cards for ${ed.label} (found ${matchCardMatches.length})`,
  );

  // Verify date group headings are rendered
  const dateHeadingMatches =
    html.match(/<h2[^>]*class=[^>]*cfc-date-group__heading/g) || [];
  assert(
    dateHeadingMatches.length >= 3,
    `Renders date group headings for ${ed.label} (found ${dateHeadingMatches.length})`,
  );

  // Verify Requirement 5.6: Channel badges STRICTLY ABSENT on home page
  const channelBadgeMatches =
    html.match(/class=[^>]*\bcfc-channel-badge\b/g) || [];
  assert(
    channelBadgeMatches.length === 0,
    `Requirement 5.6: Zero channel badges on home page for ${ed.label} (found ${channelBadgeMatches.length})`,
  );

  // Verify freshness footer exists with edition time zone label
  const freshnessMatch = html.match(
    /class="[^"]*cfc-freshness[^"]*"|class=cfc-freshness/,
  );
  assert(
    Boolean(freshnessMatch),
    `Freshness footer present on home page for ${ed.label}`,
  );
  assert(
    html.includes(ed.tzLabel),
    `Freshness footer displays edition time zone label "${ed.tzLabel}" for ${ed.label}`,
  );

  // Strict absence of lineup references in rendered home page
  assert(
    !html.toLowerCase().includes(outOfScopeWord),
    `Rendered home page for ${ed.label} has zero lineup references`,
  );
}

// ============================================================================
// Test 5: Date Groups in Ascending Chronological Order
// ============================================================================
console.log("\n--- Test 5: Date Groups Ascending Order ---");

const globalHomeHtml = fs.readFileSync(
  path.join(publicDir, "index.html"),
  "utf8",
);
const dateHeadingRegex =
  /<h2[^>]*class=[^>]*cfc-date-group__heading[^>]*>[\s\S]*?<time[^>]*datetime=["']?([0-9]{4}-[0-9]{2}-[0-9]{2})/g;
let timeMatch;
const datesFound = [];
while ((timeMatch = dateHeadingRegex.exec(globalHomeHtml)) !== null) {
  datesFound.push(timeMatch[1]);
}

assert(
  datesFound.length >= 4,
  `Found ${datesFound.length} date groups in Global home page`,
);
let isAscending = true;
for (let i = 1; i < datesFound.length; i++) {
  if (datesFound[i] <= datesFound[i - 1]) {
    isAscending = false;
    break;
  }
}
assert(
  isAscending,
  `Date groups are ordered chronologically ascending: ${datesFound.join(", ")}`,
);

// ============================================================================
// Test 6: Popular League Ordering within Day (Req 9.3)
// ============================================================================
console.log(
  "\n--- Test 6: Popular League Matches Before Regular Leagues within Day ---",
);

// In Global edition (UTC), Sunday 2026-11-08 has:
// 1. São Paulo vs Flamengo (kickoff 01:30, Brasileirão Série A - popular: true)
// 2. Chelsea vs Manchester City (kickoff 16:30, Premier League - popular: true)
// 3. Real Madrid vs Barcelona (kickoff 14:00, La Liga - popular: false)
//
// Kickoff order would be: São Paulo (01:30) -> Real Madrid (14:00) -> Chelsea (16:30).
// Popular-first requires: [Popular: São Paulo, Chelsea] -> [Regular: Real Madrid].
// Therefore, Chelsea vs Manchester City (16:30) MUST appear BEFORE Real Madrid vs Barcelona (14:00)!

const chelseaIdx = globalHomeHtml.indexOf(
  "chelsea-vs-manchester-city-2026-11-08",
);
const realMadridIdx = globalHomeHtml.indexOf(
  "real-madrid-vs-barcelona-2026-11-08",
);
const saoPauloIdx = globalHomeHtml.indexOf("sao-paulo-vs-flamengo-2026-11-08");

assert(
  chelseaIdx !== -1,
  "Chelsea vs Man City match present in global home page",
);
assert(
  realMadridIdx !== -1,
  "Real Madrid vs Barcelona match present in global home page",
);
assert(
  saoPauloIdx !== -1,
  "São Paulo vs Flamengo match present in global home page",
);

assert(
  saoPauloIdx < chelseaIdx,
  "Kickoff order preserved within popular matches: São Paulo (01:30) precedes Chelsea (16:30)",
);
assert(
  chelseaIdx < realMadridIdx,
  "Popular match precedes regular match: Chelsea (popular, 16:30) appears BEFORE Real Madrid (regular, 14:00)",
);

// In Brazil edition (America/Sao_Paulo, UTC-3), Saturday 2026-11-07 has:
// Chelsea vs Man City (local 13:30, popular: true) and Real Madrid vs Barcelona (local 11:00, popular: false).
// Chelsea (popular) MUST appear before Real Madrid (regular).
const brazilHomeHtml = fs.readFileSync(
  path.join(publicDir, "pt-br/index.html"),
  "utf8",
);
const brChelseaIdx = brazilHomeHtml.indexOf(
  "chelsea-vs-manchester-city-2026-11-08",
);
const brRealMadridIdx = brazilHomeHtml.indexOf(
  "real-madrid-vs-barcelona-2026-11-08",
);

assert(
  brChelseaIdx < brRealMadridIdx,
  "Brazil edition: Chelsea (popular, 13:30 local) appears BEFORE Real Madrid (regular, 11:00 local)",
);

// ============================================================================
// Test 7: Empty State with League Directory Link (Req 9.4)
// ============================================================================
console.log("\n--- Test 7: Empty State when No Matches in Window ---");

const emptyTestDest = path.join(ROOT_DIR, "resources", "_test_empty_hook");
try {
  execSync(
    `hugo --environment development --destination resources/_test_empty_hook --quiet`,
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        HUGO_CFC_DATA_SOURCE: "sample",
        HUGO_CFC_NOW: "2027-01-01T00:00:00Z", // Future date outside sample window
      },
      stdio: "pipe",
    },
  );

  // Global Empty State
  const emptyGlobalHtml = fs.readFileSync(
    path.join(emptyTestDest, "index.html"),
    "utf8",
  );
  assert(
    emptyGlobalHtml.includes("cfc-empty-state"),
    "Global empty state: .cfc-empty-state container is rendered",
  );
  assert(
    emptyGlobalHtml.includes("No matches scheduled for today."),
    "Global empty state: Displays English empty message",
  );
  assert(
    emptyGlobalHtml.includes('href="/league/"'),
    "Global empty state: Action link points to /league/",
  );
  assert(
    emptyGlobalHtml.includes("See all leagues"),
    "Global empty state: Action link text is 'See all leagues'",
  );
  assert(
    emptyGlobalHtml.includes("cfc-freshness"),
    "Global empty state: Freshness footer rendered at bottom",
  );
  const emptyGlobalCards =
    emptyGlobalHtml.match(/class="[^"]*cfc-match-card[^"]*"/g) || [];
  assert(
    emptyGlobalCards.length === 0,
    "Global empty state: 0 match cards rendered",
  );

  // Brazil Empty State
  const emptyBrHtml = fs.readFileSync(
    path.join(emptyTestDest, "pt-br/index.html"),
    "utf8",
  );
  assert(
    emptyBrHtml.includes("Nenhum jogo agendado para hoje."),
    "Brazil empty state: Displays Portuguese empty message",
  );
  assert(
    emptyBrHtml.includes('href="/pt-br/league/"'),
    "Brazil empty state: Action link points to /pt-br/league/",
  );
  assert(
    emptyBrHtml.includes("Ver todas as ligas"),
    "Brazil empty state: Action link text is 'Ver todas as ligas'",
  );
} finally {
  fs.rmSync(emptyTestDest, { recursive: true, force: true });
}

// ============================================================================
// Test 8: Truncation Link when Matches Exceed Max (Req 9.2)
// ============================================================================
console.log("\n--- Test 8: Truncation Link when Matches Exceed Max ---");

const truncTestDest = path.join(ROOT_DIR, "resources", "_test_trunc_hook");
try {
  execSync(
    `hugo --environment development --destination resources/_test_trunc_hook --quiet`,
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        HUGO_CFC_DATA_SOURCE: "sample",
        HUGO_CFC_HOME_MAX: "3", // Limit to 3 matches
      },
      stdio: "pipe",
    },
  );

  // Global Truncation
  const truncGlobalHtml = fs.readFileSync(
    path.join(truncTestDest, "index.html"),
    "utf8",
  );
  const truncCards =
    truncGlobalHtml.match(/<a[^>]*class=[^>]*\bcfc-match-card\b/g) || [];
  assert(
    truncCards.length === 3,
    `Global truncation: Renders exactly 3 match cards (got ${truncCards.length})`,
  );
  assert(
    truncGlobalHtml.includes("cfc-home-more"),
    "Global truncation: .cfc-home-more container is rendered",
  );
  assert(
    truncGlobalHtml.includes('href="/league/"'),
    "Global truncation: Link points to /league/",
  );
  assert(
    truncGlobalHtml.includes("See all leagues"),
    "Global truncation: Link label is 'See all leagues'",
  );
  assert(
    truncGlobalHtml.includes("btn btn-outline-primary"),
    "Global truncation: Button has btn btn-outline-primary class",
  );
  assert(
    truncGlobalHtml.indexOf("cfc-home-more") <
      truncGlobalHtml.indexOf("cfc-freshness"),
    "Global truncation: Freshness footer is rendered after truncation link",
  );

  // Brazil Truncation
  const truncBrHtml = fs.readFileSync(
    path.join(truncTestDest, "pt-br/index.html"),
    "utf8",
  );
  assert(
    truncBrHtml.includes('href="/pt-br/league/"'),
    "Brazil truncation: Link points to /pt-br/league/",
  );
  assert(
    truncBrHtml.includes("Ver todas as ligas"),
    "Brazil truncation: Localized link label is 'Ver todas as ligas'",
  );
} finally {
  fs.rmSync(truncTestDest, { recursive: true, force: true });
}

// ============================================================================
// Test 9: Full Site Invariant Check (pnpm check)
// ============================================================================
console.log("\n--- Test 9: Full Site Invariant Check (pnpm check) ---");

try {
  // Re-build standard public directory for check-site.mjs
  execSync(
    "node scripts/themeGenerator.js && hugo --gc --minify --cleanDestinationDir",
    {
      cwd: ROOT_DIR,
      env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
      stdio: "pipe",
    },
  );

  execSync("node scripts/check-site.mjs", {
    cwd: ROOT_DIR,
    stdio: "pipe",
  });
  assert(true, "Full site check (pnpm check) passed with 0 errors");
} catch (err) {
  assert(false, `pnpm check failed: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n==================================================");
console.log(
  `Summary: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`,
);
console.log("==================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log("🎉 All home page match listing hook tests passed!");
  process.exit(0);
}
