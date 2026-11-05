#!/usr/bin/env node

/**
 * CardápioFC Dataset Indexing, Validation, and Synthesis Tool (DatasetTool)
 *
 * Capabilities:
 * 1. Default / index mode:
 *    Calculates lowercase hexadecimal SHA-256 hashes and byte lengths for all dataset files,
 *    computes exact collection counts (leagues, teams, matches, lineups), and updates index.json.
 * 2. --check mode:
 *    Validates dataset files against Data Contract v1 schema constraints, file integrity hashes,
 *    and cross-collection referential consistency.
 * 3. --synthesize N mode:
 *    Generates a deterministic synthetic dataset of N matches strictly conforming to Data Contract v1,
 *    suitable for budget estimation and benchmark builds.
 *
 * Zero external npm dependencies (native Node.js built-ins).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Regex patterns strictly matching Data Contract v1 / JSON Schema
const SEMVER_REGEX = /^1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const INSTANT_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MATCH_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const CHANNEL_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HTTPS_URL_REGEX = /^https:\/\//;
const FORMATION_REGEX = /^[1-9](-[1-9]){1,4}$/;
const GRID_REGEX = /^[0-9]{1,2}:[0-9]{1,2}$/;
const LOCALE_KEY_REGEX = /^[a-z]{2}(-[a-z]{2})?$/;

const MATCH_STATUSES = new Set([
  'scheduled',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled',
  'suspended',
]);

const CHANNEL_TYPES = new Set(['tv', 'streaming', 'free_tv']);
const PLAYER_POSITIONS = new Set(['G', 'D', 'M', 'F']);

/**
 * Computes lowercase SHA-256 hex digest and byte length for a file.
 * @param {string} filePath Absolute or relative path to file
 * @returns {{ sha256: string, bytes: number }}
 */
export function calculateFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
  return { sha256, bytes: buffer.byteLength };
}

/**
 * Scans a dataset directory and identifies all dataset files.
 * @param {string} datasetDir
 * @returns {{ standardFiles: string[], channelFiles: string[] }}
 */
export function discoverDatasetFiles(datasetDir) {
  const standardCandidateFiles = ['leagues.json', 'teams.json', 'matches.json', 'lineups.json'];
  const standardFiles = standardCandidateFiles.filter(file =>
    fs.existsSync(path.join(datasetDir, file))
  );

  const channelsDir = path.join(datasetDir, 'channels');
  const channelFiles = [];
  if (fs.existsSync(channelsDir) && fs.statSync(channelsDir).isDirectory()) {
    const entries = fs.readdirSync(channelsDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        const country = entry.slice(0, -5).toUpperCase();
        if (COUNTRY_CODE_REGEX.test(country)) {
          channelFiles.push(`channels/${entry}`);
        }
      }
    }
    channelFiles.sort();
  }

  return { standardFiles, channelFiles };
}

/**
 * Updates index.json in datasetDir with accurate file hashes, byte lengths, and collection counts.
 * @param {string} datasetDir
 * @returns {{ index: object, updated: boolean }}
 */
