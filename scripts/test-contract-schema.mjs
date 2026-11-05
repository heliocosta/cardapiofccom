#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

/**
 * Lightweight, strictly compliant JSON Schema Draft 2020-12 evaluator
 * for the vocabulary used in CardápioFC Data Contract v1.
 */
function createDraft2020Validator(rootSchema) {
  const defs = rootSchema.$defs || {};

  function resolveRef(ref) {
    if (!ref.startsWith('#/$defs/')) {
      throw new Error(`Unsupported ref format: ${ref}`);
    }
    const defName = ref.slice('#/$defs/'.length);
    if (!defs[defName]) {
      throw new Error(`Missing definition: ${defName}`);
    }
    return defs[defName];
  }

  function validate(schema, data, pathStr = '$') {
    const errors = [];

    if (schema === true) return errors;
    if (schema === false) {
      errors.push(`${pathStr}: schema is boolean false`);
      return errors;
    }

    if (schema.$ref) {
      const resolved = resolveRef(schema.$ref);
      return validate(resolved, data, pathStr);
    }

    if (schema.allOf) {
      for (let i = 0; i < schema.allOf.length; i++) {
        const subErrors = validate(schema.allOf[i], data, `${pathStr}.allOf[${i}]`);
        errors.push(...subErrors);
      }
    }

    if (schema.oneOf) {
      let matchedCount = 0;
      const oneOfErrors = [];
      for (let i = 0; i < schema.oneOf.length; i++) {
        const subErrors = validate(schema.oneOf[i], data, `${pathStr}.oneOf[${i}]`);
        if (subErrors.length === 0) {
          matchedCount++;
        } else {
          oneOfErrors.push(subErrors.join('; '));
        }
      }
      if (matchedCount !== 1) {
        errors.push(`${pathStr}: expected exactly one oneOf subschema to match, matched ${matchedCount}. Errors: [${oneOfErrors.join(' | ')}]`);
      }
    }

    if (schema.type !== undefined) {
      const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actualType = getJsonType(data);
      let typeMatches = allowedTypes.includes(actualType);
      if (!typeMatches && allowedTypes.includes('number') && actualType === 'integer') {
        typeMatches = true;
      }
      if (!typeMatches) {
        errors.push(`${pathStr}: expected type ${allowedTypes.join('/')}, got ${actualType}`);
        return errors;
      }
    }

    if (schema.enum !== undefined) {
      const matchesEnum = schema.enum.some(val => deepEqual(val, data));
      if (!matchesEnum) {
        errors.push(`${pathStr}: value ${JSON.stringify(data)} not in enum [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`);
      }
    }

    // String keywords
    if (typeof data === 'string') {
      if (schema.pattern !== undefined) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push(`${pathStr}: "${data}" does not match pattern ${schema.pattern}`);
        }
      }
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push(`${pathStr}: string length ${data.length} < minLength ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push(`${pathStr}: string length ${data.length} > maxLength ${schema.maxLength}`);
      }
    }

    // Number / integer keywords
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${pathStr}: number ${data} < minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${pathStr}: number ${data} > maximum ${schema.maximum}`);
      }
    }

    // Array keywords
    if (Array.isArray(data)) {
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push(`${pathStr}: array length ${data.length} < minItems ${schema.minItems}`);
      }
      if (schema.maxItems !== undefined && data.length > schema.maxItems) {
        errors.push(`${pathStr}: array length ${data.length} > maxItems ${schema.maxItems}`);
      }
      if (schema.uniqueItems === true) {
        for (let i = 0; i < data.length; i++) {
          for (let j = i + 1; j < data.length; j++) {
            if (deepEqual(data[i], data[j])) {
              errors.push(`${pathStr}: array items not unique (items ${i} and ${j} are duplicates)`);
            }
          }
        }
      }
      if (schema.items !== undefined) {
        for (let i = 0; i < data.length; i++) {
          const itemErrors = validate(schema.items, data[i], `${pathStr}[${i}]`);
          errors.push(...itemErrors);
        }
      }
    }

    // Object keywords
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      if (schema.required) {
        for (const reqProp of schema.required) {
          if (!(reqProp in data)) {
            errors.push(`${pathStr}: missing required property "${reqProp}"`);
          }
        }
      }

      const definedProps = schema.properties || {};

      if (schema.propertyNames !== undefined) {
        for (const propKey of Object.keys(data)) {
          const propNameErrors = validate(schema.propertyNames, propKey, `${pathStr}.propertyNames(${propKey})`);
          errors.push(...propNameErrors);
        }
      }

      for (const [key, val] of Object.entries(data)) {
        if (key in definedProps) {
          const propErrors = validate(definedProps[key], val, `${pathStr}.${key}`);
          errors.push(...propErrors);
        } else if (schema.additionalProperties !== undefined) {
          if (schema.additionalProperties === false) {
            errors.push(`${pathStr}: additional property "${key}" not allowed`);
          } else if (typeof schema.additionalProperties === 'object') {
            const addErrors = validate(schema.additionalProperties, val, `${pathStr}.${key}`);
            errors.push(...addErrors);
          }
        }
      }
    }

    return errors;
  }

  return { validate, resolveRef };
}

