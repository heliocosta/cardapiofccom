#!/usr/bin/env node

/**
 * Automated test suite for scripts/cfc-data-index.mjs (DatasetTool)
 *
 * Tests:
 * 1. Indexing a dataset directory computes sha256, byte counts, and collection counts correctly
 * 2. --check mode validates conforming datasets and catches schema & referential errors
 * 3. --synthesize N mode generates valid synthetic datasets of arbitrary match sizes (e.g. N=10, N=1260)
 * 4. CLI interface compatibility (flags, arguments, exit codes)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  calculateFileHash,
  updateIndex,
  checkDataset,
  synthesizeDataset,
} from './cfc-data-index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tempBaseDir = path.join(rootDir, 'resources', '_cfc_test_tool');

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

function assertThrows(fn, expectedSubstr, message) {
  totalTests++;
  try {
    fn();
    failedTests++;
    console.error(`❌ FAIL: ${message} (expected throw, but succeeded)`);
  } catch (err) {
    if (expectedSubstr && !err.message.includes(expectedSubstr)) {
      failedTests++;
      console.error(`❌ FAIL: ${message} (expected "${expectedSubstr}", got "${err.message}")`);
    } else {
      passedTests++;
      console.log(`✅ PASS: ${message}`);
    }
  }
}

function cleanTempDir() {
  if (fs.existsSync(tempBaseDir)) {
    fs.rmSync(tempBaseDir, { recursive: true, force: true });
  }
}

console.log('🧪 Starting DatasetTool (cfc-data-index.mjs) test suite...\n');

cleanTempDir();
fs.mkdirSync(tempBaseDir, { recursive: true });

try {
  // =========================================================================
  // Section 1: SHA-256 calculation and updateIndex
  // =========================================================================
  console.log('--- 1. SHA-256 calculation & index update ---');

  const testFile1 = path.join(tempBaseDir, 'test-file.txt');
  fs.writeFileSync(testFile1, 'CardapioFC 2026\n', 'utf8');
  const expectedHash = crypto.createHash('sha256').update('CardapioFC 2026\n').digest('hex').toLowerCase();
  const hashRes = calculateFileHash(testFile1);

  assert(hashRes.sha256 === expectedHash, `calculateFileHash returns lowercase sha256: ${hashRes.sha256}`);
  assert(hashRes.bytes === Buffer.byteLength('CardapioFC 2026\n'), `calculateFileHash returns exact bytes: ${hashRes.bytes}`);

  // Create a minimal valid dataset in a temp directory
  const ds1Dir = path.join(tempBaseDir, 'dataset_1');
  const channelsDir1 = path.join(ds1Dir, 'channels');
  fs.mkdirSync(channelsDir1, { recursive: true });

  const leaguesContent = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    leagues: {
      'premier-league': {
        uuid: 'l-epl',
        slug: 'premier-league',
        names: { en: 'Premier League' },
        popular: true,
        matchSlugs: ['arsenal-vs-chelsea-2026-11-08'],
      },
    },
  };
  fs.writeFileSync(path.join(ds1Dir, 'leagues.json'), JSON.stringify(leaguesContent, null, 2) + '\n');

  const teamsContent = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    teams: {
      arsenal: {
        uuid: 't-ars',
        slug: 'arsenal',
        names: { en: 'Arsenal' },
        country: { code: 'GB' },
        leagueSlugs: ['premier-league'],
        matchSlugs: ['arsenal-vs-chelsea-2026-11-08'],
      },
      chelsea: {
        uuid: 't-che',
        slug: 'chelsea',
        names: { en: 'Chelsea' },
        country: { code: 'GB' },
        leagueSlugs: ['premier-league'],
        matchSlugs: ['arsenal-vs-chelsea-2026-11-08'],
      },
    },
  };
  fs.writeFileSync(path.join(ds1Dir, 'teams.json'), JSON.stringify(teamsContent, null, 2) + '\n');

  const matchesContent = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    order: ['arsenal-vs-chelsea-2026-11-08'],
    matches: {
      'arsenal-vs-chelsea-2026-11-08': {
        uuid: 'm-001',
        slug: 'arsenal-vs-chelsea-2026-11-08',
        kickoff: '2026-11-08T16:30:00Z',
        leagueSlug: 'premier-league',
        homeSlug: 'arsenal',
        awaySlug: 'chelsea',
        status: 'scheduled',
        statusShort: 'NS',
        score: null,
        hasLineup: true,
      },
    },
  };
  fs.writeFileSync(path.join(ds1Dir, 'matches.json'), JSON.stringify(matchesContent, null, 2) + '\n');

  const lineupsContent = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    lineups: {
      'arsenal-vs-chelsea-2026-11-08': {
        home: {
          formation: '4-3-3',
          coach: 'Mikel Arteta',
          startXI: [{ name: 'David Raya', number: 22, pos: 'G', grid: '1:1' }],
          substitutes: [],
        },
        away: {
          formation: '4-2-3-1',
          coach: 'Enzo Maresca',
          startXI: [{ name: 'Robert Sanchez', number: 1, pos: 'G', grid: '1:1' }],
          substitutes: [],
        },
      },
    },
  };
  fs.writeFileSync(path.join(ds1Dir, 'lineups.json'), JSON.stringify(lineupsContent, null, 2) + '\n');

  const channelGB = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    country: 'GB',
    channels: {
      'sky-sports': { id: 'sky-sports', name: 'Sky Sports', type: 'tv', logo: null, url: null },
    },
    matches: {
      'arsenal-vs-chelsea-2026-11-08': ['sky-sports'],
    },
  };
  fs.writeFileSync(path.join(channelsDir1, 'GB.json'), JSON.stringify(channelGB, null, 2) + '\n');

  // Also add channels/BR.json
  const channelBR = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-11-05T06:00:00Z',
    country: 'BR',
    channels: {
      'espn-br': { id: 'espn-br', name: 'ESPN Brasil', type: 'tv', logo: null, url: null },
    },
    matches: {
      'arsenal-vs-chelsea-2026-11-08': ['espn-br'],
    },
  };
  fs.writeFileSync(path.join(channelsDir1, 'BR.json'), JSON.stringify(channelBR, null, 2) + '\n');

  // Run updateIndex on ds1Dir
  const updateRes = updateIndex(ds1Dir);
  assert(updateRes.updated === true, 'updateIndex returns updated: true');

  // Verify index.json contents
  const indexPath = path.join(ds1Dir, 'index.json');
  assert(fs.existsSync(indexPath), 'index.json was created/updated');
  const indexObj = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  assert(indexObj.counts.leagues === 1, 'index.counts.leagues equals 1');
  assert(indexObj.counts.teams === 2, 'index.counts.teams equals 2');
  assert(indexObj.counts.matches === 1, 'index.counts.matches equals 1');
  assert(indexObj.counts.lineups === 1, 'index.counts.lineups equals 1');

  assert(Array.isArray(indexObj.countries) && indexObj.countries.includes('GB') && indexObj.countries.includes('BR'),
    'index.countries includes GB and BR');

  assert(Boolean(indexObj.files['leagues.json']), 'index.files contains leagues.json');
  assert(Boolean(indexObj.files['teams.json']), 'index.files contains teams.json');
  assert(Boolean(indexObj.files['matches.json']), 'index.files contains matches.json');
  assert(Boolean(indexObj.files['lineups.json']), 'index.files contains lineups.json');
  assert(Boolean(indexObj.files['channels/GB.json']), 'index.files contains channels/GB.json');
  assert(Boolean(indexObj.files['channels/BR.json']), 'index.files contains channels/BR.json');

  // Verify exact hashes
  for (const [rel, meta] of Object.entries(indexObj.files)) {
    const computed = calculateFileHash(path.join(ds1Dir, rel));
    assert(meta.sha256 === computed.sha256, `SHA-256 matches for ${rel}`);
    assert(meta.bytes === computed.bytes, `Byte count matches for ${rel}`);
  }

  // =========================================================================
  // Section 2: checkDataset validation
  // =========================================================================
  console.log('\n--- 2. Dataset validation (--check mode) ---');

  // Test conforming dataset
  const checkPass = checkDataset(ds1Dir);
  assert(checkPass.valid === true, 'Conforming dataset passes checkDataset');
  assert(checkPass.errors.length === 0, 'Conforming dataset has 0 errors');

  // Test corrupted SHA-256 hash
  const corruptedShaIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  corruptedShaIndex.files['matches.json'].sha256 = '0'.repeat(64);
  fs.writeFileSync(indexPath, JSON.stringify(corruptedShaIndex, null, 2) + '\n');

  const checkCorruptSha = checkDataset(ds1Dir);
  assert(checkCorruptSha.valid === false, 'Tampered hash fails checkDataset');
  assert(checkCorruptSha.errors.some(e => e.includes('integrity mismatch')),
    'Catches integrity mismatch error');

  // Restore valid index
  updateIndex(ds1Dir);

  // Test invalid schemaVersion
  const corruptedVerIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  corruptedVerIndex.schemaVersion = '2.0.0';
  fs.writeFileSync(indexPath, JSON.stringify(corruptedVerIndex, null, 2) + '\n');
  const checkVer = checkDataset(ds1Dir);
  assert(checkVer.valid === false, 'Invalid schemaVersion fails checkDataset');
  assert(checkVer.errors.some(e => e.includes('schemaVersion')), 'Catches schemaVersion mismatch');

  // Restore valid index
  updateIndex(ds1Dir);

  // Test collection count mismatch (e.g. duplicate key simulation)
  const corruptedCountIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  corruptedCountIndex.counts.matches = 99;
  fs.writeFileSync(indexPath, JSON.stringify(corruptedCountIndex, null, 2) + '\n');
  const checkCount = checkDataset(ds1Dir);
  assert(checkCount.valid === false, 'Count mismatch fails checkDataset');
  assert(checkCount.errors.some(e => e.includes('collection count')), 'Catches collection count mismatch');

  // Restore valid index
  updateIndex(ds1Dir);

  // Test referential error: match refers to non-existent team
  const badMatchTeams = path.join(tempBaseDir, 'bad_team_ds');
  fs.cpSync(ds1Dir, badMatchTeams, { recursive: true });
  const badMatchObj = JSON.parse(fs.readFileSync(path.join(badMatchTeams, 'matches.json'), 'utf8'));
  badMatchObj.matches['arsenal-vs-chelsea-2026-11-08'].awaySlug = 'unknown-team';
  fs.writeFileSync(path.join(badMatchTeams, 'matches.json'), JSON.stringify(badMatchObj, null, 2) + '\n');
  updateIndex(badMatchTeams);

  const checkBadTeam = checkDataset(badMatchTeams);
  assert(checkBadTeam.valid === false, 'Unknown team in match fails checkDataset');
  assert(checkBadTeam.errors.some(e => e.includes('refers to unknown team "unknown-team"')),
    'Catches unresolved team reference');

  // Test referential error: lineup refers to non-existent match
  const badLineupDs = path.join(tempBaseDir, 'bad_lineup_ds');
  fs.cpSync(ds1Dir, badLineupDs, { recursive: true });
  const badLineupObj = JSON.parse(fs.readFileSync(path.join(badLineupDs, 'lineups.json'), 'utf8'));
  badLineupObj.lineups['ghost-vs-specter-2026-11-08'] = { ...badLineupObj.lineups['arsenal-vs-chelsea-2026-11-08'] };
  delete badLineupObj.lineups['arsenal-vs-chelsea-2026-11-08'];
  fs.writeFileSync(path.join(badLineupDs, 'lineups.json'), JSON.stringify(badLineupObj, null, 2) + '\n');
  updateIndex(badLineupDs);

  const checkBadLineup = checkDataset(badLineupDs);
  assert(checkBadLineup.valid === false, 'Unknown match in lineups fails checkDataset');
  assert(checkBadLineup.errors.some(e => e.includes('refers to unknown match')),
    'Catches unresolved lineup reference');

  // Test invalid match status
  const badStatusDs = path.join(tempBaseDir, 'bad_status_ds');
  fs.cpSync(ds1Dir, badStatusDs, { recursive: true });
  const badStatusMatch = JSON.parse(fs.readFileSync(path.join(badStatusDs, 'matches.json'), 'utf8'));
  badStatusMatch.matches['arsenal-vs-chelsea-2026-11-08'].status = 'delayed';
  fs.writeFileSync(path.join(badStatusDs, 'matches.json'), JSON.stringify(badStatusMatch, null, 2) + '\n');
  updateIndex(badStatusDs);

  const checkBadStatus = checkDataset(badStatusDs);
  assert(checkBadStatus.valid === false, 'Invalid match status fails checkDataset');
  assert(checkBadStatus.errors.some(e => e.includes('invalid status "delayed"')),
    'Catches invalid match status');

  // =========================================================================
  // Section 3: synthesizeDataset
  // =========================================================================
  console.log('\n--- 3. Dataset synthesis (--synthesize N mode) ---');

  // Test small synthesis (N = 10)
  const synth10Dir = path.join(tempBaseDir, 'synth_10');
  const synth10Res = synthesizeDataset(10, synth10Dir);
  assert(synth10Res.matchesCount === 10, 'synthesizeDataset generates 10 matches');

  const synth10Check = checkDataset(synth10Dir);
  assert(synth10Check.valid === true, 'Synthesized 10-match dataset passes checkDataset');
  if (!synth10Check.valid) {
    console.error('Validation errors for synth10:', synth10Check.errors);
  }

  // Cross-validate synthesized dataset against contract/cfc-data-v1.schema.json
  const schemaPath = path.join(rootDir, 'contract', 'cfc-data-v1.schema.json');
  if (fs.existsSync(schemaPath)) {
    const rootSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const defs = rootSchema.$defs;

    function validateDef(def, data, name) {
      // Basic recursive validator for draft 2020 schema
      function valNode(sch, val, p = '$') {
        const errs = [];
        if (sch.$ref) {
          const target = sch.$ref.slice('#/$defs/'.length);
          return valNode(defs[target], val, p);
        }
        if (sch.allOf) {
          for (const s of sch.allOf) errs.push(...valNode(s, val, p));
        }
        if (sch.type) {
          const types = Array.isArray(sch.type) ? sch.type : [sch.type];
          const actualType = val === null ? 'null' : Array.isArray(val) ? 'array' : Number.isInteger(val) ? 'integer' : typeof val;
          const match = types.includes(actualType) || (types.includes('number') && actualType === 'integer');
          if (!match) errs.push(`${p}: expected ${types.join('/')}, got ${actualType}`);
        }
        if (sch.pattern && typeof val === 'string') {
          if (!new RegExp(sch.pattern).test(val)) errs.push(`${p}: does not match pattern ${sch.pattern}`);
        }
        if (sch.enum && !sch.enum.includes(val)) {
          errs.push(`${p}: value not in enum`);
        }
        if (sch.required && val && typeof val === 'object') {
          for (const req of sch.required) {
            if (!(req in val)) errs.push(`${p}: missing required "${req}"`);
          }
        }
        if (sch.properties && val && typeof val === 'object') {
          for (const [k, v] of Object.entries(val)) {
            if (sch.properties[k]) errs.push(...valNode(sch.properties[k], v, `${p}.${k}`));
          }
        }
        if (sch.additionalProperties && typeof sch.additionalProperties === 'object' && val && typeof val === 'object') {
          const defined = sch.properties || {};
          for (const [k, v] of Object.entries(val)) {
            if (!defined[k]) errs.push(...valNode(sch.additionalProperties, v, `${p}.${k}`));
          }
        }
        if (sch.items && Array.isArray(val)) {
          val.forEach((item, idx) => errs.push(...valNode(sch.items, item, `${p}[${idx}]`)));
        }
        return errs;
      }
      const errs = valNode(def, data);
      assert(errs.length === 0, `Schema validation for ${name}: ${errs.length === 0 ? 'OK' : errs.slice(0, 3).join('; ')}`);
    }

    validateDef(defs.IndexFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'index.json'))), 'index.json');
    validateDef(defs.LeaguesFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'leagues.json'))), 'leagues.json');
    validateDef(defs.TeamsFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'teams.json'))), 'teams.json');
    validateDef(defs.MatchesFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'matches.json'))), 'matches.json');
    validateDef(defs.LineupsFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'lineups.json'))), 'lineups.json');
    validateDef(defs.ChannelsFile, JSON.parse(fs.readFileSync(path.join(synth10Dir, 'channels', 'GB.json'))), 'channels/GB.json');
  }

  const synth10Matches = JSON.parse(fs.readFileSync(path.join(synth10Dir, 'matches.json'), 'utf8'));
  assert(Object.keys(synth10Matches.matches).length === 10, 'matches.json contains exactly 10 matches');
  assert(synth10Matches.order.length === 10, 'matches.order contains exactly 10 slugs');

  // Test benchmark budget-sized synthesis (N = 1260)
  console.log('Testing budget benchmark synthesis (N = 1260)...');
  const synth1260Dir = path.join(tempBaseDir, 'synth_1260');
  const startSynth = Date.now();
  const synth1260Res = synthesizeDataset(1260, synth1260Dir);
  const synthDuration = Date.now() - startSynth;
  console.log(`Synthesized 1260 matches in ${synthDuration} ms.`);

  assert(synth1260Res.matchesCount === 1260, 'synthesizeDataset generates 1,260 matches');

  const synth1260Check = checkDataset(synth1260Dir);
  assert(synth1260Check.valid === true, 'Synthesized 1,260-match dataset passes checkDataset with 0 errors');
  if (!synth1260Check.valid) {
    console.error('Validation errors for synth1260:', synth1260Check.errors.slice(0, 10));
  }

  const synth1260Index = JSON.parse(fs.readFileSync(path.join(synth1260Dir, 'index.json'), 'utf8'));
  assert(synth1260Index.counts.matches === 1260, 'index.counts.matches equals 1260');
  assert(synth1260Index.counts.leagues === 4, 'index.counts.leagues equals 4');
  assert(synth1260Index.counts.teams === 80, 'index.counts.teams equals 80');
  assert(synth1260Index.countries.length === 5, '5 countries generated in index.countries');

  // Verify file budget calculation for 1,260 matches
  // E=6, M=1260, Lambda=1260, T=80, L=4, c=5, S=200
  // F = 6 * (1260 + 1260 + 80 + 4 + 1 + 5) + 200 = 6 * 2610 + 200 = 15,860 <= 18,000
  const E = 6;
  const M = synth1260Index.counts.matches;
  const Lambda = synth1260Index.counts.lineups;
  const T = synth1260Index.counts.teams;
  const L = synth1260Index.counts.leagues;
  const c = 5;
  const S = 200;
  const totalFiles = E * (M + Lambda + T + L + 1 + c) + S;
  assert(totalFiles <= 18000, `Budget compliance: total output files ${totalFiles} <= 18,000 budget cap`);

  // =========================================================================
  // Section 4: CLI Execution via Node subprocess
  // =========================================================================
  console.log('\n--- 4. CLI Execution & Exit Codes ---');

  // Test CLI default mode (update index)
  const cliUpdateOut = execSync(`node scripts/cfc-data-index.mjs "${ds1Dir}"`, { encoding: 'utf8' });
  assert(cliUpdateOut.includes('Updated index.json'), 'CLI update command succeeded');

  // Test CLI --check mode on valid dataset
  const cliCheckOut = execSync(`node scripts/cfc-data-index.mjs --check "${ds1Dir}"`, { encoding: 'utf8' });
  assert(cliCheckOut.includes('Dataset validation passed'), 'CLI --check command succeeded on valid dataset');

  // Test CLI --check mode on invalid dataset (expect exit code 1)
  let failedAsExpected = false;
  try {
    execSync(`node scripts/cfc-data-index.mjs --check "${badMatchTeams}"`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failedAsExpected = true;
    assert(err.status === 1, 'CLI --check exited with code 1 on invalid dataset');
  }
  assert(failedAsExpected, 'CLI --check failed on invalid dataset');

  // Test CLI --synthesize mode
  const cliSynthDir = path.join(tempBaseDir, 'cli_synth');
  const cliSynthOut = execSync(`node scripts/cfc-data-index.mjs --synthesize 5 "${cliSynthDir}"`, { encoding: 'utf8' });
  assert(cliSynthOut.includes('Successfully synthesized 5 matches'), 'CLI --synthesize succeeded');
  assert(fs.existsSync(path.join(cliSynthDir, 'matches.json')), 'CLI --synthesize created matches.json');

} finally {
  // Clean up temporary testing files
  cleanTempDir();
  console.log('\n🧹 Cleaned up temporary test artifacts.');
}

console.log(`\n========================================`);
console.log(`Tests: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All DatasetTool tests passed successfully!');
  process.exit(0);
}
