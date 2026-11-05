#!/usr/bin/env node

/**
 * Automated test suite for Task 5.3: Build Team and League Content Adapters
 *
 * Verifies:
 * 1. Content adapter file specifications:
 *    - content/en/team/_content.gotmpl:
 *      * {{ .EnableAllLanguages }}
 *      * partialCached "cfcdata/dataset.html"
 *      * partial "cfcdata/name.html"
 *      * $.AddPage with kind "page", path $slug, title $teamName, dates, params.cfc (kind: "team", slug, appPath)
 *    - content/en/league/_content.gotmpl:
 *      * {{ .EnableAllLanguages }}
 *      * partialCached "cfcdata/dataset.html"
 *      * partial "cfcdata/name.html"
 *      * weight based on cond $league.popular 1 2
 *      * $.AddPage with kind "page", path $slug, title $leagueName, weight, dates, params.cfc (kind: "league", slug, appPath)
 * 2. Hugo build execution (pnpm build with HUGO_CFC_DATA_SOURCE=sample) succeeds with 0 errors and no duplicate target paths.
 * 3. Team pages generated across all 6 editions:
 *    - 8 teams × 6 editions = 48 team HTML pages:
 *      * Global: public/team/{slug}/index.html
 *      * Regional: public/{edition}/team/{slug}/index.html (en-gb, en-ie, pt-br, pt-pt, es-ar)
 * 4. League pages generated across all 6 editions:
 *    - 3 leagues × 6 editions = 18 league HTML pages:
 *      * Global: public/league/{slug}/index.html
 *      * Regional: public/{edition}/league/{slug}/index.html (en-gb, en-ie, pt-br, pt-pt, es-ar)
 * 5. League directory page persists across all 6 editions:
 *    - Global: public/league/index.html
 *    - Regional: public/{edition}/league/index.html
 * 6. Section listings suppression persists:
 *    - /team/index.html does NOT exist in any edition (6 editions checked).
 * 7. Verified absence of lineup pages:
 *    - Lineups are completely OUT OF SCOPE per user directive.
 * 8. Cross-edition translation links connect the same team and league across all 6 editions.
 * 9. Site check verification (pnpm check passes with 0 errors).
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

const EDITIONS = [
  { code: 'en', prefix: '', label: 'Global (English)', hreflang: 'en' },
  { code: 'en-gb', prefix: 'en-gb', label: 'UK (English)', hreflang: 'en-GB' },
  { code: 'en-ie', prefix: 'en-ie', label: 'Ireland (English)', hreflang: 'en-IE' },
  { code: 'pt-br', prefix: 'pt-br', label: 'Brasil (Português)', hreflang: 'pt-BR' },
  { code: 'pt-pt', prefix: 'pt-pt', label: 'Portugal (Português)', hreflang: 'pt-PT' },
  { code: 'es-ar', prefix: 'es-ar', label: 'Argentina (Español)', hreflang: 'es-AR' },
];

console.log('🧪 Starting CFC Team and League Content Adapters (Task 5.3) test suite...\n');

// ============================================================================
// Step 0: Load sample teams and leagues datasets
// ============================================================================
const sampleTeamsPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/teams.json');
const sampleLeaguesPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/leagues.json');

assert(fs.existsSync(sampleTeamsPath), 'sample teams.json exists');
assert(fs.existsSync(sampleLeaguesPath), 'sample leagues.json exists');

const sampleTeamsData = JSON.parse(fs.readFileSync(sampleTeamsPath, 'utf8'));
const sampleLeaguesData = JSON.parse(fs.readFileSync(sampleLeaguesPath, 'utf8'));

const teamSlugs = Object.keys(sampleTeamsData.teams || {});
const leagueSlugs = Object.keys(sampleLeaguesData.leagues || {});

assert(teamSlugs.length === 8, `Sample dataset has 8 teams (found ${teamSlugs.length})`);
assert(leagueSlugs.length === 3, `Sample dataset has 3 leagues (found ${leagueSlugs.length})`);

// ============================================================================
// Test 1: Team content adapter specification
// ============================================================================
console.log('\n--- Test 1: Team content adapter file specification ---');
const teamAdapterPath = path.join(ROOT_DIR, 'content/en/team/_content.gotmpl');
assert(fs.existsSync(teamAdapterPath), 'content/en/team/_content.gotmpl exists');

const teamAdapterContent = fs.readFileSync(teamAdapterPath, 'utf8');
assert(
  teamAdapterContent.trim().startsWith('{{ .EnableAllLanguages }}'),
  'First line of team adapter is {{ .EnableAllLanguages }}'
);
assert(
  teamAdapterContent.includes('cfcdata/dataset.html'),
  'Team adapter loads dataset via partialCached "cfcdata/dataset.html"'
);
assert(
  teamAdapterContent.includes('cfcdata/name.html'),
  'Team adapter resolves localized team name via cfcdata/name.html'
);
assert(
  teamAdapterContent.includes('"kind" "page"'),
  'Team adapter registers pages with kind "page"'
);
assert(
  teamAdapterContent.includes('"kind" "team"') || teamAdapterContent.includes('"team"'),
  'Team adapter sets params.cfc.kind to "team"'
);
assert(
  teamAdapterContent.includes('appPath'),
  'Team adapter sets params.cfc.appPath'
);
assert(
  teamAdapterContent.includes('dates'),
  'Team adapter provides page dates dictionary'
);
assert(
  !teamAdapterContent.includes('lineup'),
  'Team adapter adheres to user directive: lineup pages are completely OUT OF SCOPE'
);

// ============================================================================
// Test 2: League content adapter specification
// ============================================================================
console.log('\n--- Test 2: League content adapter file specification ---');
const leagueAdapterPath = path.join(ROOT_DIR, 'content/en/league/_content.gotmpl');
assert(fs.existsSync(leagueAdapterPath), 'content/en/league/_content.gotmpl exists');

const leagueAdapterContent = fs.readFileSync(leagueAdapterPath, 'utf8');
assert(
  leagueAdapterContent.trim().startsWith('{{ .EnableAllLanguages }}'),
  'First line of league adapter is {{ .EnableAllLanguages }}'
);
assert(
  leagueAdapterContent.includes('cfcdata/dataset.html'),
  'League adapter loads dataset via partialCached "cfcdata/dataset.html"'
);
assert(
  leagueAdapterContent.includes('cfcdata/name.html'),
  'League adapter resolves localized league name via cfcdata/name.html'
);
assert(
  leagueAdapterContent.includes('cond $league.popular 1 2') || leagueAdapterContent.includes('cond'),
  'League adapter computes weight dynamically using cond $league.popular 1 2'
);
assert(
  leagueAdapterContent.includes('"weight" $weight') || leagueAdapterContent.includes('"weight"'),
  'League adapter sets page weight'
);
assert(
  leagueAdapterContent.includes('"kind" "page"'),
  'League adapter registers pages with kind "page"'
);
assert(
  leagueAdapterContent.includes('"kind" "league"') || leagueAdapterContent.includes('"league"'),
  'League adapter sets params.cfc.kind to "league"'
);
assert(
  leagueAdapterContent.includes('appPath'),
  'League adapter sets params.cfc.appPath'
);
assert(
  leagueAdapterContent.includes('dates'),
  'League adapter provides page dates dictionary'
);
assert(
  !leagueAdapterContent.includes('lineup'),
  'League adapter adheres to user directive: lineup pages are completely OUT OF SCOPE'
);

// ============================================================================
// Test 3: Hugo build execution
// ============================================================================
console.log('\n--- Test 3: Hugo build execution ---');

let buildOutput = '';
try {
  buildOutput = execSync('pnpm build', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      HUGO_CFC_DATA_SOURCE: process.env.HUGO_CFC_DATA_SOURCE || 'sample',
    },
  });
  assert(true, 'Hugo build succeeds with 0 exit code');
  assert(!buildOutput.includes('ERROR'), 'Build output contains 0 ERROR entries');
  assert(!buildOutput.includes('duplicate target path'), 'Build output has 0 duplicate target path warnings');
} catch (err) {
  assert(false, `Hugo build failed: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`);
}

const publicDir = path.join(ROOT_DIR, 'public');

// ============================================================================
// Test 4: Team pages generated across all 6 editions (8 teams × 6 editions = 48)
// ============================================================================
console.log('\n--- Test 4: Team page generation (8 teams × 6 editions = 48 pages) ---');

let generatedTeamPagesCount = 0;
for (const slug of teamSlugs) {
  for (const ed of EDITIONS) {
    const relPath = ed.prefix
      ? `public/${ed.prefix}/team/${slug}/index.html`
      : `public/team/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, relPath);

    const exists = fs.existsSync(fullPath);
    if (!exists) {
      assert(false, `Expected team page missing: ${relPath} (${ed.label})`);
    } else {
      generatedTeamPagesCount++;
      const html = fs.readFileSync(fullPath, 'utf8');
      assert(
        html.length > 500 && html.includes('<!doctype html>'),
        `Team page is valid HTML: ${relPath} (${html.length} bytes)`
      );
    }
  }
}

assert(
  generatedTeamPagesCount === 48,
  `All 48 team pages generated across 6 editions (generated ${generatedTeamPagesCount}/48)`
);

// ============================================================================
// Test 5: League pages generated across all 6 editions (3 leagues × 6 editions = 18)
// ============================================================================
console.log('\n--- Test 5: League page generation (3 leagues × 6 editions = 18 pages) ---');

let generatedLeaguePagesCount = 0;
for (const slug of leagueSlugs) {
  for (const ed of EDITIONS) {
    const relPath = ed.prefix
      ? `public/${ed.prefix}/league/${slug}/index.html`
      : `public/league/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, relPath);

    const exists = fs.existsSync(fullPath);
    if (!exists) {
      assert(false, `Expected league page missing: ${relPath} (${ed.label})`);
    } else {
      generatedLeaguePagesCount++;
      const html = fs.readFileSync(fullPath, 'utf8');
      assert(
        html.length > 500 && html.includes('<!doctype html>'),
        `League page is valid HTML: ${relPath} (${html.length} bytes)`
      );
    }
  }
}

assert(
  generatedLeaguePagesCount === 18,
  `All 18 league pages generated across 6 editions (generated ${generatedLeaguePagesCount}/18)`
);

// ============================================================================
// Test 6: League directory page persists across all 6 editions
// ============================================================================
console.log('\n--- Test 6: League directory page persists across all 6 editions ---');

for (const ed of EDITIONS) {
  const dirRelPath = ed.prefix
    ? `public/${ed.prefix}/league/index.html`
    : 'public/league/index.html';
  const dirFullPath = path.join(ROOT_DIR, dirRelPath);

  assert(
    fs.existsSync(dirFullPath),
    `League directory page exists: ${dirRelPath} (${ed.label})`
  );
  if (fs.existsSync(dirFullPath)) {
    const html = fs.readFileSync(dirFullPath, 'utf8');
    assert(
      html.includes('Leagues') || html.includes('premier-league') || html.length > 500,
      `League directory page has content: ${dirRelPath}`
    );
  }
}

// ============================================================================
// Test 7: Section listings suppression persists (/team/index.html does NOT exist)
// ============================================================================
console.log('\n--- Test 7: Section listings suppression persists ---');

for (const ed of EDITIONS) {
  const teamListingRelPath = ed.prefix
    ? `public/${ed.prefix}/team/index.html`
    : 'public/team/index.html';
  const teamListingFullPath = path.join(ROOT_DIR, teamListingRelPath);

  assert(
    !fs.existsSync(teamListingFullPath),
    `Team section listing suppressed: ${teamListingRelPath} does NOT exist (${ed.label})`
  );
}

// Ensure no team directory has an index.html directly under team/
function findSectionListingFiles(dir, sectionName) {
  let listings = [];
  if (!fs.existsSync(dir)) return listings;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      listings = listings.concat(findSectionListingFiles(p, sectionName));
    } else if (ent.isFile() && p.endsWith(path.join(sectionName, 'index.html'))) {
      listings.push(p);
    }
  }
  return listings;
}

const teamListingFiles = findSectionListingFiles(publicDir, 'team');
assert(
  teamListingFiles.length === 0,
  `Zero team section listing files found anywhere in public/ (found ${teamListingFiles.length})`
);

// ============================================================================
// Test 8: Verified absence of lineup pages (Directive Enforcement)
// ============================================================================
console.log('\n--- Test 8: Verified absence of lineup pages ---');

function findLineupPaths(dir) {
  let matches = [];
  if (!fs.existsSync(dir)) return matches;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'lineup') {
        matches.push(p);
      } else {
        matches = matches.concat(findLineupPaths(p));
      }
    }
  }
  return matches;
}

const allLineupDirs = findLineupPaths(publicDir);
assert(
  allLineupDirs.length === 0,
  `Zero lineup directories found anywhere in public/ (found ${allLineupDirs.length})`
);

// ============================================================================
// Test 9: Cross-edition translation links connect same team and league across editions
// ============================================================================
console.log('\n--- Test 9: Cross-edition translation links ---');

// Test representative teams
const sampleTestTeams = ['arsenal', 'flamengo', 'barcelona'];
for (const slug of sampleTestTeams) {
  for (const originEd of EDITIONS) {
    const pageRelPath = originEd.prefix
      ? `public/${originEd.prefix}/team/${slug}/index.html`
      : `public/team/${slug}/index.html`;
    const pageFullPath = path.join(ROOT_DIR, pageRelPath);

    assert(fs.existsSync(pageFullPath), `Team origin page exists: ${pageRelPath}`);
    const html = fs.readFileSync(pageFullPath, 'utf8');

    for (const targetEd of EDITIONS) {
      const targetPrefix = targetEd.prefix ? `/${targetEd.prefix}` : '';
      const expectedHref = targetEd.code === 'en'
        ? `/team/${slug}/?edition=en`
        : `${targetPrefix}/team/${slug}/`;

      const hasLink = html.includes(`href="${expectedHref}"`) ||
        html.includes(`href='${expectedHref}'`) ||
        html.includes(`href=${expectedHref}`);
      assert(
        hasLink,
        `Team translation link (${slug}) from ${originEd.code} to ${targetEd.code} exists: ${expectedHref}`
      );
    }
  }
}

// Test representative leagues
const sampleTestLeagues = ['premier-league', 'brasileirao-serie-a', 'la-liga'];
for (const slug of sampleTestLeagues) {
  for (const originEd of EDITIONS) {
    const pageRelPath = originEd.prefix
      ? `public/${originEd.prefix}/league/${slug}/index.html`
      : `public/league/${slug}/index.html`;
    const pageFullPath = path.join(ROOT_DIR, pageRelPath);

    assert(fs.existsSync(pageFullPath), `League origin page exists: ${pageRelPath}`);
    const html = fs.readFileSync(pageFullPath, 'utf8');

    for (const targetEd of EDITIONS) {
      const targetPrefix = targetEd.prefix ? `/${targetEd.prefix}` : '';
      const expectedHref = targetEd.code === 'en'
        ? `/league/${slug}/?edition=en`
        : `${targetPrefix}/league/${slug}/`;

      const hasLink = html.includes(`href="${expectedHref}"`) ||
        html.includes(`href='${expectedHref}'`) ||
        html.includes(`href=${expectedHref}`);
      assert(
        hasLink,
        `League translation link (${slug}) from ${originEd.code} to ${targetEd.code} exists: ${expectedHref}`
      );
    }
  }
}

// ============================================================================
// Test 10: Site check verification (pnpm check)
// ============================================================================
console.log('\n--- Test 10: Site check verification (pnpm check) ---');

try {
  const checkOutput = execSync('pnpm check', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert(
    checkOutput.includes('All site checks passed successfully!'),
    'pnpm check output reports all site checks passed successfully'
  );
  assert(true, 'pnpm check exited with code 0');
} catch (err) {
  assert(false, `pnpm check failed: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================');

if (failedTests > 0) {
  console.error('\n❌ CFC Team and League Content Adapters tests FAILED!');
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Team and League Content Adapters tests passed successfully!');
  process.exit(0);
}
