#!/usr/bin/env node

/**
 * Automated test suite for Task 6.2: Match Hero, Channel Listings, and Edition Cross-Links Partials
 *
 * Verifies:
 * 1. Existence and integrity of the 3 partials in layouts/_partials/cfcpage/:
 *    - match-hero.html
 *    - channels.html
 *    - edition-links.html
 * 2. Strict enforcement that lineups are OUT OF SCOPE:
 *    - Zero occurrences of "lineup" in layouts/_partials/cfcpage/
 * 3. MatchHero partial:
 *    - Statuses: scheduled (kickoff time), live (badge + pulse + score), halftime (badge + score),
 *      finished (score + badge), postponed (warning badge)
 *    - League link, round, team names, team links, team crests (size lg, decorative false)
 *    - Venue info formatting and clean omission when missing/empty
 *    - Signature support: MatchVM map, dict with "match", or slug string
 * 4. Channels partial:
 *    - Global edition: country groups, localized headers, channel badges (size md, rel noopener nofollow)
 *    - Regional edition: single country group for current edition only
 *    - Empty state: cfc-empty-state rendered with no_broadcaster_check_app message when no broadcaster
 * 5. EditionLinks partial:
 *    - Regional edition: renders <aside class="cfc-edition-links"> with <a hreflang lang> for other broadcasting countries
 *    - Does NOT link to current edition
 *    - Global edition: renders nothing (empty output)
 * 6. Site check verification (`pnpm check`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

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

console.log('🧪 Starting CFC Match Partials (Task 6.2) test suite...\n');

// ============================================================================
// Test 1: File Existence and Lineup Out-of-Scope Enforcement
// ============================================================================
console.log('--- Test 1: File Existence & Strict Lineup Scope ---');

const partialFiles = [
  path.join(ROOT_DIR, 'layouts/_partials/cfcpage/match-hero.html'),
  path.join(ROOT_DIR, 'layouts/_partials/cfcpage/channels.html'),
  path.join(ROOT_DIR, 'layouts/_partials/cfcpage/edition-links.html'),
];

for (const pf of partialFiles) {
  assert(fs.existsSync(pf), `Partial exists: ${path.relative(ROOT_DIR, pf)}`);
  const content = fs.readFileSync(pf, 'utf8');
  // Check for any mention of lineup in code (excluding the required disclaimer comments if present)
  // Strip comments first
  const noComments = content.replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, '');
  assert(!noComments.toLowerCase().includes('lineup'), `No lineup references in code of ${path.basename(pf)}`);
}

// ============================================================================
// Test 2: Probe Hugo Build Exercising All Three Partials
// ============================================================================
console.log('\n--- Test 2: Hugo Probe Execution Across Global & Regional Editions ---');

const testContentPathEn = path.join(ROOT_DIR, 'content/en/_cfc_match_partials_probe.md');
const testContentPathGb = path.join(ROOT_DIR, 'content/en-gb/_cfc_match_partials_probe.md');
const testContentPathPt = path.join(ROOT_DIR, 'content/pt-br/_cfc_match_partials_probe.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_match_partials_probe.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_match_partials_build');

function cleanupHarness() {
  if (fs.existsSync(testContentPathEn)) fs.unlinkSync(testContentPathEn);
  if (fs.existsSync(testContentPathGb)) fs.unlinkSync(testContentPathGb);
  if (fs.existsSync(testContentPathPt)) fs.unlinkSync(testContentPathPt);
  if (fs.existsSync(testLayoutPath)) fs.unlinkSync(testLayoutPath);
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

const probeLayout = `
{{- $scheduledSlug := "sao-paulo-vs-flamengo-2026-11-08" -}}
{{- $liveSlug := "flamengo-vs-palmeiras-2026-11-07" -}}
{{- $halftimeSlug := "manchester-city-vs-arsenal-2026-11-06" -}}
{{- $finishedSlug := "arsenal-vs-chelsea-2026-11-06" -}}
{{- $postponedSlug := "real-madrid-vs-barcelona-2026-11-08" -}}

{{/* 1. Hero tests with different statuses and signatures */}}
{{- $heroScheduled := partial "cfcpage/match-hero.html" $scheduledSlug -}}
{{- $heroLive := partial "cfcpage/match-hero.html" (dict "match" $liveSlug) -}}
{{- $heroHalftime := partial "cfcpage/match-hero.html" (dict "match" (partial "cfcdata/match.html" $halftimeSlug)) -}}
{{- $heroFinished := partial "cfcpage/match-hero.html" $finishedSlug -}}
{{- $heroPostponed := partial "cfcpage/match-hero.html" $postponedSlug -}}