function getJsonType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'integer' : 'number';
  }
  return typeof val;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

console.log('--- Step 1: Validating JSON Schema Draft 2020-12 Conformance ---');

const primarySchemaPath = path.join(rootDir, 'contract', 'cfc-data-v1.schema.json');
const specSchemaPath = path.join(rootDir, '.kiro', 'specs', 'data-pages', 'contract', 'cfc-data-v1.schema.json');

assert(fs.existsSync(primarySchemaPath), `Primary schema file exists at ${primarySchemaPath}`);
assert(fs.existsSync(specSchemaPath), `Spec schema file exists at ${specSchemaPath}`);

const primaryContent = fs.readFileSync(primarySchemaPath, 'utf8');
const specContent = fs.readFileSync(specSchemaPath, 'utf8');

assert(primaryContent.trim() === specContent.trim(), 'Primary schema and spec schema are identical byte-for-byte');

let schema;
try {
  schema = JSON.parse(primaryContent);
  assert(true, 'Schema is valid, parseable JSON');
} catch (e) {
  assert(false, `Schema failed to parse as JSON: ${e.message}`);
}

assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', '$schema declares Draft 2020-12');
assert(schema.$id === 'https://cardapiofc.com/contracts/cfc-data-v1.schema.json', '$id is canonical URI');
assert(Array.isArray(schema.oneOf), 'Root schema defines top-level oneOf union');
assert(typeof schema.$defs === 'object' && schema.$defs !== null, 'Root schema defines $defs container (Draft 2020-12 compliant)');

// Validate all $defs entries
const expectedDefs = [
  'SemVer', 'Instant', 'Slug', 'MatchSlug', 'CountryCode', 'ChannelId',
  'Url', 'NullableUrl', 'LocalisedText', 'FileHeader',
  'IndexFile', 'League', 'LeaguesFile', 'Team', 'TeamsFile',
  'MatchStatus', 'Match', 'MatchesFile', 'Player', 'TeamLineup', 'Lineup', 'LineupsFile',
  'Channel', 'ChannelsFile'
];

for (const defName of expectedDefs) {
  assert(Boolean(schema.$defs[defName]), `$defs contains "${defName}"`);
}

// Check all $ref pointers in the document
function verifyRefs(node, path = '$') {
  if (node === null || typeof node !== 'object') return;
  if (node.$ref) {
    assert(node.$ref.startsWith('#/$defs/'), `Ref ${node.$ref} at ${path} uses standard #/$defs/ pointer`);
    const target = node.$ref.slice('#/$defs/'.length);
    assert(Boolean(schema.$defs[target]), `Ref ${node.$ref} at ${path} resolves to existing def`);
  }
  for (const [k, v] of Object.entries(node)) {
    if (k !== '$ref') {
      verifyRefs(v, `${path}.${k}`);
    }
  }
}
verifyRefs(schema);

