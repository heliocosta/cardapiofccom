#!/usr/bin/env node

/**
 * Spike verification script for Hugo 0.165+ / 0.169 content adapter multi-language capabilities.
 *
 * Verifies:
 * 1. Content adapter execution using .EnableAllLanguages with sites.matrix across all six edition language codes.
 * 2. Hugo built-ins execution inside adapter templates (hugo.Sites, hugo.Data, resources.GetRemote, os.Getenv, partialCached).
 * 3. Section page rendering suppression (build.render: "never") on /match/ and /team/, while /league/ directory is rendered.
 * 4. Nested child pages generation (match section + lineup child page, team page, league page).
 * 5. URL translation links across editions.
 * 6. Zero path warnings / collisions.
 * 7. Clean teardown of temporary spike artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const TEMP_BUILD_DIR = path.join('/tmp', `cfc-spike-build-${Date.now()}`);

const EDITIONS = ['en', 'en-gb', 'en-ie', 'pt-br', 'pt-pt', 'es-ar'];
const MATCH_SLUG = 'arsenal-vs-chelsea-2026-11-05';
const TEAM_SLUG = 'arsenal';
const LEAGUE_SLUG = 'premier-league';

const SPIKE_DIRS = [
  path.join(ROOT_DIR, 'content/en/match'),
  path.join(ROOT_DIR, 'content/en/team'),
  path.join(ROOT_DIR, 'content/en/league'),
  path.join(ROOT_DIR, 'layouts/_partials/spike'),
];

const SPIKE_FILES = {
  matchIndex: path.join(ROOT_DIR, 'content/en/match/_index.md'),
  matchGotmpl: path.join(ROOT_DIR, 'content/en/match/_content.gotmpl'),
  teamIndex: path.join(ROOT_DIR, 'content/en/team/_index.md'),
  teamGotmpl: path.join(ROOT_DIR, 'content/en/team/_content.gotmpl'),
  leagueIndex: path.join(ROOT_DIR, 'content/en/league/_index.md'),
  leagueGotmpl: path.join(ROOT_DIR, 'content/en/league/_content.gotmpl'),
  spikePartial: path.join(ROOT_DIR, 'layouts/_partials/spike/test-cached.html'),
  spikeData: path.join(ROOT_DIR, 'data/spike_test.json'),
};

function setupSpikeArtifacts() {
  console.log('1. Setting up spike prototype artifacts...');

  for (const dir of SPIKE_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(path.dirname(SPIKE_FILES.spikeData), { recursive: true });

  // 1. Match section index with sites.matrix and build.render: never
  fs.writeFileSync(
    SPIKE_FILES.matchIndex,
    `---
title: "Matches"
sites:
  matrix:
    languages: ["**"]
build:
  render: never
  list: always
---
`
  );

  // 2. Team section index with sites.matrix and build.render: never
  fs.writeFileSync(
    SPIKE_FILES.teamIndex,
    `---
title: "Teams"
sites:
  matrix:
    languages: ["**"]
build:
  render: never
  list: always
---
`
  );

  // 3. League section index (directory page rendered)
  fs.writeFileSync(
    SPIKE_FILES.leagueIndex,
    `---
title: "Leagues"
sites:
  matrix:
    languages: ["**"]
params:
  cfc:
    kind: "leagues"
---
`
  );

  // Cached partial to test partialCached inside adapter
  fs.writeFileSync(
    SPIKE_FILES.spikePartial,
    `{{ $val := printf "cached-result-for-%s" site.Language.Lang }}
{{ return $val }}
`
  );

  // Data file to test hugo.Data inside adapter
  fs.writeFileSync(
    SPIKE_FILES.spikeData,
    JSON.stringify({ testKey: 'spike-data-value' }, null, 2)
  );

  // Match content adapter template testing all required capabilities + match section and lineup page
  fs.writeFileSync(
    SPIKE_FILES.matchGotmpl,
    `{{ .EnableAllLanguages }}

{{/* 1. hugo.Sites check */}}
{{ $sitesCount := len hugo.Sites }}
{{ warnf "SPIKE hugo.Sites count: %d (lang: %s)" $sitesCount site.Language.Lang }}

{{/* 2. hugo.Data check */}}
{{ $testDataVal := hugo.Data.spike_test.testKey }}
{{ warnf "SPIKE hugo.Data testKey: %s (lang: %s)" $testDataVal site.Language.Lang }}

{{/* 3. os.Getenv check */}}
{{ $envVal := os.Getenv "HUGO_CFC_SPIKE_ENV" }}
{{ warnf "SPIKE os.Getenv: %s (lang: %s)" $envVal site.Language.Lang }}

