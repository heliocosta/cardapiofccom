#!/usr/bin/env node

/**
 * Automated test suite for Task 3.2: Secure Remote and Local Resource Fetcher
 *
 * Verifies layouts/_partials/cfcdata/fetch.html:
 * 1. Sample fetch of index.json, leagues.json, teams.json, matches.json, lineups.json, channels/GB.json.
 * 2. Valid SHA-256 integrity check passes for sample files.
 * 3. Integrity mismatch triggers errorf: "data-pages: <file>: integrity check failed..."
 * 4. Missing file triggers errorf: "data-pages: <file>: fetch failed..."
 * 5. Empty file triggers errorf: "data-pages: <file>: file is empty"
 * 6. Invalid JSON triggers errorf: "data-pages: <file>: invalid JSON..."
 * 7. Token redaction in error messages when remote fetch fails with a token (token=***, no raw token leaked).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import nodeAssert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const testContentPath = path.join(ROOT_DIR, 'content/en/_cfc_fetch_harness.md');
const testLayoutPath = path.join(ROOT_DIR, 'layouts/_cfc_fetch_harness.html');
const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_fetch_build');

// Paths for temporary test fixture files in assets
const tempSampleEmptyPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/_test_empty.json');
const tempSampleCorruptPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/_test_corrupt.json');
const tempSampleNonObjectPath = path.join(ROOT_DIR, 'assets/cfc-data/sample/_test_non_object.json');

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
  if (fs.existsSync(tempSampleEmptyPath)) fs.unlinkSync(tempSampleEmptyPath);
  if (fs.existsSync(tempSampleCorruptPath)) fs.unlinkSync(tempSampleCorruptPath);
  if (fs.existsSync(tempSampleNonObjectPath)) fs.unlinkSync(tempSampleNonObjectPath);
  if (fs.existsSync(tempBuildDir)) fs.rmSync(tempBuildDir, { recursive: true, force: true });
}

function setupHarnessContent() {
  fs.writeFileSync(
    testContentPath,
    `---
title: "CFC Fetch Harness"
layout: "_cfc_fetch_harness"
url: "/cfc-test-fetch-output.json"
---
`
  );
}

function runHugo(envVars = {}, hugoEnv = 'development') {
  const customEnv = {
    ...process.env,
    ...envVars,
  };

  const cmd = `hugo -e ${hugoEnv} --destination "${tempBuildDir}"`;
  try {
    const stdout = execSync(cmd, { cwd: ROOT_DIR, env: customEnv, stdio: 'pipe' });
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

console.log('🧪 Starting CFC Resource Fetcher (fetch.html) test suite...\n');

try {
  cleanupHarness();
  setupHarnessContent();

  // -------------------------------------------------------------
  // Test 1: Sample fetch of all contract files
  // -------------------------------------------------------------
  console.log('--- Test 1: Sample fetch of index, leagues, teams, matches, lineups, channels/GB ---');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $index := partial "cfcdata/fetch.html" (dict "file" "index.json") -}}
{{- $files := $index.files -}}
{{- $leagues := partial "cfcdata/fetch.html" (dict "file" "leagues.json" "sha256" (index $files "leagues.json" "sha256")) -}}
{{- $teams := partial "cfcdata/fetch.html" (dict "file" "teams.json" "sha256" (index $files "teams.json" "sha256")) -}}
{{- $matches := partial "cfcdata/fetch.html" (dict "file" "matches.json" "sha256" (index $files "matches.json" "sha256")) -}}
{{- $lineups := partial "cfcdata/fetch.html" (dict "file" "lineups.json" "sha256" (index $files "lineups.json" "sha256")) -}}
{{- $channelsGB := partial "cfcdata/fetch.html" (dict "file" "channels/GB.json" "sha256" (index $files "channels/GB.json" "sha256")) -}}

{{- $summary := dict
  "indexVersion" $index.schemaVersion
  "indexFilesCount" (len $index.files)
  "leaguesCount" (len $leagues)
  "teamsCount" (len $teams)
  "matchesCount" (len $matches)
  "lineupsCount" (len $lineups)
  "gbChannelsCount" (len $channelsGB)
-}}
{{- jsonify (dict "indent" "  ") $summary -}}
`
  );

  const res1 = runHugo({}, 'development');
  assert(res1.success, 'Hugo build succeeds fetching all sample files with valid sha256');

  const outputFile = path.join(tempBuildDir, 'cfc-test-fetch-output.json');
  assert(fs.existsSync(outputFile), 'Harness output file created');

  const output1 = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
  assert(output1.indexVersion === '1.0.0', 'index.json parsed correctly (schemaVersion 1.0.0)');
  assert(output1.indexFilesCount >= 6, `index.files lists files (found ${output1.indexFilesCount})`);
  assert(output1.leaguesCount > 0, `leagues.json parsed correctly (${output1.leaguesCount} leagues)`);
  assert(output1.teamsCount > 0, `teams.json parsed correctly (${output1.teamsCount} teams)`);
  assert(output1.matchesCount > 0, `matches.json parsed correctly (${output1.matchesCount} matches)`);
  assert(output1.lineupsCount > 0, `lineups.json parsed correctly (${output1.lineupsCount} lineups)`);
  assert(output1.gbChannelsCount > 0, `channels/GB.json parsed correctly (${output1.gbChannelsCount} matches with channels)`);

  // -------------------------------------------------------------
  // Test 2: Valid SHA-256 integrity check passes
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Valid SHA-256 integrity check passes ---');
  // Read index.json to get exact sha256 for leagues.json and matches.json
  const indexContent = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'assets/cfc-data/sample/index.json'), 'utf-8'));
  const leaguesSha = indexContent.files['leagues.json'].sha256;
  const matchesSha = indexContent.files['matches.json'].sha256;

  fs.writeFileSync(
    testLayoutPath,
    `{{- $l := partial "cfcdata/fetch.html" (dict "file" "leagues.json" "sha256" "${leaguesSha}") -}}
{{- $m := partial "cfcdata/fetch.html" (dict "file" "matches.json" "sha256" "${matchesSha.toUpperCase()}") -}}
{{- jsonify (dict "ok" true) -}}
`
  );

  const res2 = runHugo({}, 'development');
  assert(res2.success, 'Valid SHA-256 verification succeeds (including case-insensitive hex comparison)');

  // -------------------------------------------------------------
  // Test 3: Integrity mismatch triggers errorf
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Integrity mismatch triggers errorf ---');
  const badSha = '0000000000000000000000000000000000000000000000000000000000000000';
  fs.writeFileSync(
    testLayoutPath,
    `{{- $l := partial "cfcdata/fetch.html" (dict "file" "leagues.json" "sha256" "${badSha}") -}}
`
  );

  const res3 = runHugo({}, 'development');
  assert(!res3.success, 'Hugo build fails on SHA-256 mismatch');
  const errOutput3 = res3.stderr + '\n' + res3.stdout;
  assert(
    errOutput3.includes('data-pages: leagues.json: integrity check failed'),
    'Error message matches expected format: "data-pages: leagues.json: integrity check failed"'
  );
  assert(
    errOutput3.includes(`expected ${badSha}`),
    `Error message includes expected sha (${badSha})`
  );
  assert(
    errOutput3.includes(`got ${leaguesSha}`),
    `Error message includes actual calculated sha (${leaguesSha})`
  );

  // -------------------------------------------------------------
  // Test 4: Missing file triggers errorf
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Missing file triggers errorf ---');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $missing := partial "cfcdata/fetch.html" (dict "file" "nonexistent.json") -}}
`
  );

  const res4 = runHugo({}, 'development');
  assert(!res4.success, 'Hugo build fails on missing file');
  const errOutput4 = res4.stderr + '\n' + res4.stdout;
  assert(
    errOutput4.includes('data-pages: nonexistent.json: fetch failed:'),
    'Error message matches expected format: "data-pages: nonexistent.json: fetch failed:"'
  );

  // -------------------------------------------------------------
  // Test 5: Empty file triggers errorf
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Empty file triggers errorf ---');
  fs.writeFileSync(tempSampleEmptyPath, '   \n  \n');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $empty := partial "cfcdata/fetch.html" (dict "file" "_test_empty.json") -}}
`
  );

  const res5 = runHugo({}, 'development');
  assert(!res5.success, 'Hugo build fails on empty file');
  const errOutput5 = res5.stderr + '\n' + res5.stdout;
  assert(
    errOutput5.includes('data-pages: _test_empty.json: file is empty'),
    'Error message matches expected format: "data-pages: _test_empty.json: file is empty"'
  );

  // -------------------------------------------------------------
  // Test 6: Invalid JSON triggers errorf
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Invalid JSON triggers errorf ---');
  fs.writeFileSync(tempSampleCorruptPath, '{ "broken": [ 1, 2, ');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $corrupt := partial "cfcdata/fetch.html" (dict "file" "_test_corrupt.json") -}}
`
  );

  const res6 = runHugo({}, 'development');
  assert(!res6.success, 'Hugo build fails on corrupt JSON file');
  const errOutput6 = res6.stderr + '\n' + res6.stdout;
  assert(
    errOutput6.includes('data-pages: _test_corrupt.json: invalid JSON:'),
    'Error message matches expected format: "data-pages: _test_corrupt.json: invalid JSON:"'
  );

  // Test 6b: Non-standard JSON structure (e.g. array) triggers invalid JSON error
  fs.writeFileSync(tempSampleNonObjectPath, '[ "a", "b", "c" ]');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $nonObject := partial "cfcdata/fetch.html" (dict "file" "_test_non_object.json") -}}
`
  );
  const res6b = runHugo({}, 'development');
  assert(!res6b.success, 'Hugo build fails on non-object JSON file');
  const errOutput6b = res6b.stderr + '\n' + res6b.stdout;
  assert(
    errOutput6b.includes('data-pages: _test_non_object.json: invalid JSON:'),
    'Error message matches expected format: "data-pages: _test_non_object.json: invalid JSON:"'
  );

  // -------------------------------------------------------------
  // Test 7: Token redaction in remote fetch error
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Token redaction in remote fetch error ---');
  const secretToken = 'super-secret-production-token-998877';
  fs.writeFileSync(
    testLayoutPath,
    `{{- $settings := dict
      "source" "remote"
      "baseURL" "https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/"
      "prefix" "web/v1/"
      "token" "${secretToken}"
    -}}
{{- $res := partial "cfcdata/fetch.html" (dict "file" "remote-nonexistent.json" "settings" $settings) -}}
`
  );

  const res7 = runHugo({}, 'development');
  assert(!res7.success, 'Hugo build fails when remote resource not found');
  const errOutput7 = res7.stderr + '\n' + res7.stdout;

  assert(
    errOutput7.includes('data-pages: remote-nonexistent.json: fetch failed:'),
    'Error message matches expected format: "data-pages: remote-nonexistent.json: fetch failed:"'
  );
  assert(
    errOutput7.includes('token=***'),
    'Error message contains redacted "token=***"'
  );
  assert(
    !errOutput7.includes(secretToken),
    'Raw secret token is NEVER leaked into build logs or error output'
  );

  // Test 7b: Token redaction when URL parsing fails in Hugo template
  fs.writeFileSync(
    testLayoutPath,
    `{{- $settings := dict
      "source" "remote"
      "baseURL" "://malformed-scheme/"
      "prefix" "web/v1/"
      "token" "${secretToken}"
    -}}
{{- $res := partial "cfcdata/fetch.html" (dict "file" "test.json" "settings" $settings) -}}
`
  );

  const res7b = runHugo({}, 'development');
  assert(!res7b.success, 'Hugo build fails on malformed remote URL');
  const errOutput7b = res7b.stderr + '\n' + res7b.stdout;
  assert(
    errOutput7b.includes('token=***'),
    'Malformed URL error also has token redacted to "token=***"'
  );
  assert(
    !errOutput7b.includes(secretToken),
    'Raw secret token is NOT leaked even in Go template execution error'
  );

  // -------------------------------------------------------------
  // Test 8: Missing file parameter
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Missing file parameter ---');
  fs.writeFileSync(
    testLayoutPath,
    `{{- $res := partial "cfcdata/fetch.html" (dict) -}}
`
  );

  const res8 = runHugo({}, 'development');
  assert(!res8.success, 'Hugo build fails when file parameter is omitted');
  const errOutput8 = res8.stderr + '\n' + res8.stdout;
  assert(
    errOutput8.includes('data-pages: fetch: missing file parameter'),
    'Error message matches "data-pages: fetch: missing file parameter"'
  );

} finally {
  cleanupHarness();
}

console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Fetch tests passed successfully!');
  process.exit(0);
}
