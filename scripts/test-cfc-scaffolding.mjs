#!/usr/bin/env node

/**
 * Automated test suite for Task 5.1: Scaffolding Content Sections with Cross-Edition Language Matrix
 *
 * Verifies:
 * 1. Content section index files exist with required cross-edition matrix frontmatter:
 *    - content/en/match/_index.md (render: never, list: always, languages: ["**"])
 *    - content/en/team/_index.md (render: never, list: always, languages: ["**"])
 *    - content/en/league/_index.md (kind: "leagues", titleKey: "leagues", languages: ["**"])
 * 2. Hugo build succeeds with 0 errors.
 * 3. League directory page (public/league/index.html) exists across all 6 editions:
 *    - public/league/index.html (Global)
 *    - public/en-gb/league/index.html (UK)
 *    - public/en-ie/league/index.html (Ireland)
 *    - public/pt-br/league/index.html (Brazil)
 *    - public/pt-pt/league/index.html (Portugal)
 *    - public/es-ar/league/index.html (Argentina)
 * 4. Suppression of section listings:
 *    - public/match/index.html does NOT exist in any edition.
 *    - public/team/index.html does NOT exist in any edition.
 * 5. Legacy address families do NOT exist:
 *    - No public/en/matches/ or public wildcard matches/
 *    - No public/pt/jogos/ or public wildcard jogos/
 * 6. Out-of-scope directive enforced:
 *    - Lineups are completely out of scope per user instruction (no lineup section created).
 * 7. Site check verification:
 *    - `pnpm check` passes with 0 errors.
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
  { code: 'en', prefix: '', label: 'Global (English)' },
  { code: 'en-gb', prefix: 'en-gb', label: 'UK (English)' },
  { code: 'en-ie', prefix: 'en-ie', label: 'Ireland (English)' },
  { code: 'pt-br', prefix: 'pt-br', label: 'Brasil (Português)' },
  { code: 'pt-pt', prefix: 'pt-pt', label: 'Portugal (Português)' },
  { code: 'es-ar', prefix: 'es-ar', label: 'Argentina (Español)' },
];

console.log('🧪 Starting CFC Scaffolding (Task 5.1) test suite...\n');

// ============================================================================
// Test 1: Content section index files and frontmatter specification
// ============================================================================
console.log('--- Test 1: Content section index files and frontmatter specification ---');

const matchIndexPath = path.join(ROOT_DIR, 'content/en/match/_index.md');
const teamIndexPath = path.join(ROOT_DIR, 'content/en/team/_index.md');
const leagueIndexPath = path.join(ROOT_DIR, 'content/en/league/_index.md');

assert(fs.existsSync(matchIndexPath), 'content/en/match/_index.md exists');
assert(fs.existsSync(teamIndexPath), 'content/en/team/_index.md exists');
assert(fs.existsSync(leagueIndexPath), 'content/en/league/_index.md exists');

if (fs.existsSync(matchIndexPath)) {
  const matchContent = fs.readFileSync(matchIndexPath, 'utf8');
  assert(/title:\s*"Matches"/.test(matchContent), 'match/_index.md has title: "Matches"');
  assert(/languages:\s*\["\*\*"\]/.test(matchContent), 'match/_index.md has languages: ["**"]');
  assert(/render:\s*never/.test(matchContent), 'match/_index.md has render: never');
  assert(/list:\s*always/.test(matchContent), 'match/_index.md has list: always');
}

if (fs.existsSync(teamIndexPath)) {
  const teamContent = fs.readFileSync(teamIndexPath, 'utf8');
  assert(/title:\s*"Teams"/.test(teamContent), 'team/_index.md has title: "Teams"');
  assert(/languages:\s*\["\*\*"\]/.test(teamContent), 'team/_index.md has languages: ["**"]');
  assert(/render:\s*never/.test(teamContent), 'team/_index.md has render: never');
  assert(/list:\s*always/.test(teamContent), 'team/_index.md has list: always');
}

if (fs.existsSync(leagueIndexPath)) {
  const leagueContent = fs.readFileSync(leagueIndexPath, 'utf8');
  assert(/title:\s*"Leagues"/.test(leagueContent), 'league/_index.md has title: "Leagues"');
  assert(/languages:\s*\["\*\*"\]/.test(leagueContent), 'league/_index.md has languages: ["**"]');
  assert(/kind:\s*"leagues"/.test(leagueContent), 'league/_index.md has kind: "leagues"');
  assert(/titleKey:\s*"leagues"/.test(leagueContent), 'league/_index.md has titleKey: "leagues"');
}

// Lineups out-of-scope assertion
const lineupIndexPath = path.join(ROOT_DIR, 'content/en/lineup/_index.md');
assert(!fs.existsSync(lineupIndexPath), 'Lineups are completely OUT OF SCOPE: content/en/lineup does NOT exist');

// ============================================================================
// Test 2: Build execution
// ============================================================================
console.log('\n--- Test 2: Hugo build execution ---');

try {
  const buildOutput = execSync('pnpm build', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert(true, 'Hugo build succeeds with 0 exit code');
  assert(!buildOutput.includes('ERROR'), 'Build output contains 0 ERROR entries');
  assert(!buildOutput.includes('duplicate target path'), 'Build output has 0 duplicate target path warnings');
} catch (err) {
  assert(false, `Hugo build failed: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`);
}

// ============================================================================
// Test 3: League directory page exists across all 6 editions
// ============================================================================
console.log('\n--- Test 3: League directory page exists across all editions ---');

for (const ed of EDITIONS) {
  const relPath = ed.prefix ? `public/${ed.prefix}/league/index.html` : 'public/league/index.html';
  const fullPath = path.join(ROOT_DIR, relPath);
  const exists = fs.existsSync(fullPath);
  assert(exists, `League directory page exists: ${relPath} (${ed.label})`);

  if (exists) {
    const html = fs.readFileSync(fullPath, 'utf8');
    assert(html.length > 200, `${relPath} is non-empty HTML (${html.length} bytes)`);
    assert(html.includes('<!DOCTYPE html>') || html.includes('<html'), `${relPath} contains valid HTML document root`);
    assert(html.toLowerCase().includes('leagues'), `${relPath} contains leagues heading/title`);
  }
}

// ============================================================================
// Test 4: Suppression of section listings (match & team) across all editions
// ============================================================================
console.log('\n--- Test 4: Suppression of section listings (match & team) ---');

for (const ed of EDITIONS) {
  const matchRelPath = ed.prefix ? `public/${ed.prefix}/match/index.html` : 'public/match/index.html';
  const matchFullPath = path.join(ROOT_DIR, matchRelPath);
  assert(!fs.existsSync(matchFullPath), `Section page suppressed: ${matchRelPath} does NOT exist (${ed.label})`);

  const teamRelPath = ed.prefix ? `public/${ed.prefix}/team/index.html` : 'public/team/index.html';
  const teamFullPath = path.join(ROOT_DIR, teamRelPath);
  assert(!fs.existsSync(teamFullPath), `Section page suppressed: ${teamRelPath} does NOT exist (${ed.label})`);
}

// Also verify no directory-level index file leaked anywhere under match/ or team/
const publicDir = path.join(ROOT_DIR, 'public');
function findHtmlFiles(dir, matchSubstr) {
  let matches = [];
  if (!fs.existsSync(dir)) return matches;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      matches = matches.concat(findHtmlFiles(p, matchSubstr));
    } else if (ent.isFile() && p.includes(matchSubstr) && ent.name === 'index.html') {
      matches.push(p);
    }
  }
  return matches;
}

const matchIndexFiles = findHtmlFiles(publicDir, '/match/');
const teamIndexFiles = findHtmlFiles(publicDir, '/team/');
assert(matchIndexFiles.length === 0, `No match section index.html found anywhere in public/ (found ${matchIndexFiles.length})`);
assert(teamIndexFiles.length === 0, `No team section index.html found anywhere in public/ (found ${teamIndexFiles.length})`);

// ============================================================================
// Test 5: Legacy address families do NOT exist
// ============================================================================
console.log('\n--- Test 5: Absence of legacy address families ---');

const legacyPaths = [
  'public/en/matches',
  'public/en/matches/index.html',
  'public/pt/jogos',
  'public/pt/jogos/index.html',
  'public/matches',
  'public/jogos',
  'public/en/index.html',
  'public/pt',
];

for (const lp of legacyPaths) {
  const full = path.join(ROOT_DIR, lp);
  assert(!fs.existsSync(full), `Legacy address family absent: ${lp}`);
}

// Check no matches or jogos directory in any edition prefix
for (const ed of EDITIONS) {
  if (ed.prefix) {
    const edMatches = path.join(ROOT_DIR, 'public', ed.prefix, 'matches');
    const edJogos = path.join(ROOT_DIR, 'public', ed.prefix, 'jogos');
    assert(!fs.existsSync(edMatches), `No ${ed.prefix}/matches/ directory`);
    assert(!fs.existsSync(edJogos), `No ${ed.prefix}/jogos/ directory`);
  }
}

// ============================================================================
// Test 6: Site check verification (pnpm check)
// ============================================================================
console.log('\n--- Test 6: Site check verification (pnpm check) ---');

try {
  const checkOutput = execSync('pnpm check', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert(checkOutput.includes('All site checks passed successfully'), 'pnpm check output reports all site checks passed successfully');
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
  console.error('\n❌ CFC Scaffolding tests FAILED!');
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Scaffolding tests passed successfully!');
  process.exit(0);
}
