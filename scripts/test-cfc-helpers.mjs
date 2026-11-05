#!/usr/bin/env node

/**
 * Automated test suite for Task 4.1: Core Data Helpers
 *
 * Verifies:
 * 1. layouts/_partials/cfcdata/name.html:
 *    - Exact edition match (e.g. "pt-br")
 *    - Language subtag fallback (e.g. "pt" from "pt-br")
 *    - Base English fallback ("en")
 *    - Fallback to any available language string
 *    - Empty / nil handling (returns "")
 *    - Direct invocation with $names map containing "en"
 *    - Direct string pass-through
 *
 * 2. layouts/_partials/cfcdata/url.html:
 *    - Global edition URLs for match, team, league, leagues (all with trailing slash)
 *    - Regional edition URLs (e.g. pt-br, es-ar, en-gb) for match, team, league, leagues
 *    - Edition passed as string ("pt-br", "en", "global")
 *    - Edition passed as dict with .prefix or .code
 *    - Default to current site edition when omitted
 *    - Slug with or without trailing slash (no duplicate slashes)
 *    - Lineups are OUT OF SCOPE (unsupported kind fails)
 *    - Slug required for match, team, league
 *
 * 3. layouts/_partials/cfcdata/window.html:
 *    - Filtering by single status and multiple statuses
 *    - Filtering by from (kickoff >= from) with string and offset
 *    - Filtering by to (kickoff <= to)
 *    - Filtering by time range [from, to]
 *    - Limiting with first N (fromEnd = false / omitted)
 *    - Limiting with last N (fromEnd = true, e.g. recent finished matches)
 *    - Reverse ordering option
 *    - Dataset auto-resolution when omitted
 *    - Custom slugs passed explicitly
 *    - Empty slugs / no match cases
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const testContentPathEn = path.join(ROOT_DIR, 'content/en/_cfc_helpers_harness.md');
const testContentPathPt = path.join(ROOT_DIR, 'content/pt-br/_cfc_helpers_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_helpers_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_helpers_build');

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

function cleanupHarness() {
  if (fs.existsSync(testContentPathEn)) fs.unlinkSync(testContentPathEn);
  if (fs.existsSync(testContentPathPt)) fs.unlinkSync(testContentPathPt);
  if (fs.existsSync(testLayoutPath)) fs.unlinkSync(testLayoutPath);
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

function setupHarness(layoutContent) {
  fs.writeFileSync(
    testContentPathEn,
    `---
title: "CFC Helpers Harness EN"
layout: "_cfc_helpers_harness"
url: "/cfc-test-helpers-en.json"
---
`
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "CFC Helpers Harness PT"
layout: "_cfc_helpers_harness"
url: "/pt-br/cfc-test-helpers-pt.json"
---
`
  );

  fs.writeFileSync(testLayoutPath, layoutContent);
}

function runHugo(envVars = {}) {
  const env = { ...process.env, ...envVars };
  const cmd = `hugo -e development --ignoreCache --destination "${tempBuildDir}" 2>&1`;
  try {
    const stdout = execSync(cmd, { cwd: ROOT_DIR, env, stdio: 'pipe' });
    return { success: true, output: stdout.toString() };
  } catch (err) {
    return {
      success: false,
      output: (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + err.message,
    };
  }
}

function readOutputJson(filename) {
  const filePath = path.join(tempBuildDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Output file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function runAllTests() {
  console.log('🧪 Starting CFC Helpers (name, url, window) test suite...\n');

  try {
    // -------------------------------------------------------------
    // Test 1: name.html localized resolution and fallback chain
    // -------------------------------------------------------------
    console.log('--- Test 1: name.html fallback resolution chain ---');

    const nameHarness = `
{{ $namesFull := dict "en" "Arsenal FC" "pt" "Arsenal Portugal" "pt-br" "Arsenal Brasil" "es" "Arsenal Espanol" }}
{{ $namesSubtagOnly := dict "en" "Chelsea FC" "pt" "Chelsea Lusitano" }}
{{ $namesEnOnly := dict "en" "Liverpool FC" }}
{{ $namesNoEn := dict "es" "Real Madrid CF" "fr" "Real Madrid France" }}
{{ $namesEmpty := dict }}

{{ $res := dict
  "exactMatch" (partial "cfcdata/name.html" (dict "names" $namesFull "lang" "pt-br"))
  "exactMatchMixedCase" (partial "cfcdata/name.html" (dict "names" $namesFull "lang" "PT-BR"))
  "subtagFallback" (partial "cfcdata/name.html" (dict "names" $namesSubtagOnly "lang" "pt-br"))
  "subtagFallbackFromUnderscore" (partial "cfcdata/name.html" (dict "names" $namesSubtagOnly "lang" "pt_br"))
  "enFallback" (partial "cfcdata/name.html" (dict "names" $namesEnOnly "lang" "pt-br"))
  "anyFallback" (partial "cfcdata/name.html" (dict "names" $namesNoEn "lang" "pt-br"))
  "emptyMap" (partial "cfcdata/name.html" (dict "names" $namesEmpty "lang" "pt-br"))
  "nilNames" (partial "cfcdata/name.html" (dict "names" nil "lang" "pt-br"))
  "directMapInvocation" (partial "cfcdata/name.html" $namesFull)
  "stringDirect" (partial "cfcdata/name.html" "Direct String Value")
  "defaultLangEn" (partial "cfcdata/name.html" (dict "names" $namesFull))
}}
{{ $res | jsonify }}
`;

    setupHarness(nameHarness);
    const nameRun = runHugo();
    assert(nameRun.success, 'Hugo build succeeds with name.html tests');

    const nameDataEn = readOutputJson('cfc-test-helpers-en.json');
    const nameDataPt = readOutputJson('pt-br/cfc-test-helpers-pt.json');

    assert(nameDataEn.exactMatch === 'Arsenal Brasil', `Exact edition match resolves "Arsenal Brasil" (got "${nameDataEn.exactMatch}")`);
    assert(nameDataEn.exactMatchMixedCase === 'Arsenal Brasil', `Mixed case edition "PT-BR" normalizes to exact match (got "${nameDataEn.exactMatchMixedCase}")`);
    assert(nameDataEn.subtagFallback === 'Chelsea Lusitano', `Subtag fallback resolves "Chelsea Lusitano" (got "${nameDataEn.subtagFallback}")`);
    assert(nameDataEn.subtagFallbackFromUnderscore === 'Chelsea Lusitano', `Underscore lang "pt_br" extracts subtag "pt" (got "${nameDataEn.subtagFallbackFromUnderscore}")`);
    assert(nameDataEn.enFallback === 'Liverpool FC', `English fallback resolves "Liverpool FC" (got "${nameDataEn.enFallback}")`);
    assert(nameDataEn.anyFallback === 'Real Madrid CF' || nameDataEn.anyFallback === 'Real Madrid France', `Any non-empty language fallback resolves (got "${nameDataEn.anyFallback}")`);
    assert(nameDataEn.emptyMap === '', `Empty names map returns "" (got "${nameDataEn.emptyMap}")`);
    assert(nameDataEn.nilNames === '', `Nil names returns "" (got "${nameDataEn.nilNames}")`);
    assert(nameDataEn.stringDirect === 'Direct String Value', `String passed directly returns unchanged (got "${nameDataEn.stringDirect}")`);

    // In EN site, default lang is en:
    assert(nameDataEn.defaultLangEn === 'Arsenal FC', `Default lang on EN site resolves base English "Arsenal FC" (got "${nameDataEn.defaultLangEn}")`);
    assert(nameDataEn.directMapInvocation === 'Arsenal FC', `Direct map invocation on EN site resolves "Arsenal FC" (got "${nameDataEn.directMapInvocation}")`);

    // In PT-BR site, default lang is pt-br:
    assert(nameDataPt.defaultLangEn === 'Arsenal Brasil', `Default lang on PT-BR site resolves "Arsenal Brasil" (got "${nameDataPt.defaultLangEn}")`);
    assert(nameDataPt.directMapInvocation === 'Arsenal Brasil', `Direct map invocation on PT-BR site resolves "Arsenal Brasil" (got "${nameDataPt.directMapInvocation}")`);

    // -------------------------------------------------------------
    // Test 2: url.html canonical URL generation
    // -------------------------------------------------------------
    console.log('\n--- Test 2: url.html canonical URL generation ---');

    const urlHarness = `
{{ $edPtDict := dict "prefix" "/pt-br/" }}
{{ $edEnDict := dict "prefix" "/" }}
{{ $edEsCodeDict := dict "code" "es-ar" }}

{{ $res := dict
  "globalMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "arsenal-vs-chelsea-2026-11-06" "edition" "en"))
  "globalTeam" (partial "cfcdata/url.html" (dict "kind" "team" "slug" "arsenal" "edition" "en"))
  "globalLeague" (partial "cfcdata/url.html" (dict "kind" "league" "slug" "premier-league" "edition" "en"))
  "globalLeagues" (partial "cfcdata/url.html" (dict "kind" "leagues" "edition" "en"))

  "regionalMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "arsenal-vs-chelsea-2026-11-06" "edition" "pt-br"))
  "regionalTeam" (partial "cfcdata/url.html" (dict "kind" "team" "slug" "arsenal" "edition" "pt-br"))
  "regionalLeague" (partial "cfcdata/url.html" (dict "kind" "league" "slug" "premier-league" "edition" "pt-br"))
  "regionalLeagues" (partial "cfcdata/url.html" (dict "kind" "leagues" "edition" "pt-br"))

  "slugWithTrailingSlash" (partial "cfcdata/url.html" (dict "kind" "team" "slug" "arsenal/" "edition" "pt-br"))
  "slugWithLeadingSlash" (partial "cfcdata/url.html" (dict "kind" "team" "slug" "/arsenal" "edition" "pt-br"))

  "dictPtMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "m-1" "edition" $edPtDict))
  "dictEnMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "m-1" "edition" $edEnDict))
  "dictEsCodeMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "m-1" "edition" $edEsCodeDict))

  "defaultCurrentMatch" (partial "cfcdata/url.html" (dict "kind" "match" "slug" "arsenal-vs-chelsea-2026-11-06"))
  "defaultCurrentTeam" (partial "cfcdata/url.html" (dict "kind" "team" "slug" "arsenal"))
  "defaultCurrentLeague" (partial "cfcdata/url.html" (dict "kind" "league" "slug" "premier-league"))
  "defaultCurrentLeagues" (partial "cfcdata/url.html" (dict "kind" "leagues"))
}}
{{ $res | jsonify }}
`;

    setupHarness(urlHarness);
    const urlRun = runHugo();
    assert(urlRun.success, 'Hugo build succeeds with url.html tests');

    const urlDataEn = readOutputJson('cfc-test-helpers-en.json');
    const urlDataPt = readOutputJson('pt-br/cfc-test-helpers-pt.json');

    // Global checks
    assert(urlDataEn.globalMatch === '/match/arsenal-vs-chelsea-2026-11-06/', `Global match URL: "/match/arsenal-vs-chelsea-2026-11-06/" (got "${urlDataEn.globalMatch}")`);
    assert(urlDataEn.globalTeam === '/team/arsenal/', `Global team URL: "/team/arsenal/" (got "${urlDataEn.globalTeam}")`);
    assert(urlDataEn.globalLeague === '/league/premier-league/', `Global league URL: "/league/premier-league/" (got "${urlDataEn.globalLeague}")`);
    assert(urlDataEn.globalLeagues === '/league/', `Global leagues directory URL: "/league/" (got "${urlDataEn.globalLeagues}")`);

    // Regional checks (explicit edition string "pt-br")
    assert(urlDataEn.regionalMatch === '/pt-br/match/arsenal-vs-chelsea-2026-11-06/', `Regional match URL: "/pt-br/match/arsenal-vs-chelsea-2026-11-06/" (got "${urlDataEn.regionalMatch}")`);
    assert(urlDataEn.regionalTeam === '/pt-br/team/arsenal/', `Regional team URL: "/pt-br/team/arsenal/" (got "${urlDataEn.regionalTeam}")`);
    assert(urlDataEn.regionalLeague === '/pt-br/league/premier-league/', `Regional league URL: "/pt-br/league/premier-league/" (got "${urlDataEn.regionalLeague}")`);
    assert(urlDataEn.regionalLeagues === '/pt-br/league/', `Regional leagues directory URL: "/pt-br/league/" (got "${urlDataEn.regionalLeagues}")`);

    // Slug trimming checks (no double slashes)
    assert(urlDataEn.slugWithTrailingSlash === '/pt-br/team/arsenal/', `Slug with trailing slash normalizes without duplicate slash (got "${urlDataEn.slugWithTrailingSlash}")`);
    assert(urlDataEn.slugWithLeadingSlash === '/pt-br/team/arsenal/', `Slug with leading slash normalizes without duplicate slash (got "${urlDataEn.slugWithLeadingSlash}")`);

    // Dict edition parameter
    assert(urlDataEn.dictPtMatch === '/pt-br/match/m-1/', `Dict edition parameter "/pt-br/" produces "/pt-br/match/m-1/" (got "${urlDataEn.dictPtMatch}")`);
    assert(urlDataEn.dictEnMatch === '/match/m-1/', `Dict edition parameter "/" produces "/match/m-1/" (got "${urlDataEn.dictEnMatch}")`);
    assert(urlDataEn.dictEsCodeMatch === '/es-ar/match/m-1/', `Dict edition with code "es-ar" produces "/es-ar/match/m-1/" (got "${urlDataEn.dictEsCodeMatch}")`);

    // Current edition defaults
    assert(urlDataEn.defaultCurrentMatch === '/match/arsenal-vs-chelsea-2026-11-06/', `Default on EN site is global match URL (got "${urlDataEn.defaultCurrentMatch}")`);
    assert(urlDataEn.defaultCurrentTeam === '/team/arsenal/', `Default on EN site is global team URL (got "${urlDataEn.defaultCurrentTeam}")`);
    assert(urlDataEn.defaultCurrentLeague === '/league/premier-league/', `Default on EN site is global league URL (got "${urlDataEn.defaultCurrentLeague}")`);
    assert(urlDataEn.defaultCurrentLeagues === '/league/', `Default on EN site is global leagues URL (got "${urlDataEn.defaultCurrentLeagues}")`);

    assert(urlDataPt.defaultCurrentMatch === '/pt-br/match/arsenal-vs-chelsea-2026-11-06/', `Default on PT-BR site is regional match URL (got "${urlDataPt.defaultCurrentMatch}")`);
    assert(urlDataPt.defaultCurrentTeam === '/pt-br/team/arsenal/', `Default on PT-BR site is regional team URL (got "${urlDataPt.defaultCurrentTeam}")`);
    assert(urlDataPt.defaultCurrentLeague === '/pt-br/league/premier-league/', `Default on PT-BR site is regional league URL (got "${urlDataPt.defaultCurrentLeague}")`);
    assert(urlDataPt.defaultCurrentLeagues === '/pt-br/league/', `Default on PT-BR site is regional leagues URL (got "${urlDataPt.defaultCurrentLeagues}")`);

    // Trailing slash verification for all generated URLs
    const allUrls = Object.values(urlDataEn).concat(Object.values(urlDataPt));
    const allHaveTrailingSlash = allUrls.every((u) => u.endsWith('/'));
    assert(allHaveTrailingSlash, 'All generated URLs end with a trailing slash');

    // -------------------------------------------------------------
    // Test 3: url.html error validation (out-of-scope kinds, missing slug)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: url.html error handling (lineups out of scope) ---');

    const lineupHarness = `{{ partial "cfcdata/url.html" (dict "kind" "lineup" "slug" "test-slug") }}`;
    setupHarness(lineupHarness);
    const lineupRun = runHugo();
    assert(!lineupRun.success, 'url.html fails when kind is "lineup" (lineups out of scope)');
    assert(
      lineupRun.output.includes('unsupported kind "lineup"'),
      `Error output names unsupported kind`
    );

    const missingSlugHarness = `{{ partial "cfcdata/url.html" (dict "kind" "match" "slug" "") }}`;
    setupHarness(missingSlugHarness);
    const missingSlugRun = runHugo();
    assert(!missingSlugRun.success, 'url.html fails when kind is "match" with missing slug');
    assert(
      missingSlugRun.output.includes('slug is required for kind "match"'),
      'Error output specifies slug is required'
    );

    // -------------------------------------------------------------
    // Test 4: window.html match filtering and ordering
    // -------------------------------------------------------------
    console.log('\n--- Test 4: window.html filtering and ordering ---');

    // Sample dataset match statuses:
    // 1. arsenal-vs-chelsea-2026-11-06 (finished, 15:00:00Z)
    // 2. manchester-city-vs-arsenal-2026-11-06 (halftime, 17:30:00Z)
    // 3. flamengo-vs-palmeiras-2026-11-07 (live, 19:00:00Z)
    // 4. sao-paulo-vs-flamengo-2026-11-08 (scheduled, 01:30:00Z)
    // 5. real-madrid-vs-barcelona-2026-11-08 (postponed, 14:00:00Z)
    // 6. chelsea-vs-manchester-city-2026-11-08 (suspended, 16:30:00Z)
    // 7. palmeiras-vs-sao-paulo-2026-11-09 (cancelled, 20:00:00Z)
    // 8. barcelona-vs-real-madrid-2026-11-09 (scheduled, 21:00:00Z)

    const windowHarness = `
{{ $dataset := partialCached "cfcdata/dataset.html" . "dataset" }}
{{ $customSlugs := slice "manchester-city-vs-arsenal-2026-11-06" "real-madrid-vs-barcelona-2026-11-08" "barcelona-vs-real-madrid-2026-11-09" }}

{{ $res := dict
  "allMatches" (partial "cfcdata/window.html" (dict "dataset" $dataset))
  "autoResolveDataset" (partial "cfcdata/window.html" (dict))
  "statusFinished" (partial "cfcdata/window.html" (dict "dataset" $dataset "statuses" (slice "finished")))
  "statusLiveHalftime" (partial "cfcdata/window.html" (dict "dataset" $dataset "statuses" (slice "live" "halftime")))
  "fromFilter" (partial "cfcdata/window.html" (dict "dataset" $dataset "from" "2026-11-08T00:00:00Z"))
  "fromFilterWithOffset" (partial "cfcdata/window.html" (dict "dataset" $dataset "from" "2026-11-08T03:00:00+03:00"))
  "toFilter" (partial "cfcdata/window.html" (dict "dataset" $dataset "to" "2026-11-06T23:59:59Z"))
  "rangeFilter" (partial "cfcdata/window.html" (dict "dataset" $dataset "from" "2026-11-07T00:00:00Z" "to" "2026-11-08T23:59:59Z"))
  "limitFirst3" (partial "cfcdata/window.html" (dict "dataset" $dataset "limit" 3))
  "fromEndLast3" (partial "cfcdata/window.html" (dict "dataset" $dataset "limit" 3 "fromEnd" true))
  "scheduledFromEnd" (partial "cfcdata/window.html" (dict "dataset" $dataset "statuses" (slice "scheduled") "limit" 2 "fromEnd" true))
  "customSlugsFilter" (partial "cfcdata/window.html" (dict "dataset" $dataset "slugs" $customSlugs "statuses" (slice "postponed")))
  "reverseOrder" (partial "cfcdata/window.html" (dict "dataset" $dataset "limit" 3 "reverse" true))
  "noMatchesInRange" (partial "cfcdata/window.html" (dict "dataset" $dataset "from" "2030-01-01T00:00:00Z"))
}}
{{ $res | jsonify }}
`;

    setupHarness(windowHarness);
    const windowRun = runHugo();
    assert(windowRun.success, 'Hugo build succeeds with window.html tests');

    const winData = readOutputJson('cfc-test-helpers-en.json');

    assert(winData.allMatches.length === 8, `allMatches returns 8 sample matches (got ${winData.allMatches.length})`);
    assert(winData.autoResolveDataset.length === 8, `window.html auto-resolves dataset when omitted (got ${winData.autoResolveDataset.length})`);

    // Status filter
    assert(winData.statusFinished.length === 1, `statusFinished returns 1 match (got ${winData.statusFinished.length})`);
    assert(winData.statusFinished[0] === 'arsenal-vs-chelsea-2026-11-06', `Finished match is arsenal-vs-chelsea-2026-11-06`);

    assert(winData.statusLiveHalftime.length === 2, `statusLiveHalftime returns 2 matches (got ${winData.statusLiveHalftime.length})`);
    assert(winData.statusLiveHalftime.includes('manchester-city-vs-arsenal-2026-11-06'), 'Contains halftime match');
    assert(winData.statusLiveHalftime.includes('flamengo-vs-palmeiras-2026-11-07'), 'Contains live match');

    // From / To / Range filter
    assert(winData.fromFilter.length === 5, `from "2026-11-08" returns 5 matches (got ${winData.fromFilter.length})`);
    assert(winData.fromFilterWithOffset.length === 5, `from with timezone offset "+03:00" normalizes to UTC correctly (got ${winData.fromFilterWithOffset.length})`);
    assert(winData.toFilter.length === 2, `to "2026-11-06" returns 2 matches (got ${winData.toFilter.length})`);
    assert(winData.rangeFilter.length === 4, `range 2026-11-07 to 2026-11-08 returns 4 matches (got ${winData.rangeFilter.length})`);

    // Limiting and fromEnd
    assert(winData.limitFirst3.length === 3, `limit: 3 returns first 3 matches`);
    assert(winData.limitFirst3[0] === 'arsenal-vs-chelsea-2026-11-06', `First match of limit 3 is arsenal-vs-chelsea-2026-11-06`);
    assert(winData.limitFirst3[2] === 'flamengo-vs-palmeiras-2026-11-07', `Third match of limit 3 is flamengo-vs-palmeiras-2026-11-07`);

    assert(winData.fromEndLast3.length === 3, `fromEnd: true with limit: 3 returns last 3 matches`);
    assert(winData.fromEndLast3[2] === 'barcelona-vs-real-madrid-2026-11-09', `Last match of fromEnd 3 is barcelona-vs-real-madrid-2026-11-09`);
    assert(winData.fromEndLast3[0] === 'chelsea-vs-manchester-city-2026-11-08', `First of last 3 matches is chelsea-vs-manchester-city-2026-11-08`);

    // Scheduled matches fromEnd
    assert(winData.scheduledFromEnd.length === 2, `scheduled fromEnd with limit 2 returns 2 matches (got ${winData.scheduledFromEnd.length})`);
    assert(winData.scheduledFromEnd[1] === 'barcelona-vs-real-madrid-2026-11-09', `Last scheduled match returned is barcelona-vs-real-madrid-2026-11-09`);
    assert(winData.scheduledFromEnd[0] === 'sao-paulo-vs-flamengo-2026-11-08', `First of 2 scheduled matches returned is sao-paulo-vs-flamengo-2026-11-08`);

    // Custom slugs
    assert(winData.customSlugsFilter.length === 1, `customSlugsFilter returns 1 match (got ${winData.customSlugsFilter.length})`);
    assert(winData.customSlugsFilter[0] === 'real-madrid-vs-barcelona-2026-11-08', `Custom slug correctly filtered`);

    // Reverse ordering
    assert(winData.reverseOrder.length === 3, `reverseOrder returns 3 matches`);
    assert(winData.reverseOrder[0] === 'flamengo-vs-palmeiras-2026-11-07', `Reversed first match is 3rd chronological match`);
    assert(winData.reverseOrder[2] === 'arsenal-vs-chelsea-2026-11-06', `Reversed last match is 1st chronological match`);

    // Empty results
    assert(winData.noMatchesInRange.length === 0, `Out of range returns empty array [] (got ${JSON.stringify(winData.noMatchesInRange)})`);

  } finally {
    console.log('\n🧹 Cleaning up test harness and temporary files...');
    cleanupHarness();
  }

  console.log('\n=============================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('=============================================================\n');

  if (failedTests > 0) {
    console.error('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All CFC Core Data Helper tests passed successfully!');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  cleanupHarness();
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
