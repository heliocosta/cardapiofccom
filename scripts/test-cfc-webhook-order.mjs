#!/usr/bin/env node

/**
 * Automated test suite for webhook matches.order deduplication and validation.
 *
 * Verifies layouts/_partials/cfcdata/dataset.html (webhook ingestion) and
 * layouts/_partials/cfcdata/validate.html:
 * 1. Duplicate slug with same kickoff: deduplicated with warnf, build succeeds.
 * 2. Duplicate slug placing later kickoff earlier in order: deduplicated, re-sorted
 *    chronologically, and passes validate.html.
 * 3. Duplicate slug alongside an unknown slug: still fails validation with
 *    "order refers to unknown match".
 * 4. Unsorted order with no duplicates: still fails validation with
 *    "kickoff order violation".
 * 5. --live mode: hits the configured Retool webhook in data/cfc/settings.yaml
 *    and verifies Hugo builds cleanly with deduplicated, ordered matches.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SAMPLE_DIR = path.join(ROOT_DIR, 'assets', 'cfc-data', 'sample');
const TEST_CONTENT_PATH = path.join(ROOT_DIR, 'content', 'en', '_cfc_webhook_order_harness.md');
const TEST_LAYOUT_PATH = path.join(ROOT_DIR, 'layouts', '_cfc_webhook_order_harness.html');
const TEMP_BUILD_DIR = path.join(ROOT_DIR, 'resources', '_cfc_test_webhook_order_build');
const HUGO_STATS_PATH = path.join(ROOT_DIR, 'hugo_stats.json');
const OUTPUT_REL_PATH = 'cfc-test-webhook-order-output.json';

const isLiveMode = process.argv.includes('--live');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let hugoStatsBackup = null;
let hasHugoStatsBackup = false;

function assert(condition, message, details = '') {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}${details ? `\n   ${details}` : ''}`);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildBaselineWebhookPayload() {
  const leagues = readJson(path.join(SAMPLE_DIR, 'leagues.json'));
  const teams = readJson(path.join(SAMPLE_DIR, 'teams.json'));
  const matches = readJson(path.join(SAMPLE_DIR, 'matches.json'));
  const indexData = readJson(path.join(SAMPLE_DIR, 'index.json'));

  const channels = {};
  const channelsDir = path.join(SAMPLE_DIR, 'channels');
  for (const fileName of fs.readdirSync(channelsDir).sort()) {
    if (fileName.endsWith('.json')) {
      const cc = path.basename(fileName, '.json');
      channels[cc] = readJson(path.join(channelsDir, fileName));
    }
  }

  return {
    schemaVersion: indexData.schemaVersion || '1.0.0',
    generatedAt: indexData.generatedAt || matches.generatedAt || '2026-11-05T06:00:00Z',
    leagues,
    teams,
    matches,
    channels,
  };
}

function setupHarness() {
  if (fs.existsSync(HUGO_STATS_PATH)) {
    hugoStatsBackup = fs.readFileSync(HUGO_STATS_PATH);
    hasHugoStatsBackup = true;
  }

  fs.writeFileSync(
    TEST_CONTENT_PATH,
    `---
title: "CFC Webhook Order Harness"
layout: "_cfc_webhook_order_harness"
url: "/${OUTPUT_REL_PATH}"
---
`,
  );

  fs.writeFileSync(
    TEST_LAYOUT_PATH,
    `{{- $ds := partialCached "cfcdata/dataset.html" . "dataset" -}}
{{- dict "source" $ds.source "order" $ds.order "matches" $ds.matches | jsonify -}}
`,
  );
}

function cleanupHarness() {
  try {
    if (fs.existsSync(TEST_CONTENT_PATH)) fs.unlinkSync(TEST_CONTENT_PATH);
  } catch {}
  try {
    if (fs.existsSync(TEST_LAYOUT_PATH)) fs.unlinkSync(TEST_LAYOUT_PATH);
  } catch {}
  try {
    if (fs.existsSync(TEMP_BUILD_DIR)) fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
  } catch {}
  try {
    if (hasHugoStatsBackup && hugoStatsBackup !== null) {
      fs.writeFileSync(HUGO_STATS_PATH, hugoStatsBackup);
    }
  } catch {}
}

process.on('SIGINT', () => {
  cleanupHarness();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanupHarness();
  process.exit(1);
});

function startMockWebhookServer() {
  let currentPayload = buildBaselineWebhookPayload();
  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentPayload));
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}/startTrigger`,
        setPayload(payload) {
          currentPayload = payload;
        },
        close() {
          return new Promise((resClose) => server.close(resClose));
        },
      });
    });
  });
}

function runHugo({ webhookUrl = null } = {}) {
  if (fs.existsSync(TEMP_BUILD_DIR)) {
    fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
  }

  const env = { ...process.env, HUGO_CFC_DATA_SOURCE: 'webhook' };
  if (webhookUrl) {
    env.HUGO_CFC_WEBHOOK_URL = webhookUrl;
    env.HUGO_SECURITY_HTTP_URLS = '^http://127\\.0\\.0\\.1:';
  } else {
    delete env.HUGO_CFC_WEBHOOK_URL;
    delete env.HUGO_SECURITY_HTTP_URLS;
  }

  return new Promise((resolve) => {
    const child = spawn('hugo', ['-e', 'development', '--ignoreCache', '--destination', TEMP_BUILD_DIR], {
      cwd: ROOT_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (err) => {
      resolve({ success: false, code: 1, output: err.message });
    });
    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8');
      resolve({ success: code === 0, code: code ?? 1, output });
    });
  });
}

function readOutputJson() {
  const outPath = path.join(TEMP_BUILD_DIR, OUTPUT_REL_PATH);
  if (!fs.existsSync(outPath)) return null;
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

function assertValidSortedOrder(output, label) {
  assert(Boolean(output), `${label}: harness output JSON exists`);
  if (!output) return;

  assert(output.source === 'webhook', `${label}: dataset source is "webhook" (got "${output.source}")`);
  assert(Array.isArray(output.order), `${label}: order is an array`);
  if (!Array.isArray(output.order)) return;
  const matchKeys = Object.keys(output.matches || {});
  assert(
    output.order.length === matchKeys.length,
    `${label}: order length (${output.order.length}) equals matches count (${matchKeys.length})`,
  );
  assert(
    new Set(output.order).size === output.order.length,
    `${label}: order contains zero duplicate slugs`,
  );

  let monotonic = true;
  let prevKickoff = '';
  for (const slug of output.order) {
    const kickoff = String(output.matches?.[slug]?.kickoff || '');
    if (prevKickoff && prevKickoff > kickoff) {
      monotonic = false;
      break;
    }
    prevKickoff = kickoff;
  }
  assert(monotonic, `${label}: order is sorted in non-decreasing kickoff order`);
}

async function runMockTests() {
  console.log('🧪 Starting CFC Webhook matches.order test suite (mock mode)...\n');
  const mockServer = await startMockWebhookServer();

  try {
    // 1. Duplicate slug, same kickoff (inserted adjacent to original)
    console.log('--- Test 1: Duplicate slug, same kickoff ---');
    {
      const payload = buildBaselineWebhookPayload();
      const origOrder = payload.matches.order;
      const dupSlug = origOrder[2];
      payload.matches.order = [...origOrder.slice(0, 3), dupSlug, ...origOrder.slice(3)];
      mockServer.setPayload(payload);

      const res = await runHugo({ webhookUrl: mockServer.url });
      assert(res.success, 'Test 1: Hugo exits 0 when duplicate slug is present', res.output);
      assert(
        res.output.includes('data-pages: webhook: deduplicated 1 duplicate match slug(s) in matches.order') &&
          res.output.includes(dupSlug),
        `Test 1: build emits deduplication warning naming "${dupSlug}"`,
        res.output,
      );
      assertValidSortedOrder(readOutputJson(), 'Test 1');
    }

    // 2. Duplicate slug placing latest-kickoff match at index 0
    console.log('\n--- Test 2: Duplicate slug with shifted position / latest kickoff at index 0 ---');
    {
      const payload = buildBaselineWebhookPayload();
      const origOrder = payload.matches.order;
      const lastSlug = origOrder[origOrder.length - 1];
      payload.matches.order = [lastSlug, ...origOrder];
      mockServer.setPayload(payload);

      const res = await runHugo({ webhookUrl: mockServer.url });
      assert(res.success, 'Test 2: Hugo exits 0 after deduplicating and re-sorting order', res.output);
      assert(
        res.output.includes('data-pages: webhook: deduplicated 1 duplicate match slug(s) in matches.order') &&
          res.output.includes(lastSlug),
        `Test 2: build emits deduplication warning naming "${lastSlug}"`,
        res.output,
      );
      const out = readOutputJson();
      assertValidSortedOrder(out, 'Test 2');
      if (out && Array.isArray(out.order)) {
        assert(
          out.order[0] === origOrder[0] && out.order[out.order.length - 1] === lastSlug,
          `Test 2: re-sorted order restores "${origOrder[0]}" first and "${lastSlug}" last`,
        );
      }
    }

    // 3. Duplicate slug + unknown slug still fails validate.html
    console.log('\n--- Test 3: Duplicate slug + unknown slug still fails ---');
    {
      const payload = buildBaselineWebhookPayload();
      const origOrder = payload.matches.order;
      payload.matches.order = [...origOrder, origOrder[0], 'unknown-vs-match-2026-11-06'];
      mockServer.setPayload(payload);

      const res = await runHugo({ webhookUrl: mockServer.url });
      assert(!res.success, 'Test 3: Hugo fails when unknown slug is present alongside duplicate');
      assert(
        res.output.includes('order refers to unknown match') &&
          res.output.includes('unknown-vs-match-2026-11-06'),
        'Test 3: error output reports "order refers to unknown match"',
        res.output,
      );
    }

    // 4. No duplicates, unsorted order still fails validate.html
    console.log('\n--- Test 4: No duplicates, unsorted order still fails ---');
    {
      const payload = buildBaselineWebhookPayload();
      const origOrder = [...payload.matches.order];
      const first = origOrder[0];
      origOrder[0] = origOrder[origOrder.length - 1];
      origOrder[origOrder.length - 1] = first;
      payload.matches.order = origOrder;
      mockServer.setPayload(payload);

      const res = await runHugo({ webhookUrl: mockServer.url });
      assert(!res.success, 'Test 4: Hugo fails when order has no duplicates and is unsorted');
      assert(
        res.output.includes('kickoff order violation'),
        'Test 4: error output reports "kickoff order violation"',
        res.output,
      );
    }
  } finally {
    await mockServer.close();
  }
}

async function runLiveTest() {
  console.log('🧪 Starting CFC Webhook matches.order live webhook verification...\n');
  const res = await runHugo();
  assert(res.success, 'Live webhook: Hugo exits 0 without errors', res.output);
  assert(!res.output.includes('ERROR '), 'Live webhook: zero ERROR lines in build output', res.output);

  if (res.output.includes('data-pages: webhook: deduplicated')) {
    const warnLine = res.output.split('\n').find((l) => l.includes('data-pages: webhook: deduplicated')) || '';
    console.log(`  ℹ️  Live warning observed: ${warnLine.trim()}`);
  }

  const out = readOutputJson();
  assertValidSortedOrder(out, 'Live webhook');
  if (out && Array.isArray(out.order) && out.matches) {
    console.log(
      `  ℹ️  Live dataset verified: ${Object.keys(out.matches).length} matches, ${out.order.length} unique ordered slugs`,
    );
  }
}

try {
  cleanupHarness();
  setupHarness();

  if (isLiveMode) {
    await runLiveTest();
  } else {
    await runMockTests();
  }
} finally {
  cleanupHarness();
}

console.log('\n=============================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
console.log('=============================================================');

if (failedTests > 0) {
  process.exit(1);
}
console.log('\n🎉 All CFC Webhook matches.order tests passed!\n');
