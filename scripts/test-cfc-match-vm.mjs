#!/usr/bin/env node

/**
 * Automated test suite for Task 4.2: Match View-Model Service
 *
 * Verifies:
 * 1. layouts/_partials/cfcdata/match.html:
 *    - Returns MatchVM dictionary with all fields populated from sample data
 *    - Signature support: string slug, dict with slug, optional dataset, edition, lang
 *    - Slug normalization (trim slashes/whitespace)
 * 2. Localized names in different languages:
 *    - Resolves localized names and shortNames for home team, away team, and league
 *    - Subtag fallback and language fallbacks
 *    - Resolves canonical URLs with correct edition prefix
 * 3. Compatibility with layouts/_partials/cfc/match-card.html:
 *    - Renders cleanly for scheduled, live, halftime, and finished match statuses
 *    - Supports showLeague and showChannels flags
 * 4. Nil return handling:
 *    - Returns nil when match slug does not exist in dataset
 *    - Returns nil for empty slug, nil input, or dict without slug
 * 5. Caching:
 *    - Works with partialCached "cfcdata/match.html" (dict "slug" $slug) $slug site.Language.Lang
 *    - Produces correct edition/language specific results across different languages
 *
 * Lineups are completely OUT OF SCOPE per user instruction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const testContentPathEn = path.join(ROOT_DIR, 'content/en/_cfc_match_vm_harness.md');
const testContentPathPt = path.join(ROOT_DIR, 'content/pt-br/_cfc_match_vm_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_match_vm_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_match_vm_build');

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
title: "CFC Match VM Harness EN"
layout: "_cfc_match_vm_harness"
url: "/cfc-test-match-vm-en.json"
---
`
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "CFC Match VM Harness PT"
layout: "_cfc_match_vm_harness"
url: "/pt-br/cfc-test-match-vm-pt.json"
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
  console.log('🧪 Starting CFC Match View-Model Service test suite...\n');

  try {
    // -------------------------------------------------------------
    // Test 1: MatchVM fields populated from sample data
    // -------------------------------------------------------------
    console.log('--- Test 1: MatchVM fields populated from sample data ---');

    const test1Layout = `
{{ $vmFinished := partial "cfcdata/match.html" "arsenal-vs-chelsea-2026-11-06" }}
{{ $vmDict := partial "cfcdata/match.html" (dict "slug" "arsenal-vs-chelsea-2026-11-06") }}
{{ $vmSlash := partial "cfcdata/match.html" "/arsenal-vs-chelsea-2026-11-06/" }}
{{ $vmScheduled := partial "cfcdata/match.html" "sao-paulo-vs-flamengo-2026-11-08" }}
{{ $vmPostponed := partial "cfcdata/match.html" "real-madrid-vs-barcelona-2026-11-08" }}

{{ $res := dict
  "finished" $vmFinished
  "fromDict" $vmDict
  "fromSlash" $vmSlash
  "scheduled" $vmScheduled
  "postponed" $vmPostponed
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test1Layout);
    const build1 = runHugo();
    assert(build1.success, 'Hugo build succeeds for Test 1 (MatchVM fields)');

    const data1 = readOutputJson('cfc-test-match-vm-en.json');
    const fin = data1.finished;

    // Check all fields of MatchVM
    assert(fin.kind === 'match', 'MatchVM.kind is "match"');
    assert(fin.slug === 'arsenal-vs-chelsea-2026-11-06', 'MatchVM.slug matches');
    assert(fin.uuid === 'm-arsenal-vs-chelsea-2026-11-06', 'MatchVM.uuid matches');
    assert(fin.title === 'Arsenal vs Chelsea', `MatchVM.title is "Arsenal vs Chelsea" (got "${fin.title}")`);
    assert(fin.url === '/match/arsenal-vs-chelsea-2026-11-06/', `MatchVM.url is "/match/arsenal-vs-chelsea-2026-11-06/" (got "${fin.url}")`);
    assert(fin.appPath === '/match/arsenal-vs-chelsea-2026-11-06', `MatchVM.appPath is "/match/arsenal-vs-chelsea-2026-11-06" (got "${fin.appPath}")`);
    assert(fin.kickoff === '2026-11-06T15:00:00Z', 'MatchVM.kickoff matches');
    assert(fin.status === 'finished', 'MatchVM.status is "finished"');
    assert(fin.statusShort === 'FT', 'MatchVM.statusShort is "FT"');
    assert(fin.score && fin.score.home === 2 && fin.score.away === 1, 'MatchVM.score has home=2, away=1');
    assert(fin.round === 'Regular Season - 11', 'MatchVM.round matches');
    assert(fin.venue && fin.venue.name === 'Emirates Stadium' && fin.venue.city === 'London', 'MatchVM.venue matches');

    // League dict
    assert(fin.league && fin.league.slug === 'premier-league', 'MatchVM.league.slug matches');
    assert(fin.league.name === 'Premier League', 'MatchVM.league.name matches');
    assert(fin.league.url === '/league/premier-league/', 'MatchVM.league.url matches');
    assert(fin.league.logo.includes('premier-league.webp'), 'MatchVM.league.logo matches');

    // Home dict
    assert(fin.home && fin.home.slug === 'arsenal', 'MatchVM.home.slug matches');
    assert(fin.home.name === 'Arsenal', 'MatchVM.home.name matches');
    assert(fin.home.shortName === 'ARS', 'MatchVM.home.shortName matches');
    assert(fin.home.url === '/team/arsenal/', 'MatchVM.home.url matches');
    assert(fin.home.crest.includes('arsenal.webp'), 'MatchVM.home.crest matches');

    // Away dict
    assert(fin.away && fin.away.slug === 'chelsea', 'MatchVM.away.slug matches');
    assert(fin.away.name === 'Chelsea', 'MatchVM.away.name matches');
    assert(fin.away.shortName === 'CHE', 'MatchVM.away.shortName matches');
    assert(fin.away.url === '/team/chelsea/', 'MatchVM.away.url matches');
    assert(fin.away.crest.includes('chelsea.webp'), 'MatchVM.away.crest matches');

    // Boolean flags
    assert(fin.hasLineup === true, 'MatchVM.hasLineup is true for arsenal-vs-chelsea');
    assert(fin.popular === true, 'MatchVM.popular is true for premier-league match');

    // Scheduled match checks
    const sched = data1.scheduled;
    assert(sched.status === 'scheduled', 'Scheduled match status is "scheduled"');
    assert(sched.statusShort === 'NS', 'Scheduled match statusShort is "NS"');
    assert(sched.score === null, 'Scheduled match score is null');
    assert(sched.hasLineup === false, 'Scheduled match hasLineup is false');

    // Postponed match / Popular=false checks
    const post = data1.postponed;
    assert(post.status === 'postponed', 'Postponed match status is "postponed"');
    assert(post.popular === false, 'La Liga match has popular = false');

    // Invocation signatures equivalence
    assert(JSON.stringify(data1.finished) === JSON.stringify(data1.fromDict), 'String slug invocation identical to dict "slug" invocation');
    assert(JSON.stringify(data1.finished) === JSON.stringify(data1.fromSlash), 'Slug with leading/trailing slashes normalizes identically');

    // -------------------------------------------------------------
    // Test 2: Localized names and edition URLs
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Localized names and edition URLs ---');

    const test2Layout = `
{{ $slugBarca := "real-madrid-vs-barcelona-2026-11-08" }}
{{ $slugBra := "flamengo-vs-palmeiras-2026-11-07" }}

{{/* Test explicit lang override */}}
{{ $vmEn := partial "cfcdata/match.html" (dict "slug" $slugBarca "lang" "en") }}
{{ $vmEs := partial "cfcdata/match.html" (dict "slug" $slugBarca "lang" "es") }}
{{ $vmBraEn := partial "cfcdata/match.html" (dict "slug" $slugBra "lang" "en") }}
{{ $vmBraEs := partial "cfcdata/match.html" (dict "slug" $slugBra "lang" "es") }}

