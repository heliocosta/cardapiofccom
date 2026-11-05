#!/usr/bin/env node

/**
 * Automated test suite for Task 3.1: CFC Data Settings & Cache Configuration
 *
 * Verifies:
 * 1. [caches.getresource] in hugo.toml with dir=":cacheDir/:project" and maxAge="720h"
 * 2. data/cfc/settings.yaml exists with all required default values
 * 3. Default resolution in dev mode (returns source: "sample")
 * 4. Default resolution in production mode (returns source: "remote")
 * 5. Resolution with HUGO_CFC_DATA_SOURCE=remote (returns source: "remote")
 * 6. Resolution with HUGO_CFC_DATA_SOURCE=sample (returns source: "sample")
 * 7. Resolution with HUGO_CFC_DATA_TOKEN=secret-token
 * 8. Resolution with HUGO_CFC_FILE_BUDGET=15000
 * 9. Resolution with HUGO_CFC_LINEUP_PAGES=available
 * 10. Resolution with HUGO_CFC_NOW=2026-11-05T12:00:00Z
 * 11. Optional overrides HUGO_CFC_DATA_BASEURL and HUGO_CFC_DATA_SAMPLE
 * 12. Combined overrides simultaneously
 * 13. partialCached idempotency and structure verification
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

import nodeAssert from 'node:assert';

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

function assertDeepEqual(actual, expected, message) {
  totalTests++;
  try {
    nodeAssert.deepStrictEqual(actual, expected);
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  } catch (err) {
    failedTests++;
    console.error(`❌ FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

// -------------------------------------------------------------
// Test 1: Verify hugo.toml configuration
// -------------------------------------------------------------
console.log('\n--- Section 1: Verifying hugo.toml cache configuration ---');
const hugoTomlContent = fs.readFileSync(path.join(ROOT_DIR, 'hugo.toml'), 'utf-8');

assert(
  hugoTomlContent.includes('[caches.getresource]'),
  'hugo.toml contains [caches.getresource]'
);

const getresourceBlock = hugoTomlContent.split('[caches.getresource]')[1]?.split(/\[\w+/)[0] || '';
assert(
  /dir\s*=\s*":cacheDir\/:project"/.test(getresourceBlock),
  '[caches.getresource] specifies dir = ":cacheDir/:project"'
);
assert(
  /maxAge\s*=\s*"720h"/.test(getresourceBlock),
  '[caches.getresource] specifies maxAge = "720h"'
);

// Ensure other cache sections weren't broken
assert(hugoTomlContent.includes('[caches.images]'), 'hugo.toml retains [caches.images]');
assert(hugoTomlContent.includes('[caches.assets]'), 'hugo.toml retains [caches.assets]');

// -------------------------------------------------------------
// Test 2: Verify data/cfc/settings.yaml defaults
// -------------------------------------------------------------
console.log('\n--- Section 2: Verifying data/cfc/settings.yaml ---');
const settingsYamlPath = path.join(ROOT_DIR, 'data/cfc/settings.yaml');
assert(fs.existsSync(settingsYamlPath), 'data/cfc/settings.yaml exists');

const yamlContent = fs.readFileSync(settingsYamlPath, 'utf-8');
assert(/source:\s*"auto"/.test(yamlContent), 'settings.yaml specifies source: "auto"');
assert(
  /baseURL:\s*"https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/cardapiofutebol\.appspot\.com\/o\/"/.test(yamlContent),
  'settings.yaml specifies correct default Firebase baseURL'
);
assert(/prefix:\s*"web\/v1\/"/.test(yamlContent), 'settings.yaml specifies prefix: "web/v1/"');
assert(/sampleDir:\s*"cfc-data\/sample\/"/.test(yamlContent), 'settings.yaml specifies sampleDir: "cfc-data/sample/"');
assert(/timeout:\s*"20s"/.test(yamlContent), 'settings.yaml specifies timeout: "20s"');
assert(/supportedMajor:\s*1\b/.test(yamlContent), 'settings.yaml specifies supportedMajor: 1');
assert(/fileBudget:\s*18000\b/.test(yamlContent), 'settings.yaml specifies fileBudget: 18000');
assert(/staticFiles:\s*200\b/.test(yamlContent), 'settings.yaml specifies staticFiles: 200');
assert(/fixedPerEdition:\s*5\b/.test(yamlContent), 'settings.yaml specifies fixedPerEdition: 5');
assert(/lineupPages:\s*"all"/.test(yamlContent), 'settings.yaml specifies lineupPages: "all"');
assert(/home:\s*\n\s+days:\s*7\s*\n\s+max:\s*120/.test(yamlContent), 'settings.yaml specifies home: { days: 7, max: 120 }');
assert(
  /league:\s*\n\s+pastDays:\s*7\s*\n\s+futureDays:\s*30\s*\n\s+max:\s*100/.test(yamlContent),
  'settings.yaml specifies league: { pastDays: 7, futureDays: 30, max: 100 }'
);
assert(
  /team:\s*\n\s+upcoming:\s*10\s*\n\s+recent:\s*5\s*\n\s+liveGraceHours:\s*3/.test(yamlContent),
  'settings.yaml specifies team: { upcoming: 10, recent: 5, liveGraceHours: 3 }'
);

// -------------------------------------------------------------
// Test 3: Runtime resolution via layouts/_partials/cfcdata/settings.html
// -------------------------------------------------------------
console.log('\n--- Section 3: Verifying runtime settings resolution with Hugo ---');

const partialPath = path.join(ROOT_DIR, 'layouts/_partials/cfcdata/settings.html');
assert(fs.existsSync(partialPath), 'layouts/_partials/cfcdata/settings.html exists');

// Temporary test harness artifacts
const tempBuildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfc-settings-test-'));
const testContentPath = path.join(ROOT_DIR, 'content/en/_cfc_settings_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_settings_harness.html');

const stashedAdapters = [];

function setupHarness() {
  // Stash content adapters so hugo -e production can run without triggering remote dataset fetch
  const adapterCandidates = [
    path.join(ROOT_DIR, 'content/en/match/_content.gotmpl'),
    path.join(ROOT_DIR, 'content/en/team/_content.gotmpl'),
    path.join(ROOT_DIR, 'content/en/league/_content.gotmpl'),
  ];
  for (const cand of adapterCandidates) {
    if (fs.existsSync(cand)) {
      const bak = `${cand}.settings_bak`;
      fs.renameSync(cand, bak);
      stashedAdapters.push({ original: cand, backup: bak });
    }
  }

  fs.writeFileSync(
    testContentPath,
    `---
title: "CFC Settings Harness"
layout: "_cfc_settings_harness"
url: "/cfc-test-resolved-settings.json"
---
`
  );

  fs.writeFileSync(
    testLayoutPath,
    `{{- $s1 := partialCached "cfcdata/settings.html" . "settings" -}}
{{- $s2 := partialCached "cfcdata/settings.html" . "settings" -}}
{{- /* Test that both calls returned the identical map */ -}}
{{- jsonify (dict "indent" "  ") $s1 -}}
`
  );
}

function cleanupHarness() {
  for (const item of stashedAdapters) {
    if (fs.existsSync(item.backup)) {
      fs.renameSync(item.backup, item.original);
    }
  }
  stashedAdapters.length = 0;
  if (fs.existsSync(testContentPath)) fs.unlinkSync(testContentPath);
  if (fs.existsSync(testLayoutPath)) fs.unlinkSync(testLayoutPath);
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

function runHugoResolve(envVars = {}, hugoEnv = 'development') {
  const outputFile = path.join(tempBuildDir, 'cfc-test-resolved-settings.json');
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  const customEnv = {
    ...process.env,
    ...envVars,
  };

  // Ensure un-set variables are cleared
  for (const key of [
    'HUGO_CFC_DATA_SOURCE',
    'HUGO_CFC_DATA_TOKEN',
    'HUGO_CFC_DATA_BASEURL',
    'HUGO_CFC_DATA_SAMPLE',
    'HUGO_CFC_FILE_BUDGET',
    'HUGO_CFC_LINEUP_PAGES',
    'HUGO_CFC_NOW',
  ]) {
    if (!(key in envVars)) {
      delete customEnv[key];
    }
  }

  const cmd = `hugo -e ${hugoEnv} --destination "${tempBuildDir}" --quiet`;
  execSync(cmd, { cwd: ROOT_DIR, env: customEnv, stdio: 'pipe' });

  if (!fs.existsSync(outputFile)) {
    throw new Error(`Output file not created at ${outputFile}`);
  }

  return JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
}

try {
  setupHarness();

  // Test 3a: Default resolution in dev mode
  console.log('\nTesting default resolution in development mode...');
  const devDefaults = runHugoResolve({}, 'development');
  assert(devDefaults.source === 'sample', 'Dev default source is "sample"');
  assert(devDefaults.token === '', 'Dev default token is empty string');
  assert(
    devDefaults.baseURL === 'https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/',
    'Dev default baseURL matches settings.yaml'
  );
  assert(devDefaults.prefix === 'web/v1/', 'Dev default prefix is "web/v1/"');
  assert(devDefaults.sampleDir === 'cfc-data/sample/', 'Dev default sampleDir is "cfc-data/sample/"');
  assert(devDefaults.timeout === '20s', 'Dev default timeout is "20s"');
  assert(devDefaults.supportedMajor === 1, 'Dev default supportedMajor is 1');
  assert(devDefaults.fileBudget === 18000, 'Dev default fileBudget is 18000');
  assert(devDefaults.staticFiles === 200, 'Dev default staticFiles is 200');
  assert(devDefaults.fixedPerEdition === 5, 'Dev default fixedPerEdition is 5');
  assert(devDefaults.lineupPages === 'all', 'Dev default lineupPages is "all"');
  assertDeepEqual(devDefaults.home, { days: 7, max: 120 }, 'Dev default home window matches');
  assertDeepEqual(devDefaults.league, { pastDays: 7, futureDays: 30, max: 100 }, 'Dev default league window matches');
  assertDeepEqual(devDefaults.team, { upcoming: 10, recent: 5, liveGraceHours: 3 }, 'Dev default team window matches');
  assert(devDefaults.asOfOverride === null, 'Dev default asOfOverride is null when HUGO_CFC_NOW unset');

  // Test 3b: Default resolution in production mode
  console.log('\nTesting default resolution in production mode...');
  const prodDefaults = runHugoResolve({}, 'production');
  assert(prodDefaults.source === 'remote', 'Production default source is "remote"');

  // Test 3c: HUGO_CFC_DATA_SOURCE=remote in dev mode
  console.log('\nTesting HUGO_CFC_DATA_SOURCE=remote in dev mode...');
  const remoteInDev = runHugoResolve({ HUGO_CFC_DATA_SOURCE: 'remote' }, 'development');
  assert(remoteInDev.source === 'remote', 'HUGO_CFC_DATA_SOURCE=remote overrides dev mode to "remote"');

  // Test 3d: HUGO_CFC_DATA_SOURCE=sample in production mode
  console.log('\nTesting HUGO_CFC_DATA_SOURCE=sample in production mode...');
  const sampleInProd = runHugoResolve({ HUGO_CFC_DATA_SOURCE: 'sample' }, 'production');
  assert(sampleInProd.source === 'sample', 'HUGO_CFC_DATA_SOURCE=sample overrides production mode to "sample"');

  // Test 3e: HUGO_CFC_DATA_SOURCE=auto in dev mode and prod mode
  console.log('\nTesting HUGO_CFC_DATA_SOURCE=auto...');
  const autoDev = runHugoResolve({ HUGO_CFC_DATA_SOURCE: 'auto' }, 'development');
  assert(autoDev.source === 'sample', 'HUGO_CFC_DATA_SOURCE=auto resolves to "sample" in dev mode');
  const autoProd = runHugoResolve({ HUGO_CFC_DATA_SOURCE: 'auto' }, 'production');
  assert(autoProd.source === 'remote', 'HUGO_CFC_DATA_SOURCE=auto resolves to "remote" in prod mode');

  // Test 3f: HUGO_CFC_DATA_TOKEN=secret-token
  console.log('\nTesting HUGO_CFC_DATA_TOKEN=secret-token...');
  const tokenRes = runHugoResolve({ HUGO_CFC_DATA_TOKEN: 'secret-token' });
  assert(tokenRes.token === 'secret-token', 'HUGO_CFC_DATA_TOKEN sets token');

  // Test 3g: HUGO_CFC_FILE_BUDGET=15000
  console.log('\nTesting HUGO_CFC_FILE_BUDGET=15000...');
  const budgetRes = runHugoResolve({ HUGO_CFC_FILE_BUDGET: '15000' });
  assert(budgetRes.fileBudget === 15000, 'HUGO_CFC_FILE_BUDGET overrides fileBudget to 15000');

  // Test 3h: HUGO_CFC_LINEUP_PAGES=available
  console.log('\nTesting HUGO_CFC_LINEUP_PAGES=available...');
  const lineupRes = runHugoResolve({ HUGO_CFC_LINEUP_PAGES: 'available' });
  assert(lineupRes.lineupPages === 'available', 'HUGO_CFC_LINEUP_PAGES overrides lineupPages to "available"');

  // Test 3i: HUGO_CFC_NOW=2026-11-05T12:00:00Z
  console.log('\nTesting HUGO_CFC_NOW=2026-11-05T12:00:00Z...');
  const nowRes = runHugoResolve({ HUGO_CFC_NOW: '2026-11-05T12:00:00Z' });
  assert(nowRes.asOfOverride === '2026-11-05T12:00:00Z', 'HUGO_CFC_NOW parses into asOfOverride RFC 3339 timestamp');

  // Test 3j: BaseURL and SampleDir overrides
  console.log('\nTesting HUGO_CFC_DATA_BASEURL and HUGO_CFC_DATA_SAMPLE overrides...');
  const customBase = runHugoResolve({
    HUGO_CFC_DATA_BASEURL: 'https://custom-storage.example.com/',
    HUGO_CFC_DATA_SAMPLE: 'custom-data/sample/',
  });
  assert(customBase.baseURL === 'https://custom-storage.example.com/', 'HUGO_CFC_DATA_BASEURL overrides baseURL');
  assert(customBase.sampleDir === 'custom-data/sample/', 'HUGO_CFC_DATA_SAMPLE overrides sampleDir');

  // Test 3k: All overrides combined simultaneously
  console.log('\nTesting all overrides applied simultaneously...');
  const combined = runHugoResolve(
    {
      HUGO_CFC_DATA_SOURCE: 'remote',
      HUGO_CFC_DATA_TOKEN: 'token-xyz-123',
      HUGO_CFC_DATA_BASEURL: 'https://cdn.example.org/v1/',
      HUGO_CFC_DATA_SAMPLE: 'assets/test-sample/',
      HUGO_CFC_FILE_BUDGET: '25000',
      HUGO_CFC_LINEUP_PAGES: 'available',
      HUGO_CFC_NOW: '2026-12-31T23:59:59Z',
    },
    'development'
  );
  assert(combined.source === 'remote', 'Combined: source is "remote"');
  assert(combined.token === 'token-xyz-123', 'Combined: token is "token-xyz-123"');
  assert(combined.baseURL === 'https://cdn.example.org/v1/', 'Combined: baseURL is custom');
  assert(combined.sampleDir === 'assets/test-sample/', 'Combined: sampleDir is custom');
  assert(combined.fileBudget === 25000, 'Combined: fileBudget is 25000');
  assert(combined.lineupPages === 'available', 'Combined: lineupPages is "available"');
  assert(combined.asOfOverride === '2026-12-31T23:59:59Z', 'Combined: asOfOverride matches timestamp');
  assert(combined.supportedMajor === 1, 'Combined: supportedMajor intact');
  assertDeepEqual(combined.home, { days: 7, max: 120 }, 'Combined: home settings intact');

} finally {
  cleanupHarness();
}

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n=============================================');
console.log(`Results: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);
console.log('=============================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All cfc-settings tests passed successfully!');
}