// Check all regex patterns compile cleanly
function verifyPatterns(node, path = '$') {
  if (node === null || typeof node !== 'object') return;
  if (node.pattern) {
    try {
      new RegExp(node.pattern);
      assert(true, `Regex pattern "${node.pattern}" at ${path} compiles cleanly`);
    } catch (e) {
      assert(false, `Regex pattern "${node.pattern}" at ${path} failed to compile: ${e.message}`);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    verifyPatterns(v, `${path}.${k}`);
  }
}
verifyPatterns(schema);

console.log('\n--- Step 2: Validating Data Contract v1 Positive Fixtures ---');

const validator = createDraft2020Validator(schema);

const validIndex = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  window: {
    from: '2026-10-29T00:00:00Z',
    to: '2026-12-05T00:00:00Z'
  },
  countries: ['GB', 'IE', 'BR', 'PT', 'AR'],
  files: {
    'leagues.json': { sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', bytes: 1420 },
    'teams.json': { sha256: 'b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', bytes: 8540 },
    'matches.json': { sha256: 'c1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', bytes: 12450 },
    'lineups.json': { sha256: 'd1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', bytes: 4120 },
    'channels/BR.json': { sha256: 'e1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', bytes: 3890 }
  },
  counts: { leagues: 1, teams: 2, matches: 1, lineups: 1 }
};

const validLeagues = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  leagues: {
    'brasileirao-serie-a': {
      uuid: 'l-bra-001',
      slug: 'brasileirao-serie-a',
      names: { en: 'Brazil Serie A', pt: 'Brasileirão Série A' },
      shortNames: { en: 'BSA', pt: 'Série A' },
      logo: 'https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/leagues%2Fbra.webp?alt=media',
      country: { code: 'BR', names: { en: 'Brazil', pt: 'Brasil' } },
      popular: true,
      season: '2026',
      matchSlugs: ['flamengo-vs-palmeiras-2026-11-08']
    }
  }
};

const validTeams = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  teams: {
    'flamengo': {
      uuid: 't-fla-001',
      slug: 'flamengo',
      names: { en: 'Flamengo', 'pt-br': 'CR Flamengo' },
      crest: 'https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/teams%2Ffla.webp?alt=media',
      country: { code: 'BR' },
      leagueSlugs: ['brasileirao-serie-a'],
      matchSlugs: ['flamengo-vs-palmeiras-2026-11-08']
    },
    'palmeiras': {
      uuid: 't-pal-002',
      slug: 'palmeiras',
      names: { en: 'Palmeiras' },
      crest: null,
      country: { code: 'BR' },
      leagueSlugs: ['brasileirao-serie-a'],
      matchSlugs: ['flamengo-vs-palmeiras-2026-11-08']
    }
  }
};

const validMatches = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  order: ['flamengo-vs-palmeiras-2026-11-08'],
  matches: {
    'flamengo-vs-palmeiras-2026-11-08': {
      uuid: 'm-fla-pal-01',
      slug: 'flamengo-vs-palmeiras-2026-11-08',
      kickoff: '2026-11-08T19:00:00Z',
      leagueSlug: 'brasileirao-serie-a',
      homeSlug: 'flamengo',
      awaySlug: 'palmeiras',
      status: 'scheduled',
      statusShort: 'NS',
      score: null,
      round: 'Regular Season - 33',
      venue: { name: 'Maracanã', city: 'Rio de Janeiro' },
      hasLineup: true
    }
  }
};

const validLineups = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  lineups: {
    'flamengo-vs-palmeiras-2026-11-08': {
      home: {
        formation: '4-3-3',
        coach: 'Tite',
        startXI: [
          { name: 'Rossi', number: 1, pos: 'G', grid: '1:1' },
          { name: 'Varela', number: 2, pos: 'D', grid: '2:1' }
        ],
        substitutes: [
          { name: 'Matheus Cunha', number: 25, pos: 'G' }
        ]
      },
      away: {
        formation: '4-2-3-1',
        coach: 'Abel Ferreira',
        startXI: [
          { name: 'Weverton', number: 21, pos: 'G', grid: '1:1' }
        ],
        substitutes: []
      }
    }
  }
};