{{/* Test default site edition and language */}}
{{ $vmSiteDefault := partial "cfcdata/match.html" "arsenal-vs-chelsea-2026-11-06" }}

{{/* Test custom edition parameter */}}
{{ $vmCustomEditionStr := partial "cfcdata/match.html" (dict "slug" "arsenal-vs-chelsea-2026-11-06" "edition" "pt-pt") }}
{{ $vmCustomEditionDict := partial "cfcdata/match.html" (dict "slug" "arsenal-vs-chelsea-2026-11-06" "edition" (dict "code" "es-ar" "prefix" "/es-ar/")) }}

{{ $res := dict
  "barcaEn" $vmEn
  "barcaEs" $vmEs
  "braEn" $vmBraEn
  "braEs" $vmBraEs
  "siteDefault" $vmSiteDefault
  "customEditionStr" $vmCustomEditionStr
  "customEditionDict" $vmCustomEditionDict
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test2Layout);
    const build2 = runHugo();
    assert(build2.success, 'Hugo build succeeds for Test 2 (Localized names and editions)');

    const data2En = readOutputJson('cfc-test-match-vm-en.json');
    const data2Pt = readOutputJson('pt-br/cfc-test-match-vm-pt.json');

    // Check language resolution
    assert(data2En.barcaEn.away.shortName === 'BAR', 'EN Barcelona shortName is "BAR"');
    assert(data2En.barcaEs.away.shortName === 'FCB', 'ES Barcelona shortName is "FCB"');
    assert(data2En.braEn.league.name === 'Brasileirão Série A', 'EN League name is "Brasileirão Série A"');
    assert(data2En.braEs.league.name === 'Brasileirao Serie A', 'ES League name resolves without tilde "Brasileirao Serie A"');

    // Check URLs on EN site (global)
    assert(data2En.siteDefault.url === '/match/arsenal-vs-chelsea-2026-11-06/', 'EN site produces global match URL');
    assert(data2En.siteDefault.home.url === '/team/arsenal/', 'EN site produces global home URL');
    assert(data2En.siteDefault.away.url === '/team/chelsea/', 'EN site produces global away URL');
    assert(data2En.siteDefault.league.url === '/league/premier-league/', 'EN site produces global league URL');

    // Check URLs on PT-BR site (regional prefix)
    assert(data2Pt.siteDefault.url === '/pt-br/match/arsenal-vs-chelsea-2026-11-06/', 'PT-BR site produces /pt-br/ prefixed match URL');
    assert(data2Pt.siteDefault.home.url === '/pt-br/team/arsenal/', 'PT-BR site produces /pt-br/ prefixed home URL');
    assert(data2Pt.siteDefault.away.url === '/pt-br/team/chelsea/', 'PT-BR site produces /pt-br/ prefixed away URL');
    assert(data2Pt.siteDefault.league.url === '/pt-br/league/premier-league/', 'PT-BR site produces /pt-br/ prefixed league URL');

    // Check custom edition parameter override
    assert(data2En.customEditionStr.url === '/pt-pt/match/arsenal-vs-chelsea-2026-11-06/', 'Explicit edition string "pt-pt" sets prefix');
    assert(data2En.customEditionDict.url === '/es-ar/match/arsenal-vs-chelsea-2026-11-06/', 'Explicit edition dict sets prefix');

    // -------------------------------------------------------------
    // Test 3: Compatibility with cfc/match-card.html
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Compatibility with cfc/match-card.html ---');

    const test3Layout = `
{{ $mScheduled := partial "cfcdata/match.html" "sao-paulo-vs-flamengo-2026-11-08" }}
{{ $mLive := partial "cfcdata/match.html" "flamengo-vs-palmeiras-2026-11-07" }}
{{ $mHalftime := partial "cfcdata/match.html" "manchester-city-vs-arsenal-2026-11-06" }}
{{ $mFinished := partial "cfcdata/match.html" "arsenal-vs-chelsea-2026-11-06" }}

{{ $cardScheduled := partial "cfc/match-card.html" (dict "match" $mScheduled) }}
{{ $cardLive := partial "cfc/match-card.html" (dict "match" $mLive) }}
{{ $cardHalftime := partial "cfc/match-card.html" (dict "match" $mHalftime) }}
{{ $cardFinished := partial "cfc/match-card.html" (dict "match" $mFinished) }}
{{ $cardNoLeague := partial "cfc/match-card.html" (dict "match" $mFinished "showLeague" false) }}
{{ $cardChannels := partial "cfc/match-card.html" (dict "match" $mFinished "showChannels" true) }}

{{ $res := dict
  "cardScheduled" (printf "%s" $cardScheduled)
  "cardLive" (printf "%s" $cardLive)
  "cardHalftime" (printf "%s" $cardHalftime)
  "cardFinished" (printf "%s" $cardFinished)
  "cardNoLeague" (printf "%s" $cardNoLeague)
  "cardChannels" (printf "%s" $cardChannels)
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test3Layout);
    const build3 = runHugo();
    assert(build3.success, 'Hugo build succeeds for Test 3 (match-card.html compatibility)');

    const data3 = readOutputJson('cfc-test-match-vm-en.json');

    // Scheduled card
    assert(data3.cardScheduled.includes('cfc-match-card--scheduled'), 'Scheduled card has cfc-match-card--scheduled class');
    assert(data3.cardScheduled.includes('cfc-kickoff-time'), 'Scheduled card includes kickoff time component');
    assert(data3.cardScheduled.includes('São Paulo'), 'Scheduled card contains home team name');
    assert(data3.cardScheduled.includes('Flamengo'), 'Scheduled card contains away team name');

    // Live card
    assert(data3.cardLive.includes('cfc-match-card--live'), 'Live card has cfc-match-card--live class');
    assert(data3.cardLive.includes('cfc-match-card__pulse'), 'Live card contains pulse indicator');
    assert(data3.cardLive.includes('1 - 1'), 'Live card contains current match score 1 - 1');

    // Halftime card
    assert(data3.cardHalftime.includes('cfc-match-card--halftime'), 'Halftime card has cfc-match-card--halftime class');
    assert(data3.cardHalftime.includes('1 - 0'), 'Halftime card contains current match score 1 - 0');

    // Finished card
    assert(data3.cardFinished.includes('cfc-match-card--finished'), 'Finished card has cfc-match-card--finished class');
    assert(data3.cardFinished.includes('2 - 1'), 'Finished card contains final score 2 - 1');
    assert(data3.cardFinished.includes('cfc-match-card__badge--finished'), 'Finished card contains finished badge');
    assert(data3.cardFinished.includes('Regular Season - 11'), 'Finished card contains round info');

    // Options: showLeague false
    assert(!data3.cardNoLeague.includes('cfc-match-card__league'), 'showLeague=false omits league section');

    // Options: showChannels true
    assert(data3.cardChannels.includes('cfc-match-card__channels'), 'showChannels=true includes channels container cleanly');

    // -------------------------------------------------------------
    // Test 4: Returns nil when match does not exist
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Nil return handling ---');

    const test4Layout = `
{{ $nonExistent := partial "cfcdata/match.html" "non-existent-match-slug" }}
{{ $emptyString := partial "cfcdata/match.html" "" }}
{{ $dictEmptySlug := partial "cfcdata/match.html" (dict "slug" "") }}
{{ $dictNoSlug := partial "cfcdata/match.html" (dict "foo" "bar") }}
{{ $nilInput := partial "cfcdata/match.html" nil }}

{{ $res := dict
  "nonExistentIsNil" (not $nonExistent)
  "emptyStringIsNil" (not $emptyString)
  "dictEmptySlugIsNil" (not $dictEmptySlug)
  "dictNoSlugIsNil" (not $dictNoSlug)
  "nilInputIsNil" (not $nilInput)
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test4Layout);
    const build4 = runHugo();
    assert(build4.success, 'Hugo build succeeds for Test 4 (nil handling)');

    const data4 = readOutputJson('cfc-test-match-vm-en.json');
    assert(data4.nonExistentIsNil === true, 'Non-existent match slug returns nil');
    assert(data4.emptyStringIsNil === true, 'Empty string returns nil');
    assert(data4.dictEmptySlugIsNil === true, 'Dict with empty slug returns nil');
    assert(data4.dictNoSlugIsNil === true, 'Dict without slug key returns nil');
    assert(data4.nilInputIsNil === true, 'Nil input returns nil');

    // -------------------------------------------------------------
    // Test 5: Caching with partialCached
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Caching with partialCached ---');

    const test5Layout = `
{{ $slug := "arsenal-vs-chelsea-2026-11-06" }}
{{ $cached1 := partialCached "cfcdata/match.html" (dict "slug" $slug) $slug site.Language.Lang }}
{{ $cached2 := partialCached "cfcdata/match.html" (dict "slug" $slug) $slug site.Language.Lang }}

{{ $res := dict
  "title1" $cached1.title
  "title2" $cached2.title
  "url1" $cached1.url
  "url2" $cached2.url
  "identical" (eq $cached1.url $cached2.url)
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test5Layout);
    const build5 = runHugo();
    assert(build5.success, 'Hugo build succeeds for Test 5 (partialCached)');

    const data5En = readOutputJson('cfc-test-match-vm-en.json');
    const data5Pt = readOutputJson('pt-br/cfc-test-match-vm-pt.json');

    assert(data5En.identical === true, 'Cached invocations in EN site return identical results');
    assert(data5En.url1 === '/match/arsenal-vs-chelsea-2026-11-06/', 'EN cached URL is global');

    assert(data5Pt.identical === true, 'Cached invocations in PT-BR site return identical results');
    assert(data5Pt.url1 === '/pt-br/match/arsenal-vs-chelsea-2026-11-06/', 'PT-BR cached URL has /pt-br/ prefix');

    // -------------------------------------------------------------
    // Test 6: Custom dataset support
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Custom dataset support ---');

    const test6Layout = `
{{ $customDataset := dict
  "leagues" (dict "test-league" (dict "slug" "test-league" "names" (dict "en" "Test Cup" "pt-br" "Copa Teste") "logo" "/img/cup.webp" "popular" true))
  "teams" (dict
    "team-alpha" (dict "slug" "team-alpha" "names" (dict "en" "Alpha FC" "pt-br" "Alfa FC") "shortNames" (dict "en" "ALP") "crest" "/img/alpha.webp")
    "team-beta" (dict "slug" "team-beta" "names" (dict "en" "Beta United" "pt-br" "Beta Unidos") "shortNames" (dict "en" "BET") "crest" "/img/beta.webp")
  )
  "matches" (dict
    "alpha-vs-beta-2026-12-01" (dict
      "uuid" "m-custom-01"
      "slug" "alpha-vs-beta-2026-12-01"
      "leagueSlug" "test-league"
      "homeSlug" "team-alpha"
      "awaySlug" "team-beta"
      "kickoff" "2026-12-01T20:00:00Z"
      "status" "live"
      "statusShort" "1H"
      "score" (dict "home" 3 "away" 2)
      "round" "Final"
      "venue" (dict "name" "National Arena" "city" "Capital")
      "hasLineup" false
    )
  )
}}

{{ $vmCustomEn := partial "cfcdata/match.html" (dict "slug" "alpha-vs-beta-2026-12-01" "dataset" $customDataset "lang" "en") }}
{{ $vmCustomPt := partial "cfcdata/match.html" (dict "slug" "alpha-vs-beta-2026-12-01" "dataset" $customDataset "lang" "pt-br") }}

{{ $res := dict
  "en" $vmCustomEn
  "pt" $vmCustomPt
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test6Layout);
    const build6 = runHugo();
    assert(build6.success, 'Hugo build succeeds for Test 6 (Custom dataset support)');

    const data6 = readOutputJson('cfc-test-match-vm-en.json');
    assert(data6.en.title === 'Alpha FC vs Beta United', 'Custom dataset resolves English title');
    assert(data6.pt.title === 'Alfa FC vs Beta Unidos', 'Custom dataset resolves PT-BR title');
    assert(data6.en.league.name === 'Test Cup', 'Custom dataset resolves English league');
    assert(data6.pt.league.name === 'Copa Teste', 'Custom dataset resolves PT-BR league');
    assert(data6.en.score.home === 3 && data6.en.score.away === 2, 'Custom dataset preserves score');
    assert(data6.en.venue.name === 'National Arena', 'Custom dataset preserves venue');

  } catch (err) {
    console.error('Unhandled test suite exception:', err);
    failedTests++;
  } finally {
    console.log('\n🧹 Cleaning up test harness and temporary files...');
    cleanupHarness();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('='.repeat(60) + '\n');

  if (failedTests > 0) {
    console.error(`💥 ${failedTests} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('🎉 All CFC Match View-Model Service tests passed successfully!');
    process.exit(0);
  }
}

runAllTests();
