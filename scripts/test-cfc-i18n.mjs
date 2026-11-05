#!/usr/bin/env node

/**
 * Automated test suite for Task 6.1: Feature localization strings and regional overrides
 *
 * Verifies:
 * 1. Base files (i18n/en.yaml, i18n/pt.yaml, i18n/es.yaml) exist and have 100% key parity.
 * 2. All 22 required data-pages keys exist across all base files:
 *    - round, venue, league, leagues, popular_leagues, all_leagues
 *    - upcoming_matches, recent_results, no_upcoming_matches, no_matches_scheduled
 *    - next_match, back_to_match, where_to_watch_in, watch_in_other_countries
 *    - no_broadcaster_check_app, data_updated, see_all_leagues
 *    - country_gb, country_ie, country_br, country_pt, country_ar
 * 3. Enforces that lineup-specific keys are strictly OUT OF SCOPE (no lineup, lineup_official, etc.).
 * 4. Regional override files contain required overrides:
 *    - en-gb.yaml: upcoming_matches, next_match
 *    - en-ie.yaml: upcoming_matches, next_match
 *    - pt-pt.yaml: round, where_to_watch_in, watch_in_other_countries
 *    - es-ar.yaml: round, no_broadcaster_check_app
 * 5. Hugo template resolution and parameter interpolation test across editions.
 * 6. Site check verification (`pnpm check`).
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

function parseYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const map = new Map();
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (match) {
      const key = match[1];
      const val = match[2] ?? match[3] ?? match[4]?.trim() ?? '';
      map.set(key, val);
    }
  }
  return map;
}

console.log('🧪 Starting CFC Feature Localization (Task 6.1) test suite...\n');

// ============================================================================
// Test 1: Base files existence and 100% key parity
// ============================================================================
console.log('--- Test 1: Base translation files existence and 100% key parity ---');

const baseFiles = [
  { code: 'en', path: path.join(ROOT_DIR, 'i18n/en.yaml') },
  { code: 'pt', path: path.join(ROOT_DIR, 'i18n/pt.yaml') },
  { code: 'es', path: path.join(ROOT_DIR, 'i18n/es.yaml') },
];

for (const bf of baseFiles) {
  assert(fs.existsSync(bf.path), `Base table ${bf.code} exists (${path.relative(ROOT_DIR, bf.path)})`);
}

const baseKeyMaps = {};
for (const bf of baseFiles) {
  baseKeyMaps[bf.code] = parseYaml(bf.path);
}

const allBaseKeys = new Set();
for (const bf of baseFiles) {
  for (const k of baseKeyMaps[bf.code].keys()) {
    allBaseKeys.add(k);
  }
}

for (const bf of baseFiles) {
  const currentKeys = baseKeyMaps[bf.code];
  let missingCount = 0;
  for (const k of allBaseKeys) {
    if (!currentKeys.has(k)) {
      missingCount++;
      assert(false, `Key "${k}" missing in base table ${bf.code}`);
    }
  }
  if (missingCount === 0) {
    assert(true, `Base table ${bf.code} has 100% key parity (${currentKeys.size} keys)`);
  }
}

// ============================================================================
// Test 2: Presence of all 22 required data-pages keys
// ============================================================================
console.log('\n--- Test 2: Presence of all 22 required data-pages keys ---');

const REQUIRED_DATA_PAGES_KEYS = [
  'round',
  'venue',
  'league',
  'leagues',
  'popular_leagues',
  'all_leagues',
  'upcoming_matches',
  'recent_results',
  'no_upcoming_matches',
  'no_matches_scheduled',
  'next_match',
  'back_to_match',
  'where_to_watch_in',
  'watch_in_other_countries',
  'no_broadcaster_check_app',
  'data_updated',
  'see_all_leagues',
  'country_gb',
  'country_ie',
  'country_br',
  'country_pt',
  'country_ar',
];

for (const key of REQUIRED_DATA_PAGES_KEYS) {
  for (const bf of baseFiles) {
    const val = baseKeyMaps[bf.code].get(key);
    assert(val !== undefined && val.length > 0, `Base table ${bf.code} has data-pages key "${key}" = "${val}"`);
  }
}

// Check interpolation variable placeholders
for (const bf of baseFiles) {
  const watchIn = baseKeyMaps[bf.code].get('where_to_watch_in');
  assert(
    watchIn && watchIn.includes('{{ .Country }}'),
    `where_to_watch_in in ${bf.code} contains "{{ .Country }}" placeholder (got "${watchIn}")`
  );

  const dataUpdated = baseKeyMaps[bf.code].get('data_updated');
  assert(
    dataUpdated && dataUpdated.includes('{{ .When }}'),
    `data_updated in ${bf.code} contains "{{ .When }}" placeholder (got "${dataUpdated}")`
  );
}

// ============================================================================
// Test 3: Directive Enforcement - Lineup keys strictly OUT OF SCOPE
// ============================================================================
console.log('\n--- Test 3: Directive enforcement (Lineups are OUT OF SCOPE) ---');

const FORBIDDEN_LINEUP_KEYS = [
  'lineup',
  'lineups',
  'lineup_official',
  'lineup_tba',
  'official_lineup',
  'unannounced_lineup',
  'formation',
  'substitutes',
  'starting_xi',
];

const allYamlFiles = [
  path.join(ROOT_DIR, 'i18n/en.yaml'),
  path.join(ROOT_DIR, 'i18n/pt.yaml'),
  path.join(ROOT_DIR, 'i18n/es.yaml'),
  path.join(ROOT_DIR, 'i18n/en-gb.yaml'),
  path.join(ROOT_DIR, 'i18n/en-ie.yaml'),
  path.join(ROOT_DIR, 'i18n/pt-pt.yaml'),
  path.join(ROOT_DIR, 'i18n/es-ar.yaml'),
];

for (const file of allYamlFiles) {
  const map = parseYaml(file);
  const rel = path.relative(ROOT_DIR, file);
  for (const forbidden of FORBIDDEN_LINEUP_KEYS) {
    assert(!map.has(forbidden), `Forbidden lineup key "${forbidden}" is absent from ${rel}`);
  }
}

// ============================================================================
// Test 4: Regional override files validation
// ============================================================================
console.log('\n--- Test 4: Regional override files validation ---');

const enGb = parseYaml(path.join(ROOT_DIR, 'i18n/en-gb.yaml'));
assert(enGb.get('upcoming_matches') === 'Upcoming Fixtures', 'en-gb overrides upcoming_matches to "Upcoming Fixtures"');
assert(enGb.get('next_match') === 'Next fixture', 'en-gb overrides next_match to "Next fixture"');

const enIe = parseYaml(path.join(ROOT_DIR, 'i18n/en-ie.yaml'));
assert(enIe.get('upcoming_matches') === 'Upcoming Fixtures', 'en-ie overrides upcoming_matches to "Upcoming Fixtures"');
assert(enIe.get('next_match') === 'Next fixture', 'en-ie overrides next_match to "Next fixture"');

const ptPt = parseYaml(path.join(ROOT_DIR, 'i18n/pt-pt.yaml'));
assert(ptPt.get('round') === 'Jornada', 'pt-pt overrides round to "Jornada"');
assert(
  ptPt.get('where_to_watch_in') === 'Onde ver em {{ .Country }}',
  'pt-pt overrides where_to_watch_in to "Onde ver em {{ .Country }}"'
);
assert(
  ptPt.get('watch_in_other_countries') === 'Ver noutros países',
  'pt-pt overrides watch_in_other_countries to "Ver noutros países"'
);

const esAr = parseYaml(path.join(ROOT_DIR, 'i18n/es-ar.yaml'));
assert(esAr.get('round') === 'Fecha', 'es-ar overrides round to "Fecha"');
assert(
  esAr.get('no_broadcaster_check_app') === 'Sin transmisión confirmada — consultá la app CardápioFC.',
  'es-ar overrides no_broadcaster_check_app to voseo "Sin transmisión confirmada — consultá la app CardápioFC."'
);

// ============================================================================
// Test 5: Hugo i18n interpolation and fallback resolution across editions
// ============================================================================
console.log('\n--- Test 5: Hugo i18n runtime resolution across editions ---');

const tempBuildDir = path.join(ROOT_DIR, 'resources', '_cfc_test_i18n_build');
const layoutProbePath = path.join(ROOT_DIR, 'layouts', '_cfc_i18n_probe.html');

const probeProbes = [
  { code: 'en', dir: 'content/en', outFile: '_probe_en.json' },
  { code: 'en-gb', dir: 'content/en-gb', outFile: 'en-gb/_probe_en-gb.json' },
  { code: 'pt-br', dir: 'content/pt-br', outFile: 'pt-br/_probe_pt-br.json' },
  { code: 'pt-pt', dir: 'content/pt-pt', outFile: 'pt-pt/_probe_pt-pt.json' },
  { code: 'es-ar', dir: 'content/es-ar', outFile: 'es-ar/_probe_es-ar.json' },
];

const createdFiles = [];

try {
  // Write harness layout
  fs.writeFileSync(
    layoutProbePath,
    `{{- $res := dict
      "round" (i18n "round")
      "upcoming_matches" (i18n "upcoming_matches")
      "next_match" (i18n "next_match")
      "where_to_watch_in" (i18n "where_to_watch_in" (dict "Country" "United Kingdom"))
      "data_updated" (i18n "data_updated" (dict "When" "2026-11-05"))
      "no_broadcaster_check_app" (i18n "no_broadcaster_check_app")
      "watch_in_other_countries" (i18n "watch_in_other_countries")
      "country_gb" (i18n "country_gb")
    -}}
    {{- $res | jsonify -}}
`,
    'utf8'
  );
  createdFiles.push(layoutProbePath);

  // Write content files for each language
  for (const p of probeProbes) {
    const mdPath = path.join(ROOT_DIR, p.dir, '_cfc_i18n_probe.md');
    fs.writeFileSync(
      mdPath,
      `---
title: "i18n probe"
layout: "_cfc_i18n_probe"
url: "/${p.outFile}"
---
`,
      'utf8'
    );
    createdFiles.push(mdPath);
  }

  // Run Hugo with temporary destination
  execSync(`hugo -e development --ignoreCache --destination "${tempBuildDir}" --quiet`, {
    cwd: ROOT_DIR,
    env: { ...process.env, HUGO_CFC_DATA_SOURCE: 'sample' },
    stdio: 'pipe',
  });

  const expectations = {
    en: {
      round: 'Round',
      upcoming_matches: 'Upcoming Matches',
      next_match: 'Next match',
      where_to_watch_in: 'Where to watch in United Kingdom',
      data_updated: 'Data updated 2026-11-05',
      watch_in_other_countries: 'Watch in other countries',
      country_gb: 'United Kingdom',
    },
    'en-gb': {
      round: 'Round', // fallback to en
      upcoming_matches: 'Upcoming Fixtures', // regional override
      next_match: 'Next fixture', // regional override
      where_to_watch_in: 'Where to watch in United Kingdom', // fallback
    },
    'pt-br': {
      round: 'Rodada',
      where_to_watch_in: 'Onde assistir em United Kingdom',
      watch_in_other_countries: 'Assistir em outros países',
      country_gb: 'Reino Unido',
    },
    'pt-pt': {
      round: 'Jornada', // regional override
      where_to_watch_in: 'Onde ver em United Kingdom', // regional override
      watch_in_other_countries: 'Ver noutros países', // regional override
      country_gb: 'Reino Unido', // fallback to pt
    },
    'es-ar': {
      round: 'Fecha', // regional override
      no_broadcaster_check_app: 'Sin transmisión confirmada — consultá la app CardápioFC.', // regional override
      upcoming_matches: 'Próximos partidos', // fallback to es
      country_gb: 'Reino Unido', // fallback to es
    },
  };

  for (const p of probeProbes) {
    const filePath = path.join(tempBuildDir, p.outFile);
    assert(fs.existsSync(filePath), `Probe output generated for ${p.code} (${p.outFile})`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const expected = expectations[p.code];
      for (const [k, expectedVal] of Object.entries(expected)) {
        assert(
          data[k] === expectedVal,
          `Hugo i18n in ${p.code} resolves "${k}" => "${data[k]}" (expected "${expectedVal}")`
        );
      }
    }
  }
} finally {
  for (const f of createdFiles) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
  if (fs.existsSync(tempBuildDir)) {
    fs.rmSync(tempBuildDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Test 6: Site check verification (pnpm check)
// ============================================================================
console.log('\n--- Test 6: Site check verification (pnpm check) ---');

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
  console.error('\n❌ CFC Feature Localization test suite failed!');
  process.exit(1);
} else {
  console.log('\n🎉 All CFC Feature Localization tests passed successfully!');
  process.exit(0);
}
