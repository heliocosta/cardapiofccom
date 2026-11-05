#!/usr/bin/env node

/**
 * Automated test suite for Task 6.3: Match Date Grouping and Data Freshness Partials
 *
 * Verifies:
 * 1. Existence and integrity of the 2 partials in layouts/_partials/cfcpage/:
 *    - match-days.html
 *    - freshness.html
 * 2. Strict enforcement that lineups are OUT OF SCOPE:
 *    - Zero occurrences of "lineup" in layouts/_partials/cfcpage/match-days.html and freshness.html
 *    - Zero occurrences in rendered probe HTML
 * 3. MatchDays partial (`match-days.html`):
 *    - Normalizes match slugs or MatchVMs
 *    - Groups matches by edition-local day using time/group-by-day.html
 *    - Renders date group headings with <time datetime>
 *    - Renders match cards
 *    - Enforces Requirement 5.6: channel badges (cfc-channel-badge) are STRICTLY ABSENT
 *    - Honors showLeague: true (shows league) and showLeague: false (omits league)
 *    - Honors headingLevel (e.g. h2 -> h3, or h3 -> h4)
 *    - Empty state: renders cfc/empty-state when matches empty and emptyMessage provided
 *    - Empty state: returns empty string when matches empty and no emptyMessage
 * 4. Freshness partial (`freshness.html`):
 *    - Renders footer.cfc-freshness with localized text
 *    - Auto-resolves dataset.generatedAt when called with context or empty dict
 *    - Accepts explicit generatedAt or dataset dict
 *    - Localizes date and time format
 *    - Displays correct edition time zone label:
 *        - Global (en): UTC
 *        - UK (en-gb): UK time
 *        - Brazil (pt-br): horário de Brasília
 *        - Argentina (es-ar): hora de Argentina
 *    - Localizes wording:
 *        - English: "Data updated ..."
 *        - Portuguese: "Dados atualizados em ..."
 *        - Spanish: "Datos actualizados ..."
 * 5. Full site check (`pnpm check`)
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

console.log(
  "🧪 Starting CFC Match Days & Freshness Partials (Task 6.3) test suite...\n",
);

// ============================================================================
// Test 1: File Existence & Strict Lineup Scope
// ============================================================================
console.log("--- Test 1: File Existence & Strict Lineup Scope ---");

const partialFiles = [
  path.join(ROOT_DIR, "layouts/_partials/cfcpage/match-days.html"),
  path.join(ROOT_DIR, "layouts/_partials/cfcpage/freshness.html"),
];

for (const pf of partialFiles) {
  assert(fs.existsSync(pf), `Partial exists: ${path.relative(ROOT_DIR, pf)}`);
  const content = fs.readFileSync(pf, "utf8");
  assert(
    !content.toLowerCase().includes("lineup"),
    `Zero lineup references in ${path.basename(pf)}`,
  );
}

// ============================================================================
// Test 2: Setup Probe Test Site across EN, EN-GB, PT-BR, ES-AR
// ============================================================================
console.log(
  "\n--- Test 2: Probe Site Execution Across Global & Regional Editions ---",
);

const testContentPathEn = path.join(
  ROOT_DIR,
  "content/en/_cfc_days_freshness_probe.md",
);
const testContentPathGb = path.join(
  ROOT_DIR,
  "content/en-gb/_cfc_days_freshness_probe.md",
);
const testContentPathPt = path.join(
  ROOT_DIR,
  "content/pt-br/_cfc_days_freshness_probe.md",
);
const testContentPathEs = path.join(
  ROOT_DIR,
  "content/es-ar/_cfc_days_freshness_probe.md",
);
const testLayoutPath = path.join(
  ROOT_DIR,
  "layouts/_cfc_days_freshness_probe.html",
);
const tempBuildDir = path.join(
  ROOT_DIR,
  "resources",
  "_cfc_test_days_freshness_build",
);

function cleanupHarness() {
  if (fs.existsSync(testContentPathEn)) fs.unlinkSync(testContentPathEn);
  if (fs.existsSync(testContentPathGb)) fs.unlinkSync(testContentPathGb);
  if (fs.existsSync(testContentPathPt)) fs.unlinkSync(testContentPathPt);
  if (fs.existsSync(testContentPathEs)) fs.unlinkSync(testContentPathEs);
  if (fs.existsSync(testLayoutPath)) fs.unlinkSync(testLayoutPath);
  if (fs.existsSync(tempBuildDir))
    fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

const probeLayout = `
{{- $sampleSlugs := slice "arsenal-vs-chelsea-2026-11-06" "manchester-city-vs-arsenal-2026-11-06" "flamengo-vs-palmeiras-2026-11-07" "sao-paulo-vs-flamengo-2026-11-08" -}}

{{/* 1. match-days with slug slice (defaults: showLeague=true, headingLevel=2) */}}
{{- $daysSlugs := partial "cfcpage/match-days.html" $sampleSlugs -}}

