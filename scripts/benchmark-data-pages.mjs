#!/usr/bin/env node

/**
 * scripts/benchmark-data-pages.mjs
 *
 * Full integration build and scale benchmark runner for CardápioFC data-backed pages.
 *
 * Requirements verified:
 * - 11.3: Total output file count estimate reported in build log.
 * - 11.4: Estimated count strictly <= 18,000 file budget.
 * - 11.6: CI build time completes in under 30 seconds for 1,260 matches.
 * - 12.1, 12.2, 12.3, 12.5: Downstream contracts:
 *   - cfcdata/page-entity.html
 *   - cfcdata/entity-list.html
 *   - cfcdata/channels.html
 * - USER DIRECTIVE: Lineups are completely OUT OF SCOPE (Lambda = 0).
 *   Strict absence of lineup pages, markup, and scripts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const BENCH_DIR = path.join(ROOT_DIR, 'assets', 'cfc-data', 'bench-1260');
const PROBE_LAYOUT_PATH = path.join(ROOT_DIR, 'layouts', '_cfc_bench_probe.html');
const PROBE_DEST_DIR = path.join(ROOT_DIR, 'resources', '_cfc_bench_probe_out');

const EDITIONS = [
  { code: 'en', prefix: '', country: '', isGlobal: true },
  { code: 'en-gb', prefix: 'en-gb/', country: 'GB', isGlobal: false },
  { code: 'en-ie', prefix: 'en-ie/', country: 'IE', isGlobal: false },
  { code: 'pt-br', prefix: 'pt-br/', country: 'BR', isGlobal: false },
  { code: 'pt-pt', prefix: 'pt-pt/', country: 'PT', isGlobal: false },
  { code: 'es-ar', prefix: 'es-ar/', country: 'AR', isGlobal: false },
];

let totalChecks = 0;
let passedChecks = 0;
const failures = [];

function pass(msg) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg) {
  totalChecks++;
  failures.push(msg);
  console.error(`  ❌ FAIL: ${msg}`);
}

function section(title) {
  console.log(`\n===============================================================`);
  console.log(`=== ${title}`);
  console.log(`===============================================================`);
}

function getAllFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files = files.concat(getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function cleanupProbeHarness() {
  if (fs.existsSync(PROBE_LAYOUT_PATH)) {
    try { fs.unlinkSync(PROBE_LAYOUT_PATH); } catch (e) {}
  }
  for (const ed of EDITIONS) {
    const p = path.join(ROOT_DIR, 'content', ed.code, '_cfc_bench_probe.md');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
  if (fs.existsSync(PROBE_DEST_DIR)) {
    try { fs.rmSync(PROBE_DEST_DIR, { recursive: true, force: true }); } catch (e) {}
  }
}

function cleanupBenchDataset() {
  if (fs.existsSync(BENCH_DIR)) {
    try {
      fs.rmSync(BENCH_DIR, { recursive: true, force: true });
      console.log(`  Cleaned up benchmark dataset directory: ${path.relative(ROOT_DIR, BENCH_DIR)}`);
    } catch (err) {
      console.warn(`  Warning: failed to clean up ${BENCH_DIR}: ${err.message}`);
    }
  }
}

async function runBenchmark() {
  const benchmarkStartTime = performance.now();
  console.log('🚀 CardápioFC Scale Benchmark & Integration Verification Runner');
  console.log(`Workspace: ${ROOT_DIR}`);
  console.log(`Scale target: 1,260 matches across 6 editions`);

  const resultsSummary = {
    matchesCount: 0,
    teamsCount: 0,
    leaguesCount: 0,
    editionsCount: EDITIONS.length,
    estimatedOutputFiles: 0,
    fileBudget: 18000,
    actualOutputFiles: 0,
    hugoBuildTimeSec: 0,
    totalBenchmarkTimeSec: 0,
    contractChecksPassed: false,
    lineupAbsencePassed: false,
  };

  try {
    // -----------------------------------------------------------------
    // Step 1: Synthesize 1,260 matches into assets/cfc-data/bench-1260
    // -----------------------------------------------------------------
    section('Step 1: Dataset Synthesis (1,260 Matches)');
    if (fs.existsSync(BENCH_DIR)) {
      fs.rmSync(BENCH_DIR, { recursive: true, force: true });
    }

    console.log(`  Synthesizing 1,260 matches into assets/cfc-data/bench-1260...`);
    const synthOut = execSync('node scripts/cfc-data-index.mjs --synthesize 1260 assets/cfc-data/bench-1260', {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    }).toString();

    if (fs.existsSync(path.join(BENCH_DIR, 'index.json')) && fs.existsSync(path.join(BENCH_DIR, 'matches.json'))) {
      const idx = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'index.json'), 'utf8'));
      resultsSummary.matchesCount = idx.counts.matches;
      resultsSummary.teamsCount = idx.counts.teams;
      resultsSummary.leaguesCount = idx.counts.leagues;

      if (idx.counts.matches === 1260) {
        pass(`Successfully synthesized 1,260 matches (${idx.counts.teams} teams, ${idx.counts.leagues} leagues)`);
      } else {
        fail(`Synthesized match count mismatch: expected 1260, got ${idx.counts.matches}`);
      }
    } else {
      fail(`Synthesis failed: index.json or matches.json missing in ${BENCH_DIR}`);
    }

    // -----------------------------------------------------------------
    // Step 2: Validate synthesized dataset integrity using --check
    // -----------------------------------------------------------------
    section('Step 2: Synthesized Dataset Integrity Validation (--check)');
    console.log(`  Validating synthesized dataset via cfc-data-index.mjs --check...`);
    try {
      const checkOut = execSync('node scripts/cfc-data-index.mjs --check assets/cfc-data/bench-1260', {
        cwd: ROOT_DIR,
        stdio: 'pipe',
      }).toString();
      pass(`Dataset integrity check passed cleanly:\n    ${checkOut.trim().replace(/\n/g, '\n    ')}`);
    } catch (err) {
      const msg = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + err.message;
      fail(`Dataset integrity check failed: ${msg}`);
    }

    // -----------------------------------------------------------------
    // Step 3 & 4: Execute clean Hugo build, verify log estimate & time
    // -----------------------------------------------------------------
    section('Step 3 & 4: Production Hugo Build & Performance Timing');
    console.log(`  Running theme generator...`);
    execSync('node scripts/themeGenerator.js', { cwd: ROOT_DIR, stdio: 'pipe' });

    console.log(`  Executing clean Hugo build with synthesized dataset...`);
    const hugoEnv = {
      ...process.env,
      HUGO_CFC_DATA_SOURCE: 'sample',
      HUGO_CFC_DATA_SAMPLE: 'cfc-data/bench-1260/',
    };

    const buildStart = performance.now();
    let buildStdout = '';
    let buildSuccess = false;

    try {
      buildStdout = execSync('hugo --gc --minify --cleanDestinationDir 2>&1', {
        cwd: ROOT_DIR,
        env: hugoEnv,
        stdio: 'pipe',
      }).toString();
      buildSuccess = true;
    } catch (err) {
      buildStdout = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + err.message;
      buildSuccess = false;
      fail(`Hugo build failed: ${buildStdout}`);
    }

    const buildEnd = performance.now();
    const elapsedSec = (buildEnd - buildStart) / 1000;
    resultsSummary.hugoBuildTimeSec = parseFloat(elapsedSec.toFixed(2));

    if (buildSuccess) {
      pass(`Hugo build succeeded in ${resultsSummary.hugoBuildTimeSec}s`);
    }

    // Requirement 11.6: Build time <= 30 seconds
    if (elapsedSec <= 30.0) {
      pass(`Requirement 11.6 SATISFIED: Build completed in ${resultsSummary.hugoBuildTimeSec}s (<= 30.0s target)`);
    } else {
      fail(`Requirement 11.6 VIOLATION: Build took ${resultsSummary.hugoBuildTimeSec}s, exceeding 30.0s budget`);
    }

    // Requirement 11.3: Total output file count estimate reported in build log
    const budgetLogMatch = buildStdout.match(/data-pages:\s*estimated output files\s*(\d+)\/(\d+)\s*\(([^)]+)\)/i);
    if (budgetLogMatch) {
      const estimatedCount = parseInt(budgetLogMatch[1], 10);
      const configuredBudget = parseInt(budgetLogMatch[2], 10);
      const breakdown = budgetLogMatch[3];
      resultsSummary.estimatedOutputFiles = estimatedCount;
      resultsSummary.fileBudget = configuredBudget;

      pass(`Requirement 11.3 SATISFIED: Build log reports file count estimate: ${estimatedCount}/${configuredBudget} (${breakdown})`);

      // Requirement 11.4: Estimated count <= 18,000 file budget
      if (estimatedCount <= configuredBudget && estimatedCount <= 18000) {
        pass(`Requirement 11.4 SATISFIED: Estimated file count (${estimatedCount}) is strictly <= file budget (${configuredBudget})`);
      } else {
        fail(`Requirement 11.4 VIOLATION: Estimated file count (${estimatedCount}) exceeds budget (${configuredBudget})`);
      }
    } else {
      fail(`Requirement 11.3 VIOLATION: File count estimate missing from build log output:\n${buildStdout}`);
    }

    // -----------------------------------------------------------------
    // Step 5: Count total output files in public/ (asserts <= 18,000)
    // -----------------------------------------------------------------
    section('Step 5: Output File Budget Audit');
    const allPublicFiles = getAllFiles(PUBLIC_DIR);
    resultsSummary.actualOutputFiles = allPublicFiles.length;

    console.log(`  Total files counted in public/: ${resultsSummary.actualOutputFiles}`);
    if (resultsSummary.actualOutputFiles <= 18000) {
      pass(`Requirement 11.4 SATISFIED: Actual public/ file count (${resultsSummary.actualOutputFiles}) strictly <= 18,000 budget`);
    } else {
      fail(`Requirement 11.4 VIOLATION: Actual public/ file count (${resultsSummary.actualOutputFiles}) exceeds 18,000`);
    }

    // Expected vs Actual comparison:
    // Estimate is conservative (S=200 static files, c=5 fixed per edition)
    const ratio = ((resultsSummary.actualOutputFiles / resultsSummary.fileBudget) * 100).toFixed(1);
    console.log(`  Budget utilization: ${resultsSummary.actualOutputFiles} / ${resultsSummary.fileBudget} (${ratio}%)`);

    // -----------------------------------------------------------------
    // Step 6: Verify downstream contracts via probe execution
    // -----------------------------------------------------------------
    section('Step 6: Downstream Contracts Verification');
    cleanupProbeHarness();

    // Read synthesized data to pick test slugs
    const matchesJson = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'matches.json'), 'utf8'));
    const teamsJson = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'teams.json'), 'utf8'));
    const leaguesJson = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'leagues.json'), 'utf8'));

    const sampleMatchSlug = matchesJson.order[0];
    const sampleMatch = matchesJson.matches[sampleMatchSlug];
    const sampleTeamSlug = sampleMatch.homeSlug;
    const sampleLeagueSlug = sampleMatch.leagueSlug;

    console.log(`  Probing downstream contracts against synthesized dataset:`);
    console.log(`    Sample match:  ${sampleMatchSlug}`);
    console.log(`    Sample team:   ${sampleTeamSlug}`);
    console.log(`    Sample league: ${sampleLeagueSlug}`);

    // Create probe layout
    const probeLayoutContent = `
{{ $sampleMatchSlug := "${sampleMatchSlug}" }}
{{ $sampleTeamSlug := "${sampleTeamSlug}" }}
{{ $sampleLeagueSlug := "${sampleLeagueSlug}" }}

{{/* 1. PageEntity contracts */}}
{{ $matchPage := dict "Params" (dict "cfc" (dict "kind" "match" "slug" $sampleMatchSlug)) }}
{{ $entityMatch := partial "cfcdata/page-entity.html" $matchPage }}

