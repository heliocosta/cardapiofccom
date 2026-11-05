#!/usr/bin/env node

/**
 * Automated test suite for Task 3.4: Dataset Loader and File Budget Estimator
 *
 * Verifies layouts/_partials/cfcdata/dataset.html and layouts/_partials/cfcdata/budget.html:
 * 1. cfcdata/dataset.html returns complete validated dataset from sample.
 * 2. Lineups are completely OUT OF SCOPE (not loaded, not present in dataset).
 * 3. cfcdata/dataset.html works with direct invocation (partial "cfcdata/dataset.html" .).
 * 4. cfcdata/dataset.html respects HUGO_CFC_NOW asOf override.
 * 5. cfcdata/budget.html calculates correct file estimate: F = E * (M + T + L + 1 + c) + S.
 * 6. cfcdata/budget.html logs warning with estimated file count:
 *    "data-pages: estimated output files 350/18000 (matches 8, teams 8, leagues 3, editions 6)"
 * 7. cfcdata/budget.html works with page context only (automatic resolution of dataset & settings).
 * 8. cfcdata/budget.html respects custom parameter overrides (fixedPerEdition, staticFiles, fileBudget).
 * 9. cfcdata/budget.html halts build with errorf when HUGO_CFC_FILE_BUDGET is lower than estimate.
 * 10. cfcdata/dataset.html halts build with errorf on contract major version mismatch.
 * 11. Verify deduplication / caching: partialCached can be called repeatedly without re-fetching.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const testContentPath = path.join(ROOT_DIR, 'content/en/_cfc_dataset_budget_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_dataset_budget_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_dataset_budget_build');
const sampleIndexBackupPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/index.json.bak');
const sampleIndexPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/index.json');

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
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
  if (fs.existsSync(sampleIndexBackupPath)) {
    fs.copyFileSync(sampleIndexBackupPath, sampleIndexPath);
    fs.unlinkSync(sampleIndexBackupPath);
  }
}

function setupHarness(layoutContent) {
  fs.writeFileSync(
    testContentPath,
    `---
title: "CFC Dataset and Budget Harness"
layout: "_cfc_dataset_budget_harness"
url: "/cfc-test-dataset-budget-output.json"
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

console.log('🧪 Starting CFC Dataset Loader and Budget Estimator test suite...\n');

try {
  cleanupHarness();

  // =========================================================================
  // Test 1: cfcdata/dataset.html returns complete validated dataset from sample
  // =========================================================================
  console.log('--- Test 1: Complete validated dataset returned from sample ---');
  {
    setupHarness(`
{{- $dataset := partialCached "cfcdata/dataset.html" . "dataset" -}}
{{- $directDataset := partial "cfcdata/dataset.html" . -}}
{{- dict "cached" $dataset "direct" $directDataset | jsonify -}}
`);

    const res = runHugo();
    assert(res.success, 'Hugo build succeeds with dataset partials');
    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    assert(fs.existsSync(outFile), 'Output JSON was generated');

    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      const ds = output.cached;
      const directDs = output.direct;

      assert(ds.source === 'sample', `Dataset source is "sample" (got "${ds.source}")`);
      assert(ds.generatedAt === '2026-11-05T06:00:00Z', `Dataset generatedAt matches index.json (got "${ds.generatedAt}")`);
      assert(ds.asOf.startsWith('2026-11-05T06:00:00'), `Dataset asOf matches sample generatedAt (got "${ds.asOf}")`);

      // Leagues
      assert(ds.leagues && typeof ds.leagues === 'object', 'Dataset contains leagues object');
      const leagueKeys = Object.keys(ds.leagues);
      assert(leagueKeys.length === 3, `Dataset contains 3 leagues (got ${leagueKeys.length})`);
      assert(leagueKeys.includes('premier-league'), 'Leagues contains premier-league');
      assert(leagueKeys.includes('la-liga'), 'Leagues contains la-liga');
      assert(leagueKeys.includes('brasileirao-serie-a'), 'Leagues contains brasileirao-serie-a');

      // Teams
      assert(ds.teams && typeof ds.teams === 'object', 'Dataset contains teams object');
      const teamKeys = Object.keys(ds.teams);
      assert(teamKeys.length === 8, `Dataset contains 8 teams (got ${teamKeys.length})`);
      assert(teamKeys.includes('arsenal'), 'Teams contains arsenal');
      assert(teamKeys.includes('chelsea'), 'Teams contains chelsea');

      // Matches & Order
      assert(ds.matches && typeof ds.matches === 'object', 'Dataset contains matches object');
      const matchKeys = Object.keys(ds.matches);
      assert(matchKeys.length === 8, `Dataset contains 8 matches (got ${matchKeys.length})`);
      assert(Array.isArray(ds.order), 'Dataset contains order array');
      assert(ds.order.length === 8, `Dataset order array has 8 match slugs (got ${ds.order.length})`);
      assert(ds.order[0] === 'arsenal-vs-chelsea-2026-11-06', `First match in order is arsenal-vs-chelsea-2026-11-06`);

      // Channels
      assert(ds.channels && typeof ds.channels === 'object', 'Dataset contains channels object');
      const countryKeys = Object.keys(ds.channels);
      assert(countryKeys.length === 5, `Dataset contains 5 countries (got ${countryKeys.length}: ${countryKeys.join(', ')})`);
      assert(countryKeys.includes('GB'), 'Channels contains GB');
      assert(countryKeys.includes('BR'), 'Channels contains BR');
      assert(ds.channels.GB && ds.channels.GB.channels && ds.channels.GB.channels['sky-sports-main-event'], 'Channels GB contains sky-sports-main-event');

      // DIRECTIVE: Lineups are completely out of scope
      assert(ds.lineups === undefined, 'Lineups are completely OUT OF SCOPE (not present in dataset)');

      // Direct invocation matches cached invocation
      assert(directDs && directDs.generatedAt === ds.generatedAt, 'Direct invocation partial matches partialCached');
      assert(Object.keys(directDs.matches).length === matchKeys.length, 'Direct invocation matches count matches cached');
    }
  }

  // =========================================================================
  // Test 2: cfcdata/dataset.html respects HUGO_CFC_NOW asOf override
  // =========================================================================
  console.log('\n--- Test 2: Respects HUGO_CFC_NOW asOf override ---');
  {
    setupHarness(`
{{- $dataset := partial "cfcdata/dataset.html" . -}}
{{- dict "asOf" $dataset.asOf | jsonify -}}
`);

    const overrideTimestamp = '2026-11-07T12:00:00Z';
    const res = runHugo({ HUGO_CFC_NOW: overrideTimestamp });
    assert(res.success, 'Hugo build succeeds with HUGO_CFC_NOW');
    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert(output.asOf.startsWith('2026-11-07T12:00:00'), `Dataset asOf reflects HUGO_CFC_NOW override (got "${output.asOf}")`);
    }
  }

  // =========================================================================
  // Test 3 & 4: cfcdata/budget.html calculations and warning log
  // =========================================================================
  console.log('\n--- Test 3 & 4: Budget estimation calculation and warning log ---');
  {
    setupHarness(`
{{- $dataset := partialCached "cfcdata/dataset.html" . "dataset" -}}
{{- $settings := partialCached "cfcdata/settings.html" . "settings" -}}
{{- $budget := partialCached "cfcdata/budget.html" (dict "dataset" $dataset "settings" $settings) "budget" -}}
{{- dict "budget" $budget | jsonify -}}
`);

    const res = runHugo();
    assert(res.success, 'Hugo build succeeds with budget partial');

    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      const b = output.budget;

      // Formula: F = E * (M + T + L + 1 + c) + S
      // Baseline: M=8, T=8, L=3, c=5, S=200, E=6
      // perEdition = 8 + 8 + 3 + 1 + 5 = 25
      // total = 6 * 25 + 200 = 350
      assert(b.editions === 6, `Budget editions count E is 6 (got ${b.editions})`);
      assert(b.matches === 8, `Budget matches count M is 8 (got ${b.matches})`);
      assert(b.teams === 8, `Budget teams count T is 8 (got ${b.teams})`);
      assert(b.leagues === 3, `Budget leagues count L is 3 (got ${b.leagues})`);
      assert(b.perEdition === 25, `Budget perEdition is 25 (got ${b.perEdition})`);
      assert(b.staticFiles === 200, `Budget staticFiles S is 200 (got ${b.staticFiles})`);
      assert(b.total === 350, `Budget total is 350 (got ${b.total})`);
      assert(b.budget === 18000, `Budget limit is 18000 (got ${b.budget})`);
    }

    // Verify warning log format
    const expectedWarning = 'data-pages: estimated output files 350/18000 (matches 8, teams 8, leagues 3, editions 6)';
    const combinedLog = `${res.stdout}\n${res.stderr}`;
    assert(
      combinedLog.includes(expectedWarning),
      `Warning log contains expected message: "${expectedWarning}"`
    );
  }

  // =========================================================================
  // Test 5: cfcdata/budget.html works with page context only
  // =========================================================================
  console.log('\n--- Test 5: Budget partial with page context only ---');
  {
    setupHarness(`
{{- $budget := partial "cfcdata/budget.html" . -}}
{{- dict "budget" $budget | jsonify -}}
`);

    const res = runHugo();
    assert(res.success, 'Hugo build succeeds with page context budget invocation');

    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      const b = output.budget;
      assert(b.total === 350, `Page context invocation calculated same total 350 (got ${b.total})`);
    }
  }

  // =========================================================================
  // Test 6: cfcdata/budget.html with custom settings parameters
  // =========================================================================
  console.log('\n--- Test 6: Budget estimation with custom parameter overrides ---');
  {
    setupHarness(`
{{- $dataset := partialCached "cfcdata/dataset.html" . "dataset" -}}
{{- $customSettings := dict "fixedPerEdition" 10 "staticFiles" 50 "fileBudget" 5000 -}}
{{- $budget := partial "cfcdata/budget.html" (dict "dataset" $dataset "settings" $customSettings) -}}
{{- dict "budget" $budget | jsonify -}}
`);

    const res = runHugo();
    assert(res.success, 'Hugo build succeeds with custom budget settings');

    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      const b = output.budget;
      // perEdition = 8 + 8 + 3 + 1 + 10 = 30
      // total = 6 * 30 + 50 = 230
      assert(b.perEdition === 30, `Custom perEdition is 30 (got ${b.perEdition})`);
      assert(b.staticFiles === 50, `Custom staticFiles is 50 (got ${b.staticFiles})`);
      assert(b.budget === 5000, `Custom budget is 5000 (got ${b.budget})`);
      assert(b.total === 230, `Custom total is 230 (got ${b.total})`);
    }
  }

  // =========================================================================
  // Test 7: Budget exceeded halts build with errorf
  // =========================================================================
  console.log('\n--- Test 7: File budget exceeded halts build with errorf ---');
  {
    setupHarness(`
{{- $budget := partial "cfcdata/budget.html" . -}}
{{- dict "budget" $budget | jsonify -}}
`);

    // Budget lower than estimate 350
    const res = runHugo({ HUGO_CFC_FILE_BUDGET: '300' });
    assert(!res.success, 'Build correctly fails when HUGO_CFC_FILE_BUDGET=300 (total is 350)');

    const expectedError = 'data-pages: file budget exceeded: estimated 350 files exceeds budget 300 (matches: 8, teams: 8, leagues: 3, editions: 6)';
    const combinedLog = `${res.stdout}\n${res.stderr}`;
    assert(
      combinedLog.includes(expectedError),
      `Build error message matches expected format:\n  "${expectedError}"`
    );
  }

  // =========================================================================
  // Test 8: Major version mismatch halts build early
  // =========================================================================
  console.log('\n--- Test 8: Contract major version mismatch halts build early ---');
  {
    // Backup index.json and temporarily change schemaVersion to 2.0.0
    fs.copyFileSync(sampleIndexPath, sampleIndexBackupPath);
    const indexData = JSON.parse(fs.readFileSync(sampleIndexPath, 'utf8'));
    indexData.schemaVersion = '2.0.0';
    fs.writeFileSync(sampleIndexPath, JSON.stringify(indexData, null, 2));

    setupHarness(`
{{- $dataset := partial "cfcdata/dataset.html" . -}}
{{- dict "done" true | jsonify -}}
`);

    const res = runHugo();
    assert(!res.success, 'Build correctly fails when contract major version is 2.0.0');

    const expectedError = 'data-pages: index.json: contract major version mismatch (declared "2.0.0", supported 1)';
    const combinedLog = `${res.stdout}\n${res.stderr}`;
    assert(
      combinedLog.includes(expectedError),
      `Error log contains version mismatch: "${expectedError}"`
    );

    // Restore index.json
    fs.copyFileSync(sampleIndexBackupPath, sampleIndexPath);
    fs.unlinkSync(sampleIndexBackupPath);
  }

  // =========================================================================
  // Test 9: Deduplication and caching via partialCached
  // =========================================================================
  console.log('\n--- Test 9: Deduplication and caching via partialCached ---');
  {
    setupHarness(`
{{- /* Invoke partialCached 5 times */ -}}
{{- $b1 := partialCached "cfcdata/budget.html" . "budget" -}}
{{- $b2 := partialCached "cfcdata/budget.html" . "budget" -}}
{{- $b3 := partialCached "cfcdata/budget.html" . "budget" -}}
{{- $b4 := partialCached "cfcdata/budget.html" . "budget" -}}
{{- $b5 := partialCached "cfcdata/budget.html" . "budget" -}}
{{- dict "total1" $b1.total "total5" $b5.total | jsonify -}}
`);

    const res = runHugo();
    assert(res.success, 'Multiple partialCached calls succeed');

    // In a multilingual build with 6 languages, each language executes the template once.
    // Without caching, 5 calls per language would produce 5 * 6 = 30 warnf log lines.
    // With partialCached, each language site evaluates budget.html at most once (or once globally),
    // so count is <= 6, not 30.
    const combinedLog = `${res.stdout}\n${res.stderr}`;
    const logMatch = combinedLog.match(/data-pages: estimated output files 350\/18000/g);
    const count = logMatch ? logMatch.length : 0;
    assert(count > 0 && count <= 6, `Estimated file count warning was emitted ${count} times (cached, not 30 times)`);

    const outFile = path.join(tempBuildDir, 'cfc-test-dataset-budget-output.json');
    if (fs.existsSync(outFile)) {
      const output = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert(output.total1 === 350 && output.total5 === 350, 'All partialCached returns produce identical total (350)');
    }
  }

} finally {
  console.log('\n🧹 Cleaning up test harness and temporary files...');
  cleanupHarness();
}

console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Dataset Loader and Budget Estimator tests passed successfully!\n');
}
