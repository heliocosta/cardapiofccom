#!/usr/bin/env node

/**
 * Automated test suite for Task 4.4: Channel Resolver and Downstream Feature Contracts
 *
 * Verifies:
 * 1. layouts/_partials/cfcdata/channels.html:
 *    - In Global edition, returns groups for all countries broadcasting the match,
 *      ordered by edition weight, omitting countries with 0 channels.
 *    - In Regional edition, returns single group for that edition's country
 *      (with channels or empty list if no broadcaster).
 *    - Each group contains country, countryName, edition, url, channels [ { name, id, type, url, logo } ].
 *    - Match with 0 channels everywhere returns empty slice.
 *    - Non-existent match slug or empty slug returns empty slice.
 * 2. Missing country channel file:
 *    - Emits warnf "data-pages: channel file missing for edition country \"<country>\""
 *    - In regional edition: returns single group with empty channels: [] without crashing build.
 *    - In global edition: omits missing country without crashing build.
 * 3. layouts/_partials/cfcdata/page-entity.html:
 *    - Exposes PageEntity contract for match, team, league, and leagues pages.
 *    - Returns nil / null for regular pages (no .Params.cfc or unrecognized kind).
 *    - PageEntity contains kind, edition, generatedAt, and the corresponding entity VM.
 * 4. layouts/_partials/cfcdata/entity-list.html:
 *    - Returns complete EntityListItem[] array in exact order:
 *      1. Leagues (popular first, then alphabetical by localized name)
 *      2. Teams (alphabetical by localized name)
 *      3. Matches (in kickoff order from $dataset.order)
 *    - Verified fields:
 *      - Leagues: kind="league", slug, name, altNames, url, appPath, crest
 *      - Teams: kind="team", slug, name, altNames, url, appPath, crest
 *      - Matches: kind="match", slug, name, altNames=[], url, appPath, kickoff, league: { slug, name }
 *    - altNames contains distinct values across names and shortNames excluding name.
 *    - Multi-language support: EN site produces global URLs; PT-BR site produces /pt-br/ URLs.
 *    - Invocations via partialCached produce correct, cached results.
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

const testContentPathEn = path.join(ROOT_DIR, 'content/en/_cfc_channel_contracts_harness.md');
const testContentPathPt = path.join(ROOT_DIR, 'content/pt-br/_cfc_channel_contracts_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_channel_contracts_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_channel_contracts_build');

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
title: "CFC Channel Contracts Harness EN"
layout: "_cfc_channel_contracts_harness"
url: "/cfc-test-channel-contracts-en.json"
---
`
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "CFC Channel Contracts Harness PT"
layout: "_cfc_channel_contracts_harness"
url: "/pt-br/cfc-test-channel-contracts-pt.json"
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
  console.log('🧪 Starting CFC Channel Resolver and Downstream Feature Contracts test suite...\n');

  try {
    // -------------------------------------------------------------
    // Test 1: channels.html in Global edition
    // -------------------------------------------------------------
    console.log('--- Test 1: channels.html in Global edition ---');

    const test1Layout = `
{{/* Global edition invocations */}}
{{ $arsChe := partial "cfcdata/channels.html" "arsenal-vs-chelsea-2026-11-06" }}
{{ $mciArs := partial "cfcdata/channels.html" "manchester-city-vs-arsenal-2026-11-06" }}
{{ $flaPal := partial "cfcdata/channels.html" (dict "slug" "flamengo-vs-palmeiras-2026-11-07") }}
{{ $rmaBar := partial "cfcdata/channels.html" "real-madrid-vs-barcelona-2026-11-08" }}
{{ $nonExistent := partial "cfcdata/channels.html" "non-existent-match-slug" }}
{{ $emptySlug := partial "cfcdata/channels.html" "" }}