const validChannels = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-11-05T06:00:00Z',
  country: 'BR',
  channels: {
    'globo': { id: 'globo', name: 'TV Globo', type: 'free_tv', logo: null, url: 'https://ge.globo.com' },
    'premiere': { id: 'premiere', name: 'Premiere', type: 'tv', logo: null, url: null }
  },
  matches: {
    'flamengo-vs-palmeiras-2026-11-08': ['premiere', 'globo']
  }
};

assert(validator.validate(schema, validIndex).length === 0, 'validIndex satisfies root schema');
assert(validator.validate(schema, validLeagues).length === 0, 'validLeagues satisfies root schema');
assert(validator.validate(schema, validTeams).length === 0, 'validTeams satisfies root schema');
assert(validator.validate(schema, validMatches).length === 0, 'validMatches satisfies root schema');
assert(validator.validate(schema, validLineups).length === 0, 'validLineups satisfies root schema');
assert(validator.validate(schema, validChannels).length === 0, 'validChannels satisfies root schema');

console.log('\n--- Step 3: Validating Data Contract v1 Negative Constraints ---');

// 1. Missing schemaVersion
{
  const invalid = structuredClone(validIndex);
  delete invalid.schemaVersion;
  assert(validator.validate(schema, invalid).length > 0, 'Rejects index with missing schemaVersion');
}

// 2. Unsupported major version (e.g. 2.0.0)
{
  const invalid = structuredClone(validIndex);
  invalid.schemaVersion = '2.0.0';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects schemaVersion major != 1');
}

// 3. Kickoff without Z (e.g. +02:00 or missing Z)
{
  const invalid = structuredClone(validMatches);
  invalid.matches['flamengo-vs-palmeiras-2026-11-08'].kickoff = '2026-11-08T19:00:00+02:00';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects kickoff without explicit UTC Z designator');
}

// 4. Invalid match status
{
  const invalid = structuredClone(validMatches);
  invalid.matches['flamengo-vs-palmeiras-2026-11-08'].status = 'in_progress';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects unknown match status "in_progress"');
}

// 5. Invalid match slug format (not {home}-vs-{away}-{date})
{
  const invalid = structuredClone(validMatches);
  const badSlug = 'flamengo_palmeiras_2026';
  invalid.order = [badSlug];
  invalid.matches = { [badSlug]: { ...invalid.matches['flamengo-vs-palmeiras-2026-11-08'], slug: badSlug } };
  assert(validator.validate(schema, invalid).length > 0, 'Rejects match slug not conforming to app format');
}

// 6. Missing required English in LocalisedText
{
  const invalid = structuredClone(validLeagues);
  invalid.leagues['brasileirao-serie-a'].names = { pt: 'Brasileirão Série A' }; // en missing!
  assert(validator.validate(schema, invalid).length > 0, 'Rejects LocalisedText without required "en" property');
}

// 7. Non-https URL
{
  const invalid = structuredClone(validTeams);
  invalid.teams.flamengo.crest = 'http://example.com/crest.png';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects non-https URL');
}

// 8. startXI with > 11 players
{
  const invalid = structuredClone(validLineups);
  const players = [];
  for (let i = 0; i < 12; i++) {
    players.push({ name: `Player ${i}`, number: i + 1 });
  }
  invalid.lineups['flamengo-vs-palmeiras-2026-11-08'].home.startXI = players;
  assert(validator.validate(schema, invalid).length > 0, 'Rejects startXI exceeding 11 players');
}

// 9. Invalid formation format
{
  const invalid = structuredClone(validLineups);
  invalid.lineups['flamengo-vs-palmeiras-2026-11-08'].home.formation = '433';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects formation not matching ^[1-9](-[1-9]){1,4}$');
}

// 10. Channels file with invalid channel type
{
  const invalid = structuredClone(validChannels);
  invalid.channels.globo.type = 'cable';
  assert(validator.validate(schema, invalid).length > 0, 'Rejects channel with type outside allowed enum');
}