export function updateIndex(datasetDir) {
  const resolvedDir = path.resolve(datasetDir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Dataset directory not found: ${datasetDir}`);
  }

  const indexPath = path.join(resolvedDir, 'index.json');
  let existingIndex = {};
  if (fs.existsSync(indexPath)) {
    try {
      existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      // If corrupted, we will overwrite with valid skeleton
      existingIndex = {};
    }
  }

  const { standardFiles, channelFiles } = discoverDatasetFiles(resolvedDir);

  // Compute counts and metadata from respective files if they exist
  let fileGeneratedAt = null;
  let fileSchemaVersion = null;

  let leaguesCount = 0;
  const leaguesPath = path.join(resolvedDir, 'leagues.json');
  if (fs.existsSync(leaguesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(leaguesPath, 'utf8'));
      leaguesCount = Object.keys(data.leagues || {}).length;
      if (data.generatedAt && INSTANT_REGEX.test(data.generatedAt)) fileGeneratedAt = data.generatedAt;
      if (data.schemaVersion && SEMVER_REGEX.test(data.schemaVersion)) fileSchemaVersion = data.schemaVersion;
    } catch {}
  }

  let teamsCount = 0;
  const teamsPath = path.join(resolvedDir, 'teams.json');
  if (fs.existsSync(teamsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
      teamsCount = Object.keys(data.teams || {}).length;
      if (!fileGeneratedAt && data.generatedAt && INSTANT_REGEX.test(data.generatedAt)) fileGeneratedAt = data.generatedAt;
      if (!fileSchemaVersion && data.schemaVersion && SEMVER_REGEX.test(data.schemaVersion)) fileSchemaVersion = data.schemaVersion;
    } catch {}
  }

  let matchesCount = 0;
  let minKickoff = null;
  let maxKickoff = null;
  const matchesPath = path.join(resolvedDir, 'matches.json');
  if (fs.existsSync(matchesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
      const matches = data.matches || {};
      matchesCount = Object.keys(matches).length;
      if (!fileGeneratedAt && data.generatedAt && INSTANT_REGEX.test(data.generatedAt)) fileGeneratedAt = data.generatedAt;
      if (!fileSchemaVersion && data.schemaVersion && SEMVER_REGEX.test(data.schemaVersion)) fileSchemaVersion = data.schemaVersion;
      for (const m of Object.values(matches)) {
        if (m.kickoff && INSTANT_REGEX.test(m.kickoff)) {
          if (!minKickoff || m.kickoff < minKickoff) minKickoff = m.kickoff;
          if (!maxKickoff || m.kickoff > maxKickoff) maxKickoff = m.kickoff;
        }
      }
    } catch {}
  }

  let lineupsCount = 0;
  const lineupsPath = path.join(resolvedDir, 'lineups.json');
  if (fs.existsSync(lineupsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lineupsPath, 'utf8'));
      lineupsCount = Object.keys(data.lineups || {}).length;
      if (!fileGeneratedAt && data.generatedAt && INSTANT_REGEX.test(data.generatedAt)) fileGeneratedAt = data.generatedAt;
      if (!fileSchemaVersion && data.schemaVersion && SEMVER_REGEX.test(data.schemaVersion)) fileSchemaVersion = data.schemaVersion;
    } catch {}
  }

  // Determine countries from channel files
  const countries = channelFiles.map(rel => path.basename(rel, '.json').toUpperCase());
  countries.sort();

  // Compute file hashes in predictable order
  const filesMap = {};
  const allRelFiles = [...standardFiles, ...channelFiles];
  for (const relFile of allRelFiles) {
    const fullPath = path.join(resolvedDir, relFile);
    filesMap[relFile] = calculateFileHash(fullPath);
  }

  const generatedAt =
    existingIndex.generatedAt && INSTANT_REGEX.test(existingIndex.generatedAt)
      ? existingIndex.generatedAt
      : fileGeneratedAt || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const schemaVersion =
    existingIndex.schemaVersion && SEMVER_REGEX.test(existingIndex.schemaVersion)
      ? existingIndex.schemaVersion
      : fileSchemaVersion || '1.0.0';

  const windowFrom =
    existingIndex.window?.from && INSTANT_REGEX.test(existingIndex.window.from)
      ? existingIndex.window.from
      : minKickoff || generatedAt;

  const windowTo =
    existingIndex.window?.to && INSTANT_REGEX.test(existingIndex.window.to)
      ? existingIndex.window.to
      : maxKickoff || generatedAt;

  const updatedIndex = {
    schemaVersion,
    generatedAt,
    window: {
      from: windowFrom,
      to: windowTo,
    },
    countries,
    files: filesMap,
    counts: {
      leagues: leaguesCount,
      teams: teamsCount,
      matches: matchesCount,
      lineups: lineupsCount,
    },
  };

  fs.writeFileSync(indexPath, JSON.stringify(updatedIndex, null, 2) + '\n', 'utf8');

  return { index: updatedIndex, updated: true };
}

/**
 * Validates a dataset directory against Data Contract v1 schema and integrity rules.
 * @param {string} datasetDir
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function checkDataset(datasetDir) {
  const resolvedDir = path.resolve(datasetDir);
  const errors = [];

  function err(file, slug, field, message) {
    const parts = ['data-pages:'];
    if (file) parts.push(`${file}:`);
    if (slug) parts.push(`${slug}:`);
    if (field) parts.push(`${field}`);
    parts.push(message);
    errors.push(parts.join(' ').replace(/:\s+:/g, ':'));
  }

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { valid: false, errors: [`Dataset directory does not exist: ${datasetDir}`] };
  }

  const indexPath = path.join(resolvedDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return { valid: false, errors: ['data-pages: index.json: file not found'] };
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (e) {
    return { valid: false, errors: [`data-pages: index.json: invalid JSON (${e.message})`] };
  }

  // 1. Validate index.json structure
  if (!index.schemaVersion || !SEMVER_REGEX.test(index.schemaVersion)) {
    err('index.json', null, 'schemaVersion', `must match SemVer major 1, got "${index.schemaVersion}"`);
  }
  if (!index.generatedAt || !INSTANT_REGEX.test(index.generatedAt)) {
    err('index.json', null, 'generatedAt', `must be RFC 3339 UTC instant (e.g. 2026-11-05T06:00:00Z), got "${index.generatedAt}"`);
  }
  if (!index.window || typeof index.window !== 'object') {
    err('index.json', null, 'window', 'missing window object');
  } else {
    if (!index.window.from || !INSTANT_REGEX.test(index.window.from)) {
      err('index.json', null, 'window.from', `invalid instant: "${index.window.from}"`);
    }
    if (!index.window.to || !INSTANT_REGEX.test(index.window.to)) {
      err('index.json', null, 'window.to', `invalid instant: "${index.window.to}"`);
    }
    if (index.window.from && index.window.to && index.window.from > index.window.to) {
      err('index.json', null, 'window', `from (${index.window.from}) must be <= to (${index.window.to})`);
    }
  }

  if (!Array.isArray(index.countries)) {
    err('index.json', null, 'countries', 'must be an array');
  } else {
    const seenCountries = new Set();
    for (const c of index.countries) {
      if (!COUNTRY_CODE_REGEX.test(c)) {
        err('index.json', null, 'countries', `invalid country code "${c}"`);
      }
      if (seenCountries.has(c)) {
        err('index.json', null, 'countries', `duplicate country code "${c}"`);
      }
      seenCountries.add(c);
    }
  }

  if (!index.counts || typeof index.counts !== 'object') {
    err('index.json', null, 'counts', 'missing counts object');
  } else {
    for (const key of ['leagues', 'teams', 'matches', 'lineups']) {
      if (typeof index.counts[key] !== 'number' || index.counts[key] < 0 || !Number.isInteger(index.counts[key])) {
        err('index.json', null, `counts.${key}`, `must be non-negative integer, got ${index.counts[key]}`);
      }
    }
  }

  if (!index.files || typeof index.files !== 'object') {
    err('index.json', null, 'files', 'missing files object');
    return { valid: false, errors };
  }

  // Required files in index.files
  const requiredFiles = ['leagues.json', 'teams.json', 'matches.json', 'lineups.json'];
  for (const rf of requiredFiles) {
    if (!index.files[rf]) {
      err('index.json', null, 'files', `missing required file "${rf}" in files`);
    }
  }

  // Check country channel files in index.files
  if (Array.isArray(index.countries)) {
    for (const c of index.countries) {
      const channelFile = `channels/${c}.json`;
      if (!index.files[channelFile]) {
        err('index.json', null, 'files', `missing channel file "${channelFile}" for declared country "${c}"`);
      }
    }
  }

  // Validate file integrity for each listed file
  const parsedFiles = {};

  for (const [relPath, fileMeta] of Object.entries(index.files)) {
    if (!/^(leagues|teams|matches|lineups)\.json$|^channels\/[A-Z]{2}\.json$/.test(relPath)) {
      err('index.json', null, 'files', `unexpected or malformed file entry "${relPath}"`);
      continue;
    }

    if (!fileMeta || typeof fileMeta !== 'object') {
      err('index.json', null, `files["${relPath}"]`, 'must be an object with sha256 and bytes');
      continue;
    }

    if (!fileMeta.sha256 || !/^[0-9a-f]{64}$/.test(fileMeta.sha256)) {
      err('index.json', null, `files["${relPath}"].sha256`, `invalid SHA-256 hex string "${fileMeta.sha256}"`);
    }
    if (typeof fileMeta.bytes !== 'number' || fileMeta.bytes <= 0 || !Number.isInteger(fileMeta.bytes)) {
      err('index.json', null, `files["${relPath}"].bytes`, `must be positive integer, got ${fileMeta.bytes}`);
    }

    const fullPath = path.join(resolvedDir, relPath);
    if (!fs.existsSync(fullPath)) {
      err(relPath, null, null, 'file listed in index.files does not exist on disk');
      continue;
    }

    const { sha256: diskSha, bytes: diskBytes } = calculateFileHash(fullPath);
    if (diskSha !== fileMeta.sha256) {
      err(relPath, null, null, `integrity mismatch: expected ${fileMeta.sha256}, got ${diskSha}`);
    }
    if (diskBytes !== fileMeta.bytes) {
      err(relPath, null, null, `byte size mismatch: expected ${fileMeta.bytes}, got ${diskBytes}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      parsedFiles[relPath] = parsed;
    } catch (e) {
      err(relPath, null, null, `invalid JSON (${e.message})`);
      continue;
    }

    // Common file header checks
    if (!parsed.schemaVersion || !SEMVER_REGEX.test(parsed.schemaVersion)) {
      err(relPath, null, 'schemaVersion', `must match SemVer major 1, got "${parsed.schemaVersion}"`);
    } else if (index.schemaVersion && parsed.schemaVersion.split('.')[0] !== index.schemaVersion.split('.')[0]) {
      err(relPath, null, 'schemaVersion', `major version ${parsed.schemaVersion.split('.')[0]} differs from index major version ${index.schemaVersion.split('.')[0]}`);
    }

    if (!parsed.generatedAt || !INSTANT_REGEX.test(parsed.generatedAt)) {
      err(relPath, null, 'generatedAt', `must be RFC 3339 UTC instant, got "${parsed.generatedAt}"`);
    } else if (index.generatedAt && parsed.generatedAt !== index.generatedAt) {
      err(relPath, null, 'generatedAt', `differs from index.generatedAt (${parsed.generatedAt} vs ${index.generatedAt})`);
    }
  }

  // Helper to validate LocalisedText
  function validateLocalisedText(file, slug, fieldName, textObj, required = true) {
    if (!textObj) {
      if (required) err(file, slug, fieldName, 'is required');
      return;
    }
    if (typeof textObj !== 'object' || Array.isArray(textObj)) {
      err(file, slug, fieldName, 'must be an object');
      return;
    }
    if (required && (!textObj.en || typeof textObj.en !== 'string' || textObj.en.trim() === '')) {
      err(file, slug, `${fieldName}.en`, 'is required and must be non-empty string');
    }
    for (const [key, val] of Object.entries(textObj)) {
      if (!LOCALE_KEY_REGEX.test(key)) {
        err(file, slug, `${fieldName}.${key}`, `invalid locale key "${key}"`);
      }
      if (typeof val !== 'string' || val.trim() === '') {
        err(file, slug, `${fieldName}.${key}`, 'must be non-empty string');
      }
    }
  }

  // 2. Validate leagues.json
  const leaguesData = parsedFiles['leagues.json'];
  const leaguesMap = leaguesData?.leagues || {};
  if (leaguesData) {
    if (!leaguesData.leagues || typeof leaguesData.leagues !== 'object' || Array.isArray(leaguesData.leagues)) {
      err('leagues.json', null, 'leagues', 'must be an object keyed by slug');
    } else {
      const keys = Object.keys(leaguesMap);
      if (index.counts && keys.length !== index.counts.leagues) {
        err('leagues.json', null, 'leagues', `collection count (${keys.length}) does not match index.counts.leagues (${index.counts.leagues})`);
      }
      for (const [slug, league] of Object.entries(leaguesMap)) {
        if (!SLUG_REGEX.test(slug) || slug.length > 120) {
          err('leagues.json', slug, 'key', 'must be valid slug (max 120 chars)');
        }
        if (league.slug !== slug) {
          err('leagues.json', slug, 'slug', `does not match map key "${slug}"`);
        }
        if (!league.uuid || typeof league.uuid !== 'string' || league.uuid.trim() === '') {
          err('leagues.json', slug, 'uuid', 'is required non-empty string');
        }
        validateLocalisedText('leagues.json', slug, 'names', league.names, true);
        if (league.shortNames) {
          validateLocalisedText('leagues.json', slug, 'shortNames', league.shortNames, false);
        }
        if (league.logo !== undefined && league.logo !== null) {
          if (typeof league.logo !== 'string' || !HTTPS_URL_REGEX.test(league.logo)) {
            err('leagues.json', slug, 'logo', `must be null or https:// URL, got "${league.logo}"`);
          }
        }
        if (league.country !== undefined && league.country !== null) {
          if (typeof league.country !== 'object' || !league.country.code || !COUNTRY_CODE_REGEX.test(league.country.code)) {
            err('leagues.json', slug, 'country.code', `must be valid 2-letter CountryCode, got "${league.country?.code}"`);
          }
          if (league.country.names) {
            validateLocalisedText('leagues.json', slug, 'country.names', league.country.names, false);
          }
        }
        if (typeof league.popular !== 'boolean') {
          err('leagues.json', slug, 'popular', 'must be boolean');
        }
        if (league.season !== undefined && league.season !== null && typeof league.season !== 'string') {
          err('leagues.json', slug, 'season', 'must be string or null');
        }
        if (!Array.isArray(league.matchSlugs)) {
          err('leagues.json', slug, 'matchSlugs', 'must be an array');
        } else {
          const seen = new Set();
          for (const mSlug of league.matchSlugs) {
            if (!MATCH_SLUG_REGEX.test(mSlug)) {
              err('leagues.json', slug, 'matchSlugs', `invalid match slug "${mSlug}"`);
            }
            if (seen.has(mSlug)) {
              err('leagues.json', slug, 'matchSlugs', `duplicate match slug "${mSlug}"`);
            }
            seen.add(mSlug);
          }
        }
      }
    }
  }

  // 3. Validate teams.json
  const teamsData = parsedFiles['teams.json'];
  const teamsMap = teamsData?.teams || {};
  if (teamsData) {
    if (!teamsData.teams || typeof teamsData.teams !== 'object' || Array.isArray(teamsData.teams)) {
      err('teams.json', null, 'teams', 'must be an object keyed by slug');
    } else {
      const keys = Object.keys(teamsMap);
      if (index.counts && keys.length !== index.counts.teams) {
        err('teams.json', null, 'teams', `collection count (${keys.length}) does not match index.counts.teams (${index.counts.teams})`);
      }
      for (const [slug, team] of Object.entries(teamsMap)) {
        if (!SLUG_REGEX.test(slug) || slug.length > 120) {
          err('teams.json', slug, 'key', 'must be valid slug (max 120 chars)');
        }
        if (team.slug !== slug) {
          err('teams.json', slug, 'slug', `does not match map key "${slug}"`);
        }
        if (!team.uuid || typeof team.uuid !== 'string' || team.uuid.trim() === '') {
          err('teams.json', slug, 'uuid', 'is required non-empty string');
        }
        validateLocalisedText('teams.json', slug, 'names', team.names, true);
        if (team.shortNames) {
          validateLocalisedText('teams.json', slug, 'shortNames', team.shortNames, false);
        }
        if (team.crest !== undefined && team.crest !== null) {
          if (typeof team.crest !== 'string' || !HTTPS_URL_REGEX.test(team.crest)) {
            err('teams.json', slug, 'crest', `must be null or https:// URL, got "${team.crest}"`);
          }
        }
        if (team.country !== undefined && team.country !== null) {
          if (typeof team.country !== 'object' || !team.country.code || !COUNTRY_CODE_REGEX.test(team.country.code)) {
            err('teams.json', slug, 'country.code', `must be valid CountryCode, got "${team.country?.code}"`);
          }
        }
        if (!Array.isArray(team.leagueSlugs)) {
          err('teams.json', slug, 'leagueSlugs', 'must be an array');
        } else {
          const seenLeagues = new Set();
          for (const lSlug of team.leagueSlugs) {
            if (!SLUG_REGEX.test(lSlug)) {
              err('teams.json', slug, 'leagueSlugs', `invalid league slug "${lSlug}"`);
            }
            if (seenLeagues.has(lSlug)) {
              err('teams.json', slug, 'leagueSlugs', `duplicate league slug "${lSlug}"`);
            }
            seenLeagues.add(lSlug);
          }
        }
        if (!Array.isArray(team.matchSlugs)) {
          err('teams.json', slug, 'matchSlugs', 'must be an array');
        } else {
          const seenMatches = new Set();
          for (const mSlug of team.matchSlugs) {
            if (!MATCH_SLUG_REGEX.test(mSlug)) {
              err('teams.json', slug, 'matchSlugs', `invalid match slug "${mSlug}"`);
            }
            if (seenMatches.has(mSlug)) {
              err('teams.json', slug, 'matchSlugs', `duplicate match slug "${mSlug}"`);
            }
            seenMatches.add(mSlug);
          }
        }
      }
    }
  }

  // 4. Validate matches.json
  const matchesData = parsedFiles['matches.json'];
  const matchesMap = matchesData?.matches || {};
  if (matchesData) {
    if (!matchesData.matches || typeof matchesData.matches !== 'object' || Array.isArray(matchesData.matches)) {
      err('matches.json', null, 'matches', 'must be an object keyed by slug');
    }
    if (!Array.isArray(matchesData.order)) {
      err('matches.json', null, 'order', 'must be an array of match slugs');
    }

    const matchKeys = Object.keys(matchesMap);
    if (index.counts && matchKeys.length !== index.counts.matches) {
      err('matches.json', null, 'matches', `collection count (${matchKeys.length}) does not match index.counts.matches (${index.counts.matches})`);
    }

    if (Array.isArray(matchesData.order)) {
      if (matchesData.order.length !== matchKeys.length) {
        err('matches.json', null, 'order', `length (${matchesData.order.length}) must match matches collection size (${matchKeys.length})`);
      }
      const orderSet = new Set(matchesData.order);
      if (orderSet.size !== matchesData.order.length) {
        err('matches.json', null, 'order', 'contains duplicate match slugs');
      }
      for (const key of matchKeys) {
        if (!orderSet.has(key)) {
          err('matches.json', null, 'order', `missing match slug "${key}"`);
        }
      }

      // Verify order is non-decreasing by kickoff
      let prevKickoff = null;
      for (const mSlug of matchesData.order) {
        const m = matchesMap[mSlug];
        if (m && m.kickoff) {
          if (prevKickoff && m.kickoff < prevKickoff) {
            err('matches.json', mSlug, 'kickoff', `order violation: kickoff ${m.kickoff} < previous ${prevKickoff}`);
          }
          prevKickoff = m.kickoff;
        }
      }
    }

    for (const [slug, match] of Object.entries(matchesMap)) {
      if (!MATCH_SLUG_REGEX.test(slug)) {
        err('matches.json', slug, 'key', 'must be valid match slug');
      }
      if (match.slug !== slug) {
        err('matches.json', slug, 'slug', `does not match map key "${slug}"`);
      }
      if (!match.uuid || typeof match.uuid !== 'string' || match.uuid.trim() === '') {
        err('matches.json', slug, 'uuid', 'is required non-empty string');
      }
      if (!match.kickoff || !INSTANT_REGEX.test(match.kickoff)) {
        err('matches.json', slug, 'kickoff', `must be RFC 3339 UTC instant, got "${match.kickoff}"`);
      }
      if (!match.leagueSlug || !SLUG_REGEX.test(match.leagueSlug)) {
        err('matches.json', slug, 'leagueSlug', `invalid slug "${match.leagueSlug}"`);
      }
      if (!match.homeSlug || !SLUG_REGEX.test(match.homeSlug)) {
        err('matches.json', slug, 'homeSlug', `invalid slug "${match.homeSlug}"`);
      }
      if (!match.awaySlug || !SLUG_REGEX.test(match.awaySlug)) {
        err('matches.json', slug, 'awaySlug', `invalid slug "${match.awaySlug}"`);
      }
      if (match.homeSlug && match.awaySlug && match.homeSlug === match.awaySlug) {
        err('matches.json', slug, 'homeSlug', 'cannot equal awaySlug (a team cannot play itself)');
      }

      // Validate slug composition: starts with {homeSlug}-vs-{awaySlug}-
      const expectedPrefix = `${match.homeSlug}-vs-${match.awaySlug}-`;
      if (!slug.startsWith(expectedPrefix)) {
        err('matches.json', slug, 'slug', `must begin with "${expectedPrefix}"`);
      } else {
        const datePart = slug.slice(expectedPrefix.length);
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(datePart)) {
          err('matches.json', slug, 'slug', `must end with valid YYYY-MM-DD date, got "${datePart}"`);
        }
      }

      if (!MATCH_STATUSES.has(match.status)) {
        err('matches.json', slug, 'status', `invalid status "${match.status}"`);
      }
      if (!match.statusShort || typeof match.statusShort !== 'string' || match.statusShort.length > 8) {
        err('matches.json', slug, 'statusShort', 'must be string 1-8 chars');
      }
      if (typeof match.hasLineup !== 'boolean') {
        err('matches.json', slug, 'hasLineup', 'must be boolean');
      }

      if (match.score !== undefined && match.score !== null) {
        if (typeof match.score !== 'object' || typeof match.score.home !== 'number' || typeof match.score.away !== 'number' || match.score.home < 0 || match.score.away < 0) {
          err('matches.json', slug, 'score', 'must be null or {home: integer >= 0, away: integer >= 0}');
        }
      }
      if (match.round !== undefined && match.round !== null && typeof match.round !== 'string') {
        err('matches.json', slug, 'round', 'must be string or null');
      }
      if (match.venue !== undefined && match.venue !== null) {
        if (typeof match.venue !== 'object' || !match.venue.name || typeof match.venue.name !== 'string') {
          err('matches.json', slug, 'venue.name', 'is required non-empty string');
        }
        if (match.venue.city !== undefined && typeof match.venue.city !== 'string') {
          err('matches.json', slug, 'venue.city', 'must be string');
        }
      }
    }
  }

  // 5. Validate lineups.json
  const lineupsData = parsedFiles['lineups.json'];
  const lineupsMap = lineupsData?.lineups || {};
  if (lineupsData) {
    if (!lineupsData.lineups || typeof lineupsData.lineups !== 'object' || Array.isArray(lineupsData.lineups)) {
      err('lineups.json', null, 'lineups', 'must be an object keyed by match slug');
    } else {
      const keys = Object.keys(lineupsMap);
      if (index.counts && keys.length !== index.counts.lineups) {
        err('lineups.json', null, 'lineups', `collection count (${keys.length}) does not match index.counts.lineups (${index.counts.lineups})`);
      }
      for (const [slug, lineup] of Object.entries(lineupsMap)) {
        if (!MATCH_SLUG_REGEX.test(slug)) {
          err('lineups.json', slug, 'key', 'must be valid match slug');
        }
        if (!lineup.home || typeof lineup.home !== 'object') {
          err('lineups.json', slug, 'home', 'missing home team lineup');
        } else {
          validateTeamLineup('lineups.json', slug, 'home', lineup.home);
        }
        if (!lineup.away || typeof lineup.away !== 'object') {
          err('lineups.json', slug, 'away', 'missing away team lineup');
        } else {
          validateTeamLineup('lineups.json', slug, 'away', lineup.away);
        }
      }
    }
  }

  function validateTeamLineup(file, slug, side, teamLineup) {
    if (teamLineup.formation !== undefined && teamLineup.formation !== null) {
      if (!FORMATION_REGEX.test(teamLineup.formation)) {
        err(file, slug, `${side}.formation`, `invalid formation "${teamLineup.formation}" (expected e.g. "4-3-3")`);
      }
    }
    if (teamLineup.coach !== undefined && teamLineup.coach !== null && typeof teamLineup.coach !== 'string') {
      err(file, slug, `${side}.coach`, 'must be string or null');
    }
    if (!Array.isArray(teamLineup.startXI)) {
      err(file, slug, `${side}.startXI`, 'must be an array');
    } else {
      if (teamLineup.startXI.length > 11) {
        err(file, slug, `${side}.startXI`, `exceeds max 11 players (${teamLineup.startXI.length})`);
      }
      for (let i = 0; i < teamLineup.startXI.length; i++) {
        validatePlayer(file, slug, `${side}.startXI[${i}]`, teamLineup.startXI[i]);
      }
    }
    if (!Array.isArray(teamLineup.substitutes)) {
      err(file, slug, `${side}.substitutes`, 'must be an array');
    } else {
      for (let i = 0; i < teamLineup.substitutes.length; i++) {
        validatePlayer(file, slug, `${side}.substitutes[${i}]`, teamLineup.substitutes[i]);
      }
    }
  }

  function validatePlayer(file, slug, fieldPath, player) {
    if (!player || typeof player !== 'object') {
      err(file, slug, fieldPath, 'must be an object');
      return;
    }
    if (!player.name || typeof player.name !== 'string' || player.name.trim() === '') {
      err(file, slug, `${fieldPath}.name`, 'is required non-empty string');
    }
    if (player.number !== undefined && player.number !== null) {
      if (typeof player.number !== 'number' || player.number < 0 || player.number > 99 || !Number.isInteger(player.number)) {
        err(file, slug, `${fieldPath}.number`, `must be integer 0-99, got ${player.number}`);
      }
    }
    if (player.pos !== undefined && player.pos !== null) {
      if (!PLAYER_POSITIONS.has(player.pos)) {
        err(file, slug, `${fieldPath}.pos`, `invalid position "${player.pos}" (allowed G, D, M, F)`);
      }
    }
    if (player.grid !== undefined && player.grid !== null) {
      if (!GRID_REGEX.test(player.grid)) {
        err(file, slug, `${fieldPath}.grid`, `invalid grid format "${player.grid}" (expected e.g. "1:1")`);
      }
    }
  }

  // 6. Validate channels/<CC>.json
  for (const [relPath, channelFile] of Object.entries(parsedFiles)) {
    if (!relPath.startsWith('channels/')) continue;
    const countryCode = path.basename(relPath, '.json').toUpperCase();
    if (channelFile.country !== countryCode) {
      err(relPath, null, 'country', `must match filename country code "${countryCode}", got "${channelFile.country}"`);
    }
    if (!channelFile.channels || typeof channelFile.channels !== 'object' || Array.isArray(channelFile.channels)) {
      err(relPath, null, 'channels', 'must be an object keyed by channel ID');
    } else {
      for (const [chId, channel] of Object.entries(channelFile.channels)) {
        if (!CHANNEL_ID_REGEX.test(chId)) {
          err(relPath, chId, 'key', `invalid channel ID "${chId}"`);
        }
        if (channel.id !== chId) {
          err(relPath, chId, 'id', `does not match map key "${chId}"`);
        }
        if (!channel.name || typeof channel.name !== 'string' || channel.name.trim() === '') {
          err(relPath, chId, 'name', 'is required non-empty string');
        }
        if (!CHANNEL_TYPES.has(channel.type)) {
          err(relPath, chId, 'type', `invalid channel type "${channel.type}"`);
        }
        if (channel.logo !== undefined && channel.logo !== null) {
          if (typeof channel.logo !== 'string' || !HTTPS_URL_REGEX.test(channel.logo)) {
            err(relPath, chId, 'logo', `must be null or https:// URL, got "${channel.logo}"`);
          }
        }
        if (channel.url !== undefined && channel.url !== null) {
          if (typeof channel.url !== 'string' || !HTTPS_URL_REGEX.test(channel.url)) {
            err(relPath, chId, 'url', `must be null or https:// URL, got "${channel.url}"`);
          }
        }
      }
    }

    if (!channelFile.matches || typeof channelFile.matches !== 'object' || Array.isArray(channelFile.matches)) {
      err(relPath, null, 'matches', 'must be an object keyed by match slug');
    } else {
      for (const [mSlug, chList] of Object.entries(channelFile.matches)) {
        if (!MATCH_SLUG_REGEX.test(mSlug)) {
          err(relPath, mSlug, 'key', `invalid match slug "${mSlug}"`);
        }
        if (!Array.isArray(chList) || chList.length === 0) {
          err(relPath, mSlug, 'channels', 'must be non-empty array of channel IDs');
        } else {
          const seenCh = new Set();
          for (const chId of chList) {
            if (!channelFile.channels[chId]) {
              err(relPath, mSlug, 'channels', `refers to unknown channel ID "${chId}"`);
            }
            if (seenCh.has(chId)) {
              err(relPath, mSlug, 'channels', `duplicate channel ID "${chId}"`);
            }
            seenCh.add(chId);
          }
        }
      }
    }
  }

  // 7. Referential Integrity Checks across collections
  // A. Match referential checks
  for (const [mSlug, match] of Object.entries(matchesMap)) {
    if (!leaguesMap[match.leagueSlug]) {
      err('matches.json', mSlug, 'leagueSlug', `refers to unknown league "${match.leagueSlug}"`);
    }
    if (!teamsMap[match.homeSlug]) {
      err('matches.json', mSlug, 'homeSlug', `refers to unknown team "${match.homeSlug}"`);
    }
    if (!teamsMap[match.awaySlug]) {
      err('matches.json', mSlug, 'awaySlug', `refers to unknown team "${match.awaySlug}"`);
    }
    const hasLineupInLineups = Boolean(lineupsMap[mSlug]);
    if (match.hasLineup !== hasLineupInLineups) {
      err('matches.json', mSlug, 'hasLineup', `flag is ${match.hasLineup} but lineups.json ${hasLineupInLineups ? 'contains' : 'does not contain'} this match`);
    }

    // Check inclusion in league.matchSlugs
    const league = leaguesMap[match.leagueSlug];
    if (league && Array.isArray(league.matchSlugs) && !league.matchSlugs.includes(mSlug)) {
      err('leagues.json', match.leagueSlug, 'matchSlugs', `missing match "${mSlug}"`);
    }

    // Check inclusion in home and away team matchSlugs
    const homeTeam = teamsMap[match.homeSlug];
    if (homeTeam && Array.isArray(homeTeam.matchSlugs) && !homeTeam.matchSlugs.includes(mSlug)) {
      err('teams.json', match.homeSlug, 'matchSlugs', `missing home match "${mSlug}"`);
    }
    const awayTeam = teamsMap[match.awaySlug];
    if (awayTeam && Array.isArray(awayTeam.matchSlugs) && !awayTeam.matchSlugs.includes(mSlug)) {
      err('teams.json', match.awaySlug, 'matchSlugs', `missing away match "${mSlug}"`);
    }
  }

  // B. League matchSlugs reverse check
  for (const [lSlug, league] of Object.entries(leaguesMap)) {
    if (Array.isArray(league.matchSlugs)) {
      for (const mSlug of league.matchSlugs) {
        const match = matchesMap[mSlug];
        if (!match) {
          err('leagues.json', lSlug, 'matchSlugs', `refers to unknown match "${mSlug}"`);
        } else if (match.leagueSlug !== lSlug) {
          err('leagues.json', lSlug, 'matchSlugs', `match "${mSlug}" has leagueSlug "${match.leagueSlug}", expected "${lSlug}"`);
        }
      }
    }
  }

  // C. Team matchSlugs and leagueSlugs reverse check
  for (const [tSlug, team] of Object.entries(teamsMap)) {
    if (Array.isArray(team.leagueSlugs)) {
      for (const lSlug of team.leagueSlugs) {
        if (!leaguesMap[lSlug]) {
          err('teams.json', tSlug, 'leagueSlugs', `refers to unknown league "${lSlug}"`);
        }
      }
    }
    if (Array.isArray(team.matchSlugs)) {
      for (const mSlug of team.matchSlugs) {
        const match = matchesMap[mSlug];
        if (!match) {
          err('teams.json', tSlug, 'matchSlugs', `refers to unknown match "${mSlug}"`);
        } else if (match.homeSlug !== tSlug && match.awaySlug !== tSlug) {
          err('teams.json', tSlug, 'matchSlugs', `match "${mSlug}" does not involve team "${tSlug}"`);
        }
      }
    }
  }

  // D. Lineups reverse check
  for (const lSlug of Object.keys(lineupsMap)) {
    if (!matchesMap[lSlug]) {
      err('lineups.json', lSlug, 'slug', `refers to unknown match "${lSlug}"`);
    }
  }

  // E. Channels reverse check
  for (const [relPath, channelFile] of Object.entries(parsedFiles)) {
    if (!relPath.startsWith('channels/')) continue;
    if (channelFile.matches) {
      for (const mSlug of Object.keys(channelFile.matches)) {
        if (!matchesMap[mSlug]) {
          err(relPath, mSlug, 'matches', `refers to unknown match "${mSlug}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a synthetic dataset with N matches strictly adhering to Data Contract v1.
 * @param {number} n Total number of matches to synthesize
 * @param {string} outDir Destination directory
 * @returns {{ datasetDir: string, matchesCount: number }}
 */
export function synthesizeDataset(n, outDir) {
  if (typeof n !== 'number' || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid match count: ${n}. Must be a positive integer.`);
  }

  const resolvedDir = path.resolve(outDir);
  const channelsDir = path.join(resolvedDir, 'channels');
  fs.mkdirSync(channelsDir, { recursive: true });

  const generatedAt = '2026-11-05T06:00:00Z';
  const schemaVersion = '1.0.0';

  // 4 Leagues (2 popular, 2 not)
  const leaguesDef = [
    {
      uuid: 'l-brasileirao-serie-a',
      slug: 'brasileirao-serie-a',
      names: { en: 'Brasileirão Série A', pt: 'Brasileirão Série A', es: 'Brasileirao Serie A' },
      shortNames: { en: 'Serie A', pt: 'Série A' },
      logo: 'https://example.com/logos/brasileirao.webp',
      country: { code: 'BR', names: { en: 'Brazil', pt: 'Brasil', es: 'Brasil' } },
      popular: true,
      season: '2026',
    },
    {
      uuid: 'l-premier-league',
      slug: 'premier-league',
      names: { en: 'Premier League', pt: 'Premier League', es: 'Premier League' },
      shortNames: { en: 'EPL', pt: 'EPL' },
      logo: 'https://example.com/logos/premier-league.webp',
      country: { code: 'GB', names: { en: 'United Kingdom', pt: 'Reino Unido', es: 'Reino Unido' } },
      popular: true,
      season: '2026',
    },
    {
      uuid: 'l-la-liga',
      slug: 'la-liga',
      names: { en: 'La Liga', pt: 'La Liga', es: 'La Liga' },
      shortNames: { en: 'La Liga', pt: 'La Liga' },
      logo: 'https://example.com/logos/la-liga.webp',
      country: null,
      popular: false,
      season: '2026',
    },
    {
      uuid: 'l-champions-league',
      slug: 'champions-league',
      names: { en: 'UEFA Champions League', pt: 'Liga dos Campeões', es: 'Liga de Campeones' },
      shortNames: { en: 'UCL', pt: 'UCL' },
      logo: 'https://example.com/logos/ucl.webp',
      country: null,
      popular: false,
      season: '2026',
    },
  ];

  // 20 teams per league (80 teams total)
  const teamsByLeague = {};
  const allTeams = {};
  const leaguesMap = {};

  for (const lDef of leaguesDef) {
    teamsByLeague[lDef.slug] = [];
    leaguesMap[lDef.slug] = {
      ...lDef,
      matchSlugs: [],
    };

    const teamPrefix = lDef.slug.split('-')[0];
    for (let t = 1; t <= 20; t++) {
      const pad = String(t).padStart(2, '0');
      const teamSlug = `${teamPrefix}-team-${pad}`;
      const teamName = `${lDef.shortNames.en} Team ${pad}`;
      const teamObj = {
        uuid: `t-${teamSlug}`,
        slug: teamSlug,
        names: { en: teamName, pt: teamName, es: teamName },
        shortNames: { en: `T${pad}` },
        crest: `https://example.com/crests/${teamSlug}.webp`,
        country: lDef.country ? { code: lDef.country.code } : null,
        leagueSlugs: [lDef.slug],
        matchSlugs: [],
      };
      teamsByLeague[lDef.slug].push(teamObj);
      allTeams[teamSlug] = teamObj;
    }
  }

  // Generate N matches distributed across leagues
  const matchesMap = {};
  const lineupsMap = {};
  const generatedMatches = [];

  // Match Status Distribution helper
  const statuses = ['scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'suspended'];

  for (let i = 0; i < n; i++) {
    const leagueIndex = i % leaguesDef.length;
    const leagueDef = leaguesDef[leagueIndex];
    const leagueTeams = teamsByLeague[leagueDef.slug];

    // Pick unique home and away teams
    // 20 teams -> 380 ordered pairs
    const pairIndex = Math.floor(i / leaguesDef.length) % 380;
    const hIdx = Math.floor(pairIndex / 19);
    let aIdx = pairIndex % 19;
    if (aIdx >= hIdx) aIdx++;

    const homeTeam = leagueTeams[hIdx];
    const awayTeam = leagueTeams[aIdx];

    // Date distribution around 2026-11-05
    // Cycle offset ensures identical pairings get different dates
    const cycle = Math.floor(Math.floor(i / leaguesDef.length) / 380);
    const dayOffset = ((i % 35) - 7) + (cycle * 35);

    const baseMs = Date.parse('2026-11-05T12:00:00Z');
    const matchMs = baseMs + (dayOffset * 86400000) + ((i % 4) * 7200000); // 12:00, 14:00, 16:00, 18:00
    const matchDate = new Date(matchMs);
    const isoString = matchDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const datePart = isoString.slice(0, 10);

    const matchSlug = `${homeTeam.slug}-vs-${awayTeam.slug}-${datePart}`;

    // Determine status based on dayOffset
    let status;
    let statusShort;
    let score = null;

    if (dayOffset < -1) {
      status = 'finished';
      statusShort = 'FT';
      score = { home: (i % 4), away: ((i + 1) % 3) };
    } else if (dayOffset === -1) {
      if (i % 3 === 0) {
        status = 'live';
        statusShort = '2H';
        score = { home: 1, away: 1 };
      } else if (i % 3 === 1) {
        status = 'halftime';
        statusShort = 'HT';
        score = { home: 0, away: 0 };
      } else {
        status = 'finished';
        statusShort = 'FT';
        score = { home: 2, away: 0 };
      }
    } else if (dayOffset === 0) {
      if (i % 4 === 0) {
        status = 'live';
        statusShort = '1H';
        score = { home: 1, away: 0 };
      } else {
        status = 'scheduled';
        statusShort = 'NS';
      }
    } else {
      if (i % 25 === 23) {
        status = 'postponed';
        statusShort = 'PST';
      } else if (i % 25 === 24) {
        status = 'cancelled';
        statusShort = 'CANC';
      } else {
        status = 'scheduled';
        statusShort = 'NS';
      }
    }

    // Lineup flag (all matches for budget test, or majority)
    const hasLineup = true;

    const matchObj = {
      uuid: `m-${matchSlug}`,
      slug: matchSlug,
      kickoff: isoString,
      leagueSlug: leagueDef.slug,
      homeSlug: homeTeam.slug,
      awaySlug: awayTeam.slug,
      status,
      statusShort,
      score,
      round: `Round ${(i % 38) + 1}`,
      venue: {
        name: `${homeTeam.names.en} Stadium`,
        city: 'City',
      },
      hasLineup,
    };

    matchesMap[matchSlug] = matchObj;
    generatedMatches.push(matchObj);

    // Add match to league and teams
    leaguesMap[leagueDef.slug].matchSlugs.push(matchSlug);
    homeTeam.matchSlugs.push(matchSlug);
    awayTeam.matchSlugs.push(matchSlug);

    // If hasLineup, generate lineup
    if (hasLineup) {
      const positions = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'F', 'F', 'F'];
      const grids = ['1:1', '2:1', '2:2', '2:3', '2:4', '3:1', '3:2', '3:3', '4:1', '4:2', '4:3'];

      function makePlayers(prefix) {
        const startXI = [];
        for (let p = 0; p < 11; p++) {
          startXI.push({
            name: `${prefix} Player ${p + 1}`,
            number: p + 1,
            pos: positions[p],
            grid: grids[p],
          });
        }
        const substitutes = [];
        for (let s = 12; s <= 16; s++) {
          substitutes.push({
            name: `${prefix} Sub ${s}`,
            number: s,
            pos: positions[(s - 1) % 4 + 1] || 'M',
            grid: null,
          });
        }
        return { startXI, substitutes };
      }

      const homePlayers = makePlayers(homeTeam.names.en);
      const awayPlayers = makePlayers(awayTeam.names.en);

      lineupsMap[matchSlug] = {
        home: {
          formation: '4-3-3',
          coach: `${homeTeam.names.en} Coach`,
          startXI: homePlayers.startXI,
          substitutes: homePlayers.substitutes,
        },
        away: {
          formation: '4-3-3',
          coach: `${awayTeam.names.en} Coach`,
          startXI: awayPlayers.startXI,
          substitutes: awayPlayers.substitutes,
        },
      };
    }
  }

  // Sort match order ascending by kickoff, then slug
  generatedMatches.sort((a, b) => {
    if (a.kickoff !== b.kickoff) return a.kickoff.localeCompare(b.kickoff);
    return a.slug.localeCompare(b.slug);
  });
  const order = generatedMatches.map(m => m.slug);

  // Sort matchSlugs inside leagues and teams to match kickoff ordering
  for (const l of Object.values(leaguesMap)) {
    l.matchSlugs.sort((a, b) => {
      const kA = matchesMap[a].kickoff;
      const kB = matchesMap[b].kickoff;
      return kA !== kB ? kA.localeCompare(kB) : a.localeCompare(b);
    });
  }
  for (const t of Object.values(allTeams)) {
    t.matchSlugs.sort((a, b) => {
      const kA = matchesMap[a].kickoff;
      const kB = matchesMap[b].kickoff;
      return kA !== kB ? kA.localeCompare(kB) : a.localeCompare(b);
    });
  }

  // Channels for 5 countries: GB, IE, BR, PT, AR
  const countries = ['GB', 'IE', 'BR', 'PT', 'AR'];
  const channelDefinitions = {
    GB: {
      channels: {
        'sky-sports-main': { id: 'sky-sports-main', name: 'Sky Sports Main Event', type: 'tv', logo: 'https://example.com/sky.webp', url: 'https://sky.com' },
        'tnt-sports-1': { id: 'tnt-sports-1', name: 'TNT Sports 1', type: 'tv', logo: null, url: 'https://tntsports.co.uk' },
        'bbc-iplayer': { id: 'bbc-iplayer', name: 'BBC iPlayer', type: 'free_tv', logo: null, url: 'https://bbc.co.uk/iplayer' },
      },
    },
    IE: {
      channels: {
        'rte-2': { id: 'rte-2', name: 'RTÉ 2', type: 'free_tv', logo: null, url: 'https://rte.ie' },
        'premier-sports-roi': { id: 'premier-sports-roi', name: 'Premier Sports 1', type: 'tv', logo: null, url: 'https://premiersports.com' },
      },
    },
    BR: {
      channels: {
        'globo': { id: 'globo', name: 'TV Globo', type: 'free_tv', logo: 'https://example.com/globo.webp', url: 'https://ge.globo.com' },
        'sportv': { id: 'sportv', name: 'SporTV', type: 'tv', logo: null, url: 'https://sportv.globo.com' },
        'cazetv': { id: 'cazetv', name: 'CazéTV', type: 'streaming', logo: null, url: 'https://youtube.com/cazetv' },
      },
    },
    PT: {
      channels: {
        'sport-tv-1': { id: 'sport-tv-1', name: 'Sport TV 1', type: 'tv', logo: null, url: 'https://sporttv.pt' },
        'rtp-1': { id: 'rtp-1', name: 'RTP 1', type: 'free_tv', logo: null, url: 'https://rtp.pt' },
      },
    },
    AR: {
      channels: {
        'espn-ar': { id: 'espn-ar', name: 'ESPN Argentina', type: 'tv', logo: null, url: 'https://espn.com.ar' },
        'tyc-sports': { id: 'tyc-sports', name: 'TyC Sports', type: 'tv', logo: null, url: 'https://tycsports.com' },
        'star-plus': { id: 'star-plus', name: 'Disney+ / Star+', type: 'streaming', logo: null, url: 'https://disneyplus.com' },
      },
    },
  };

  // Assign matches to channels
  for (const c of countries) {
    const cDef = channelDefinitions[c];
    const chKeys = Object.keys(cDef.channels);
    const countryMatches = {};

    for (let i = 0; i < generatedMatches.length; i++) {
      const m = generatedMatches[i];
      // Every match gets at least 1 channel in its country or a major country
      if (i % 5 !== 4) {
        const assigned = [chKeys[i % chKeys.length]];
        if (i % 2 === 0 && chKeys.length > 1) {
          assigned.push(chKeys[(i + 1) % chKeys.length]);
        }
        countryMatches[m.slug] = assigned;
      }
    }

    const channelFileContent = {
      schemaVersion,
      generatedAt,
      country: c,
      channels: cDef.channels,
      matches: countryMatches,
    };
    fs.writeFileSync(
      path.join(channelsDir, `${c}.json`),
      JSON.stringify(channelFileContent, null, 2) + '\n',
      'utf8'
    );
  }

  // Write standard collection files
  fs.writeFileSync(
    path.join(resolvedDir, 'leagues.json'),
    JSON.stringify({ schemaVersion, generatedAt, leagues: leaguesMap }, null, 2) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(resolvedDir, 'teams.json'),
    JSON.stringify({ schemaVersion, generatedAt, teams: allTeams }, null, 2) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(resolvedDir, 'matches.json'),
    JSON.stringify({ schemaVersion, generatedAt, order, matches: matchesMap }, null, 2) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(resolvedDir, 'lineups.json'),
    JSON.stringify({ schemaVersion, generatedAt, lineups: lineupsMap }, null, 2) + '\n',
    'utf8'
  );

  // Now compute hashes and update index.json
  const minK = generatedMatches.length > 0 ? generatedMatches[0].kickoff : generatedAt;
  const maxK = generatedMatches.length > 0 ? generatedMatches[generatedMatches.length - 1].kickoff : generatedAt;

  // Temporary minimal index so updateIndex has window guidance
  const initialIndex = {
    schemaVersion,
    generatedAt,
    window: { from: minK, to: maxK },
    countries,
    files: {},
    counts: {},
  };
  fs.writeFileSync(
    path.join(resolvedDir, 'index.json'),
    JSON.stringify(initialIndex, null, 2) + '\n',
    'utf8'
  );

  updateIndex(resolvedDir);

  // Validate the generated dataset
  const validation = checkDataset(resolvedDir);
  if (!validation.valid) {
    throw new Error(`Synthesized dataset failed internal validation:\n${validation.errors.join('\n')}`);
  }

  return { datasetDir: resolvedDir, matchesCount: n };
}

/**
 * CLI Help text
 */
function printHelp() {
  console.log(`
CardápioFC Dataset Indexing, Validation, and Synthesis Tool

Usage:
  node scripts/cfc-data-index.mjs [dataset-dir]
  node scripts/cfc-data-index.mjs --check [dataset-dir]
  node scripts/cfc-data-index.mjs --synthesize <N> [output-dir]

Modes:
  default              Re-hashes all dataset files, recalculates entity counts,
                       and writes updated index.json.
  --check              Validates dataset files against Data Contract v1 schema
                       and referential integrity rules. Exits 0 on success, 1 on error.
  --synthesize <N>     Generates a synthetic conforming dataset of N matches for
                       benchmarking and budget estimation.

Options:
  --out <dir>          Target directory for synthesis
  --help, -h           Show this help message
`);
}

/**
 * Main CLI entry point
 */
export async function main(argv = process.argv.slice(2)) {
  let checkMode = false;
  let synthesizeCount = null;
  let targetDir = null;
  let outDir = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      checkMode = true;
    } else if (arg === '--synthesize') {
      const countVal = argv[++i];
      if (!countVal) {
        console.error('Error: --synthesize requires a match count argument');
        process.exit(1);
      }
      synthesizeCount = parseInt(countVal, 10);
    } else if (arg.startsWith('--synthesize=')) {
      synthesizeCount = parseInt(arg.slice('--synthesize='.length), 10);
    } else if (arg === '--out') {
      outDir = argv[++i];
    } else if (arg.startsWith('--out=')) {
      outDir = arg.slice('--out='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return 0;
    } else if (!arg.startsWith('-')) {
      if (!targetDir) {
        targetDir = arg;
      }
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (synthesizeCount !== null) {
    const dest = outDir || targetDir || 'assets/cfc-data/synthetic';
    console.log(`Synthesizing dataset with ${synthesizeCount} matches into "${dest}"...`);
    try {
      const res = synthesizeDataset(synthesizeCount, dest);
      console.log(`✅ Successfully synthesized ${res.matchesCount} matches in ${res.datasetDir}`);
      return 0;
    } catch (e) {
      console.error(`❌ Synthesis failed: ${e.message}`);
      process.exit(1);
    }
  }

  const datasetDir = targetDir || outDir || 'assets/cfc-data/sample';

  if (checkMode) {
    console.log(`Validating dataset at "${datasetDir}"...`);
    const result = checkDataset(datasetDir);
    if (!result.valid) {
      console.error(`❌ Dataset validation failed with ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    } else {
      console.log(`✅ Dataset validation passed for "${datasetDir}".`);
      return 0;
    }
  }

  // Default mode: update index
  console.log(`Updating dataset index at "${datasetDir}"...`);
  try {
    const { index } = updateIndex(datasetDir);
    const fileCount = Object.keys(index.files || {}).length;
    console.log(
      `✅ Updated index.json in "${datasetDir}":\n` +
      `   Counts: leagues=${index.counts.leagues}, teams=${index.counts.teams}, matches=${index.counts.matches}, lineups=${index.counts.lineups}\n` +
      `   Files hashed: ${fileCount}`
    );
    return 0;
  } catch (e) {
    console.error(`❌ Failed to update index: ${e.message}`);
    process.exit(1);
  }
}

// Execute if run directly from CLI
const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  main();
}