{{ $res := dict
  "arsChe" $arsChe
  "mciArs" $mciArs
  "flaPal" $flaPal
  "rmaBar" $rmaBar
  "nonExistent" $nonExistent
  "emptySlug" $emptySlug
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test1Layout);
    const build1 = runHugo();
    assert(build1.success, 'Hugo build succeeds for Test 1 (Global channels)');

    const data1 = readOutputJson('cfc-test-channel-contracts-en.json');

    // arsenal-vs-chelsea is broadcast in GB, IE, BR, PT, AR (5 countries)
    assert(Array.isArray(data1.arsChe), 'arsChe returns an array of ChannelGroups');
    assert(data1.arsChe.length === 5, `arsChe returns 5 country groups (got ${data1.arsChe.length})`);

    // Verify edition weight ordering: GB (weight 2), IE (3), BR (4), PT (5), AR (6)
    const expectedCountries = ['GB', 'IE', 'BR', 'PT', 'AR'];
    const actualCountries = data1.arsChe.map(g => g.country);
    assert(
      JSON.stringify(actualCountries) === JSON.stringify(expectedCountries),
      `Groups ordered by edition weight: expected [${expectedCountries.join(', ')}], got [${actualCountries.join(', ')}]`
    );

    // Verify fields of each group
    const gbGroup = data1.arsChe[0];
    assert(gbGroup.country === 'GB', 'Group 0 country is GB');
    assert(gbGroup.edition === 'en-gb', 'Group 0 edition is en-gb');
    assert(gbGroup.countryName === 'UK (English)', `Group 0 countryName is "UK (English)" (got "${gbGroup.countryName}")`);
    assert(
      gbGroup.url === '/en-gb/match/arsenal-vs-chelsea-2026-11-06/',
      `Group 0 URL is regional match URL (got "${gbGroup.url}")`
    );
    assert(Array.isArray(gbGroup.channels) && gbGroup.channels.length === 2, 'GB group has 2 channels');

    // Verify channel object fields: { name, id, type, url, logo }
    const ch0 = gbGroup.channels[0];
    assert(ch0.id === 'sky-sports-main-event', 'Channel ID matches');
    assert(ch0.name === 'Sky Sports Main Event', 'Channel name matches');
    assert(ch0.type === 'tv', 'Channel type matches');
    assert(ch0.url === 'https://www.skysports.com', 'Channel url matches');
    assert(ch0.logo.includes('sky-sports.webp'), 'Channel logo matches');

    // manchester-city-vs-arsenal is broadcast in GB and IE only
    assert(data1.mciArs.length === 2, `mciArs has 2 groups (got ${data1.mciArs.length})`);
    const mciCountries = data1.mciArs.map(g => g.country);
    assert(
      mciCountries[0] === 'GB' && mciCountries[1] === 'IE',
      `Countries with 0 channels omitted: got [${mciCountries.join(', ')}]`
    );

    // flamengo-vs-palmeiras is broadcast in BR and PT only
    assert(data1.flaPal.length === 2, `flaPal has 2 groups (got ${data1.flaPal.length})`);
    const flaCountries = data1.flaPal.map(g => g.country);
    assert(
      flaCountries[0] === 'BR' && flaCountries[1] === 'PT',
      `BR and PT groups present for flamengo-vs-palmeiras: got [${flaCountries.join(', ')}]`
    );

    // real-madrid-vs-barcelona has 0 broadcasters anywhere -> empty array
    assert(Array.isArray(data1.rmaBar) && data1.rmaBar.length === 0, 'Match with 0 channels returns empty slice');

    // Non-existent match -> empty array
    assert(Array.isArray(data1.nonExistent) && data1.nonExistent.length === 0, 'Non-existent match returns empty slice');

    // Empty slug -> empty array
    assert(Array.isArray(data1.emptySlug) && data1.emptySlug.length === 0, 'Empty slug returns empty slice');

    // -------------------------------------------------------------
    // Test 2: channels.html in Regional edition
    // -------------------------------------------------------------
    console.log('\n--- Test 2: channels.html in Regional edition ---');

    const test2Layout = `
{{/* Regional edition invocations */}}
{{ $flaPalPt := partial "cfcdata/channels.html" "flamengo-vs-palmeiras-2026-11-07" }}
{{ $mciArsPt := partial "cfcdata/channels.html" "manchester-city-vs-arsenal-2026-11-06" }}
{{ $overrideGb := partial "cfcdata/channels.html" (dict "slug" "manchester-city-vs-arsenal-2026-11-06" "edition" "en-gb") }}
{{ $nonExistentPt := partial "cfcdata/channels.html" "non-existent-match" }}

{{ $res := dict
  "flaPalPt" $flaPalPt
  "mciArsPt" $mciArsPt
  "overrideGb" $overrideGb
  "nonExistentPt" $nonExistentPt
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test2Layout);
    const build2 = runHugo();
    assert(build2.success, 'Hugo build succeeds for Test 2 (Regional channels)');

    const data2Pt = readOutputJson('pt-br/cfc-test-channel-contracts-pt.json');

    // flamengo-vs-palmeiras in pt-br: single group for BR with broadcasters
    assert(Array.isArray(data2Pt.flaPalPt), 'Regional return is array');
    assert(data2Pt.flaPalPt.length === 1, `Regional returns single group (got length ${data2Pt.flaPalPt.length})`);
    const brGroup = data2Pt.flaPalPt[0];
    assert(brGroup.country === 'BR', 'Regional group country is BR');
    assert(brGroup.edition === 'pt-br', 'Regional group edition is pt-br');
    assert(brGroup.countryName === 'Brasil (Português)', `Regional countryName is localized (got "${brGroup.countryName}")`);
    assert(
      brGroup.url === '/pt-br/match/flamengo-vs-palmeiras-2026-11-07/',
      `Regional URL has /pt-br/ prefix (got "${brGroup.url}")`
    );
    assert(brGroup.channels.length > 0, `BR channels populated for flamengo-vs-palmeiras (got ${brGroup.channels.length})`);

    // manchester-city-vs-arsenal in pt-br: NOT broadcast in BR
    // Must return single group with empty channels array
    assert(Array.isArray(data2Pt.mciArsPt) && data2Pt.mciArsPt.length === 1, 'Match not in BR still returns single group');
    assert(data2Pt.mciArsPt[0].country === 'BR', 'Group is for country BR');
    assert(
      Array.isArray(data2Pt.mciArsPt[0].channels) && data2Pt.mciArsPt[0].channels.length === 0,
      'Match not broadcast in country has empty channels slice'
    );
    assert(
      data2Pt.mciArsPt[0].url === '/pt-br/match/manchester-city-vs-arsenal-2026-11-06/',
      'URL points to regional match page'
    );

    // Explicit edition override to en-gb: single group for GB with channels
    assert(data2Pt.overrideGb.length === 1, 'Explicit en-gb override returns single group');
    assert(data2Pt.overrideGb[0].country === 'GB', 'Override group country is GB');
    assert(data2Pt.overrideGb[0].edition === 'en-gb', 'Override group edition is en-gb');
    assert(data2Pt.overrideGb[0].channels.length > 0, 'Override GB has channels for mci-ars');

    // Non-existent match in regional: empty array
    assert(
      Array.isArray(data2Pt.nonExistentPt) && data2Pt.nonExistentPt.length === 0,
      'Non-existent match returns empty slice in regional edition'
    );

    // -------------------------------------------------------------
    // Test 3: Missing country channel file handling
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Missing country channel file handling ---');

    const test3Layout = `
{{/* Load default dataset and simulate missing channels file */}}
{{ $defaultDs := partialCached "cfcdata/dataset.html" . "dataset" }}

{{/* Build mutated channels map omitting AR */}}
{{ $mutatedChannels := dict }}
{{ range $k, $v := $defaultDs.channels }}
  {{ if ne $k "AR" }}
    {{ $mutatedChannels = merge $mutatedChannels (dict $k $v) }}
  {{ end }}
{{ end }}

{{ $dsWithoutAr := dict
  "index" $defaultDs.index
  "leagues" $defaultDs.leagues
  "teams" $defaultDs.teams
  "matches" $defaultDs.matches
  "order" $defaultDs.order
  "channels" $mutatedChannels
  "generatedAt" $defaultDs.generatedAt
  "asOf" $defaultDs.asOf
  "source" $defaultDs.source
}}

{{/* 1. Global call with dataset missing AR */}}
{{ $globalRes := partial "cfcdata/channels.html" (dict "slug" "arsenal-vs-chelsea-2026-11-06" "dataset" $dsWithoutAr) }}

{{/* 2. Regional call for es-ar with dataset missing AR */}}
{{ $arRes := partial "cfcdata/channels.html" (dict "slug" "arsenal-vs-chelsea-2026-11-06" "dataset" $dsWithoutAr "edition" "es-ar") }}

{{ $res := dict
  "globalRes" $globalRes
  "arRes" $arRes
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test3Layout);
    const build3 = runHugo();
    assert(build3.success, 'Hugo build succeeds without crashing when country channel file is missing');
    assert(
      build3.output.includes('data-pages: channel file missing for edition country "AR"'),
      'Warning logged: data-pages: channel file missing for edition country "AR"'
    );

    const data3 = readOutputJson('cfc-test-channel-contracts-en.json');

    // In Global edition: AR is omitted from groups
    const globalCountries = data3.globalRes.map(g => g.country);
    assert(!globalCountries.includes('AR'), 'AR omitted from Global groups when channel file missing');
    assert(globalCountries.includes('GB') && globalCountries.includes('BR'), 'Other countries preserved in Global groups');

    // In Regional edition for AR: returns single group with empty channels
    assert(Array.isArray(data3.arRes) && data3.arRes.length === 1, 'Regional es-ar returns single group');
    assert(data3.arRes[0].country === 'AR', 'Regional group country is AR');
    assert(data3.arRes[0].edition === 'es-ar', 'Regional group edition is es-ar');
    assert(
      Array.isArray(data3.arRes[0].channels) && data3.arRes[0].channels.length === 0,
      'Regional group channels is empty slice when channel file missing'
    );

    // -------------------------------------------------------------
    // Test 4: page-entity.html downstream contract
    // -------------------------------------------------------------
    console.log('\n--- Test 4: page-entity.html downstream contract ---');

    const test4Layout = `
{{/* 1. Match mock */}}
{{ $matchPage := dict "Params" (dict "cfc" (dict "kind" "match" "slug" "arsenal-vs-chelsea-2026-11-06")) }}
{{ $entityMatch := partial "cfcdata/page-entity.html" $matchPage }}

{{/* 2. Team mock */}}
{{ $teamPage := dict "Params" (dict "cfc" (dict "kind" "team" "slug" "arsenal")) }}
{{ $entityTeam := partial "cfcdata/page-entity.html" $teamPage }}

{{/* 3. League mock */}}
{{ $leaguePage := dict "Params" (dict "cfc" (dict "kind" "league" "slug" "premier-league")) }}
{{ $entityLeague := partial "cfcdata/page-entity.html" $leaguePage }}

{{/* 4. Leagues directory mock */}}
{{ $leaguesPage := dict "Params" (dict "cfc" (dict "kind" "leagues")) }}
{{ $entityLeagues := partial "cfcdata/page-entity.html" $leaguesPage }}

{{/* 5. Regular page mock (no cfc) */}}
{{ $regularPage := dict "Params" (dict "title" "About Us") }}
{{ $entityRegular := partial "cfcdata/page-entity.html" $regularPage }}

{{/* 6. Unrecognized kind mock */}}
{{ $unknownPage := dict "Params" (dict "cfc" (dict "kind" "article" "slug" "something")) }}
{{ $entityUnknown := partial "cfcdata/page-entity.html" $unknownPage }}

{{/* 7. Current page context (no cfc on this harness page) */}}
{{ $entityHarness := partial "cfcdata/page-entity.html" . }}

{{ $res := dict
  "match" $entityMatch
  "team" $entityTeam
  "league" $entityLeague
  "leagues" $entityLeagues
  "regular" $entityRegular
  "unknown" $entityUnknown
  "harness" $entityHarness
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test4Layout);
    const build4 = runHugo();
    assert(build4.success, 'Hugo build succeeds for Test 4 (page-entity.html)');

    const data4 = readOutputJson('cfc-test-channel-contracts-en.json');

    // Match PageEntity
    assert(data4.match !== null, 'Match page-entity is not null');
    assert(data4.match.kind === 'match', 'Match page-entity.kind is "match"');
    assert(data4.match.edition === 'en', 'Match page-entity.edition is "en"');
    assert(typeof data4.match.generatedAt === 'string' && data4.match.generatedAt.length > 0, 'generatedAt is string');
    assert(data4.match.match && data4.match.match.title === 'Arsenal vs Chelsea', 'MatchVM populated in page-entity');
    assert(data4.match.match.home && data4.match.match.home.slug === 'arsenal', 'home team populated in match');
    assert(data4.match.match.away && data4.match.match.away.slug === 'chelsea', 'away team populated in match');
    assert(data4.match.match.league && data4.match.match.league.slug === 'premier-league', 'league populated in match');
    assert(Array.isArray(data4.match.channels), 'channels array populated in match page-entity');
    assert(data4.match.channels.length === 5, 'Match page-entity channels has 5 country groups');

    // Team PageEntity
    assert(data4.team !== null, 'Team page-entity is not null');
    assert(data4.team.kind === 'team', 'Team page-entity.kind is "team"');
    assert(data4.team.edition === 'en', 'Team page-entity.edition is "en"');
    assert(data4.team.team && data4.team.team.name === 'Arsenal', 'TeamVM populated in team page-entity');
    assert(data4.team.team.crest.includes('arsenal.webp'), 'crest populated in team');
    assert(data4.team.team.country.code === 'GB', 'country populated in team');

    // League PageEntity
    assert(data4.league !== null, 'League page-entity is not null');
    assert(data4.league.kind === 'league', 'League page-entity.kind is "league"');
    assert(data4.league.edition === 'en', 'League page-entity.edition is "en"');
    assert(data4.league.league && data4.league.league.name === 'Premier League', 'LeagueVM populated in league page-entity');
    assert(data4.league.league.popular === true, 'popular flag populated in league');

    // Leagues directory PageEntity
    assert(data4.leagues !== null, 'Leagues page-entity is not null');
    assert(data4.leagues.kind === 'leagues', 'Leagues page-entity.kind is "leagues"');
    assert(data4.leagues.edition === 'en', 'Leagues page-entity.edition is "en"');
    assert(Array.isArray(data4.leagues.leagues), 'leagues array populated in leagues page-entity');
    assert(data4.leagues.leagues.length >= 3, `leagues directory contains >= 3 leagues (got ${data4.leagues.leagues.length})`);
    assert(data4.leagues.leagues[0].popular === true, 'First league in directory is popular');

    // Regular page & unrecognized kinds return null
    assert(data4.regular === null, 'Regular page returns null');
    assert(data4.unknown === null, 'Unrecognized kind returns null');
    assert(data4.harness === null, 'Page without .Params.cfc returns null');

    // -------------------------------------------------------------
    // Test 5: entity-list.html downstream contract
    // -------------------------------------------------------------
    console.log('\n--- Test 5: entity-list.html downstream contract ---');

    const test5Layout = `
{{/* entity-list.html invocations */}}
{{ $list := partialCached "cfcdata/entity-list.html" . site.Language.Lang }}
{{ $cachedAgain := partialCached "cfcdata/entity-list.html" . site.Language.Lang }}

{{ $res := dict
  "list" $list
  "count" (len $list)
  "identical" (eq (len $list) (len $cachedAgain))
}}
{{ $res | jsonify }}
`;

    cleanupHarness();
    setupHarness(test5Layout);
    const build5 = runHugo();
    assert(build5.success, 'Hugo build succeeds for Test 5 (entity-list.html)');

    const data5En = readOutputJson('cfc-test-channel-contracts-en.json');
    const data5Pt = readOutputJson('pt-br/cfc-test-channel-contracts-pt.json');

    assert(Array.isArray(data5En.list), 'entity-list returns an array');
    assert(data5En.count > 0, `entity-list has items (count: ${data5En.count})`);
    assert(data5En.identical === true, 'partialCached returns identical result on repeated call');

    const enList = data5En.list;

    // Verify ordering: 1. Leagues, 2. Teams, 3. Matches
    let lastKind = 'league';
    let leaguesCount = 0;
    let teamsCount = 0;
    let matchesCount = 0;

    let leaguesDone = false;
    let teamsDone = false;
    let orderValid = true;

    for (const item of enList) {
      if (item.kind === 'league') {
        leaguesCount++;
        if (leaguesDone) orderValid = false;
      } else if (item.kind === 'team') {
        teamsCount++;
        leaguesDone = true;
        if (teamsDone) orderValid = false;
      } else if (item.kind === 'match') {
        matchesCount++;
        leaguesDone = true;
        teamsDone = true;
      } else {
        orderValid = false;
      }
    }

    assert(orderValid, 'List items partitioned in exact order: leagues, then teams, then matches');
    assert(leaguesCount === 3, `Found 3 leagues (got ${leaguesCount})`);
    assert(teamsCount === 8, `Found 8 teams (got ${teamsCount})`);
    assert(matchesCount === 8, `Found 8 matches (got ${matchesCount})`);

    // Verify League items:
    // Leagues are ordered by cfcdata/league-list.html: popular first (alphabetical), then regular (alphabetical)
    const leagueItems = enList.filter(i => i.kind === 'league');
    assert(leagueItems[0].name === 'Brasileirão Série A', 'League 0 is Brasileirão Série A (popular)');
    assert(leagueItems[1].name === 'Premier League', 'League 1 is Premier League (popular)');
    assert(leagueItems[2].name === 'La Liga', 'League 2 is La Liga (regular)');

    for (const l of leagueItems) {
      assert(typeof l.slug === 'string' && l.slug.length > 0, `League ${l.slug} has slug`);
      assert(typeof l.name === 'string' && l.name.length > 0, `League ${l.slug} has name`);
      assert(Array.isArray(l.altNames), `League ${l.slug} has altNames array`);
      assert(!l.altNames.includes(l.name), `League ${l.slug} altNames excludes its own name`);
      assert(l.url.startsWith('/league/'), `League ${l.slug} has global URL "${l.url}"`);
      assert(l.appPath.startsWith('/league/'), `League ${l.slug} has appPath "${l.appPath}"`);
      assert(typeof l.crest === 'string' && l.crest.includes('.webp'), `League ${l.slug} has crest`);
    }

    // Verify altNames for Premier League contains "EPL"
    const premierLeagueItem = leagueItems.find(l => l.slug === 'premier-league');
    assert(
      premierLeagueItem && premierLeagueItem.altNames.includes('EPL'),
      'Premier League altNames includes "EPL"'
    );

    // Verify Team items:
    // Teams sorted alphabetically by localized name
    const teamItems = enList.filter(i => i.kind === 'team');
    const teamNames = teamItems.map(t => t.name);
    const sortedTeamNames = [...teamNames].sort();
    assert(
      JSON.stringify(teamNames) === JSON.stringify(sortedTeamNames),
      `Teams sorted alphabetically by localized name: [${teamNames.join(', ')}]`
    );

    for (const t of teamItems) {
      assert(typeof t.slug === 'string' && t.slug.length > 0, `Team ${t.slug} has slug`);
      assert(typeof t.name === 'string' && t.name.length > 0, `Team ${t.slug} has name`);
      assert(Array.isArray(t.altNames), `Team ${t.slug} has altNames array`);
      assert(!t.altNames.includes(t.name), `Team ${t.slug} altNames excludes its own name`);
      assert(t.url.startsWith('/team/'), `Team ${t.slug} has global URL "${t.url}"`);
      assert(t.appPath.startsWith('/team/'), `Team ${t.slug} has appPath "${t.appPath}"`);
      assert(typeof t.crest === 'string' && t.crest.includes('.webp'), `Team ${t.slug} has crest`);
    }

    // Verify Arsenal altNames contains "ARS"
    const arsenalItem = teamItems.find(t => t.slug === 'arsenal');
    assert(
      arsenalItem && arsenalItem.altNames.includes('ARS'),
      'Arsenal altNames includes "ARS"'
    );

    // Verify Match items:
    // Matches ordered in kickoff order from $dataset.order
    const matchItems = enList.filter(i => i.kind === 'match');
    const matchSlugs = matchItems.map(m => m.slug);
    const expectedOrder = [
      'arsenal-vs-chelsea-2026-11-06',
      'manchester-city-vs-arsenal-2026-11-06',
      'flamengo-vs-palmeiras-2026-11-07',
      'sao-paulo-vs-flamengo-2026-11-08',
      'real-madrid-vs-barcelona-2026-11-08',
      'chelsea-vs-manchester-city-2026-11-08',
      'palmeiras-vs-sao-paulo-2026-11-09',
      'barcelona-vs-real-madrid-2026-11-09'
    ];
    assert(
      JSON.stringify(matchSlugs) === JSON.stringify(expectedOrder),
      'Matches are in exact kickoff order from dataset.order'
    );

    for (const m of matchItems) {
      assert(typeof m.slug === 'string' && m.slug.length > 0, `Match ${m.slug} has slug`);
      assert(typeof m.name === 'string' && m.name.includes(' vs '), `Match ${m.slug} title is formatted "<home> vs <away>"`);
      assert(Array.isArray(m.altNames) && m.altNames.length === 0, `Match ${m.slug} altNames is empty slice`);
      assert(m.url.startsWith('/match/'), `Match ${m.slug} has global URL "${m.url}"`);
      assert(m.appPath.startsWith('/match/'), `Match ${m.slug} has appPath "${m.appPath}"`);
      assert(typeof m.kickoff === 'string' && m.kickoff.includes('T'), `Match ${m.slug} has ISO kickoff "${m.kickoff}"`);
      assert(
        m.league && typeof m.league.slug === 'string' && typeof m.league.name === 'string',
        `Match ${m.slug} has league object with slug and name`
      );
    }

    // Verify PT-BR multi-language edition URLs
    const ptList = data5Pt.list;
    assert(ptList.length === enList.length, 'PT-BR list has identical count');

    const ptLeague = ptList.find(i => i.kind === 'league');
    assert(ptLeague.url.startsWith('/pt-br/league/'), `PT-BR league has /pt-br/ URL "${ptLeague.url}"`);

    const ptTeam = ptList.find(i => i.kind === 'team');
    assert(ptTeam.url.startsWith('/pt-br/team/'), `PT-BR team has /pt-br/ URL "${ptTeam.url}"`);

    const ptMatch = ptList.find(i => i.kind === 'match');
    assert(ptMatch.url.startsWith('/pt-br/match/'), `PT-BR match has /pt-br/ URL "${ptMatch.url}"`);

  } finally {
    console.log('\n🧹 Cleaning up test harness and temporary files...');
    cleanupHarness();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('='.repeat(60) + '\n');

  if (failedTests > 0) {
    console.error(`💥 ${failedTests} test(s) failed!`);
    process.exit(1);
  } else {
    console.log('🎉 All CFC Channel Resolver & Downstream Contract tests passed successfully!\n');
  }
}

runAllTests().catch(err => {
  console.error('Fatal error running tests:', err);
  cleanupHarness();
  process.exit(1);
});
