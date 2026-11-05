#!/usr/bin/env node

/**
 * Automated test suite for Task 4.3: Team, League, and League Directory View-Model Services
 *
 * Verifies:
 * 1. layouts/_partials/cfcdata/team.html:
 *    - Returns complete TeamVM dictionary with localized names, crest, country, url, appPath, leagues, matchSlugs
 *    - Signature support: string slug, dict with slug, optional dataset, edition, lang
 *    - Slug normalization (trim slashes/whitespace)
 *    - Leagues array contains { slug, name, url } for each league in leagueSlugs
 * 2. layouts/_partials/cfcdata/league.html:
 *    - Returns complete LeagueVM dictionary with localized names, logo, country { code, name }, popular, season, url, appPath, matchSlugs
 *    - Signature support: string slug, dict with slug, optional dataset, edition, lang
 *    - Slug normalization
 * 3. Nil return handling:
 *    - Returns nil when team/league slug does not exist in dataset
 *    - Returns nil for empty string, empty slug, dict without slug, or nil input
 * 4. layouts/_partials/cfcdata/league-list.html:
 *    - Returns all leagues from dataset
 *    - Partitions into popular (popular: true) and regular (popular: false)
 *    - Sorts each partition alphabetically by localized name
 *    - Returns concatenated slice: popular leagues first, then regular leagues
 * 5. Multi-language resolution:
 *    - Resolves localized team names/shortNames (en vs pt-br vs es-ar)
 *    - Resolves localized league names and country names (en vs pt-br vs es-ar)
 * 6. Edition canonical URLs on Global vs Regional sites:
 *    - EN site (Global) produces /team/<slug>/ and /league/<slug>/
 *    - PT-BR site (Regional) produces /pt-br/team/<slug>/ and /pt-br/league/<slug>/
 *    - Explicit edition parameter override support
 * 7. Caching via partialCached:
 *    - Invocations via partialCached produce correct, cached, language-specific results
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

const testContentPathEn = path.join(ROOT_DIR, 'content/en/_cfc_team_league_vm_harness.md');
const testContentPathPt = path.join(ROOT_DIR, 'content/pt-br/_cfc_team_league_vm_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_team_league_vm_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_team_league_vm_build');

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
title: "CFC Team & League VM Harness EN"
layout: "_cfc_team_league_vm_harness"
url: "/cfc-test-team-league-vm-en.json"
---
`
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "CFC Team & League VM Harness PT"
layout: "_cfc_team_league_vm_harness"
url: "/pt-br/cfc-test-team-league-vm-pt.json"
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
  console.log('🧪 Starting CFC Team, League, and Directory View-Model Service test suite...\n');

  try {
    // -------------------------------------------------------------
    // Test 1: TeamVM fields populated from sample data (team.html)
    // -------------------------------------------------------------
    console.log('--- Test 1: TeamVM fields populated from sample data ---');

    const test1Layout = `
{{ $vmArsenal := partial "cfcdata/team.html" "arsenal" }}
{{ $vmDict := partial "cfcdata/team.html" (dict "slug" "arsenal") }}
{{ $vmSlash := partial "cfcdata/team.html" "/arsenal/" }}
{{ $vmBarca := partial "cfcdata/team.html" "barcelona" }}

{{ $res := dict
  "arsenal" $vmArsenal
  "fromDict" $vmDict
  "fromSlash" $vmSlash
  "barcelona" $vmBarca
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test1Layout);
    const build1 = runHugo();
    assert(build1.success, 'Hugo build succeeds for Test 1 (TeamVM fields)');

    const data1 = readOutputJson('cfc-test-team-league-vm-en.json');
    const ars = data1.arsenal;

    // Check all fields of TeamVM
    assert(ars.kind === 'team', 'TeamVM.kind is "team"');
    assert(ars.slug === 'arsenal', 'TeamVM.slug is "arsenal"');
    assert(ars.uuid === 't-arsenal', 'TeamVM.uuid matches');
    assert(ars.name === 'Arsenal', `TeamVM.name is "Arsenal" (got "${ars.name}")`);
    assert(ars.shortName === 'ARS', `TeamVM.shortName is "ARS" (got "${ars.shortName}")`);
    assert(ars.names && ars.names.en === 'Arsenal', 'TeamVM.names map preserved');
    assert(ars.crest.includes('arsenal.webp'), 'TeamVM.crest matches');
    assert(ars.country && ars.country.code === 'GB', 'TeamVM.country.code is "GB"');
    assert(ars.country && ars.country.name === 'GB', 'TeamVM.country.name resolves code fallback when names omitted');
    assert(ars.url === '/team/arsenal/', `TeamVM.url is "/team/arsenal/" (got "${ars.url}")`);
    assert(ars.appPath === '/team/arsenal', `TeamVM.appPath is "/team/arsenal" (got "${ars.appPath}")`);

    // Check leagues array
    assert(Array.isArray(ars.leagues) && ars.leagues.length === 1, 'TeamVM.leagues is an array with 1 item');
    assert(ars.leagues[0].slug === 'premier-league', 'TeamVM.leagues[0].slug is "premier-league"');
    assert(ars.leagues[0].name === 'Premier League', 'TeamVM.leagues[0].name is "Premier League"');
    assert(ars.leagues[0].url === '/league/premier-league/', 'TeamVM.leagues[0].url is "/league/premier-league/"');

    // Check matchSlugs array
    assert(Array.isArray(ars.matchSlugs) && ars.matchSlugs.length === 2, 'TeamVM.matchSlugs has 2 matches');
    assert(ars.matchSlugs.includes('arsenal-vs-chelsea-2026-11-06'), 'TeamVM.matchSlugs contains match 1');
    assert(ars.matchSlugs.includes('manchester-city-vs-arsenal-2026-11-06'), 'TeamVM.matchSlugs contains match 2');

    // Invocation signatures equivalence
    assert(JSON.stringify(data1.arsenal) === JSON.stringify(data1.fromDict), 'String slug invocation identical to dict "slug" invocation');
    assert(JSON.stringify(data1.arsenal) === JSON.stringify(data1.fromSlash), 'Slug with leading/trailing slashes normalizes identically');

    // Check second team (barcelona)
    const barca = data1.barcelona;
    assert(barca.slug === 'barcelona', 'Barcelona slug matches');
    assert(barca.shortName === 'BAR', 'Barcelona shortName is BAR');
    assert(barca.country.code === 'ES', 'Barcelona country is ES');

    // -------------------------------------------------------------
    // Test 2: LeagueVM fields populated from sample data (league.html)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: LeagueVM fields populated from sample data ---');

    const test2Layout = `
{{ $vmEpl := partial "cfcdata/league.html" "premier-league" }}
{{ $vmDict := partial "cfcdata/league.html" (dict "slug" "premier-league") }}
{{ $vmSlash := partial "cfcdata/league.html" "/premier-league/" }}
{{ $vmLaLiga := partial "cfcdata/league.html" "la-liga" }}

{{ $res := dict
  "epl" $vmEpl
  "fromDict" $vmDict
  "fromSlash" $vmSlash
  "laLiga" $vmLaLiga
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test2Layout);
    const build2 = runHugo();
    assert(build2.success, 'Hugo build succeeds for Test 2 (LeagueVM fields)');

    const data2 = readOutputJson('cfc-test-team-league-vm-en.json');
    const epl = data2.epl;

    // Check all fields of LeagueVM
    assert(epl.kind === 'league', 'LeagueVM.kind is "league"');
    assert(epl.slug === 'premier-league', 'LeagueVM.slug is "premier-league"');
    assert(epl.uuid === 'l-premier-league', 'LeagueVM.uuid matches');
    assert(epl.name === 'Premier League', `LeagueVM.name is "Premier League" (got "${epl.name}")`);
    assert(epl.shortName === 'EPL', `LeagueVM.shortName is "EPL" (got "${epl.shortName}")`);
    assert(epl.names && epl.names.en === 'Premier League', 'LeagueVM.names map preserved');
    assert(epl.logo.includes('premier-league.webp'), 'LeagueVM.logo matches');
    assert(epl.country && epl.country.code === 'GB', 'LeagueVM.country.code is "GB"');
    assert(epl.country && epl.country.name === 'United Kingdom', `LeagueVM.country.name is localized "United Kingdom" (got "${epl.country.name}")`);
    assert(epl.popular === true, 'LeagueVM.popular is true for Premier League');
    assert(epl.season === '2026-27', 'LeagueVM.season is "2026-27"');
    assert(epl.url === '/league/premier-league/', `LeagueVM.url is "/league/premier-league/" (got "${epl.url}")`);
    assert(epl.appPath === '/league/premier-league', `LeagueVM.appPath is "/league/premier-league" (got "${epl.appPath}")`);
    assert(Array.isArray(epl.matchSlugs) && epl.matchSlugs.length === 3, 'LeagueVM.matchSlugs has 3 matches');

    // Invocation signatures equivalence
    assert(JSON.stringify(data2.epl) === JSON.stringify(data2.fromDict), 'League string slug invocation identical to dict "slug" invocation');
    assert(JSON.stringify(data2.epl) === JSON.stringify(data2.fromSlash), 'League slug with slashes normalizes identically');

    // Regular league check (La Liga)
    const laLiga = data2.laLiga;
    assert(laLiga.popular === false, 'LeagueVM.popular is false for La Liga');
    assert(laLiga.country && laLiga.country.name === 'Spain', 'La Liga country is "Spain" in EN');

    // -------------------------------------------------------------
    // Test 3: Nil return handling for team and league
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Nil return handling ---');

    const test3Layout = `
{{ $teamNonExistent := partial "cfcdata/team.html" "non-existent-team" }}
{{ $teamEmptyString := partial "cfcdata/team.html" "" }}
{{ $teamDictEmptySlug := partial "cfcdata/team.html" (dict "slug" "") }}
{{ $teamDictNoSlug := partial "cfcdata/team.html" (dict "foo" "bar") }}
{{ $teamNilInput := partial "cfcdata/team.html" nil }}

{{ $leagueNonExistent := partial "cfcdata/league.html" "non-existent-league" }}
{{ $leagueEmptyString := partial "cfcdata/league.html" "" }}
{{ $leagueDictEmptySlug := partial "cfcdata/league.html" (dict "slug" "") }}
{{ $leagueDictNoSlug := partial "cfcdata/league.html" (dict "foo" "bar") }}
{{ $leagueNilInput := partial "cfcdata/league.html" nil }}

{{ $res := dict
  "teamNonExistentIsNil" (not $teamNonExistent)
  "teamEmptyStringIsNil" (not $teamEmptyString)
  "teamDictEmptySlugIsNil" (not $teamDictEmptySlug)
  "teamDictNoSlugIsNil" (not $teamDictNoSlug)
  "teamNilInputIsNil" (not $teamNilInput)
  "leagueNonExistentIsNil" (not $leagueNonExistent)
  "leagueEmptyStringIsNil" (not $leagueEmptyString)
  "leagueDictEmptySlugIsNil" (not $leagueDictEmptySlug)
  "leagueDictNoSlugIsNil" (not $leagueDictNoSlug)
  "leagueNilInputIsNil" (not $leagueNilInput)
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test3Layout);
    const build3 = runHugo();
    assert(build3.success, 'Hugo build succeeds for Test 3 (nil handling)');

    const data3 = readOutputJson('cfc-test-team-league-vm-en.json');
    assert(data3.teamNonExistentIsNil === true, 'team.html: non-existent slug returns nil');
    assert(data3.teamEmptyStringIsNil === true, 'team.html: empty string returns nil');
    assert(data3.teamDictEmptySlugIsNil === true, 'team.html: dict with empty slug returns nil');
    assert(data3.teamDictNoSlugIsNil === true, 'team.html: dict without slug key returns nil');
    assert(data3.teamNilInputIsNil === true, 'team.html: nil input returns nil');

    assert(data3.leagueNonExistentIsNil === true, 'league.html: non-existent slug returns nil');
    assert(data3.leagueEmptyStringIsNil === true, 'league.html: empty string returns nil');
    assert(data3.leagueDictEmptySlugIsNil === true, 'league.html: dict with empty slug returns nil');
    assert(data3.leagueDictNoSlugIsNil === true, 'league.html: dict without slug key returns nil');
    assert(data3.leagueNilInputIsNil === true, 'league.html: nil input returns nil');

    // -------------------------------------------------------------
    // Test 4: league-list.html directory order & sorting
    // -------------------------------------------------------------
    console.log('\n--- Test 4: league-list.html directory order & sorting ---');

    const test4Layout = `
{{/* Sample dataset league list */}}
{{ $sampleList := partial "cfcdata/league-list.html" . }}