// 11. Channels file with empty match array (minItems: 1)
{
  const invalid = structuredClone(validChannels);
  invalid.matches['flamengo-vs-palmeiras-2026-11-08'] = [];
  assert(validator.validate(schema, invalid).length > 0, 'Rejects match in channels file with 0 channels (must be omitted)');
}

// 12. Negative score
{
  const invalid = structuredClone(validMatches);
  invalid.matches['flamengo-vs-palmeiras-2026-11-08'].score = { home: -1, away: 2 };
  assert(validator.validate(schema, invalid).length > 0, 'Rejects negative score');
}

console.log('\n--- Step 4: Validating Output File Budget Formula & Worked Examples ---');

/**
 * File budget estimate formula:
 * F = E * (M + Lambda + T + L + 1 + c) + S <= B
 */
function estimateFiles({ E, M, Lambda, T, L, c, S }) {
  const perEdition = M + Lambda + T + L + 1 + c;
  return E * perEdition + S;
}

const E = 6;
const T = 410;
const L = 24;
const c = 5;
const S = 200;
const B = 18000;

// Scenario 1: All lineups, M=1000, Lambda=1000
const s1 = estimateFiles({ E, M: 1000, Lambda: 1000, T, L, c, S });
assert(s1 === 14840, `Scenario 1 estimate is 14,840 (calculated ${s1})`);
assert(s1 <= B, 'Scenario 1 is within budget 18,000');

// Scenario 2: Maximum capacity with all lineups (M=1260, Lambda=1260)
const s2 = estimateFiles({ E, M: 1260, Lambda: 1260, T, L, c, S });
assert(s2 === 17960, `Scenario 2 estimate is 17,960 (calculated ${s2})`);
assert(s2 <= B, 'Scenario 2 is within budget 18,000');

// Maximum M formula check
const M_max_all = Math.floor(((B - S) / E - T - L - 1 - c) / 2);
assert(M_max_all === 1263, `M_max formula computes 1,263 (computed ${M_max_all})`);

// Scenario 3: Lineups available for 30% (M=1900, Lambda=570)
const s3 = estimateFiles({ E, M: 1900, Lambda: 570, T, L, c, S });
assert(s3 === 17660, `Scenario 3 estimate is 17,660 (calculated ${s3})`);
assert(s3 <= B, 'Scenario 3 is within budget 18,000');

console.log('\n--- Step 5: Checking Operator Documentation ---');

const readmePath = path.join(rootDir, 'contract', 'README.md');
assert(fs.existsSync(readmePath), `contract/README.md exists`);

const readmeContent = fs.readFileSync(readmePath, 'utf8');
assert(readmeContent.includes('schemaVersion'), 'README documents schemaVersion');
assert(readmeContent.includes('^[a-z0-9]+(?:-[a-z0-9]+)*$'), 'README documents Slug regex pattern');
assert(readmeContent.includes('{homeTeamSlug}-vs-{awayTeamSlug}-{yyyy-mm-dd}'), 'README documents MatchSlug format');
assert(readmeContent.includes('RFC 3339 UTC timestamp with explicit `Z` designator'), 'README documents UTC timestamps');
assert(readmeContent.includes('LocalisedText'), 'README documents LocalisedText and fallback chain');
assert(readmeContent.includes('channels/<CC>.json'), 'README documents country channels');
assert(readmeContent.includes('F = E \\times (M + \\Lambda + T + L + 1 + c) + S'), 'README documents File Budget formula');
assert(readmeContent.includes('18,000') || readmeContent.includes('18{,}000'), 'README documents 18,000 file budget');
assert(readmeContent.includes('cardapiofc://match/{slug}'), 'README documents mobile app deep link mappings');

console.log(`\n======================================================`);
console.log(`Summary: ${passedTests} passed, ${failedTests} failed, ${totalTests} total.`);
console.log(`======================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All schema and contract tests passed successfully!');
  process.exit(0);
}