{{/* Hero with missing venue */}}
{{- $noVenueMatch := dict "status" "scheduled" "kickoff" "2026-11-08T12:00:00Z" "home" (dict "name" "Home Team" "shortName" "HOM" "crest" "" "url" "/home/") "away" (dict "name" "Away Team" "shortName" "AWA" "crest" "" "url" "/away/") "league" (dict "name" "League One" "url" "/league/") -}}
{{- $heroNoVenue := partial "cfcpage/match-hero.html" $noVenueMatch -}}

{{/* 2. Channels tests */}}
{{- $channelsBroadcast := partial "cfcpage/channels.html" $finishedSlug -}}
{{- $channelsNoBroadcast := partial "cfcpage/channels.html" "non-existent-match-slug" -}}
{{- $channelsFlamengo := partial "cfcpage/channels.html" $liveSlug -}}

{{/* 3. Edition links tests */}}
{{- $editionLinksFinished := partial "cfcpage/edition-links.html" $finishedSlug -}}
{{- $editionLinksNoBroadcast := partial "cfcpage/edition-links.html" "non-existent-match-slug" -}}

{{- $res := dict
  "heroScheduled" $heroScheduled
  "heroLive" $heroLive
  "heroHalftime" $heroHalftime
  "heroFinished" $heroFinished
  "heroPostponed" $heroPostponed
  "heroNoVenue" $heroNoVenue
  "channelsBroadcast" $channelsBroadcast
  "channelsNoBroadcast" $channelsNoBroadcast
  "channelsFlamengo" $channelsFlamengo
  "editionLinksFinished" $editionLinksFinished
  "editionLinksNoBroadcast" $editionLinksNoBroadcast
-}}
{{- $res | jsonify -}}
`;

try {
  cleanupHarness();

  fs.writeFileSync(
    testContentPathEn,
    `---
title: "Probe EN"
layout: "_cfc_match_partials_probe"
url: "/cfc-probe-en.json"
---
`
  );

  fs.writeFileSync(
    testContentPathGb,
    `---
title: "Probe GB"
layout: "_cfc_match_partials_probe"
url: "/en-gb/cfc-probe-gb.json"
---
`
  );

  fs.writeFileSync(
    testContentPathPt,
    `---