{{/* Custom dataset with multiple popular and regular leagues to verify sorting */}}
{{ $customDataset := dict
  "leagues" (dict
    "z-pop" (dict "slug" "z-pop" "names" (dict "en" "Zulu Cup") "popular" true)
    "a-pop" (dict "slug" "a-pop" "names" (dict "en" "Alpha Championship") "popular" true)
    "m-pop" (dict "slug" "m-pop" "names" (dict "en" "Metro Trophy") "popular" true)
    "z-reg" (dict "slug" "z-reg" "names" (dict "en" "Zephyr League") "popular" false)
    "b-reg" (dict "slug" "b-reg" "names" (dict "en" "Beta Division") "popular" false)
  )
}}
{{ $customList := partial "cfcdata/league-list.html" (dict "dataset" $customDataset "lang" "en") }}

{{ $res := dict
  "sampleList" $sampleList
  "customList" $customList
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test4Layout);
    const build4 = runHugo();
    assert(build4.success, 'Hugo build succeeds for Test 4 (league-list)');

    const data4 = readOutputJson('cfc-test-team-league-vm-en.json');
    const sList = data4.sampleList;

    assert(Array.isArray(sList) && sList.length === 3, 'Sample league list returns 3 leagues');

    // Check popular partition comes first
    assert(sList[0].popular === true, 'First league in sample list is popular');
    assert(sList[1].popular === true, 'Second league in sample list is popular');
    assert(sList[2].popular === false, 'Third league in sample list is regular');

    // Check alphabetical sorting within partitions
    // "Brasileirão Série A" comes before "Premier League"
    assert(sList[0].name === 'Brasileirão Série A', `Popular league 1 is "Brasileirão Série A" (got "${sList[0].name}")`);
    assert(sList[1].name === 'Premier League', `Popular league 2 is "Premier League" (got "${sList[1].name}")`);
    assert(sList[2].name === 'La Liga', `Regular league 1 is "La Liga" (got "${sList[2].name}")`);

    // Verify custom dataset sorting
    const cList = data4.customList;
    assert(Array.isArray(cList) && cList.length === 5, 'Custom league list returns 5 leagues');
    // Popular: Alpha Championship, Metro Trophy, Zulu Cup
    assert(cList[0].name === 'Alpha Championship' && cList[0].popular === true, 'Custom popular 1 is Alpha Championship');
    assert(cList[1].name === 'Metro Trophy' && cList[1].popular === true, 'Custom popular 2 is Metro Trophy');
    assert(cList[2].name === 'Zulu Cup' && cList[2].popular === true, 'Custom popular 3 is Zulu Cup');
    // Regular: Beta Division, Zephyr League
    assert(cList[3].name === 'Beta Division' && cList[3].popular === false, 'Custom regular 1 is Beta Division');
    assert(cList[4].name === 'Zephyr League' && cList[4].popular === false, 'Custom regular 2 is Zephyr League');

    // -------------------------------------------------------------
    // Test 5: Multi-language resolution (en vs pt-br vs es-ar)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Multi-language resolution ---');

    const test5Layout = `
{{/* Team localized names */}}
{{ $teamEn := partial "cfcdata/team.html" (dict "slug" "barcelona" "lang" "en") }}
{{ $teamEs := partial "cfcdata/team.html" (dict "slug" "barcelona" "lang" "es") }}

{{/* League localized names */}}
{{ $leagueEn := partial "cfcdata/league.html" (dict "slug" "brasileirao-serie-a" "lang" "en") }}
{{ $leagueEs := partial "cfcdata/league.html" (dict "slug" "brasileirao-serie-a" "lang" "es") }}

{{/* League country localized names */}}
{{ $eplEn := partial "cfcdata/league.html" (dict "slug" "premier-league" "lang" "en") }}
{{ $eplPt := partial "cfcdata/league.html" (dict "slug" "premier-league" "lang" "pt-br") }}
{{ $eplEs := partial "cfcdata/league.html" (dict "slug" "premier-league" "lang" "es-ar") }}

{{ $laLigaEn := partial "cfcdata/league.html" (dict "slug" "la-liga" "lang" "en") }}
{{ $laLigaPt := partial "cfcdata/league.html" (dict "slug" "la-liga" "lang" "pt-br") }}
{{ $laLigaEs := partial "cfcdata/league.html" (dict "slug" "la-liga" "lang" "es-ar") }}

{{/* Team associated league localized name */}}
{{ $teamRealEn := partial "cfcdata/team.html" (dict "slug" "real-madrid" "lang" "en") }}
{{ $teamRealEs := partial "cfcdata/team.html" (dict "slug" "real-madrid" "lang" "es") }}

{{ $res := dict
  "teamEn" $teamEn
  "teamEs" $teamEs
  "leagueEn" $leagueEn
  "leagueEs" $leagueEs
  "eplEn" $eplEn
  "eplPt" $eplPt
  "eplEs" $eplEs
  "laLigaEn" $laLigaEn
  "laLigaPt" $laLigaPt
  "laLigaEs" $laLigaEs
  "teamRealEn" $teamRealEn
  "teamRealEs" $teamRealEs
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test5Layout);
    const build5 = runHugo();
    assert(build5.success, 'Hugo build succeeds for Test 5 (Multi-language resolution)');

    const data5 = readOutputJson('cfc-test-team-league-vm-en.json');

    // Team shortName localization
    assert(data5.teamEn.shortName === 'BAR', 'EN Barcelona shortName is "BAR"');
    assert(data5.teamEs.shortName === 'FCB', 'ES Barcelona shortName is "FCB"');

    // League name localization
    assert(data5.leagueEn.name === 'Brasileirão Série A', 'EN Brasileirão has tilde');
    assert(data5.leagueEs.name === 'Brasileirao Serie A', 'ES Brasileirao resolves without tilde');

    // League country localization (United Kingdom)
    assert(data5.eplEn.country.name === 'United Kingdom', 'EN EPL country is "United Kingdom"');
    assert(data5.eplPt.country.name === 'Reino Unido', 'PT-BR EPL country is "Reino Unido"');
    assert(data5.eplEs.country.name === 'Reino Unido', 'ES-AR EPL country is "Reino Unido"');

    // League country localization (Spain)
    assert(data5.laLigaEn.country.name === 'Spain', 'EN La Liga country is "Spain"');
    assert(data5.laLigaPt.country.name === 'Espanha', 'PT-BR La Liga country is "Espanha"');
    assert(data5.laLigaEs.country.name === 'España', 'ES-AR La Liga country is "España"');

    // Team associated league localization
    assert(data5.teamRealEn.leagues[0].name === 'La Liga', 'EN team associated league is "La Liga"');
    assert(data5.teamRealEs.leagues[0].name === 'La Liga', 'ES team associated league is "La Liga"');

    // -------------------------------------------------------------
    // Test 6: Edition canonical URLs on Global vs Regional sites
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Edition canonical URLs on Global vs Regional sites ---');

    const test6Layout = `
{{ $teamDefault := partial "cfcdata/team.html" "arsenal" }}
{{ $leagueDefault := partial "cfcdata/league.html" "premier-league" }}
{{ $listDefault := partial "cfcdata/league-list.html" . }}

{{/* Explicit edition parameter overrides */}}
{{ $teamEsArStr := partial "cfcdata/team.html" (dict "slug" "arsenal" "edition" "es-ar") }}
{{ $teamEsArDict := partial "cfcdata/team.html" (dict "slug" "arsenal" "edition" (dict "code" "es-ar" "prefix" "/es-ar/")) }}
{{ $leagueEsArStr := partial "cfcdata/league.html" (dict "slug" "premier-league" "edition" "es-ar") }}

{{ $res := dict
  "teamDefault" $teamDefault
  "leagueDefault" $leagueDefault
  "listDefault" $listDefault
  "teamEsArStr" $teamEsArStr
  "teamEsArDict" $teamEsArDict
  "leagueEsArStr" $leagueEsArStr
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test6Layout);
    const build6 = runHugo();
    assert(build6.success, 'Hugo build succeeds for Test 6 (Edition URLs)');

    const data6En = readOutputJson('cfc-test-team-league-vm-en.json');
    const data6Pt = readOutputJson('pt-br/cfc-test-team-league-vm-pt.json');

    // EN Site: Global URLs
    assert(data6En.teamDefault.url === '/team/arsenal/', 'EN site produces global team URL "/team/arsenal/"');
    assert(data6En.leagueDefault.url === '/league/premier-league/', 'EN site produces global league URL "/league/premier-league/"');
    assert(data6En.teamDefault.leagues[0].url === '/league/premier-league/', 'EN site produces global associated league URL');
    assert(data6En.listDefault[0].url.startsWith('/league/'), 'EN site league list items have global URL prefix');

    // PT-BR Site: Regional /pt-br/ URLs
    assert(data6Pt.teamDefault.url === '/pt-br/team/arsenal/', 'PT-BR site produces regional team URL "/pt-br/team/arsenal/"');
    assert(data6Pt.leagueDefault.url === '/pt-br/league/premier-league/', 'PT-BR site produces regional league URL "/pt-br/league/premier-league/"');
    assert(data6Pt.teamDefault.leagues[0].url === '/pt-br/league/premier-league/', 'PT-BR site produces regional associated league URL');
    assert(data6Pt.listDefault[0].url.startsWith('/pt-br/league/'), 'PT-BR site league list items have "/pt-br/league/" prefix');

    // Explicit edition override
    assert(data6En.teamEsArStr.url === '/es-ar/team/arsenal/', 'Explicit edition string "es-ar" produces "/es-ar/team/arsenal/"');
    assert(data6En.teamEsArDict.url === '/es-ar/team/arsenal/', 'Explicit edition dict produces "/es-ar/team/arsenal/"');
    assert(data6En.leagueEsArStr.url === '/es-ar/league/premier-league/', 'Explicit edition string produces "/es-ar/league/premier-league/"');

    // -------------------------------------------------------------
    // Test 7: Caching with partialCached
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Caching with partialCached ---');

    const test7Layout = `
{{ $slugTeam := "arsenal" }}
{{ $cachedTeam1 := partialCached "cfcdata/team.html" (dict "slug" $slugTeam) $slugTeam site.Language.Lang }}
{{ $cachedTeam2 := partialCached "cfcdata/team.html" (dict "slug" $slugTeam) $slugTeam site.Language.Lang }}

{{ $slugLeague := "premier-league" }}
{{ $cachedLeague1 := partialCached "cfcdata/league.html" (dict "slug" $slugLeague) $slugLeague site.Language.Lang }}
{{ $cachedLeague2 := partialCached "cfcdata/league.html" (dict "slug" $slugLeague) $slugLeague site.Language.Lang }}

{{ $cachedList1 := partialCached "cfcdata/league-list.html" . site.Language.Lang }}
{{ $cachedList2 := partialCached "cfcdata/league-list.html" . site.Language.Lang }}

{{ $res := dict
  "teamUrl1" $cachedTeam1.url
  "teamUrl2" $cachedTeam2.url
  "teamIdentical" (eq $cachedTeam1.url $cachedTeam2.url)
  "leagueUrl1" $cachedLeague1.url
  "leagueUrl2" $cachedLeague2.url
  "leagueIdentical" (eq $cachedLeague1.url $cachedLeague2.url)
  "listIdentical" (eq (len $cachedList1) (len $cachedList2))
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test7Layout);
    const build7 = runHugo();
    assert(build7.success, 'Hugo build succeeds for Test 7 (partialCached)');

    const data7En = readOutputJson('cfc-test-team-league-vm-en.json');
    const data7Pt = readOutputJson('pt-br/cfc-test-team-league-vm-pt.json');

    // EN Site caching
    assert(data7En.teamIdentical === true, 'Team cached invocations return identical URLs');
    assert(data7En.teamUrl1 === '/team/arsenal/', 'EN cached team URL is global');
    assert(data7En.leagueIdentical === true, 'League cached invocations return identical URLs');
    assert(data7En.leagueUrl1 === '/league/premier-league/', 'EN cached league URL is global');
    assert(data7En.listIdentical === true, 'League list cached invocations return identical length');

    // PT-BR Site caching
    assert(data7Pt.teamIdentical === true, 'PT-BR Team cached invocations return identical URLs');
    assert(data7Pt.teamUrl1 === '/pt-br/team/arsenal/', 'PT-BR cached team URL has regional prefix');
    assert(data7Pt.leagueIdentical === true, 'PT-BR League cached invocations return identical URLs');
    assert(data7Pt.leagueUrl1 === '/pt-br/league/premier-league/', 'PT-BR cached league URL has regional prefix');
    assert(data7Pt.listIdentical === true, 'PT-BR League list cached invocations return identical length');

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
    console.log('🎉 All CFC Team, League, and Directory View-Model tests passed successfully!');
    process.exit(0);
  }
}

runAllTests();
