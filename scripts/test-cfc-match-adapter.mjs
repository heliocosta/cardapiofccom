#!/usr/bin/env node

/**
 * Automated test suite for Task 5.2: Build Match Content Adapter
 *
 * Verifies:
 * 1. All 8 sample matches generate HTML files across all 6 editions:
 *    - Global: public/match/{slug}/index.html
 *    - Regional: public/{edition}/match/{slug}/index.html (en-gb, en-ie, pt-br, pt-pt, es-ar)
 *    - Total: 48 match pages.
 * 2. Verified absence of lineup pages (/match/{slug}/lineup/ must NOT exist in any edition).
 * 3. Section listing suppression persists (public/match/index.html does NOT exist in any edition).
 * 4. Cross-edition translation links connect the same match across editions.
 * 5. pnpm check passes with 0 errors.
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

console.log('🧪 Starting CFC Match Adapter (Task 5.2) test suite...\n');

// ============================================================================
// Step 0: Load sample matches and teams dataset
// ============================================================================
const sampleMatchesPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/matches.json');
const sampleTeamsPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/teams.json');

assert(fs.existsSync(sampleMatchesPath), 'sample matches.json exists');
assert(fs.existsSync(sampleTeamsPath), 'sample teams.json exists');

const sampleMatchesData = JSON.parse(fs.readFileSync(sampleMatchesPath, 'utf8'));
const matchOrder = sampleMatchesData.order || Object.keys(sampleMatchesData.matches || {});
const matchSlugs = Object.keys(sampleMatchesData.matches || {});

assert(matchSlugs.length === 8, `Sample dataset has 8 matches (found ${matchSlugs.length})`);
assert(matchOrder.length === 8, `Sample dataset order has 8 matches (found ${matchOrder.length})`);

// ============================================================================
// Test 1: Content adapter file specification
// ============================================================================
console.log('\n--- Test 1: Content adapter file specification ---');
const adapterPath = path.join(ROOT_DIR, 'content/en/match/_content.gotmpl');
assert(fs.existsSync(adapterPath), 'content/en/match/_content.gotmpl exists');

const adapterContent = fs.readFileSync(adapterPath, 'utf8');
assert(
  adapterContent.trim().startsWith('{{ .EnableAllLanguages }}'),
  'First line of adapter is {{ .EnableAllLanguages }}'
);
assert(
  adapterContent.includes('cfcdata/dataset.html'),
  'Adapter loads dataset via partialCached "cfcdata/dataset.html"'
);
assert(
  adapterContent.includes('cfcdata/budget.html'),
  'Adapter calls cfcdata/budget.html for file budget verification'
);
assert(
  adapterContent.includes('cfcdata/name.html'),
  'Adapter resolves localized team names via cfcdata/name.html'
);
assert(
  adapterContent.includes('"kind" "section"'),
  'Adapter registers pages with kind "section"'
);
assert(
  !adapterContent.includes('lineup'),
  'Adapter adheres to user directive: lineup pages are completely OUT OF SCOPE'
);

// ============================================================================
// Test 2: Hugo build execution
// ============================================================================
console.log('\n--- Test 2: Hugo build execution ---');

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

// ============================================================================
// Test 3: All 8 sample matches generate HTML files across all 6 editions (48 total)
// ============================================================================
console.log('\n--- Test 3: Match page generation (8 matches × 6 editions = 48 pages) ---');

const publicDir = path.join(ROOT_DIR, 'public');
let generatedMatchPagesCount = 0;

for (const slug of matchSlugs) {
  for (const ed of EDITIONS) {
    const relPath = ed.prefix
      ? `public/${ed.prefix}/match/${slug}/index.html`
      : `public/match/${slug}/index.html`;
    const fullPath = path.join(ROOT_DIR, relPath);

    const exists = fs.existsSync(fullPath);
    if (!exists) {
      assert(false, `Expected match page missing: ${relPath} (${ed.label})`);
    } else {
      generatedMatchPagesCount++;
      const html = fs.readFileSync(fullPath, 'utf8');
      assert(
        html.length > 500 && html.includes('<!doctype html>'),
        `Match page is valid HTML: ${relPath} (${html.length} bytes)`
      );
    }
  }
}

assert(
  generatedMatchPagesCount === 48,
  `All 48 match pages generated across 6 editions (generated ${generatedMatchPagesCount}/48)`
);

// ============================================================================
// Test 4: Absence of lineup child pages (Directive Enforcement)
// ============================================================================
console.log('\n--- Test 4: Verified absence of lineup pages ---');

let lineupPagesFound = 0;
for (const slug of matchSlugs) {
  for (const ed of EDITIONS) {
    const lineupRelPath = ed.prefix
      ? `public/${ed.prefix}/match/${slug}/lineup/index.html`
      : `public/match/${slug}/lineup/index.html`;
    const lineupFullPath = path.join(ROOT_DIR, lineupRelPath);
    if (fs.existsSync(lineupFullPath)) {
      lineupPagesFound++;
      assert(false, `Unexpected lineup page found: ${lineupRelPath}`);
    }
  }
}

assert(lineupPagesFound === 0, 'No lineup child pages exist for any match in any edition');

// Scan public/ directory recursively to ensure no lineup directory exists anywhere under match/
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
// Test 5: Section listing suppression persists
// ============================================================================
console.log('\n--- Test 5: Section listing suppression persists ---');

for (const ed of EDITIONS) {
  const listingRelPath = ed.prefix
    ? `public/${ed.prefix}/match/index.html`
    : 'public/match/index.html';
  const listingFullPath = path.join(ROOT_DIR, listingRelPath);
  assert(
    !fs.existsSync(listingFullPath),
    `Section listing suppressed: ${listingRelPath} does NOT exist (${ed.label})`
  );
}

// Search for any exact directory-level match/index.html
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

const matchListingFiles = findSectionListingFiles(publicDir, 'match');
assert(
  matchListingFiles.length === 0,
  `Zero match section listing files found anywhere in public/ (found ${matchListingFiles.length})`
);

// ============================================================================
// Test 6: Cross-edition translation links connect the same match across editions
// ============================================================================
console.log('\n--- Test 6: Cross-edition translation links ---');

// Pick representative matches to verify translation links thoroughly
const testSlugs = ['arsenal-vs-chelsea-2026-11-06', 'flamengo-vs-palmeiras-2026-11-07'];

for (const slug of testSlugs) {
  for (const originEd of EDITIONS) {
    const pageRelPath = originEd.prefix
      ? `public/${originEd.prefix}/match/${slug}/index.html`
      : `public/match/${slug}/index.html`;
    const pageFullPath = path.join(ROOT_DIR, pageRelPath);

    assert(fs.existsSync(pageFullPath), `Origin page exists: ${pageRelPath}`);
    const html = fs.readFileSync(pageFullPath, 'utf8');

    for (const targetEd of EDITIONS) {
      const targetPrefix = targetEd.prefix ? `/${targetEd.prefix}` : '';
      // Global target links have ?edition=en appended by edition-switcher
      const expectedHref = targetEd.code === 'en'
        ? `/match/${slug}/?edition=en`
        : `${targetPrefix}/match/${slug}/`;

      const hasLink = html.includes(`href="${expectedHref}"`) ||
        html.includes(`href='${expectedHref}'`) ||
        html.includes(`href=${expectedHref}`);
      assert(
        hasLink,
        `Translation link from ${originEd.code} to ${targetEd.code} exists: ${expectedHref}`
      );
    }
  }
}

// ============================================================================
// Test 7: Site check verification (pnpm check)
// ============================================================================
console.log('\n--- Test 7: Site check verification (pnpm check) ---');

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
  console.error('\n❌ CFC Match Adapter tests FAILED!');
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Match Adapter tests passed successfully!');
  process.exit(0);
}