{{ $teamPage := dict "Params" (dict "cfc" (dict "kind" "team" "slug" $sampleTeamSlug)) }}
{{ $entityTeam := partial "cfcdata/page-entity.html" $teamPage }}

{{ $leaguePage := dict "Params" (dict "cfc" (dict "kind" "league" "slug" $sampleLeagueSlug)) }}
{{ $entityLeague := partial "cfcdata/page-entity.html" $leaguePage }}

{{ $leaguesPage := dict "Params" (dict "cfc" (dict "kind" "leagues")) }}
{{ $entityLeagues := partial "cfcdata/page-entity.html" $leaguesPage }}

{{ $regularPage := dict "Params" (dict "title" "Static Info Page") }}
{{ $entityRegular := partial "cfcdata/page-entity.html" $regularPage }}

{{/* 2. EntityList contract */}}
{{ $entityList := partialCached "cfcdata/entity-list.html" . site.Language.Lang }}

{{/* 3. Channels contract direct invocation */}}
{{ $channelsDirect := partial "cfcdata/channels.html" $sampleMatchSlug }}

{{ dict
  "edition" site.Language.Lang
  "match" $entityMatch
  "team" $entityTeam
  "league" $entityLeague
  "leagues" $entityLeagues
  "regular" $entityRegular
  "entityList" $entityList
  "channelsDirect" $channelsDirect
| jsonify }}
`;

    fs.writeFileSync(PROBE_LAYOUT_PATH, probeLayoutContent, 'utf8');

    // Create probe content file in each edition
    for (const ed of EDITIONS) {
      const probeContentFile = path.join(ROOT_DIR, 'content', ed.code, '_cfc_bench_probe.md');
      fs.writeFileSync(
        probeContentFile,
        `---\ntitle: "CFC Benchmark Probe"\nlayout: "_cfc_bench_probe"\nurl: "/${ed.prefix}bench-probe.json"\n---\n`,
        'utf8'
      );
    }

    try {
      execSync(`hugo --destination "${PROBE_DEST_DIR}" 2>&1`, {
        cwd: ROOT_DIR,
        env: hugoEnv,
        stdio: 'pipe',
      });
      pass('Probe Hugo execution completed successfully');
    } catch (err) {
      const msg = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + err.message;
      fail(`Probe Hugo execution failed: ${msg}`);
    }

    // Verify probe JSON output for each edition
    let probeSuccessCount = 0;
    for (const ed of EDITIONS) {
      const probeJsonPath = path.join(PROBE_DEST_DIR, ed.prefix, 'bench-probe.json');
      if (!fs.existsSync(probeJsonPath)) {
        fail(`Missing probe output JSON for edition ${ed.code} at ${probeJsonPath}`);
        continue;
      }

      const probeData = JSON.parse(fs.readFileSync(probeJsonPath, 'utf8'));

      // 6a: cfcdata/page-entity.html - Match
      const mEntity = probeData.match;
      if (
        mEntity &&
        mEntity.kind === 'match' &&
        mEntity.edition === ed.code &&
        mEntity.match &&
        mEntity.match.slug === sampleMatchSlug &&
        mEntity.match.home &&
        mEntity.match.away &&
        mEntity.match.league &&
        Array.isArray(mEntity.channels)
      ) {
        pass(`[${ed.code}] cfcdata/page-entity.html match entity verified with full VM & channels`);
      } else {
        fail(`[${ed.code}] cfcdata/page-entity.html match entity contract violation`);
      }

      // 6b: cfcdata/page-entity.html - Team
      const tEntity = probeData.team;
      if (
        tEntity &&
        tEntity.kind === 'team' &&
        tEntity.edition === ed.code &&
        tEntity.team &&
        tEntity.team.slug === sampleTeamSlug &&
        tEntity.team.name
      ) {
        pass(`[${ed.code}] cfcdata/page-entity.html team entity verified with full TeamVM`);
      } else {
        fail(`[${ed.code}] cfcdata/page-entity.html team entity contract violation`);
      }

      // 6c: cfcdata/page-entity.html - League
      const lEntity = probeData.league;
      if (
        lEntity &&
        lEntity.kind === 'league' &&
        lEntity.edition === ed.code &&
        lEntity.league &&
        lEntity.league.slug === sampleLeagueSlug &&
        lEntity.league.name
      ) {
        pass(`[${ed.code}] cfcdata/page-entity.html league entity verified with full LeagueVM`);
      } else {
        fail(`[${ed.code}] cfcdata/page-entity.html league entity contract violation`);
      }

      // 6d: cfcdata/page-entity.html - Leagues directory
      const lsEntity = probeData.leagues;
      if (
        lsEntity &&
        lsEntity.kind === 'leagues' &&
        lsEntity.edition === ed.code &&
        Array.isArray(lsEntity.leagues) &&
        lsEntity.leagues.length === 4
      ) {
        pass(`[${ed.code}] cfcdata/page-entity.html leagues directory entity returns all 4 leagues`);
      } else {
        fail(`[${ed.code}] cfcdata/page-entity.html leagues directory contract violation`);
      }

      // Non-CFC page returns null
      if (probeData.regular === null) {
        pass(`[${ed.code}] cfcdata/page-entity.html returns nil for non-CFC page`);
      } else {
        fail(`[${ed.code}] cfcdata/page-entity.html did not return nil for non-CFC page`);
      }

      // 6e: cfcdata/entity-list.html
      const eList = probeData.entityList;
      const expectedTotalEntities = 4 + 80 + 1260; // 1344
      if (Array.isArray(eList) && eList.length === expectedTotalEntities) {
        pass(`[${ed.code}] cfcdata/entity-list.html returns all ${expectedTotalEntities} entities (4 leagues + 80 teams + 1260 matches)`);

        // Check ordering: leagues, teams, matches
        let orderValid = true;
        let lastSection = 'league';
        let leaguesSeen = 0;
        let teamsSeen = 0;
        let matchesSeen = 0;

        for (const item of eList) {
          if (item.kind === 'league') {
            if (lastSection !== 'league') orderValid = false;
            leaguesSeen++;
          } else if (item.kind === 'team') {
            if (lastSection === 'league') lastSection = 'team';
            if (lastSection !== 'team') orderValid = false;
            teamsSeen++;
          } else if (item.kind === 'match') {
            if (lastSection === 'team') lastSection = 'match';
            if (lastSection !== 'match') orderValid = false;
            matchesSeen++;
          }

          // Entity fields
          if (!item.slug || !item.name || !item.url || !item.appPath) {
            orderValid = false;
          }
          if (!item.url.startsWith(`/${ed.prefix}`)) {
            orderValid = false;
          }
        }

        if (orderValid && leaguesSeen === 4 && teamsSeen === 80 && matchesSeen === 1260) {
          pass(`[${ed.code}] cfcdata/entity-list.html ordering and field schemas valid across all entities`);
        } else {
          fail(`[${ed.code}] cfcdata/entity-list.html ordering/schema error (leagues=${leaguesSeen}, teams=${teamsSeen}, matches=${matchesSeen})`);
        }
      } else {
        fail(`[${ed.code}] cfcdata/entity-list.html length mismatch: expected ${expectedTotalEntities}, got ${eList ? eList.length : 'null'}`);
      }

      // 6f: cfcdata/channels.html & Requirement 12.5 consistency
      const chanDirect = probeData.channelsDirect;
      if (ed.isGlobal) {
        if (Array.isArray(chanDirect) && chanDirect.length === 5) {
          pass(`[${ed.code}] cfcdata/channels.html returns 5 country groups for Global edition`);
        } else {
          fail(`[${ed.code}] cfcdata/channels.html expected 5 country groups, got ${chanDirect ? chanDirect.length : 'null'}`);
        }
      } else {
        if (Array.isArray(chanDirect) && chanDirect.length === 1 && chanDirect[0].country === ed.country) {
          pass(`[${ed.code}] cfcdata/channels.html returns local country group (${ed.country}) for regional edition`);
        } else {
          fail(`[${ed.code}] cfcdata/channels.html expected 1 country group for ${ed.country}, got ${JSON.stringify(chanDirect)}`);
        }
      }

      // Requirement 12.5: page-entity channels matches direct channels invocation
      if (JSON.stringify(mEntity.channels) === JSON.stringify(chanDirect)) {
        pass(`[${ed.code}] Requirement 12.5 SATISFIED: page-entity channels matches cfcdata/channels.html`);
      } else {
        fail(`[${ed.code}] Requirement 12.5 VIOLATION: channel mismatch between page-entity and channels.html`);
      }

      probeSuccessCount++;
    }

    if (probeSuccessCount === EDITIONS.length) {
      resultsSummary.contractChecksPassed = true;
      pass('All downstream contracts verified across all 6 editions on synthesized dataset');
    }

    cleanupProbeHarness();

    // -----------------------------------------------------------------
    // Step 7: Asserts strict absence of lineup pages and scripts
    // -----------------------------------------------------------------
    section('Step 7: Lineup Isolation Audit (Lambda = 0)');
    let lineupFilesFound = 0;
    let lineupJsFound = 0;
    let lineupHtmlRefsFound = 0;

    for (const f of allPublicFiles) {
      const rel = path.relative(PUBLIC_DIR, f);
      // Check paths
      if (rel.includes('/lineup/') || rel.endsWith('/lineup') || path.basename(f) === 'lineup.html') {
        lineupFilesFound++;
        fail(`Forbidden lineup page file found: ${rel}`);
      }
      // Check custom lineup JS
      if (path.basename(f).includes('cfc-lineup')) {
        lineupJsFound++;
        fail(`Forbidden lineup script found: ${rel}`);
      }
    }

    if (lineupFilesFound === 0 && lineupJsFound === 0) {
      pass('Strict absence of lineup pages and lineup scripts verified across all public/ output files');
    }

    // Inspect HTML content for forbidden references
    const allHtml = allPublicFiles.filter(f => f.endsWith('.html'));
    for (const hf of allHtml) {
      const content = fs.readFileSync(hf, 'utf8');
      if (content.includes('cfc-lineup') || content.includes('/lineup/')) {
        lineupHtmlRefsFound++;
        fail(`Forbidden lineup reference found in: ${path.relative(ROOT_DIR, hf)}`);
      }
    }

    if (lineupHtmlRefsFound === 0) {
      resultsSummary.lineupAbsencePassed = true;
      pass(`Strict check: Zero lineup markup or references found across all ${allHtml.length} HTML files`);
    }

    // -----------------------------------------------------------------
    // Step 8: Clean up assets/cfc-data/bench-1260/
    // -----------------------------------------------------------------
    section('Step 8: Cleanup Benchmark Artifacts');
    cleanupBenchDataset();
    if (!fs.existsSync(BENCH_DIR)) {
      pass('Synthesized benchmark dataset directory successfully deleted');
    } else {
      fail('Failed to remove synthesized benchmark dataset directory');
    }

    // -----------------------------------------------------------------
    // Step 9: Restore standard public/ build using sample dataset
    // -----------------------------------------------------------------
    section('Step 9: Standard Sample Dataset Build & Verification Restore');
    console.log(`  Building standard production site with sample dataset...`);
    execSync('hugo --gc --minify --cleanDestinationDir 2>&1', {
      cwd: ROOT_DIR,
      env: { ...process.env, HUGO_CFC_DATA_SOURCE: 'sample' },
      stdio: 'pipe',
    });
    pass('Standard production build with sample dataset completed successfully');

    console.log(`  Executing pnpm check:data (scripts/check-data-pages.mjs)...`);
    const checkDataOut = execSync('node scripts/check-data-pages.mjs', {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    }).toString();

    if (checkDataOut.includes('ALL BUILD OUTPUT VERIFICATION CHECKS PASSED')) {
      pass('Full standard check suite (check-data-pages.mjs) passed cleanly after restoration');
    } else {
      fail(`Standard check suite failed after restoration:\n${checkDataOut}`);
    }
  } catch (unexpectedErr) {
    fail(`Unexpected benchmark error: ${unexpectedErr.stack || unexpectedErr.message}`);
  } finally {
    cleanupProbeHarness();
    cleanupBenchDataset();
  }

  const benchmarkEndTime = performance.now();
  resultsSummary.totalBenchmarkTimeSec = parseFloat(((benchmarkEndTime - benchmarkStartTime) / 1000).toFixed(2));

  // -----------------------------------------------------------------
  // Benchmark Summary & Reporting
  // -----------------------------------------------------------------
  section('Scale Benchmark & Integration Summary');
  console.log(`Matches synthesized:       ${resultsSummary.matchesCount}`);
  console.log(`Teams:                     ${resultsSummary.teamsCount}`);
  console.log(`Leagues:                   ${resultsSummary.leaguesCount}`);
  console.log(`Editions:                  ${resultsSummary.editionsCount}`);
  console.log(`Estimated output files:    ${resultsSummary.estimatedOutputFiles} / ${resultsSummary.fileBudget}`);
  console.log(`Actual public/ files:      ${resultsSummary.actualOutputFiles} (Budget: 18,000, Util: ${((resultsSummary.actualOutputFiles / 18000) * 100).toFixed(1)}%)`);
  console.log(`Clean Hugo build time:     ${resultsSummary.hugoBuildTimeSec}s (Target: <= 30.0s)`);
  console.log(`Total benchmark runner:    ${resultsSummary.totalBenchmarkTimeSec}s`);
  console.log(`Downstream contracts:      ${resultsSummary.contractChecksPassed ? 'VERIFIED' : 'FAILED'}`);
  console.log(`Lineup pages out-of-scope: ${resultsSummary.lineupAbsencePassed ? 'VERIFIED (Lambda = 0)' : 'FAILED'}`);
  console.log(`Total assertions checked:  ${totalChecks}`);
  console.log(`Passed assertions:         ${passedChecks}`);
  console.log(`Failed assertions:         ${failures.length}`);

  if (failures.length > 0) {
    console.error('\n❌ Benchmark SUITE FAILED with the following errors:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL SCALE BENCHMARK & FULL INTEGRATION VERIFICATION CHECKS PASSED!\n');
    return resultsSummary;
  }
}

runBenchmark();