{{/* 2. match-days with dict, showLeague=false */}}
{{- $daysNoLeague := partial "cfcpage/match-days.html" (dict "matches" $sampleSlugs "showLeague" false) -}}

{{/* 3. match-days with custom headingLevel = 3 */}}
{{- $daysH3 := partial "cfcpage/match-days.html" (dict "matches" $sampleSlugs "headingLevel" 3) -}}

{{/* 4. match-days with resolved MatchVMs slice */}}
{{- $vm1 := partial "cfcdata/match.html" "arsenal-vs-chelsea-2026-11-06" -}}
{{- $vm2 := partial "cfcdata/match.html" "flamengo-vs-palmeiras-2026-11-07" -}}
{{- $daysVMs := partial "cfcpage/match-days.html" (dict "matches" (slice $vm1 $vm2)) -}}

{{/* 5. match-days empty with emptyMessage and emptyAction */}}
{{- $daysEmptyWithMessage := partial "cfcpage/match-days.html" (dict "matches" slice "emptyMessage" (i18n "no_matches" | default "No matches scheduled") "emptyAction" (dict "label" "Browse leagues" "url" "/leagues/")) -}}

{{/* 6. match-days empty without emptyMessage (returns nothing) */}}
{{- $daysEmptyNoMessage := partial "cfcpage/match-days.html" (dict "matches" slice) -}}

{{/* 7. freshness with auto dataset */}}
{{- $freshnessAuto := partial "cfcpage/freshness.html" . -}}

{{/* 8. freshness with explicit generatedAt */}}
{{- $freshnessExplicit := partial "cfcpage/freshness.html" (dict "generatedAt" "2026-11-05T06:00:00Z") -}}

{{/* 9. freshness with explicit dataset dict */}}
{{- $freshnessDatasetDict := partial "cfcpage/freshness.html" (dict "dataset" (dict "generatedAt" "2026-11-05T06:00:00Z")) -}}

{{- $res := dict
  "daysSlugs" $daysSlugs
  "daysNoLeague" $daysNoLeague
  "daysH3" $daysH3
  "daysVMs" $daysVMs
  "daysEmptyWithMessage" $daysEmptyWithMessage
  "daysEmptyNoMessage" $daysEmptyNoMessage
  "freshnessAuto" $freshnessAuto
  "freshnessExplicit" $freshnessExplicit
  "freshnessDatasetDict" $freshnessDatasetDict
-}}
{{- $res | jsonify -}}
`;

try {
  cleanupHarness();

  fs.writeFileSync(
    testContentPathEn,
    `---
title: "Probe EN"
layout: "_cfc_days_freshness_probe"
url: "/cfc-probe-en.json"
---
`,
  );

  fs.writeFileSync(
    testContentPathGb,
    `---
