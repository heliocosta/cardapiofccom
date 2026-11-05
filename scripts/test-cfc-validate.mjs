#!/usr/bin/env node

/**
 * Automated test suite for Task 3.3: Comprehensive Dataset Validator
 *
 * Verifies layouts/_partials/cfcdata/validate.html:
 * 1. Valid sample dataset passes (dict and direct form, wrapped and unwrapped).
 * 2. Major version mismatch fails.
 * 3. Collection count mismatch fails (leagues, teams, matches).
 * 4. Match order mismatch / unsorted fails.
 * 5. Invalid slug format fails.
 * 6. Kickoff missing UTC Z fails.
 * 7. Missing or empty names.en fails.
 * 8. Unknown match status and channel type fails.
 * 9. Referential integrity failures: unknown team, unknown league, unknown channel, empty channel list.
 * 10. Missing or non-map dataset fails.
 *
 * NOTE: Lineups are completely out of scope per user instruction and are ignored.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const testContentPath = path.join(ROOT_DIR, 'content/en/_cfc_validate_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_validate_harness.html');
const tempFixturePath = path.join(ROOT_DIR, 'assets/_cfc_test_dataset.json');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_validate_build');

const sampleDir = path.join(ROOT_DIR, 'assets/cfc-data/sample');

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
  if (fs.existsSync(testContentPath)) fs.unlinkSync(testContentPath);
  if (fs.existsSync(testLayoutPath)) fs.unlinkSync(testLayoutPath);
  if (fs.existsSync(tempFixturePath)) fs.unlinkSync(tempFixturePath);
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

function setupHarness() {
  fs.writeFileSync(
    testContentPath,
    `---
title: "CFC Validate Harness"
layout: "_cfc_validate_harness"
url: "/cfc-test-validate-output.json"
---
`
  );

  fs.writeFileSync(
    testLayoutPath,
    `{{- $res := resources.Get "_cfc_test_dataset.json" -}}
{{- $data := $res.Content | transform.Unmarshal -}}
{{- $param := $data -}}
{{- if and (reflect.IsMap $data) (isset $data "_harnessDirect") -}}
  {{- $param = $data.dataset -}}
{{- else -}}
  {{- $param = dict "dataset" $data -}}
{{- end -}}
{{- $valid := partial "cfcdata/validate.html" $param -}}
{{- dict "valid" $valid | jsonify -}}
`
  );
}

function loadBaselineSampleDataset() {
  const indexData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'index.json'), 'utf8'));
  const leaguesData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'leagues.json'), 'utf8'));
  const teamsData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'teams.json'), 'utf8'));
  const matchesData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'matches.json'), 'utf8'));
  const channelsGB = JSON.parse(fs.readFileSync(path.join(sampleDir, 'channels/GB.json'), 'utf8'));

  return {
    index: JSON.parse(JSON.stringify(indexData)),
    leagues: JSON.parse(JSON.stringify(leaguesData.leagues)),
    teams: JSON.parse(JSON.stringify(teamsData.teams)),
    matches: JSON.parse(JSON.stringify(matchesData.matches)),
    order: JSON.parse(JSON.stringify(matchesData.order)),
    channels: {
      GB: JSON.parse(JSON.stringify(channelsGB)),
    },
  };
}

function runHugo() {
  const cmd = `hugo -e development --ignoreCache --destination "${tempBuildDir}"`;
  try {
    const stdout = execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe' });
    return {
      success: true,
      stdout: stdout.toString(),
      stderr: '',
    };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
    };
  }
}

function runWithDataset(datasetObject) {
  fs.writeFileSync(tempFixturePath, JSON.stringify(datasetObject, null, 2));
  return runHugo();
}

console.log('🧪 Starting CFC Comprehensive Dataset Validator (validate.html) test suite...\n');

try {
  cleanupHarness();
  setupHarness();

  // =========================================================================
  // 1. Valid sample dataset passes
  // =========================================================================
  console.log('--- Test 1: Valid sample dataset passes ---');
  {
    const ds = loadBaselineSampleDataset();
    const res = runWithDataset(ds);
    assert(res.success, 'Valid baseline sample dataset builds successfully');
    const outFile = path.join(tempBuildDir, 'cfc-test-validate-output.json');
    assert(fs.existsSync(outFile), 'Harness output file was created');
    if (fs.existsSync(outFile)) {
      const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert(parsed.valid === true, 'validate.html returned true for valid sample dataset');
    }

    // Direct invocation mode: partial "cfcdata/validate.html" $dataset (without dict "dataset" wrapping)
    const directRes = runWithDataset({
      _harnessDirect: true,
      dataset: ds,
    });
    assert(directRes.success, 'Direct dataset invocation (without dict wrapper) succeeds');

    // Wrapped collections mode: dataset where leagues, teams, matches are raw file objects
    const rawLeagues = JSON.parse(fs.readFileSync(path.join(sampleDir, 'leagues.json'), 'utf8'));
    const rawTeams = JSON.parse(fs.readFileSync(path.join(sampleDir, 'teams.json'), 'utf8'));
    const rawMatches = JSON.parse(fs.readFileSync(path.join(sampleDir, 'matches.json'), 'utf8'));
    const wrappedDs = {
      index: ds.index,
      leagues: rawLeagues,
      teams: rawTeams,
      matches: rawMatches,
      channels: ds.channels,
    };
    const wrappedRes = runWithDataset(wrappedDs);
    assert(wrappedRes.success, 'Dataset with raw wrapped file objects succeeds');
  }

  // =========================================================================
  // 2. Major version mismatch fails
  // =========================================================================
  console.log('\n--- Test 2: Major version mismatch fails ---');
  {
    const ds2 = loadBaselineSampleDataset();
    ds2.index.schemaVersion = '2.0.0';
    const res2 = runWithDataset(ds2);
    assert(!res2.success, 'Major version 2.0.0 fails build');
    assert(
      res2.stderr.includes('contract major version mismatch') && res2.stderr.includes('declared "2.0.0", supported 1'),
      `Error mentions contract major version mismatch and declared version: "${res2.stderr.trim()}"`
    );

    const ds0 = loadBaselineSampleDataset();
    ds0.index.schemaVersion = '0.9.0';
    const res0 = runWithDataset(ds0);
    assert(!res0.success, 'Major version 0.9.0 fails build');
    assert(
      res0.stderr.includes('contract major version mismatch'),
      'Error mentions contract major version mismatch for 0.9.0'
    );
  }

  // =========================================================================
  // 3. Collection count mismatch fails (leagues, teams, matches)
  // =========================================================================
  console.log('\n--- Test 3: Collection count mismatch fails ---');
  {
    // Leagues count mismatch
    const dsL = loadBaselineSampleDataset();
    dsL.index.counts.leagues = 99;
    const resL = runWithDataset(dsL);
    assert(!resL.success, 'Leagues count mismatch fails build');
    assert(
      resL.stderr.includes('data-pages: leagues.json: count mismatch'),
      `Leagues count mismatch error format verified: "${resL.stderr.trim()}"`
    );

    // Teams count mismatch
    const dsT = loadBaselineSampleDataset();
    dsT.index.counts.teams = 999;
    const resT = runWithDataset(dsT);
    assert(!resT.success, 'Teams count mismatch fails build');
    assert(
      resT.stderr.includes('data-pages: teams.json: count mismatch'),
      `Teams count mismatch error format verified: "${resT.stderr.trim()}"`
    );

    // Matches count mismatch
    const dsM = loadBaselineSampleDataset();
    dsM.index.counts.matches = 50;
    const resM = runWithDataset(dsM);
    assert(!resM.success, 'Matches count mismatch fails build');
    assert(
      resM.stderr.includes('data-pages: matches.json: count mismatch'),
      `Matches count mismatch error format verified: "${resM.stderr.trim()}"`
    );

    // Missing counts object
    const dsNoCounts = loadBaselineSampleDataset();
    delete dsNoCounts.index.counts;
    const resNoCounts = runWithDataset(dsNoCounts);
    assert(!resNoCounts.success, 'Missing counts object fails build');
    assert(
      resNoCounts.stderr.includes('data-pages: index.json: counts object missing'),
      'Missing counts error format verified'
    );
  }

  // =========================================================================
  // 4. Match order mismatch / unsorted fails
  // =========================================================================
  console.log('\n--- Test 4: Match order mismatch / unsorted fails ---');
  {
    // Order length mismatch
    const dsOrderLen = loadBaselineSampleDataset();
    dsOrderLen.order = dsOrderLen.order.slice(0, 2);
    const resOrderLen = runWithDataset(dsOrderLen);
    assert(!resOrderLen.success, 'Order count mismatch fails build');
    assert(
      resOrderLen.stderr.includes('data-pages: matches.json: order count mismatch'),
      'Order count mismatch error format verified'
    );

    // Duplicate match in order
    const dsOrderDup = loadBaselineSampleDataset();
    const origFirst = dsOrderDup.order[0];
    const origSecond = dsOrderDup.order[1];
    dsOrderDup.order[1] = origFirst; // now has duplicate of first match
    const resOrderDup = runWithDataset(dsOrderDup);
    assert(!resOrderDup.success, 'Duplicate match in order fails build');
    assert(
      resOrderDup.stderr.includes('duplicate match in order'),
      `Duplicate match in order error format verified: "${resOrderDup.stderr.trim()}"`
    );

    // Order refers to unknown match
    const dsOrderUnknown = loadBaselineSampleDataset();
    dsOrderUnknown.order[0] = 'unknown-match-slug-2026-11-06';
    const resOrderUnknown = runWithDataset(dsOrderUnknown);
    assert(!resOrderUnknown.success, 'Order referring to unknown match fails build');
    assert(
      resOrderUnknown.stderr.includes('order refers to unknown match'),
      'Order unknown match error format verified'
    );

    // Unsorted kickoff order violation (earlier match placed after later match)
    const dsOrderUnsorted = loadBaselineSampleDataset();
    // Swap the first two matches (where match[0] has earlier kickoff than match[1])
    const temp = dsOrderUnsorted.order[0];
    dsOrderUnsorted.order[0] = dsOrderUnsorted.order[dsOrderUnsorted.order.length - 1];
    dsOrderUnsorted.order[dsOrderUnsorted.order.length - 1] = temp;
    const resOrderUnsorted = runWithDataset(dsOrderUnsorted);
    assert(!resOrderUnsorted.success, 'Unsorted kickoff order fails build');
    assert(
      resOrderUnsorted.stderr.includes('kickoff order violation'),
      `Kickoff order violation error format verified: "${resOrderUnsorted.stderr.trim()}"`
    );

    // Match in matches missing from order
    const dsOrderMissing = loadBaselineSampleDataset();
    dsOrderMissing.order = [
      ...dsOrderMissing.order.slice(1),
      'arsenal-vs-chelsea-2026-11-06', // duplicate
    ];
    delete dsOrderMissing.matches[dsOrderMissing.order[0]]; // remove one from matches
    dsOrderMissing.index.counts.matches--;
    const resOrderMissing = runWithDataset(dsOrderMissing);
    assert(!resOrderMissing.success, 'Mismatch between order and matches keys fails build');
  }

  // =========================================================================
  // 5. Invalid slug format fails
  // =========================================================================
  console.log('\n--- Test 5: Invalid slug format fails ---');
  {
    // League slug with invalid uppercase characters
    const dsLeagueSlug = loadBaselineSampleDataset();
    const lKey = Object.keys(dsLeagueSlug.leagues)[0];
    const origLeague = dsLeagueSlug.leagues[lKey];
    delete dsLeagueSlug.leagues[lKey];
    dsLeagueSlug.leagues['INVALID_SLUG'] = {
      ...origLeague,
      slug: 'INVALID_SLUG',
    };
    const resLeagueSlug = runWithDataset(dsLeagueSlug);
    assert(!resLeagueSlug.success, 'Invalid league slug format fails build');
    assert(
      resLeagueSlug.stderr.includes('slug invalid format'),
      `Invalid league slug error format verified: "${resLeagueSlug.stderr.trim()}"`
    );

    // League key != slug
    const dsLeagueKeyMismatch = loadBaselineSampleDataset();
    const lKey2 = Object.keys(dsLeagueKeyMismatch.leagues)[0];
    dsLeagueKeyMismatch.leagues[lKey2].slug = 'different-slug';
    const resLeagueKeyMismatch = runWithDataset(dsLeagueKeyMismatch);
    assert(!resLeagueKeyMismatch.success, 'League key mismatch with slug fails build');
    assert(
      resLeagueKeyMismatch.stderr.includes('slug does not match map key'),
      'League key mismatch error format verified'
    );

    // Team slug with double hyphen or invalid characters
    const dsTeamSlug = loadBaselineSampleDataset();
    const tKey = Object.keys(dsTeamSlug.teams)[0];
    const origTeam = dsTeamSlug.teams[tKey];
    delete dsTeamSlug.teams[tKey];
    dsTeamSlug.teams['bad--slug'] = {
      ...origTeam,
      slug: 'bad--slug',
    };
    const resTeamSlug = runWithDataset(dsTeamSlug);
    assert(!resTeamSlug.success, 'Invalid team slug format fails build');
    assert(
      resTeamSlug.stderr.includes('slug invalid format'),
      'Invalid team slug error format verified'
    );

    // Team key != slug
    const dsTeamKeyMismatch = loadBaselineSampleDataset();
    const tKey2 = Object.keys(dsTeamKeyMismatch.teams)[0];
    dsTeamKeyMismatch.teams[tKey2].slug = 'mismatched-team-slug';
    const resTeamKeyMismatch = runWithDataset(dsTeamKeyMismatch);
    assert(!resTeamKeyMismatch.success, 'Team key mismatch with slug fails build');
    assert(
      resTeamKeyMismatch.stderr.includes('slug does not match map key'),
      'Team key mismatch error format verified'
    );

    // Match slug invalid regex format
    const dsMatchSlug = loadBaselineSampleDataset();
    const mKey = Object.keys(dsMatchSlug.matches)[0];
    const origMatch = dsMatchSlug.matches[mKey];
    delete dsMatchSlug.matches[mKey];
    const badSlug = 'team-a-team-b-2026-11-06'; // missing -vs-
    dsMatchSlug.matches[badSlug] = {
      ...origMatch,
      slug: badSlug,
    };
    const idx = dsMatchSlug.order.indexOf(mKey);
    dsMatchSlug.order[idx] = badSlug;
    const resMatchSlug = runWithDataset(dsMatchSlug);
    assert(!resMatchSlug.success, 'Invalid match slug format (missing -vs-) fails build');
    assert(
      resMatchSlug.stderr.includes('slug invalid format'),
      'Invalid match slug error format verified'
    );

    // Match slug mismatch with {homeSlug}-vs-{awaySlug}-{kickoffDate}
    const dsMatchMismatch = loadBaselineSampleDataset();
    const mKey2 = Object.keys(dsMatchMismatch.matches)[0];
    const origMatch2 = dsMatchMismatch.matches[mKey2];
    delete dsMatchMismatch.matches[mKey2];
    // Date in slug is 2026-11-07 but kickoff date is 2026-11-06
    const wrongDateSlug = `${origMatch2.homeSlug}-vs-${origMatch2.awaySlug}-2026-11-07`;
    dsMatchMismatch.matches[wrongDateSlug] = {
      ...origMatch2,
      slug: wrongDateSlug,
    };
    const idx2 = dsMatchMismatch.order.indexOf(mKey2);
    dsMatchMismatch.order[idx2] = wrongDateSlug;
    const resMatchMismatch = runWithDataset(dsMatchMismatch);
    assert(!resMatchMismatch.success, 'Match slug date mismatch fails build');
    assert(
      resMatchMismatch.stderr.includes('slug mismatch'),
      `Match slug mismatch error format verified: "${resMatchMismatch.stderr.trim()}"`
    );
  }

  // =========================================================================
  // 6. Kickoff missing UTC Z fails
  // =========================================================================
  console.log('\n--- Test 6: Kickoff missing UTC Z fails ---');
  {
    // Match kickoff missing Z
    const dsNoZ = loadBaselineSampleDataset();
    const mKey = Object.keys(dsNoZ.matches)[0];
    dsNoZ.matches[mKey].kickoff = '2026-11-06T15:00:00'; // Missing 'Z'
    const resNoZ = runWithDataset(dsNoZ);
    assert(!resNoZ.success, 'Kickoff missing Z fails build');
    assert(
      resNoZ.stderr.includes('kickoff invalid timestamp'),
      `Kickoff missing Z error format verified: "${resNoZ.stderr.trim()}"`
    );

    // Match kickoff with timezone offset instead of Z
    const dsOffset = loadBaselineSampleDataset();
    const mKey2 = Object.keys(dsOffset.matches)[0];
    dsOffset.matches[mKey2].kickoff = '2026-11-06T15:00:00+00:00';
    const resOffset = runWithDataset(dsOffset);
    assert(!resOffset.success, 'Kickoff with numeric offset instead of Z fails build');
    assert(
      resOffset.stderr.includes('kickoff invalid timestamp'),
      'Kickoff offset error format verified'
    );

    // Index generatedAt missing Z
    const dsGenAt = loadBaselineSampleDataset();
    dsGenAt.index.generatedAt = '2026-11-05T06:00:00';
    const resGenAt = runWithDataset(dsGenAt);
    assert(!resGenAt.success, 'Index generatedAt missing Z fails build');
    assert(
      resGenAt.stderr.includes('index.json: generatedAt invalid timestamp'),
      'Index generatedAt error format verified'
    );

    // Index window.from missing Z
    const dsWinFrom = loadBaselineSampleDataset();
    dsWinFrom.index.window.from = 'invalid-timestamp';
    const resWinFrom = runWithDataset(dsWinFrom);
    assert(!resWinFrom.success, 'Index window.from invalid timestamp fails build');
    assert(
      resWinFrom.stderr.includes('index.json: window.from invalid timestamp'),
      'Index window.from error format verified'
    );

    // Index window.to missing Z
    const dsWinTo = loadBaselineSampleDataset();
    dsWinTo.index.window.to = '2026-11-09T21:00:00';
    const resWinTo = runWithDataset(dsWinTo);
    assert(!resWinTo.success, 'Index window.to missing Z fails build');
    assert(
      resWinTo.stderr.includes('index.json: window.to invalid timestamp'),
      'Index window.to error format verified'
    );
  }

  // =========================================================================
  // 7. Missing or empty names.en fails
  // =========================================================================
  console.log('\n--- Test 7: Missing or empty names.en fails ---');
  {
    // League missing names.en
    const dsLeagueNoEn = loadBaselineSampleDataset();
    const lKey = Object.keys(dsLeagueNoEn.leagues)[0];
    delete dsLeagueNoEn.leagues[lKey].names.en;
    const resLeagueNoEn = runWithDataset(dsLeagueNoEn);
    assert(!resLeagueNoEn.success, 'League missing names.en fails build');
    assert(
      resLeagueNoEn.stderr.includes('leagues.json') && resLeagueNoEn.stderr.includes('names.en missing or empty'),
      `League missing names.en error verified: "${resLeagueNoEn.stderr.trim()}"`
    );

    // League empty names.en
    const dsLeagueEmptyEn = loadBaselineSampleDataset();
    const lKey2 = Object.keys(dsLeagueEmptyEn.leagues)[0];
    dsLeagueEmptyEn.leagues[lKey2].names.en = '   ';
    const resLeagueEmptyEn = runWithDataset(dsLeagueEmptyEn);
    assert(!resLeagueEmptyEn.success, 'League empty names.en fails build');
    assert(
      resLeagueEmptyEn.stderr.includes('leagues.json') && resLeagueEmptyEn.stderr.includes('names.en missing or empty'),
      'League empty names.en error verified'
    );

    // Team missing names.en
    const dsTeamNoEn = loadBaselineSampleDataset();
    const tKey = Object.keys(dsTeamNoEn.teams)[0];
    delete dsTeamNoEn.teams[tKey].names.en;
    const resTeamNoEn = runWithDataset(dsTeamNoEn);
    assert(!resTeamNoEn.success, 'Team missing names.en fails build');
    assert(
      resTeamNoEn.stderr.includes('teams.json') && resTeamNoEn.stderr.includes('names.en missing or empty'),
      'Team missing names.en error verified'
    );

    // Team empty names.en
    const dsTeamEmptyEn = loadBaselineSampleDataset();
    const tKey2 = Object.keys(dsTeamEmptyEn.teams)[0];
    dsTeamEmptyEn.teams[tKey2].names.en = '';
    const resTeamEmptyEn = runWithDataset(dsTeamEmptyEn);
    assert(!resTeamEmptyEn.success, 'Team empty names.en fails build');
    assert(
      resTeamEmptyEn.stderr.includes('teams.json') && resTeamEmptyEn.stderr.includes('names.en missing or empty'),
      'Team empty names.en error verified'
    );
  }

  // =========================================================================
  // 8. Unknown match status fails
  // =========================================================================
  console.log('\n--- Test 8: Unknown match status / channel type fails ---');
  {
    // Unknown match status
    const dsBadStatus = loadBaselineSampleDataset();
    const mKey = Object.keys(dsBadStatus.matches)[0];
    dsBadStatus.matches[mKey].status = 'in_extra_time';
    const resBadStatus = runWithDataset(dsBadStatus);
    assert(!resBadStatus.success, 'Unknown match status fails build');
    assert(
      resBadStatus.stderr.includes('matches.json') && resBadStatus.stderr.includes('status unknown status "in_extra_time"'),
      `Unknown match status error verified: "${resBadStatus.stderr.trim()}"`
    );

    // Unknown channel type
    const dsBadChType = loadBaselineSampleDataset();
    const chKey = Object.keys(dsBadChType.channels.GB.channels)[0];
    dsBadChType.channels.GB.channels[chKey].type = 'satellite_radio';
    const resBadChType = runWithDataset(dsBadChType);
    assert(!resBadChType.success, 'Unknown channel type fails build');
    assert(
      resBadChType.stderr.includes('channels/GB.json') && resBadChType.stderr.includes('type unknown channel type "satellite_radio"'),
      `Unknown channel type error verified: "${resBadChType.stderr.trim()}"`
    );
  }

  // =========================================================================
  // 9. Referential integrity failures: unknown team, unknown league, unknown channel, empty channel list
  // =========================================================================
  console.log('\n--- Test 9: Referential integrity failures ---');
  {
    // Match refers to unknown league
    const dsBadLeague = loadBaselineSampleDataset();
    const mKey1 = Object.keys(dsBadLeague.matches)[0];
    dsBadLeague.matches[mKey1].leagueSlug = 'non-existent-league';
    const resBadLeague = runWithDataset(dsBadLeague);
    assert(!resBadLeague.success, 'Unknown leagueSlug fails build');
    assert(
      resBadLeague.stderr.includes('leagueSlug refers to unknown league "non-existent-league"'),
      `Unknown leagueSlug error verified: "${resBadLeague.stderr.trim()}"`
    );

    // Match refers to unknown home team
    const dsBadHome = loadBaselineSampleDataset();
    const mKey2 = Object.keys(dsBadHome.matches)[0];
    dsBadHome.matches[mKey2].homeSlug = 'non-existent-home-team';
    const resBadHome = runWithDataset(dsBadHome);
    assert(!resBadHome.success, 'Unknown homeSlug fails build');
    assert(
      resBadHome.stderr.includes('homeSlug refers to unknown team "non-existent-home-team"'),
      'Unknown homeSlug error verified'
    );

    // Match refers to unknown away team
    const dsBadAway = loadBaselineSampleDataset();
    const mKey3 = Object.keys(dsBadAway.matches)[0];
    dsBadAway.matches[mKey3].awaySlug = 'non-existent-away-team';
    const resBadAway = runWithDataset(dsBadAway);
    assert(!resBadAway.success, 'Unknown awaySlug fails build');
    assert(
      resBadAway.stderr.includes('awaySlug refers to unknown team "non-existent-away-team"'),
      'Unknown awaySlug error verified'
    );

    // Channel listings refer to unknown match
    const dsChBadMatch = loadBaselineSampleDataset();
    dsChBadMatch.channels.GB.matches['non-existent-match-slug'] = ['sky-sports-main-event'];
    const resChBadMatch = runWithDataset(dsChBadMatch);
    assert(!resChBadMatch.success, 'Channel listing referring to unknown match fails build');
    assert(
      resChBadMatch.stderr.includes('channels/GB.json') && resChBadMatch.stderr.includes('refers to unknown match'),
      'Channel unknown match error verified'
    );

    // Channel listings has empty channel array (must be omitted)
    const dsChEmpty = loadBaselineSampleDataset();
    const mKeyCh = Object.keys(dsChEmpty.channels.GB.matches)[0];
    dsChEmpty.channels.GB.matches[mKeyCh] = [];
    const resChEmpty = runWithDataset(dsChEmpty);
    assert(!resChEmpty.success, 'Empty channel list in channel file fails build');
    assert(
      resChEmpty.stderr.includes('match has empty channel list (must be omitted)'),
      `Empty channel list error verified: "${resChEmpty.stderr.trim()}"`
    );

    // Channel listings refer to unknown channel ID
    const dsChBadId = loadBaselineSampleDataset();
    const mKeyCh2 = Object.keys(dsChBadId.channels.GB.matches)[0];
    dsChBadId.channels.GB.matches[mKeyCh2] = ['non-existent-channel-id'];
    const resChBadId = runWithDataset(dsChBadId);
    assert(!resChBadId.success, 'Unknown channel ID in channel listing fails build');
    assert(
      resChBadId.stderr.includes('refers to unknown channel "non-existent-channel-id"'),
      `Unknown channel ID error verified: "${resChBadId.stderr.trim()}"`
    );
  }

  // =========================================================================
  // 10. Non-map dataset input fails
  // =========================================================================
  console.log('\n--- Test 10: Non-map dataset input fails ---');
  {
    const resNonMap = runWithDataset({
      _harnessDirect: true,
      dataset: 'not-a-map',
    });
    assert(!resNonMap.success, 'Non-map dataset parameter fails build');
    assert(
      resNonMap.stderr.includes('data-pages: validate: dataset is missing or not a map'),
      'Non-map dataset error verified'
    );
  }

} finally {
  console.log('\n🧹 Cleaning up test harness and temporary files...');
  cleanupHarness();
}

console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================\n');

if (failedTests > 0) {
  console.error('❌ Some tests failed.');
  process.exit(1);
} else {
  console.log('🎉 All CFC Comprehensive Dataset Validator tests passed successfully!');
  process.exit(0);
}