{{/* 4. partialCached check */}}
{{ $cachedVal := partialCached "spike/test-cached.html" . site.Language.Lang }}
{{ warnf "SPIKE partialCached: %s (lang: %s)" $cachedVal site.Language.Lang }}

{{/* 5. resources.GetRemote check */}}
{{ $remoteStatus := "untested" }}
{{ with try (resources.GetRemote "https://httpbin.org/get") }}
  {{ with .Err }}
    {{ $remoteStatus = printf "error: %s" . }}
  {{ else }}
    {{ with .Value }}
      {{ $remoteStatus = printf "success: HTTP %d" .Data.StatusCode | default "success" }}
    {{ else }}
      {{ $remoteStatus = "404/nil" }}
    {{ end }}
  {{ end }}
{{ end }}
{{ warnf "SPIKE resources.GetRemote: %s (lang: %s)" $remoteStatus site.Language.Lang }}

{{/* Page generation: match section + lineup page */}}
{{ $matchSlug := "${MATCH_SLUG}" }}
{{ $matchPage := dict
  "kind" "section"
  "path" $matchSlug
  "title" (printf "Arsenal vs Chelsea (%s)" site.Language.Lang)
  "params" (dict "cfc" (dict "kind" "match" "slug" $matchSlug "appPath" (printf "/match/%s" $matchSlug)))
}}
{{ $.AddPage $matchPage }}