title: "Probe GB"
layout: "_cfc_days_freshness_probe"
url: "/en-gb/cfc-probe-gb.json"
---
`,
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "Probe PT"
layout: "_cfc_days_freshness_probe"
url: "/pt-br/cfc-probe-pt.json"
---
`,
  );

  fs.writeFileSync(
    testContentPathEs,
    `---
title: "Probe ES"
layout: "_cfc_days_freshness_probe"
url: "/es-ar/cfc-probe-es.json"
---
`,
  );

  fs.writeFileSync(testLayoutPath, probeLayout);

  const hugoCmd = `hugo -e development --ignoreCache --destination "${tempBuildDir}" 2>&1`;
  execSync(hugoCmd, {
    cwd: ROOT_DIR,
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: "sample" },
    encoding: "utf8",
  });

  const outEnPath = path.join(tempBuildDir, "cfc-probe-en.json");
  const outGbPath = path.join(tempBuildDir, "en-gb/cfc-probe-gb.json");
  const outPtPath = path.join(tempBuildDir, "pt-br/cfc-probe-pt.json");
  const outEsPath = path.join(tempBuildDir, "es-ar/cfc-probe-es.json");

  assert(fs.existsSync(outEnPath), "Probe EN output generated");
  assert(fs.existsSync(outGbPath), "Probe GB output generated");
  assert(fs.existsSync(outPtPath), "Probe PT output generated");
  assert(fs.existsSync(outEsPath), "Probe ES output generated");

  const enData = JSON.parse(fs.readFileSync(outEnPath, "utf8"));
  const gbData = JSON.parse(fs.readFileSync(outGbPath, "utf8"));
  const ptData = JSON.parse(fs.readFileSync(outPtPath, "utf8"));
  const esData = JSON.parse(fs.readFileSync(outEsPath, "utf8"));

  // ============================================================================
  // Test 3: MatchDays Rendering, Date Grouping & Requirement 5.6
  // ============================================================================
  console.log("\n--- Test 3: MatchDays Grouping, Layout & Requirement 5.6 ---");

  // Container classes
  assert(
    enData.daysSlugs.includes("cfc-match-days space-y-6 my-6"),
    "Renders cfc-match-days container with space-y-6 my-6",
  );
  assert(
    enData.daysSlugs.includes("cfc-date-group"),
    "Renders cfc-date-group elements",
  );
  assert(
    enData.daysSlugs.includes("cfc-date-group__heading"),
    "Renders date group headings",
  );
  assert(
    enData.daysSlugs.includes("<time datetime="),
    "Renders <time datetime> in date headings",
  );

  // Day groupings across dates
  assert(
    enData.daysSlugs.includes("date-group-2026-11-06"),
    "Groups matches on 2026-11-06",
  );
  assert(
    enData.daysSlugs.includes("date-group-2026-11-07"),
    "Groups matches on 2026-11-07",
  );
  assert(enData.daysSlugs.includes("cfc-match-card"), "Renders match cards");

  // CRITICAL REQUIREMENT 5.6: Channel badges strictly absent
  assert(
    !enData.daysSlugs.includes("cfc-channel-badge"),
    "CRITICAL Req 5.6: Zero cfc-channel-badge in match list",
  );
  assert(
    !enData.daysSlugs.includes("cfc-match-card__channels"),
    "CRITICAL Req 5.6: Zero cfc-match-card__channels container",
  );
  assert(
    !gbData.daysSlugs.includes("cfc-channel-badge"),
    "Req 5.6 strictly holds in GB edition",
  );
  assert(
    !ptData.daysSlugs.includes("cfc-channel-badge"),
    "Req 5.6 strictly holds in PT-BR edition",
  );
  assert(
    !esData.daysSlugs.includes("cfc-channel-badge"),
    "Req 5.6 strictly holds in ES-AR edition",
  );

  // League display toggle (showLeague)
  assert(
    enData.daysSlugs.includes("cfc-match-card__league"),
    "Default showLeague: true displays league name",
  );
  assert(
    !enData.daysNoLeague.includes("cfc-match-card__league"),
    "Explicit showLeague: false omits cfc-match-card__league",
  );

  // Heading level customization
  assert(
    enData.daysSlugs.includes('<h2 id="date-group-'),
    'Default headingLevel: 2 produces <h2 id="date-group-',
  );
  assert(
    enData.daysSlugs.includes('<h3 class="sr-only">'),
    'Default headingLevel: 2 produces <h3 class="sr-only"> on cards',
  );
  assert(
    enData.daysH3.includes('<h3 id="date-group-'),
    'Explicit headingLevel: 3 produces <h3 id="date-group-',
  );
  assert(
    enData.daysH3.includes('<h4 class="sr-only">'),
    'Explicit headingLevel: 3 produces <h4 class="sr-only"> on cards',
  );

  // Direct MatchVM slice
  assert(
    enData.daysVMs.includes("cfc-match-card"),
    "Direct MatchVM input slice renders match cards",
  );
  assert(
    enData.daysVMs.includes("Arsenal"),
    "Direct MatchVM input renders home team",
  );
  assert(
    enData.daysVMs.includes("Chelsea"),
    "Direct MatchVM input renders away team",
  );

  // Empty state handling
  assert(
    enData.daysEmptyWithMessage.includes("cfc-match-days--empty"),
    "Empty list with message renders cfc-match-days--empty",
  );
  assert(
    enData.daysEmptyWithMessage.includes("cfc-empty-state"),
    "Empty list renders cfc-empty-state",
  );
  assert(
    enData.daysEmptyWithMessage.includes("cfc-empty-state__message"),
    "Empty list renders empty message wrapper",
  );
  assert(
    enData.daysEmptyWithMessage.includes("Browse leagues"),
    "Empty list renders action label",
  );
  assert(
    enData.daysEmptyWithMessage.includes('href="/leagues/"'),
    "Empty list renders action URL",
  );
  assert(
    enData.daysEmptyNoMessage === "",
    "Empty list without message renders empty string",
  );

  // ============================================================================
  // Test 4: Freshness Partial Formatting, Timezones & Localization
  // ============================================================================
  console.log("\n--- Test 4: Freshness Partial Rendering & Localization ---");

  // Markup structure
  assert(
    enData.freshnessAuto.includes(
      '<footer class="cfc-freshness text-xs text-muted text-center my-8">',
    ),
    "Renders footer with class cfc-freshness",
  );
  assert(
    enData.freshnessAuto.includes("<p>"),
    "Renders paragraph with updated text",
  );

  // Global EN edition (UTC)
  assert(
    enData.freshnessAuto.includes("Data updated"),
    'EN renders "Data updated"',
  );
  assert(enData.freshnessAuto.includes("UTC"), "EN renders UTC timezone");

  // UK edition (Europe/London: UK time)
  assert(
    gbData.freshnessAuto.includes("Data updated"),
    'EN-GB renders "Data updated"',
  );
  assert(
    gbData.freshnessAuto.includes("UK time"),
    "EN-GB renders UK time timezone",
  );

  // Brazil edition (America/Sao_Paulo: horário de Brasília)
  assert(
    ptData.freshnessAuto.includes("Dados atualizados em"),
    'PT-BR renders "Dados atualizados em"',
  );
  assert(
    ptData.freshnessAuto.includes("horário de Brasília"),
    'PT-BR renders "horário de Brasília"',
  );

  // Argentina edition (America/Argentina/Buenos_Aires: hora de Argentina)
  assert(
    esData.freshnessAuto.includes("Datos actualizados"),
    'ES-AR renders "Datos actualizados"',
  );
  assert(
    esData.freshnessAuto.includes("hora de Argentina"),
    'ES-AR renders "hora de Argentina"',
  );

  // Explicit parameters
  assert(
    enData.freshnessExplicit.includes("Data updated"),
    "Explicit generatedAt renders updated text",
  );
  assert(
    enData.freshnessExplicit.includes("UTC"),
    "Explicit generatedAt includes timezone",
  );
  assert(
    enData.freshnessDatasetDict.includes("Data updated"),
    "Dataset dict input renders updated text",
  );

  // ============================================================================
  // Test 5: Strict Lineup Scope in Rendered Output
  // ============================================================================
  console.log("\n--- Test 5: Strict Lineup Scope in Rendered Output ---");

  const allRendered = [
    enData.daysSlugs,
    enData.daysNoLeague,
    enData.daysH3,
    enData.daysVMs,
    enData.daysEmptyWithMessage,
    enData.freshnessAuto,
    gbData.daysSlugs,
    gbData.freshnessAuto,
    ptData.daysSlugs,
    ptData.freshnessAuto,
    esData.daysSlugs,
    esData.freshnessAuto,
  ].join("\n");

  assert(
    !allRendered.toLowerCase().includes("lineup"),
    "Strict scope: rendered output contains ZERO occurrences of lineup",
  );
} catch (err) {
  console.error("Fatal probe execution error:", err);
  process.exit(1);
} finally {
  console.log("\n🧹 Cleaning up probe test harness...");
  cleanupHarness();
}

// ============================================================================
// Test 6: pnpm check verification
// ============================================================================
console.log("\n--- Test 6: Site check verification (pnpm check) ---");

try {
  const checkOutput = execSync("pnpm check", {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  const hasErrors =
    checkOutput.toLowerCase().includes("failed") ||
    checkOutput.toLowerCase().includes("error:");
  assert(!hasErrors, "pnpm check passed with 0 errors");
} catch (e) {
  assert(false, `pnpm check failed: ${e.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n=============================================================");
console.log(
  `Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`,
);
console.log("=============================================================");

if (failedTests > 0) {
  console.error("\n❌ Some tests failed.");
  process.exit(1);
} else {
  console.log("\n🎉 All CFC Match Days & Freshness tests passed successfully!");
}
