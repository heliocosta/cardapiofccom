#!/usr/bin/env node

/**
 * scripts/check-data-pages.mjs
 *
 * Automated build output verification script for CardápioFC data-backed pages.
 * Inspects the public/ directory after a production build with the sample dataset.
 *
 * Requirements verified:
 * - 2.5, 2.6, 2.7, 2.8, 2.9, 2.10 (Data contract, integrity, validation)
 * - 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 (Page generation, URL map, suppressed listings, edition switcher)
 * - 4.1, 4.2 (Timezone labels, UTC on Global, kickoff formatting)
 * - 5.1, 5.2, 5.3, 5.4, 5.6 (Channel filtering: Global vs Regional, no-broadcaster state, zero channel badges in lists)
 * - 11.1, 11.2 (Page weight budget <= 100 KB, first-party JS <= 10 KB, match card HTML <= 2048 bytes)
 * - USER DIRECTIVE: Lineups are completely OUT OF SCOPE. Strict absence of lineup pages, markup, and JS.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const sampleDir = path.join(rootDir, 'assets', 'cfc-data', 'sample');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const forceBuild = args.includes('--build');

const failures = [];
let totalChecks = 0;
let passedChecks = 0;

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
  console.log(`\n=== ${title} ===`);
}

// -------------------------------------------------------------
// Editions Registry
// -------------------------------------------------------------
const EDITIONS = [
  {
    code: 'en',
    prefix: '',
    locale: 'en',
    lang: 'en',
    timeZone: 'UTC',
    zoneLabel: 'UTC',
    isGlobal: true,
    country: '',
  },
  {
    code: 'en-gb',
    prefix: 'en-gb/',
    locale: 'en-GB',
    lang: 'en-GB',
    timeZone: 'Europe/London',
    zoneLabel: 'UK time',
    isGlobal: false,
    country: 'GB',
  },
  {
    code: 'en-ie',
    prefix: 'en-ie/',
    locale: 'en-IE',
    lang: 'en-IE',
    timeZone: 'Europe/Dublin',
    zoneLabel: 'Irish time',
    isGlobal: false,
    country: 'IE',
  },
  {
    code: 'pt-br',
    prefix: 'pt-br/',
    locale: 'pt-BR',
    lang: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    zoneLabel: 'horário de Brasília',
    isGlobal: false,
    country: 'BR',
  },
  {
    code: 'pt-pt',
    prefix: 'pt-pt/',
    locale: 'pt-PT',
    lang: 'pt-PT',
    timeZone: 'Europe/Lisbon',
    zoneLabel: 'hora de Portugal',
    isGlobal: false,
    country: 'PT',
  },
  {
    code: 'es-ar',
    prefix: 'es-ar/',
    locale: 'es-AR',
    lang: 'es-AR',
    timeZone: 'America/Argentina/Buenos_Aires',
    zoneLabel: 'hora de Argentina',
    isGlobal: false,
    country: 'AR',
  },
];

// -------------------------------------------------------------
// Check 1: Sample Dataset Contract & Integrity (Req 2.5 - 2.10, 3.6)
// -------------------------------------------------------------
section('1. Sample Dataset Contract & Integrity (Req 2.5-2.10, 3.6)');

let indexData;
let matchesData;
let teamsData;
let leaguesData;

try {
  const indexPath = path.join(sampleDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    fail(`Sample index.json not found at ${indexPath}`);
  } else {
    indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    // Requirement 2.6: Schema major version == 1
    const major = parseInt(indexData.schemaVersion.split('.')[0], 10);
    if (major === 1) {
      pass(`schemaVersion major is 1 (got "${indexData.schemaVersion}")`);
    } else {
      fail(`schemaVersion major must be 1, got "${indexData.schemaVersion}"`);
    }

    // Requirement 2.7: SHA-256 integrity and file bytes for each declared file
    for (const [relPath, meta] of Object.entries(indexData.files)) {
      const filePath = path.join(sampleDir, relPath);
      if (!fs.existsSync(filePath)) {
        fail(`Declared file in index.files missing on disk: ${relPath}`);
        continue;
      }
      const buf = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash === meta.sha256) {
        pass(`Integrity verified for ${relPath} (SHA-256 matches)`);
      } else {
        fail(`SHA-256 mismatch for ${relPath}: expected ${meta.sha256}, got ${hash}`);
      }
      if (buf.length === meta.bytes) {
        pass(`Byte length verified for ${relPath} (${buf.length} bytes)`);
      } else {
        fail(`Byte length mismatch for ${relPath}: expected ${meta.bytes}, got ${buf.length}`);
      }
    }

    // Load sub-datasets
    matchesData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'matches.json'), 'utf8'));
    teamsData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'teams.json'), 'utf8'));
    leaguesData = JSON.parse(fs.readFileSync(path.join(sampleDir, 'leagues.json'), 'utf8'));

    // Requirement 3.6: Counts match collection sizes
    const actualMatchesCount = Object.keys(matchesData.matches).length;
    const actualTeamsCount = Object.keys(teamsData.teams).length;
    const actualLeaguesCount = Object.keys(leaguesData.leagues).length;

    if (indexData.counts.matches === actualMatchesCount) {
      pass(`Matches count matches collection size (${actualMatchesCount})`);
    } else {
      fail(`Matches count mismatch: declared ${indexData.counts.matches}, actual ${actualMatchesCount}`);
    }

    if (indexData.counts.teams === actualTeamsCount) {
      pass(`Teams count matches collection size (${actualTeamsCount})`);
    } else {
      fail(`Teams count mismatch: declared ${indexData.counts.teams}, actual ${actualTeamsCount}`);
    }

    if (indexData.counts.leagues === actualLeaguesCount) {
      pass(`Leagues count matches collection size (${actualLeaguesCount})`);
    } else {
      fail(`Leagues count mismatch: declared ${indexData.counts.leagues}, actual ${actualLeaguesCount}`);
    }

    // Requirement 2.8: Kick-off with zone designator & valid statuses
    const allowedStatuses = new Set(['scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'suspended']);
    for (const [slug, m] of Object.entries(matchesData.matches)) {
      if (!/(Z|[+-]\d{2}:?\d{2})$/.test(m.kickoff)) {
        fail(`Match ${slug} kickoff missing explicit timezone designator: "${m.kickoff}"`);
      }
      if (!allowedStatuses.has(m.status)) {
        fail(`Match ${slug} has unknown status: "${m.status}"`);
      }
    }
    pass(`All ${actualMatchesCount} matches have valid zoned kickoff times and statuses`);

    // Requirement 2.9: Foreign keys resolve
    for (const [slug, m] of Object.entries(matchesData.matches)) {
      if (!teamsData.teams[m.homeSlug]) {
        fail(`Match ${slug} references unknown homeSlug "${m.homeSlug}"`);
      }
      if (!teamsData.teams[m.awaySlug]) {
        fail(`Match ${slug} references unknown awaySlug "${m.awaySlug}"`);
      }
      if (!leaguesData.leagues[m.leagueSlug]) {
        fail(`Match ${slug} references unknown leagueSlug "${m.leagueSlug}"`);
      }
    }
    pass(`All match foreign keys (homeSlug, awaySlug, leagueSlug) resolve cleanly`);

    // Channels files foreign keys
    for (const cc of indexData.countries) {
      const channelFile = path.join(sampleDir, 'channels', `${cc}.json`);
      if (fs.existsSync(channelFile)) {
        const cData = JSON.parse(fs.readFileSync(channelFile, 'utf8'));
        for (const [mSlug, chIds] of Object.entries(cData.matches)) {
          if (!matchesData.matches[mSlug]) {
            fail(`Channel file ${cc}.json references unknown matchSlug "${mSlug}"`);
          }
          for (const chId of chIds) {
            if (!cData.channels[chId]) {
              fail(`Channel file ${cc}.json references unknown channel id "${chId}" for match "${mSlug}"`);
            }
          }
        }
      }
    }
    pass(`All channel broadcaster and match foreign keys resolve cleanly across all countries`);
  }
} catch (err) {
  fail(`Failed during dataset contract verification: ${err.message}`);
}

// -------------------------------------------------------------
// Check 2: Build Trigger & Output Verification
// -------------------------------------------------------------
section('2. Build Trigger & Inspection');

function shouldBuild() {
  if (forceBuild) return true;
  if (noBuild) return false;
  if (!fs.existsSync(publicDir)) return true;
  const homeHtml = path.join(publicDir, 'index.html');
  if (!fs.existsSync(homeHtml)) return true;

  const homeMtime = fs.statSync(homeHtml).mtimeMs;
  const watchDirs = [
    path.join(rootDir, 'assets'),
    path.join(rootDir, 'content'),
    path.join(rootDir, 'layouts'),
    path.join(rootDir, 'data'),
    path.join(rootDir, 'config'),
  ];

  for (const d of watchDirs) {
    if (fs.existsSync(d)) {
      const isNewer = checkDirNewer(d, homeMtime);
      if (isNewer) return true;
    }
  }
  return false;
}

function checkDirNewer(dir, targetMtime) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (checkDirNewer(full, targetMtime)) return true;
    } else if (stat.mtimeMs > targetMtime) {
      return true;
    }
  }
  return false;
}

if (shouldBuild()) {
  console.log('  Triggering production build with sample dataset (HUGO_CFC_DATA_SOURCE=sample)...');
  try {
    execSync('node scripts/themeGenerator.js && hugo -e production --minify', {
      cwd: rootDir,
      env: { ...process.env, HUGO_CFC_DATA_SOURCE: 'sample' },
      stdio: 'pipe',
    });
    pass('Production build completed successfully with sample dataset');
  } catch (err) {
    fail(`Production build failed: ${err.message}`);
  }
} else {
  console.log('  Inspecting existing public/ build output (--no-build or up-to-date)...');
  pass('Inspecting existing public/ directory');
}

if (!fs.existsSync(publicDir)) {
  fail(`public/ directory does not exist at ${publicDir}`);
}

// -------------------------------------------------------------
// Check 3: Existence of Pages (Req 3.1, 3.2, 3.4)
// -------------------------------------------------------------
section('3. Existence of Pages (Req 3.1, 3.2, 3.4)');

const matchSlugs = Object.keys(matchesData ? matchesData.matches : {});
const teamSlugs = Object.keys(teamsData ? teamsData.teams : {});
const leagueSlugs = Object.keys(leaguesData ? leaguesData.leagues : {});

// 3a: Match section pages: 8 matches x 6 editions = 48 pages
let matchPagesCount = 0;
for (const ed of EDITIONS) {
  for (const mSlug of matchSlugs) {
    const p = path.join(publicDir, ed.prefix, 'match', mSlug, 'index.html');
    if (fs.existsSync(p)) {
      matchPagesCount++;
    } else {
      fail(`Missing match page: ${path.relative(rootDir, p)} (${ed.code})`);
    }
  }
}
if (matchPagesCount === matchSlugs.length * EDITIONS.length) {
  pass(`All ${matchPagesCount} match section pages exist (${matchSlugs.length} matches × ${EDITIONS.length} editions)`);
} else {
  fail(`Expected ${matchSlugs.length * EDITIONS.length} match pages, found ${matchPagesCount}`);
}

// 3b: Team pages: 8 teams x 6 editions = 48 pages
let teamPagesCount = 0;
for (const ed of EDITIONS) {
  for (const tSlug of teamSlugs) {
    const p = path.join(publicDir, ed.prefix, 'team', tSlug, 'index.html');
    if (fs.existsSync(p)) {
      teamPagesCount++;
    } else {
      fail(`Missing team page: ${path.relative(rootDir, p)} (${ed.code})`);
    }
  }
}
if (teamPagesCount === teamSlugs.length * EDITIONS.length) {
  pass(`All ${teamPagesCount} team pages exist (${teamSlugs.length} teams × ${EDITIONS.length} editions)`);
} else {
  fail(`Expected ${teamSlugs.length * EDITIONS.length} team pages, found ${teamPagesCount}`);
}

// 3c: League pages: 3 leagues x 6 editions = 18 pages
let leaguePagesCount = 0;
for (const ed of EDITIONS) {
  for (const lSlug of leagueSlugs) {
    const p = path.join(publicDir, ed.prefix, 'league', lSlug, 'index.html');
    if (fs.existsSync(p)) {
      leaguePagesCount++;
    } else {
      fail(`Missing league page: ${path.relative(rootDir, p)} (${ed.code})`);
    }
  }
}
if (leaguePagesCount === leagueSlugs.length * EDITIONS.length) {
  pass(`All ${leaguePagesCount} league pages exist (${leagueSlugs.length} leagues × ${EDITIONS.length} editions)`);
} else {
  fail(`Expected ${leagueSlugs.length * EDITIONS.length} league pages, found ${leaguePagesCount}`);
}

// 3d: League directory pages: 6 pages (one per edition at {prefix}league/index.html)
let leagueDirCount = 0;
for (const ed of EDITIONS) {
  const p = path.join(publicDir, ed.prefix, 'league', 'index.html');
  if (fs.existsSync(p)) {
    leagueDirCount++;
  } else {
    fail(`Missing league directory page: ${path.relative(rootDir, p)} (${ed.code})`);
  }
}
if (leagueDirCount === EDITIONS.length) {
  pass(`All ${leagueDirCount} league directory pages exist`);
} else {
  fail(`Expected ${EDITIONS.length} league directory pages, found ${leagueDirCount}`);
}

// 3e: Home pages: 6 pages (one per edition at {prefix}index.html)
let homePageCount = 0;
for (const ed of EDITIONS) {
  const p = path.join(publicDir, ed.prefix, 'index.html');
  if (fs.existsSync(p)) {
    homePageCount++;
  } else {
    fail(`Missing edition home page: ${path.relative(rootDir, p)} (${ed.code})`);
  }
}
if (homePageCount === EDITIONS.length) {
  pass(`All ${homePageCount} edition home pages exist`);
} else {
  fail(`Expected ${EDITIONS.length} edition home pages, found ${homePageCount}`);
}

// -------------------------------------------------------------
// Check 4: Suppressed & Forbidden Paths (Req 3.3, USER DIRECTIVE)
// -------------------------------------------------------------
section('4. Suppressed & Forbidden Paths (Req 3.3, Lineups Out-Of-Scope)');

// Section listings /match/index.html and {edition}/match/index.html MUST NOT EXIST
for (const ed of EDITIONS) {
  const matchSection = path.join(publicDir, ed.prefix, 'match', 'index.html');
  if (fs.existsSync(matchSection)) {
    fail(`Match section listing MUST NOT exist: ${path.relative(rootDir, matchSection)}`);
  } else {
    pass(`Match section listing suppressed: ${ed.prefix}match/index.html is ABSENT`);
  }

  const teamSection = path.join(publicDir, ed.prefix, 'team', 'index.html');
  if (fs.existsSync(teamSection)) {
    fail(`Team section listing MUST NOT exist: ${path.relative(rootDir, teamSection)}`);
  } else {
    pass(`Team section listing suppressed: ${ed.prefix}team/index.html is ABSENT`);
  }
}

// Legacy address families MUST NOT EXIST
const legacyPaths = [
  'jogos',
  'en/matches',
  'pt/jogos',
  'en-gb/jogos',
  'en-ie/jogos',
  'pt-br/jogos',
  'pt-pt/jogos',
  'es-ar/jogos',
];

for (const lp of legacyPaths) {
  const full = path.join(publicDir, lp);
  if (fs.existsSync(full)) {
    fail(`Legacy address family MUST NOT exist: public/${lp}`);
  } else {
    pass(`Legacy address family absent: public/${lp}`);
  }
}

// Lineup pages MUST NOT EXIST anywhere
let lineupPageFound = false;
for (const ed of EDITIONS) {
  for (const mSlug of matchSlugs) {
    const lineupPath = path.join(publicDir, ed.prefix, 'match', mSlug, 'lineup');
    if (fs.existsSync(lineupPath)) {
      lineupPageFound = true;
      fail(`Forbidden lineup path exists: ${path.relative(rootDir, lineupPath)}`);
    }
  }
}
if (!lineupPageFound) {
  pass('Strict absence of lineup pages (/match/{slug}/lineup/) verified across all matches and editions');
}

// -------------------------------------------------------------
// Check 5: Strict Absence of Lineup Markup & JS (USER DIRECTIVE)
// -------------------------------------------------------------
section('5. Strict Absence of Lineup Markup & JS Across public/');

function getAllFiles(dir) {
  let files = [];
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

const allPublicFiles = getAllFiles(publicDir);
const allHtmlFiles = allPublicFiles.filter(f => f.endsWith('.html'));

let lineupJsFound = false;
for (const f of allPublicFiles) {
  if (path.basename(f).includes('cfc-lineup')) {
    lineupJsFound = true;
    fail(`Forbidden lineup JS file found: ${path.relative(rootDir, f)}`);
  }
}
if (!lineupJsFound) {
  pass('Zero custom lineup JS files (cfc-lineup.js) found in public/');
}

let lineupHtmlMatches = [];
for (const f of allHtmlFiles) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('cfc-lineup') || content.includes('/lineup/')) {
    lineupHtmlMatches.push(path.relative(rootDir, f));
  }
}
if (lineupHtmlMatches.length === 0) {
  pass(`Strict check: Zero occurrences of lineup markup or links across all ${allHtmlFiles.length} HTML files`);
} else {
  fail(`Lineup markup or links found in ${lineupHtmlMatches.length} HTML files: ${lineupHtmlMatches.slice(0, 5).join(', ')}`);
}

// Agenda-Only check: Strict absence of live scores and match status badges (USER DIRECTIVE)
let scoreMatches = [];
let statusBadgeMatches = [];
for (const f of allHtmlFiles) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('cfc-match-card__score') || content.includes('cfc-match-hero__score')) {
    scoreMatches.push(path.relative(rootDir, f));
  }
  if (content.includes('cfc-match-card__badge--live') || content.includes('cfc-match-card__badge--finished')) {
    statusBadgeMatches.push(path.relative(rootDir, f));
  }
}
if (scoreMatches.length === 0) {
  pass(`Agenda-only check: Zero score elements found across all ${allHtmlFiles.length} HTML files`);
} else {
  fail(`Score elements found in ${scoreMatches.length} HTML files: ${scoreMatches.slice(0, 5).join(', ')}`);
}
if (statusBadgeMatches.length === 0) {
  pass(`Agenda-only check: Zero live/status badges found across all ${allHtmlFiles.length} HTML files`);
} else {
  fail(`Status badge elements found in ${statusBadgeMatches.length} HTML files: ${statusBadgeMatches.slice(0, 5).join(', ')}`);
}

// -------------------------------------------------------------
// Check 6: Channel Filtering (Global vs Regional) & Req 5.6
// -------------------------------------------------------------
section('6. Channel Filtering (Global vs Regional) & Req 5.6');

// 6a: Global match page has country grouping sections
const globalArsChePath = path.join(publicDir, 'match', 'arsenal-vs-chelsea-2026-11-06', 'index.html');
if (fs.existsSync(globalArsChePath)) {
  const html = fs.readFileSync(globalArsChePath, 'utf8');

  // Must have country group sections
  if (html.includes('cfc-channels__group')) {
    pass('Global match page contains country grouping sections (cfc-channels__group)');
  } else {
    fail('Global match page missing cfc-channels__group');
  }

  // Headings for multiple countries
  const hasUkHeading = html.includes('Where to watch in United Kingdom');
  const hasBrHeading = html.includes('Where to watch in Brazil');
  const hasIeHeading = html.includes('Where to watch in Ireland');
  if (hasUkHeading && hasBrHeading && hasIeHeading) {
    pass('Global match page contains country headings for UK, Brazil, Ireland');
  } else {
    fail(`Global match page missing country headings (UK: ${hasUkHeading}, BR: ${hasBrHeading}, IE: ${hasIeHeading})`);
  }

  // Global should not have regional edition-links aside
  if (!html.includes('cfc-edition-links')) {
    pass('Global match page suppresses regional edition-links aside');
  } else {
    fail('Global match page unexpectedly includes cfc-edition-links');
  }
} else {
  fail(`Missing Global match page: ${globalArsChePath}`);
}

// 6b: Regional match page has single local country section and edition links
const ptBrArsChePath = path.join(publicDir, 'pt-br', 'match', 'arsenal-vs-chelsea-2026-11-06', 'index.html');
if (fs.existsSync(ptBrArsChePath)) {
  const html = fs.readFileSync(ptBrArsChePath, 'utf8');

  // Single country heading
  if (html.includes('Onde assistir em Brasil')) {
    pass('Regional pt-br match page contains local country heading "Onde assistir em Brasil"');
  } else {
    fail('Regional pt-br match page missing "Onde assistir em Brasil"');
  }

  // Does NOT contain UK or other country sections
  if (!html.includes('United Kingdom') && !html.includes('Reino Unido') && !html.includes('cfc-channels__group')) {
    pass('Regional pt-br match page does not contain other country channel groups');
  } else if (!html.includes('cfc-channels__group')) {
    pass('Regional pt-br match page has single local channel section (no country group sections)');
  } else {
    fail('Regional pt-br match page improperly contains multi-country channel groups');
  }

  // Cross-links to other editions (Req 5.4)
  if (html.includes('cfc-edition-links') && html.includes('hreflang=en-gb')) {
    pass('Regional pt-br match page contains edition links to other broadcasting countries with hreflang (Req 5.4)');
  } else {
    fail('Regional pt-br match page missing edition links or hreflang tags');
  }
} else {
  fail(`Missing pt-br match page: ${ptBrArsChePath}`);
}

// 6c: Match with no broadcaster shows check-app prompt (Req 5.3)
const noBroadcasterGlobal = path.join(publicDir, 'match', 'real-madrid-vs-barcelona-2026-11-08', 'index.html');
if (fs.existsSync(noBroadcasterGlobal)) {
  const html = fs.readFileSync(noBroadcasterGlobal, 'utf8');
  if (html.includes('cfc-empty-state') || html.includes('check the CardápioFC app') || html.includes('No confirmed broadcaster')) {
    pass('Global match with 0 channels displays empty prompt (Req 5.3)');
  } else {
    fail('Global match with 0 channels does not show empty broadcaster prompt');
  }
}

const noBroadcasterPtBr = path.join(publicDir, 'pt-br', 'match', 'real-madrid-vs-barcelona-2026-11-08', 'index.html');
if (fs.existsSync(noBroadcasterPtBr)) {
  const html = fs.readFileSync(noBroadcasterPtBr, 'utf8');
  if (html.includes('Sem transmissão confirmada') || html.includes('consulte o app')) {
    pass('Regional pt-br match with 0 channels displays localized empty prompt (Req 5.3)');
  } else {
    fail('Regional pt-br match with 0 channels does not show localized empty prompt');
  }
}

// 6d: Requirement 5.6: Zero channel badges on match cards across team, league, home pages
let channelBadgeViolation = false;
const listPageFiles = allHtmlFiles.filter(f => {
  const rel = path.relative(publicDir, f);
  // Matches home pages, team pages, league pages, and league directory pages
  const isMatchDetail = rel.includes('match/') && !rel.endsWith('match/index.html');
  const isStyleguide = rel.includes('styleguide');
  return !isMatchDetail && !isStyleguide;
});

for (const f of listPageFiles) {
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes('cfc-channel-badge') || html.includes('cfc-match-card__channels')) {
    channelBadgeViolation = true;
    fail(`Req 5.6 VIOLATION: channel badge or channels container found in ${path.relative(rootDir, f)}`);
  }
}
if (!channelBadgeViolation) {
  pass(`Requirement 5.6 strictly satisfied: Zero channel badges on match cards across all ${listPageFiles.length} list pages (team, league, home)`);
}

// -------------------------------------------------------------
// Check 7: Timezone and Day Groupings Across Editions (Req 4.1, 4.2)
// -------------------------------------------------------------
section('7. Timezone and Day Groupings Across Editions (Req 4.1, 4.2)');

// 7a: Timezone labels on kickoff times and freshness footers
for (const ed of EDITIONS) {
  // Check match page freshness footer and kickoff time
  const matchPath = path.join(publicDir, ed.prefix, 'match', 'sao-paulo-vs-flamengo-2026-11-08', 'index.html');
  if (fs.existsSync(matchPath)) {
    const html = fs.readFileSync(matchPath, 'utf8');

    // Kickoff time timezone label
    if (html.includes(ed.zoneLabel)) {
      pass(`Edition ${ed.code} match page renders kickoff time zone label "${ed.zoneLabel}"`);
    } else {
      fail(`Edition ${ed.code} match page missing kickoff zone label "${ed.zoneLabel}"`);
    }

    // Freshness footer timezone label
    const freshnessMatch = html.match(/<footer class="[^"]*\bcfc-freshness\b[^"]*"[\s\S]*?<\/footer>/);
    if (freshnessMatch && freshnessMatch[0].includes(ed.zoneLabel)) {
      pass(`Edition ${ed.code} match page renders freshness footer with zone label "${ed.zoneLabel}"`);
    } else {
      fail(`Edition ${ed.code} match page freshness footer missing zone label "${ed.zoneLabel}"`);
    }
  } else {
    fail(`Missing match page for timezone check: ${matchPath}`);
  }
}

// 7b: Day groupings match edition-local time
// Match sao-paulo-vs-flamengo-2026-11-08 kicks off at 2026-11-08T01:30:00Z.
// In UTC (Global) and London (en-gb), kickoff is on Sunday 2026-11-08.
// In America/Sao_Paulo (pt-br) and Buenos Aires (es-ar), kickoff is at 22:30 on Saturday 2026-11-07.

function getMatchDateGroup(htmlPath, matchSlug) {
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const sections = html.split('<section class=cfc-date-group');
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    if (s.includes(`data-cfc-match=${matchSlug}`)) {
      const idMatch = s.match(/aria-labelledby=([^\s>]+)/);
      const timeMatch = s.match(/<time datetime=([^\s>]+)>/);
      return {
        id: idMatch ? idMatch[1] : null,
        date: timeMatch ? timeMatch[1] : null,
      };
    }
  }
  return null;
}

const globalTeamGroup = getMatchDateGroup(path.join(publicDir, 'team', 'sao-paulo', 'index.html'), 'sao-paulo-vs-flamengo-2026-11-08');
const ptBrTeamGroup = getMatchDateGroup(path.join(publicDir, 'pt-br', 'team', 'sao-paulo', 'index.html'), 'sao-paulo-vs-flamengo-2026-11-08');
const esArTeamGroup = getMatchDateGroup(path.join(publicDir, 'es-ar', 'team', 'sao-paulo', 'index.html'), 'sao-paulo-vs-flamengo-2026-11-08');

if (globalTeamGroup && globalTeamGroup.date === '2026-11-08') {
  pass('Global edition groups sao-paulo-vs-flamengo under local date 2026-11-08 (Sunday)');
} else {
  fail(`Global edition did not group under 2026-11-08: got ${JSON.stringify(globalTeamGroup)}`);
}

if (ptBrTeamGroup && ptBrTeamGroup.date === '2026-11-07') {
  pass('pt-br edition groups sao-paulo-vs-flamengo under local date 2026-11-07 (Saturday in BRT)');
} else {
  fail(`pt-br edition did not group under 2026-11-07: got ${JSON.stringify(ptBrTeamGroup)}`);
}

if (esArTeamGroup && esArTeamGroup.date === '2026-11-07') {
  pass('es-ar edition groups sao-paulo-vs-flamengo under local date 2026-11-07 (Saturday in ART)');
} else {
  fail(`es-ar edition did not group under 2026-11-07: got ${JSON.stringify(esArTeamGroup)}`);
}

// -------------------------------------------------------------
// Check 8: Edition Switcher Target Alignment (Req 3.5)
// -------------------------------------------------------------
section('8. Edition Switcher Target Alignment (Req 3.5)');

// On match, team, league, and league directory pages, the switcher should point to the equivalent page in target edition
const sampleSwitchers = [
  { kind: 'match', rel: 'match/arsenal-vs-chelsea-2026-11-06/index.html', slug: 'match/arsenal-vs-chelsea-2026-11-06' },
  { kind: 'team', rel: 'team/arsenal/index.html', slug: 'team/arsenal' },
  { kind: 'league', rel: 'league/premier-league/index.html', slug: 'league/premier-league' },
  { kind: 'league-dir', rel: 'league/index.html', slug: 'league' },
];

for (const item of sampleSwitchers) {
  const globalPath = path.join(publicDir, item.rel);
  if (fs.existsSync(globalPath)) {
    const html = fs.readFileSync(globalPath, 'utf8');
    for (const ed of EDITIONS) {
      if (ed.isGlobal) continue;
      const expectedHref = `/${ed.prefix}${item.slug}/`;
      if (html.includes(`href=${expectedHref}`) || html.includes(`href="${expectedHref}"`)) {
        pass(`Edition switcher on Global ${item.kind} page links to ${ed.code} at "${expectedHref}"`);
      } else {
        fail(`Edition switcher on Global ${item.kind} page missing expected link "${expectedHref}"`);
      }
    }
  }
}

// -------------------------------------------------------------
// Check 9: Page Weight and JS Budgets (Req 11.1, 11.2)
// -------------------------------------------------------------
section('9. Page Weight and JS Budgets (Req 11.1, 11.2)');

function measurePage(htmlPath) {
  const htmlBuf = fs.readFileSync(htmlPath);
  const htmlGzip = zlib.gzipSync(htmlBuf).length;
  const htmlStr = htmlBuf.toString('utf8');

  let totalLinkedGzip = htmlGzip;
  let firstPartyJsBytes = 0;

  // CSS stylesheets
  const cssMatches = htmlStr.match(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']?([^"'>\s]+)["']?/gi) || [];
  for (const m of cssMatches) {
    const srcMatch = m.match(/href=["']?([^"'>\s]+)["']?/i);
    if (srcMatch && srcMatch[1].startsWith('/')) {
      const assetPath = path.join(publicDir, srcMatch[1]);
      if (fs.existsSync(assetPath)) {
        totalLinkedGzip += zlib.gzipSync(fs.readFileSync(assetPath)).length;
      }
    }
  }

  // JS scripts
  const jsMatches = htmlStr.match(/<script[^>]+src=["']?([^"'>\s]+)["']?/gi) || [];
  for (const m of jsMatches) {
    const srcMatch = m.match(/src=["']?([^"'>\s]+)["']?/i);
    if (srcMatch && srcMatch[1].startsWith('/')) {
      const assetPath = path.join(publicDir, srcMatch[1]);
      if (fs.existsSync(assetPath)) {
        const buf = fs.readFileSync(assetPath);
        totalLinkedGzip += zlib.gzipSync(buf).length;
        firstPartyJsBytes += buf.length;
      }
    }
  }

  return { totalLinkedGzip, firstPartyJsBytes };
}

const budgetTestPages = [
  { desc: 'Global Home', rel: 'index.html' },
  { desc: 'Regional pt-br Home', rel: 'pt-br/index.html' },
  { desc: 'Global Match', rel: 'match/arsenal-vs-chelsea-2026-11-06/index.html' },
  { desc: 'Regional pt-br Match', rel: 'pt-br/match/arsenal-vs-chelsea-2026-11-06/index.html' },
  { desc: 'Global Team', rel: 'team/arsenal/index.html' },
  { desc: 'Regional pt-br Team', rel: 'pt-br/team/arsenal/index.html' },
  { desc: 'Global League', rel: 'league/premier-league/index.html' },
  { desc: 'Regional pt-br League', rel: 'pt-br/league/premier-league/index.html' },
  { desc: 'Global League Directory', rel: 'league/index.html' },
  { desc: 'Regional pt-br League Directory', rel: 'pt-br/league/index.html' },
];

for (const tp of budgetTestPages) {
  const full = path.join(publicDir, tp.rel);
  if (!fs.existsSync(full)) {
    fail(`Cannot measure budget on missing page: ${tp.rel}`);
    continue;
  }
  const { totalLinkedGzip, firstPartyJsBytes } = measurePage(full);

  // Compressed page weight budget <= 100 KB
  if (totalLinkedGzip <= 100 * 1024) {
    pass(`Page weight budget OK for ${tp.desc}: ${(totalLinkedGzip / 1024).toFixed(1)} KB (budget: 100 KB)`);
  } else {
    fail(`Page weight budget EXCEEDED for ${tp.desc}: ${(totalLinkedGzip / 1024).toFixed(1)} KB (budget: 100 KB)`);
  }

  // First-party JS budget <= 10 KB
  if (firstPartyJsBytes <= 10 * 1024) {
    pass(`JS budget OK for ${tp.desc}: ${(firstPartyJsBytes / 1024).toFixed(1)} KB (budget: 10 KB)`);
  } else {
    fail(`JS budget EXCEEDED for ${tp.desc}: ${(firstPartyJsBytes / 1024).toFixed(1)} KB (budget: 10 KB)`);
  }
}

// 9b: Individual match card HTML size <= 2048 bytes
let totalCards = 0;
let maxCardSize = 0;
let cardSizeViolations = 0;

for (const f of allHtmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const cardRegex = /<a[^>]*class="[^"]*\bcfc-match-card\b[^"]*"[\s\S]*?<\/a>/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    totalCards++;
    const cardHtml = cardMatch[0];
    const size = Buffer.byteLength(cardHtml, 'utf8');
    if (size > maxCardSize) maxCardSize = size;
    if (size > 2048) {
      cardSizeViolations++;
      fail(`Match card exceeds 2048 bytes (${size} bytes) in ${path.relative(rootDir, f)}`);
    }
  }
}

if (cardSizeViolations === 0) {
  pass(`All ${totalCards} match cards across public/ satisfy size budget <= 2048 bytes (max card: ${maxCardSize} bytes)`);
}

// -------------------------------------------------------------
// Final Report and Exit Code
// -------------------------------------------------------------
section('Verification Summary');

console.log(`Total checks performed: ${totalChecks}`);
console.log(`Passed checks: ${passedChecks}`);
console.log(`Failed checks: ${failures.length}`);

if (failures.length > 0) {
  console.error('\n❌ Build output verification FAILED with the following errors:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 ALL BUILD OUTPUT VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}