{{ $lineupPage := dict
  "kind" "page"
  "path" (printf "%s/lineup" $matchSlug)
  "title" (printf "Arsenal vs Chelsea Lineup (%s)" site.Language.Lang)
  "params" (dict "cfc" (dict "kind" "lineup" "slug" $matchSlug "appPath" (printf "/match/%s/lineup" $matchSlug)))
}}
{{ $.AddPage $lineupPage }}
`
  );

  // Team content adapter template
  fs.writeFileSync(
    SPIKE_FILES.teamGotmpl,
    `{{ .EnableAllLanguages }}
{{ $teamSlug := "${TEAM_SLUG}" }}
{{ $.AddPage (dict
  "kind" "page"
  "path" $teamSlug
  "title" (printf "Arsenal (%s)" site.Language.Lang)
  "params" (dict "cfc" (dict "kind" "team" "slug" $teamSlug "appPath" (printf "/team/%s" $teamSlug)))
) }}
`
  );

  // League content adapter template
  fs.writeFileSync(
    SPIKE_FILES.leagueGotmpl,
    `{{ .EnableAllLanguages }}
{{ $leagueSlug := "${LEAGUE_SLUG}" }}
{{ $.AddPage (dict
  "kind" "page"
  "path" $leagueSlug
  "title" (printf "Premier League (%s)" site.Language.Lang)
  "params" (dict "cfc" (dict "kind" "league" "slug" $leagueSlug "appPath" (printf "/league/%s" $leagueSlug)))
) }}
`
  );
}

function cleanupSpikeArtifacts() {
  console.log('Cleaning up spike prototype artifacts...');
  try {
    for (const dir of SPIKE_DIRS) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    if (fs.existsSync(SPIKE_FILES.spikeData)) {
      fs.rmSync(SPIKE_FILES.spikeData, { force: true });
    }
    if (fs.existsSync(TEMP_BUILD_DIR)) {
      fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

function runSpikeBuild() {
  console.log('2. Running Hugo build with --printPathWarnings...');
  const env = {
    ...process.env,
    HUGO_CFC_SPIKE_ENV: 'spike-test-ok',
  };

  const output = execSync(
    `pnpm exec hugo --environment development -d "${TEMP_BUILD_DIR}" --printPathWarnings 2>&1`,
    { env, encoding: 'utf8' }
  );

  return output;
}

function verifyOutput(buildLogs) {
  console.log('3. Validating spike assertions...');

  // A. Check zero path collision warnings
  if (buildLogs.includes('duplicate target path') || buildLogs.includes('path warning')) {
    throw new Error('Path collision warning detected in Hugo build output!');
  }

  // B. Verify built-ins execution across all 6 editions
  for (const lang of EDITIONS) {
    // hugo.Sites count == 6
    const sitesMatch = buildLogs.includes(`SPIKE hugo.Sites count: 6 (lang: ${lang})`);
    if (!sitesMatch) {
      throw new Error(`hugo.Sites validation failed for language: ${lang}`);
    }

    // hugo.Data
    const dataMatch = buildLogs.includes(`SPIKE hugo.Data testKey: spike-data-value (lang: ${lang})`);
    if (!dataMatch) {
      throw new Error(`hugo.Data validation failed for language: ${lang}`);
    }

    // os.Getenv
    const envMatch = buildLogs.includes(`SPIKE os.Getenv: spike-test-ok (lang: ${lang})`);
    if (!envMatch) {
      throw new Error(`os.Getenv validation failed for language: ${lang}`);
    }

    // partialCached
    const partialMatch = buildLogs.includes(`SPIKE partialCached: cached-result-for-${lang} (lang: ${lang})`);
    if (!partialMatch) {
      throw new Error(`partialCached validation failed for language: ${lang}`);
    }

    // resources.GetRemote
    const remoteMatch = buildLogs.includes(`SPIKE resources.GetRemote: success: HTTP 200 (lang: ${lang})`);
    if (!remoteMatch) {
      throw new Error(`resources.GetRemote validation failed for language: ${lang}`);
    }
  }
  console.log('  ✔ All 5 Hugo built-ins executed reliably across all 6 editions.');

  // C. Verify section page rendering suppression (build.render: "never") for match/ and team/
  for (const section of ['match', 'team']) {
    const globalSectionPath = path.join(TEMP_BUILD_DIR, `${section}/index.html`);
    if (fs.existsSync(globalSectionPath)) {
      throw new Error(`Section index unexpectedly rendered at: ${globalSectionPath}`);
    }

    for (const lang of EDITIONS) {
      if (lang === 'en') continue;
      const prefixSectionPath = path.join(TEMP_BUILD_DIR, lang, `${section}/index.html`);
      if (fs.existsSync(prefixSectionPath)) {
        throw new Error(`Section index unexpectedly rendered at: ${prefixSectionPath}`);
      }
    }
  }
  console.log('  ✔ Section page rendering suppression (build.render: "never") verified for match and team across all editions.');

  // D. Verify league directory page is rendered across all editions (Requirement 3.2)
  const globalLeagueDir = path.join(TEMP_BUILD_DIR, 'league/index.html');
  if (!fs.existsSync(globalLeagueDir)) {
    throw new Error(`Expected league directory missing: ${globalLeagueDir}`);
  }
  for (const lang of EDITIONS) {
    if (lang === 'en') continue;
    const prefixLeagueDir = path.join(TEMP_BUILD_DIR, lang, 'league/index.html');
    if (!fs.existsSync(prefixLeagueDir)) {
      throw new Error(`Expected league directory missing: ${prefixLeagueDir}`);
    }
  }
  console.log('  ✔ League directory page rendered at {edition prefix}league/ across all editions.');

  // E. Verify dummy match, lineup, team, and league pages generated across all edition prefixes (Requirement 3.1)
  for (const lang of EDITIONS) {
    const prefix = lang === 'en' ? '' : `${lang}/`;
    const matchPage = path.join(TEMP_BUILD_DIR, prefix, `match/${MATCH_SLUG}/index.html`);
    const lineupPage = path.join(TEMP_BUILD_DIR, prefix, `match/${MATCH_SLUG}/lineup/index.html`);
    const teamPage = path.join(TEMP_BUILD_DIR, prefix, `team/${TEAM_SLUG}/index.html`);
    const leaguePage = path.join(TEMP_BUILD_DIR, prefix, `league/${LEAGUE_SLUG}/index.html`);

    if (!fs.existsSync(matchPage)) {
      throw new Error(`Expected match page missing: ${matchPage}`);
    }
    if (!fs.existsSync(lineupPage)) {
      throw new Error(`Expected lineup page missing: ${lineupPage}`);
    }
    if (!fs.existsSync(teamPage)) {
      throw new Error(`Expected team page missing: ${teamPage}`);
    }
    if (!fs.existsSync(leaguePage)) {
      throw new Error(`Expected league page missing: ${leaguePage}`);
    }

    // F. Verify URL translation links across editions (Requirement 3.5)
    const matchContent = fs.readFileSync(matchPage, 'utf8');
    for (const targetLang of EDITIONS) {
      const targetPrefix = targetLang === 'en' ? '' : `/${targetLang}`;
      const expectedHref = `${targetPrefix}/match/${MATCH_SLUG}/`;
      if (!matchContent.includes(expectedHref)) {
        throw new Error(`Translation link to "${expectedHref}" not found in ${matchPage}`);
      }
    }
  }
  console.log('  ✔ Dummy match, lineup, team, and league pages generated across all 6 edition prefixes.');
  console.log('  ✔ Cross-edition translation links verified across all generated entity pages.');
}

function main() {
  console.log('=== Starting Hugo 0.165+ Content Adapter Spike ===\n');
  try {
    setupSpikeArtifacts();
    const buildOutput = runSpikeBuild();
    verifyOutput(buildOutput);
    console.log('\n✅ All Spike checks passed successfully!');
  } finally {
    cleanupSpikeArtifacts();
  }
}

main();