title: "Probe PT"
layout: "_cfc_match_partials_probe"
url: "/pt-br/cfc-probe-pt.json"
---
`
  );

  fs.writeFileSync(testLayoutPath, probeLayout);

  const hugoCmd = `hugo -e development --ignoreCache --destination "${tempBuildDir}" 2>&1`;
  const hugoExec = execSync(hugoCmd, {
    cwd: ROOT_DIR,
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: 'sample' },
    encoding: 'utf8',
  });

  const outEnPath = path.join(tempBuildDir, 'cfc-probe-en.json');
  const outGbPath = path.join(tempBuildDir, 'en-gb/cfc-probe-gb.json');
  const outPtPath = path.join(tempBuildDir, 'pt-br/cfc-probe-pt.json');

  assert(fs.existsSync(outEnPath), 'Probe EN output generated');
  assert(fs.existsSync(outGbPath), 'Probe GB output generated');
  assert(fs.existsSync(outPtPath), 'Probe PT output generated');

  const enData = JSON.parse(fs.readFileSync(outEnPath, 'utf8'));
  const gbData = JSON.parse(fs.readFileSync(outGbPath, 'utf8'));
  const ptData = JSON.parse(fs.readFileSync(outPtPath, 'utf8'));

  // ============================================================================
  // Test 3: MatchHero Assertions
  // ============================================================================
  console.log('\n--- Test 3: MatchHero Rendering & Behavior ---');

  // Scheduled match
  assert(enData.heroScheduled.includes('cfc-match-hero--scheduled'), 'Scheduled hero has cfc-match-hero--scheduled');
  assert(enData.heroScheduled.includes('cfc-kickoff-time'), 'Scheduled hero renders kickoff time');
  assert(enData.heroScheduled.includes('cfc-team-crest--lg'), 'Hero renders large team crests (cfc-team-crest--lg)');
  assert(enData.heroScheduled.includes('aria-hidden="false"'), 'Hero crests have decorative: false (aria-hidden="false")');
  assert(enData.heroScheduled.includes('cfc-match-hero__team-name'), 'Hero renders team name classes');
  assert(enData.heroScheduled.includes('São Paulo'), 'Hero renders home team name');
  assert(enData.heroScheduled.includes('Flamengo'), 'Hero renders away team name');
  assert(enData.heroScheduled.includes('/team/sao-paulo/'), 'Hero links home team URL');
  assert(enData.heroScheduled.includes('/team/flamengo/'), 'Hero links away team URL');
  assert(enData.heroScheduled.includes('/league/brasileirao-serie-a/'), 'Hero links league URL');
  assert(enData.heroScheduled.includes('cfc-match-hero__round'), 'Hero renders round info');
  assert(enData.heroScheduled.includes('MorumBIS'), 'Hero renders venue name');
  assert(enData.heroScheduled.includes('São Paulo'), 'Hero renders venue city');

  // Regional URLs in GB hero
  assert(gbData.heroScheduled.includes('/en-gb/team/sao-paulo/'), 'GB hero home link has /en-gb/ prefix');
  assert(gbData.heroScheduled.includes('/en-gb/team/flamengo/'), 'GB hero away link has /en-gb/ prefix');
  assert(gbData.heroScheduled.includes('/en-gb/league/brasileirao-serie-a/'), 'GB hero league link has /en-gb/ prefix');

  // Live match
  assert(enData.heroLive.includes('cfc-match-hero--live'), 'Live hero has cfc-match-hero--live');
  assert(enData.heroLive.includes('cfc-match-card__badge--live'), 'Live hero has live badge');
  assert(enData.heroLive.includes('cfc-match-card__pulse'), 'Live hero has pulse element');
  assert(enData.heroLive.includes('1 - 1'), 'Live hero displays score');

  // Halftime match
  assert(enData.heroHalftime.includes('cfc-match-hero--halftime'), 'Halftime hero has cfc-match-hero--halftime');
  assert(enData.heroHalftime.includes('cfc-match-hero__live'), 'Halftime hero uses live container');
  assert(enData.heroHalftime.includes('1 - 0'), 'Halftime hero displays score');

  // Finished match
  assert(enData.heroFinished.includes('cfc-match-hero--finished'), 'Finished hero has cfc-match-hero--finished');
  assert(enData.heroFinished.includes('cfc-match-card__badge--finished'), 'Finished hero has finished badge');
  assert(enData.heroFinished.includes('2 - 1'), 'Finished hero displays final score');

  // Postponed match
  assert(enData.heroPostponed.includes('cfc-match-hero--postponed'), 'Postponed hero has cfc-match-hero--postponed');
  assert(enData.heroPostponed.includes('cfc-match-card__badge--warning'), 'Postponed hero has warning badge');

  // Omission of venue when missing/empty
  assert(!enData.heroNoVenue.includes('cfc-match-hero__venue'), 'Hero cleanly omits venue section when venue is absent');

  // ============================================================================
  // Test 4: Channels Partial Assertions
  // ============================================================================
  console.log('\n--- Test 4: Channels Partial (Global vs Regional vs Empty) ---');

  // Global edition (EN)
  assert(
    enData.channelsBroadcast.includes('cfc-channels') && enData.channelsBroadcast.includes('space-y-6'),
    'Global channels has container with space-y-6'
  );
  assert(enData.channelsBroadcast.includes('cfc-channels__group'), 'Global channels renders country groups');
  assert(enData.channelsBroadcast.includes('Where to watch in United Kingdom'), 'Global channels has UK header');
  assert(enData.channelsBroadcast.includes('Where to watch in Brazil'), 'Global channels has Brazil header');
  assert(enData.channelsBroadcast.includes('cfc-channel-badge--md'), 'Channel badges use size="md"');
  assert(enData.channelsBroadcast.includes('rel="noopener nofollow"'), 'Channel badges have rel="noopener nofollow"');
  assert(enData.channelsBroadcast.includes('Sky Sports Main Event'), 'Global channels includes Sky Sports');
  assert(
    enData.channelsBroadcast.includes('Disney+') || enData.channelsBroadcast.includes('Disney&#43;'),
    'Global channels includes Disney+'
  );

  // Empty state in Global edition
  assert(enData.channelsNoBroadcast.includes('cfc-empty-state'), 'Empty state rendered for match with no broadcasts');
  assert(enData.channelsNoBroadcast.includes('No confirmed broadcaster — check the CardápioFC app.'), 'Empty state has default message in EN');

  // Regional edition (GB)
  assert(!gbData.channelsBroadcast.includes('cfc-channels space-y-6'), 'Regional channels does not use multi-group space-y-6');
  assert(gbData.channelsBroadcast.includes('Where to watch in United Kingdom'), 'GB channels has UK header');
  assert(!gbData.channelsBroadcast.includes('Where to watch in Brazil'), 'GB channels does NOT render Brazil section');
  assert(!gbData.channelsBroadcast.includes('Where to watch in Portugal'), 'GB channels does NOT render Portugal section');
  assert(gbData.channelsBroadcast.includes('Sky Sports Main Event'), 'GB channels includes Sky Sports');

  // Regional empty state (flamengo-vs-palmeiras is only broadcast in BR, not GB)
  assert(gbData.channelsFlamengo.includes('cfc-empty-state'), 'GB channels renders empty state for match without UK broadcast');
  assert(gbData.channelsFlamengo.includes('No confirmed broadcaster — check the CardápioFC app.'), 'GB channels displays no broadcaster message');

  // Regional empty state in PT-BR (localized message)
  assert(ptData.channelsNoBroadcast.includes('cfc-empty-state'), 'PT-BR channels renders empty state');
  assert(ptData.channelsNoBroadcast.includes('Sem transmissão confirmada — consulte o app CardápioFC.'), 'PT-BR empty state is localized');

  // ============================================================================
  // Test 5: EditionLinks Partial Assertions
  // ============================================================================
  console.log('\n--- Test 5: EditionLinks Partial (Regional Cross-Links vs Global) ---');

  // Global edition should render nothing
  assert(enData.editionLinksFinished.trim() === '', 'Global edition produces empty string for edition-links');
  assert(!enData.editionLinksFinished.includes('cfc-edition-links'), 'Global edition does not render cfc-edition-links container');

  // Regional edition (GB) for multi-broadcast match (arsenal-vs-chelsea)
  assert(gbData.editionLinksFinished.includes('cfc-edition-links'), 'Regional edition (GB) renders cfc-edition-links');
  assert(gbData.editionLinksFinished.includes('Watch in other countries'), 'GB edition-links renders heading');
  assert(gbData.editionLinksFinished.includes('hreflang="pt-br"'), 'GB edition-links contains hreflang="pt-br"');
  assert(gbData.editionLinksFinished.includes('lang="pt-br"'), 'GB edition-links contains lang="pt-br"');
  assert(gbData.editionLinksFinished.includes('/pt-br/match/arsenal-vs-chelsea-2026-11-06/'), 'Cross-link points to match in PT-BR edition');
  assert(!gbData.editionLinksFinished.includes('hreflang="en-gb"'), 'GB edition-links does NOT link to itself');

  // Regional edition (PT-BR) localized heading & link back to GB
  assert(ptData.editionLinksFinished.includes('Assistir em outros países'), 'PT-BR edition-links heading is localized');
  assert(ptData.editionLinksFinished.includes('hreflang="en-gb"'), 'PT-BR edition-links links to GB');
  assert(ptData.editionLinksFinished.includes('/en-gb/match/arsenal-vs-chelsea-2026-11-06/'), 'Cross-link points to match in GB edition');

  // When no broadcasts exist in other countries
  assert(gbData.editionLinksNoBroadcast.trim() === '', 'edition-links renders nothing when no other broadcast exists');

  // ============================================================================
  // Test 6: Strict Lineup Absence Across All Rendered Outputs
  // ============================================================================
  console.log('\n--- Test 6: Strict Absence of Lineup in All Rendered Output ---');

  const allRenderedHtml = [
    JSON.stringify(enData),
    JSON.stringify(gbData),
    JSON.stringify(ptData),
  ].join(' ');

  assert(!allRenderedHtml.toLowerCase().includes('lineup'), 'Rendered HTML contains zero references to lineup');

} catch (err) {
  console.error('Unhandled test suite exception:', err);
  failedTests++;
} finally {
  console.log('\n🧹 Cleaning up test harness and temporary files...');
  cleanupHarness();
}

// ============================================================================
// Test 7: Site check verification (pnpm check)
// ============================================================================
console.log('\n--- Test 7: Site check verification (pnpm check) ---');

try {
  const checkOutput = execSync('pnpm check', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert(checkOutput.includes('All site checks passed successfully'), 'pnpm check passed with 0 errors');
} catch (err) {
  assert(false, `pnpm check failed: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================');

if (failedTests > 0) {
  console.error('\n❌ CFC Match Partials test suite failed!');
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Match Partials tests passed successfully!');
  process.exit(0);
}
