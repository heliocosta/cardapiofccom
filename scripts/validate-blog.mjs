#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..');

export const VALID_PILLARS = new Set([
  'rights-changes',
  'watch-guides',
  'app-guides',
  'market-analysis',
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASCII_KEY_PATTERN = /^[\x21-\x7E]+$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/i;

const BANNED_LINK_PATTERN = /\/(?:categories|tags|authors)(?:\/|$|["')\s?#])/i;
const BANNED_FA_CLASS_PATTERN =
  /\bfa-[a-z0-9-]+|\b(?:fab|fas|far)\s+fa-|class\s*=\s*["'][^"']*\b(?:fab|fas|far)\b/i;
const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9-]*(?:\s+[^>]*)?>/i;

const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 630;

/**
 * Parses CLI flags (`--root=<dir>` or `--root <dir>`).
 */
export function parseArgs(argv, defaultRoot = DEFAULT_ROOT_DIR) {
  let rootDir = defaultRoot;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--root=')) {
      const raw = arg.slice('--root='.length).trim();
      if (!raw) throw new Error('Flag --root requires a non-empty directory path');
      rootDir = path.resolve(process.cwd(), raw);
    } else if (arg === '--root') {
      if (i + 1 >= argv.length) {
        throw new Error('Flag --root requires a directory path argument');
      }
      rootDir = path.resolve(process.cwd(), argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { rootDir };
}

/**
 * Strips inline TOML comments outside quoted strings.
 */
function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inDouble && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inDouble && ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Unquotes a TOML string literal.
 */
function unquoteTomlString(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses top-level edition tables and their `contentDir` from `config/_default/languages.toml`.
 */
export function parseLanguagesToml(tomlText) {
  const editions = [];
  const byCode = new Map();
  let currentSection = '';

  for (const rawLine of tomlText.replace(/\r\n?/g, '\n').split('\n')) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!currentSection.includes('.')) {
        if (!byCode.has(currentSection)) {
          const entry = {
            code: currentSection,
            contentDir: `content/${currentSection}`,
          };
          byCode.set(currentSection, entry);
          editions.push(entry);
        }
      }
      continue;
    }

    if (currentSection && !currentSection.includes('.')) {
      const kvMatch = line.match(/^contentDir\s*=\s*(.+)$/);
      if (kvMatch) {
        const entry = byCode.get(currentSection);
        if (entry) {
          entry.contentDir = unquoteTomlString(kvMatch[1]);
        }
      }
    }
  }

  return editions;
}

/**
 * Strips YAML comments outside single/double quoted strings.
 */
function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inDouble && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inDouble && ch === "'") {
      if (line[i + 1] === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (!inSingle && !inDouble && ch === '#') {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/**
 * Splits a comma-separated YAML flow collection respecting nested brackets and quotes.
 */
function splitFlowItems(inner) {
  const items = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (inDouble && ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        if (current.trim()) items.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

/**
 * Parses a YAML scalar or inline flow value.
 */
function parseYamlScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlowItems(inner).map((item) => parseYamlScalar(item));
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const obj = {};
    if (!inner) return obj;
    for (const part of splitFlowItems(inner)) {
      const idx = findKeySeparator(part);
      if (idx === -1) {
        throw new Error(`Invalid inline YAML object entry: ${part}`);
      }
      const k = unquoteYamlKey(part.slice(0, idx).trim());
      const v = parseYamlScalar(part.slice(idx + 1));
      obj[k] = v;
    }
    return obj;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function unquoteYamlKey(rawKey) {
  if (
    (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
    (rawKey.startsWith("'") && rawKey.endsWith("'"))
  ) {
    return parseYamlScalar(rawKey);
  }
  return rawKey;
}

function findKeySeparator(text) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inDouble && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    } else if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inDouble && ch === ':') {
      if (i + 1 === text.length || /\s/.test(text[i + 1])) {
        return i;
      }
    }
  }
  return -1;
}

function tokenizeYamlLines(yamlText) {
  const rawLines = yamlText.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const withoutComment = stripYamlComment(raw);
    const trimmed = withoutComment.trim();
    const indent = raw.match(/^ */)[0].length;
    lines.push({
      lineNo: i + 1,
      raw,
      indent,
      trimmed,
      isBlankOrComment: trimmed.length === 0,
    });
  }
  return lines;
}

function nextSignificantIndex(lines, startIndex) {
  let idx = startIndex;
  while (idx < lines.length && lines[idx].isBlankOrComment) {
    idx++;
  }
  return idx;
}

function parseBlockScalar(lines, startIndex, parentIndent, indicator) {
  const isFolded = indicator.startsWith('>');
  const chomp = indicator.endsWith('-') ? 'strip' : indicator.endsWith('+') ? 'keep' : 'clip';
  const collected = [];
  let blockIndent = null;
  let idx = startIndex;

  while (idx < lines.length) {
    const line = lines[idx];
    if (line.raw.trim() === '') {
      collected.push('');
      idx++;
      continue;
    }
    if (blockIndent === null) {
      if (line.indent <= parentIndent) break;
      blockIndent = line.indent;
    }
    if (line.indent < blockIndent) break;
    collected.push(line.raw.slice(blockIndent));
    idx++;
  }

  while (collected.length > 0 && collected[collected.length - 1] === '' && chomp !== 'keep') {
    collected.pop();
  }

  let text = isFolded
    ? collected.reduce((acc, cur, i) => {
        if (i === 0) return cur;
        if (cur === '' || collected[i - 1] === '') return `${acc}\n${cur}`;
        return `${acc} ${cur}`;
      }, '')
    : collected.join('\n');

  if (chomp === 'clip' && text.length > 0) {
    text += '\n';
  }
  return { value: text, nextIndex: idx };
}

function parseYamlBlock(lines, startIndex, minIndent) {
  const firstIdx = nextSignificantIndex(lines, startIndex);
  if (firstIdx >= lines.length || lines[firstIdx].indent < minIndent) {
    return { value: null, nextIndex: firstIdx };
  }

  const first = lines[firstIdx];
  if (first.trimmed === '-' || first.trimmed.startsWith('- ')) {
    return parseYamlSequence(lines, firstIdx, first.indent);
  }
  return parseYamlMapping(lines, firstIdx, first.indent);
}

function parseYamlSequence(lines, startIndex, seqIndent) {
  const arr = [];
  let idx = startIndex;

  while (idx < lines.length) {
    idx = nextSignificantIndex(lines, idx);
    if (idx >= lines.length) break;
    const line = lines[idx];
    if (line.indent < seqIndent) break;
    if (line.indent > seqIndent) {
      throw new Error(`Unexpected indentation at frontmatter line ${line.lineNo}`);
    }
    if (line.trimmed !== '-' && !line.trimmed.startsWith('- ')) {
      break;
    }

    const rest = line.trimmed === '-' ? '' : line.trimmed.slice(2).trim();
    if (!rest) {
      const child = parseYamlBlock(lines, idx + 1, seqIndent + 1);
      arr.push(child.value);
      idx = child.nextIndex;
      continue;
    }

    const sepIdx = findKeySeparator(rest);
    if (sepIdx !== -1) {
      const itemIndent = line.indent + 2;
      const obj = {};
      const key = unquoteYamlKey(rest.slice(0, sepIdx).trim());
      const valStr = rest.slice(sepIdx + 1).trim();
      let nextIdx = idx + 1;

      if (valStr === '' || /^[|>][+-]?$/.test(valStr)) {
        if (/^[|>][+-]?$/.test(valStr)) {
          const scalar = parseBlockScalar(lines, nextIdx, itemIndent, valStr);
          obj[key] = scalar.value;
          nextIdx = scalar.nextIndex;
        } else {
          const peek = nextSignificantIndex(lines, nextIdx);
          if (peek < lines.length && lines[peek].indent > itemIndent) {
            const nested = parseYamlBlock(lines, peek, itemIndent + 1);
            obj[key] = nested.value;
            nextIdx = nested.nextIndex;
          } else {
            obj[key] = null;
          }
        }
      } else {
        obj[key] = parseYamlScalar(valStr);
      }

      const nextPeek = nextSignificantIndex(lines, nextIdx);
      if (
        nextPeek < lines.length &&
        lines[nextPeek].indent === itemIndent &&
        lines[nextPeek].trimmed !== '-' &&
        !lines[nextPeek].trimmed.startsWith('- ')
      ) {
        const siblingMap = parseYamlMapping(lines, nextPeek, itemIndent);
        Object.assign(obj, siblingMap.value);
        nextIdx = siblingMap.nextIndex;
      }

      arr.push(obj);
      idx = nextIdx;
      continue;
    }

    arr.push(parseYamlScalar(rest));
    idx++;
  }

  return { value: arr, nextIndex: idx };
}

function parseYamlMapping(lines, startIndex, mapIndent) {
  const obj = {};
  let idx = startIndex;

  while (idx < lines.length) {
    idx = nextSignificantIndex(lines, idx);
    if (idx >= lines.length) break;
    const line = lines[idx];
    if (line.indent < mapIndent) break;
    if (line.indent > mapIndent) {
      throw new Error(`Unexpected indentation at frontmatter line ${line.lineNo}`);
    }
    if (line.trimmed === '-' || line.trimmed.startsWith('- ')) {
      break;
    }

    const sepIdx = findKeySeparator(line.trimmed);
    if (sepIdx === -1) {
      throw new Error(`Invalid YAML mapping line ${line.lineNo}: ${line.trimmed}`);
    }

    const key = unquoteYamlKey(line.trimmed.slice(0, sepIdx).trim());
    const valStr = line.trimmed.slice(sepIdx + 1).trim();

    if (/^[|>][+-]?$/.test(valStr)) {
      const scalar = parseBlockScalar(lines, idx + 1, mapIndent, valStr);
      obj[key] = scalar.value;
      idx = scalar.nextIndex;
      continue;
    }

    if (valStr === '') {
      const peek = nextSignificantIndex(lines, idx + 1);
      if (
        peek < lines.length &&
        (lines[peek].indent > mapIndent ||
          (lines[peek].indent === mapIndent &&
            (lines[peek].trimmed === '-' || lines[peek].trimmed.startsWith('- '))))
      ) {
        const child = parseYamlBlock(lines, peek, mapIndent);
        obj[key] = child.value;
        idx = child.nextIndex;
      } else {
        obj[key] = null;
        idx++;
      }
      continue;
    }

    obj[key] = parseYamlScalar(valStr);
    idx++;
  }

  return { value: obj, nextIndex: idx };
}

/**
 * Extracts YAML frontmatter and Markdown body from a Hugo content file.
 */
export function parseFrontmatterAndBody(markdownText) {
  const normalized = markdownText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$|^---\n---(?:\n([\s\S]*))?$/);
  if (!match) {
    throw new Error('Missing or unclosed YAML frontmatter delimiters (--- ... ---)');
  }

  const frontmatterRaw = match[1] ?? '';
  const body = match[2] ?? match[3] ?? '';
  const tokens = tokenizeYamlLines(frontmatterRaw);
  const firstIdx = nextSignificantIndex(tokens, 0);

  let data = {};
  if (firstIdx < tokens.length) {
    const parsed = parseYamlMapping(tokens, firstIdx, tokens[firstIdx].indent);
    if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      throw new Error('Frontmatter must be a YAML mapping');
    }
    data = parsed.value;
  }

  return { frontmatterRaw, data, body };
}

/**
 * Reads image pixel dimensions directly from PNG, JPEG, or WebP headers without external deps.
 */
export function readImageDimensions(filePath) {
  fs.accessSync(filePath, fs.constants.R_OK);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error('Image path is not a regular file');
  }
  const buf = fs.readFileSync(filePath);
  if (buf.length < 12) {
    throw new Error(`Image file too small to parse headers (${buf.length} bytes)`);
  }

  // PNG: 8-byte signature + IHDR chunk
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    if (buf.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('Invalid PNG: missing IHDR chunk');
    }
    return {
      format: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG: SOI (0xFF 0xD8) followed by markers up to SOF0..SOF15 (excluding DHT/JPG/DAC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length) {
      while (offset < buf.length && buf[offset] !== 0xff) {
        offset++;
      }
      while (offset < buf.length && buf[offset] === 0xff) {
        offset++;
      }
      if (offset >= buf.length) break;

      const marker = buf[offset++];
      if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        continue;
      }

      if (offset + 2 > buf.length) break;
      const segLen = buf.readUInt16BE(offset);
      if (segLen < 2 || offset + segLen > buf.length) {
        throw new Error('Corrupt JPEG segment length');
      }

      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        if (segLen < 7) {
          throw new Error('Corrupt JPEG SOF segment');
        }
        return {
          format: 'jpeg',
          height: buf.readUInt16BE(offset + 3),
          width: buf.readUInt16BE(offset + 5),
        };
      }
      offset += segLen;
    }
    throw new Error('JPEG SOF marker with dimensions not found');
  }

  // WebP: RIFF....WEBP followed by VP8 , VP8L, or VP8X
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP' &&
    buf.length >= 24
  ) {
    const fourCC = buf.toString('ascii', 12, 16);
    if (fourCC === 'VP8 ' && buf.length >= 30) {
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        return {
          format: 'webp',
          width: buf.readUInt16LE(26) & 0x3fff,
          height: buf.readUInt16LE(28) & 0x3fff,
        };
      }
      throw new Error('Invalid WebP VP8 bitstream header');
    }
    if (fourCC === 'VP8L' && buf.length >= 25) {
      if (buf[20] !== 0x2f) {
        throw new Error('Invalid WebP VP8L signature byte');
      }
      const bits = buf.readUInt32LE(21);
      return {
        format: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (fourCC === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { format: 'webp', width, height };
    }
    throw new Error(`Unsupported WebP chunk type: ${fourCC}`);
  }

  throw new Error('Unsupported or unrecognized image format (expected PNG, JPEG, or WebP)');
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function parseTimestampMs(val) {
  if (!isNonEmptyString(val)) return null;
  const trimmed = val.trim();
  const match = ISO_TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const fracRaw = match[7] ?? '';
  const tz = match[8];

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 60) {
    return null;
  }

  let offsetMs = 0;
  if (tz.toUpperCase() !== 'Z') {
    const sign = match[9] === '+' ? 1 : -1;
    const offHour = Number(match[10]);
    const offMin = Number(match[11]);
    if (offHour < 0 || offHour > 23 || offMin < 0 || offMin > 59) return null;
    offsetMs = sign * (offHour * 60 + offMin) * 60_000;
  }

  // Verify calendar date/time without Date.UTC rollover (clamp leap second 60 for check)
  const checkSecond = second === 60 ? 59 : second;
  const utcCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, checkSecond));
  if (
    utcCheck.getUTCFullYear() !== year ||
    utcCheck.getUTCMonth() !== month - 1 ||
    utcCheck.getUTCDate() !== day ||
    utcCheck.getUTCHours() !== hour ||
    utcCheck.getUTCMinutes() !== minute ||
    utcCheck.getUTCSeconds() !== checkSecond
  ) {
    return null;
  }

  const fracMs = fracRaw ? Number(fracRaw.slice(0, 3).padEnd(3, '0')) : 0;
  const leapMs = second === 60 ? 1000 : 0;
  const ms = utcCheck.getTime() + leapMs + fracMs - offsetMs;
  return Number.isFinite(ms) ? ms : null;
}

function scanBannedPatterns(fileLabel, frontmatterRaw, body, errors) {
  const combined = `${frontmatterRaw}\n${body}`;
  const linkMatch = combined.match(BANNED_LINK_PATTERN);
  if (linkMatch) {
    errors.push(`${fileLabel}: contains banned taxonomy/author link "${linkMatch[0].trim()}"`);
  }
  const faMatch = combined.match(BANNED_FA_CLASS_PATTERN);
  if (faMatch) {
    errors.push(`${fileLabel}: contains banned FontAwesome class "${faMatch[0].trim()}"`);
  }
}

function validateArticleEntry(entry, rootDir, assetsDir, imageCache, errors) {
  const { relPath, data, body, frontmatterRaw } = entry;

  scanBannedPatterns(relPath, frontmatterRaw, body, errors);

  for (const field of ['title', 'description', 'image_alt']) {
    if (!isNonEmptyString(data[field])) {
      errors.push(`${relPath}: missing or empty required frontmatter field "${field}"`);
    }
  }

  const dateMs = parseTimestampMs(data.date);
  if (dateMs === null) {
    errors.push(`${relPath}: "date" must be a valid RFC 3339 / ISO 8601 timestamp`);
  }

  const lastmodMs = parseTimestampMs(data.lastmod);
  if (lastmodMs === null) {
    errors.push(`${relPath}: "lastmod" must be a valid RFC 3339 / ISO 8601 timestamp`);
  }

  if (dateMs !== null && lastmodMs !== null && lastmodMs < dateMs) {
    errors.push(`${relPath}: "lastmod" (${data.lastmod}) must be >= "date" (${data.date})`);
  }

  if (typeof data.translationKey !== 'string' || !ASCII_KEY_PATTERN.test(data.translationKey)) {
    errors.push(`${relPath}: "translationKey" must be a non-empty ASCII string without whitespace`);
  }

  if (!isNonEmptyString(data.pillar) || !VALID_PILLARS.has(data.pillar)) {
    errors.push(
      `${relPath}: invalid "pillar" (${JSON.stringify(data.pillar)}); expected one of ${[...VALID_PILLARS].join(', ')}`
    );
  }

  if (typeof data.draft !== 'boolean') {
    errors.push(`${relPath}: "draft" must be a boolean (true or false)`);
  }

  if (!isNonEmptyString(body)) {
    errors.push(`${relPath}: Markdown body content must not be empty`);
  }

  if (!isNonEmptyString(data.image)) {
    errors.push(`${relPath}: missing or empty required frontmatter field "image"`);
  } else {
    const normImage = data.image.trim().replace(/^\/+/, '');
    const resolvedImage = path.resolve(assetsDir, normImage);
    const relativeToAssets = path.relative(assetsDir, resolvedImage);
    if (!relativeToAssets || relativeToAssets.startsWith('..') || path.isAbsolute(relativeToAssets)) {
      errors.push(`${relPath}: "image" path escapes assets/: ${data.image}`);
    } else {
      let cached = imageCache.get(resolvedImage);
      if (!cached) {
        if (!fs.existsSync(resolvedImage)) {
          cached = { error: `cover image does not exist at assets/${normImage}` };
        } else {
          try {
            const dims = readImageDimensions(resolvedImage);
            if (dims.width < MIN_IMAGE_WIDTH || dims.height < MIN_IMAGE_HEIGHT) {
              cached = {
                error: `cover image assets/${normImage} dimensions ${dims.width}x${dims.height} are below minimum ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}`,
              };
            } else {
              cached = { dims };
            }
          } catch (err) {
            cached = { error: `cover image assets/${normImage} unreadable/invalid: ${err.message}` };
          }
        }
        imageCache.set(resolvedImage, cached);
      }
      if (cached.error) {
        errors.push(`${relPath}: ${cached.error}`);
      }
    }
  }

  if (data.faq !== undefined) {
    if (!Array.isArray(data.faq)) {
      errors.push(`${relPath}: optional "faq" field must be an array of { q, a } objects`);
    } else {
      for (let i = 0; i < data.faq.length; i++) {
        const item = data.faq[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${relPath}: faq[${i}] must be an object with "q" and "a" strings`);
          continue;
        }
        if (!isNonEmptyString(item.q) || HTML_TAG_PATTERN.test(item.q)) {
          errors.push(`${relPath}: faq[${i}].q must be a non-empty plain-text string`);
        }
        if (!isNonEmptyString(item.a) || HTML_TAG_PATTERN.test(item.a)) {
          errors.push(`${relPath}: faq[${i}].a must be a non-empty plain-text string`);
        }
      }
    }
  }
}

/**
 * Validates the nine-edition editorial blog contract under `rootDir`.
 */
export function validateBlog({ rootDir = DEFAULT_ROOT_DIR } = {}) {
  const errors = [];
  const languagesPath = path.join(rootDir, 'config', '_default', 'languages.toml');
  const assetsDir = path.join(rootDir, 'assets');

  if (!fs.existsSync(languagesPath)) {
    return {
      ok: false,
      errors: [`Missing edition registry: ${path.relative(rootDir, languagesPath)}`],
      stats: { editions: 0, publishedArticles: 0, draftArticles: 0 },
    };
  }

  const editions = parseLanguagesToml(fs.readFileSync(languagesPath, 'utf8'));
  if (editions.length === 0) {
    return {
      ok: false,
      errors: ['No active editions found in config/_default/languages.toml'],
      stats: { editions: 0, publishedArticles: 0, draftArticles: 0 },
    };
  }

  const articlesBySlug = new Map();
  const imageCache = new Map();

  for (const ed of editions) {
    const blogDir = path.join(rootDir, ed.contentDir, 'blog');
    const hubPath = path.join(blogDir, '_index.md');
    const hubRel = path.relative(rootDir, hubPath);

    if (!fs.existsSync(blogDir) || !fs.statSync(blogDir).isDirectory()) {
      errors.push(`Edition "${ed.code}" is missing blog directory: ${path.relative(rootDir, blogDir)}`);
      continue;
    }

    if (!fs.existsSync(hubPath)) {
      errors.push(`Edition "${ed.code}" is missing blog hub page: ${hubRel}`);
    } else {
      try {
        const parsedHub = parseFrontmatterAndBody(fs.readFileSync(hubPath, 'utf8'));
        scanBannedPatterns(hubRel, parsedHub.frontmatterRaw, parsedHub.body, errors);
        if (!isNonEmptyString(parsedHub.data.title)) {
          errors.push(`${hubRel}: missing or empty "title"`);
        }
        if (!isNonEmptyString(parsedHub.data.description)) {
          errors.push(`${hubRel}: missing or empty "description"`);
        }
        if (parsedHub.data.translationKey !== 'blog-hub') {
          errors.push(
            `${hubRel}: "translationKey" must be "blog-hub" (found ${JSON.stringify(parsedHub.data.translationKey)})`
          );
        }
      } catch (err) {
        errors.push(`${hubRel}: failed to parse frontmatter (${err.message})`);
      }
    }

    for (const entry of fs.readdirSync(blogDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === '_index.md') {
        continue;
      }
      const slug = entry.name.slice(0, -3);
      const filePath = path.join(blogDir, entry.name);
      const relPath = path.relative(rootDir, filePath);

      let parsed;
      try {
        parsed = parseFrontmatterAndBody(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        errors.push(`${relPath}: failed to parse frontmatter (${err.message})`);
        continue;
      }

      if (!articlesBySlug.has(slug)) {
        articlesBySlug.set(slug, new Map());
      }
      articlesBySlug.get(slug).set(ed.code, {
        edition: ed.code,
        slug,
        relPath,
        ...parsed,
      });
    }
  }

  let publishedArticles = 0;
  let draftArticles = 0;

  for (const [slug, editionEntries] of articlesBySlug.entries()) {
    const draftValues = new Map();
    let hasInvalidDraft = false;

    for (const [edCode, item] of editionEntries.entries()) {
      if (typeof item.data.draft !== 'boolean') {
        hasInvalidDraft = true;
        errors.push(`${item.relPath}: "draft" must be a boolean (true or false)`);
      } else {
        draftValues.set(edCode, item.data.draft);
      }
    }

    const uniqueDraftFlags = new Set(draftValues.values());
    if (uniqueDraftFlags.size > 1) {
      const summary = [...draftValues.entries()]
        .map(([edCode, val]) => `${edCode}=${val}`)
        .join(', ');
      errors.push(`Draft parity mismatch for slug "${slug}": ${summary}`);
    }

    const allExplicitDraftTrue =
      !hasInvalidDraft &&
      draftValues.size === editionEntries.size &&
      uniqueDraftFlags.size === 1 &&
      uniqueDraftFlags.has(true);

    if (allExplicitDraftTrue) {
      draftArticles++;
      continue;
    }

    publishedArticles++;

    if (!SLUG_PATTERN.test(slug)) {
      errors.push(
        `Invalid blog slug "${slug}": must match lowercase ASCII kebab-case ${SLUG_PATTERN}`
      );
    }

    const missingEditions = editions
      .map((ed) => ed.code)
      .filter((code) => !editionEntries.has(code));
    if (missingEditions.length > 0) {
      errors.push(
        `Article "${slug}" is missing in ${missingEditions.length} edition(s): ${missingEditions.join(', ')}`
      );
    }

    const translationKeys = new Map();
    const normalizedImages = new Map();

    for (const item of editionEntries.values()) {
      validateArticleEntry(item, rootDir, assetsDir, imageCache, errors);
      if (isNonEmptyString(item.data.translationKey)) {
        translationKeys.set(item.edition, item.data.translationKey);
      }
      if (isNonEmptyString(item.data.image)) {
        normalizedImages.set(item.edition, item.data.image.trim().replace(/^\/+/, ''));
      }
    }

    const distinctKeys = new Set(translationKeys.values());
    if (distinctKeys.size > 1) {
      const detail = [...translationKeys.entries()]
        .map(([edCode, k]) => `${edCode}="${k}"`)
        .join(', ');
      errors.push(`Article "${slug}" has mismatched translationKey across editions: ${detail}`);
    }

    const distinctImages = new Set(normalizedImages.values());
    if (distinctImages.size > 1) {
      const detail = [...normalizedImages.entries()]
        .map(([edCode, img]) => `${edCode}="${img}"`)
        .join(', ');
      errors.push(`Article "${slug}" must share one cover image across editions: ${detail}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      editions: editions.length,
      publishedArticles,
      draftArticles,
    },
  };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), DEFAULT_ROOT_DIR);
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }

  const result = validateBlog({ rootDir: opts.rootDir });
  if (!result.ok) {
    console.error(`FAIL: Blog contract validation failed with ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `PASS: Blog contract validated across ${result.stats.editions} editions (${result.stats.publishedArticles} published article(s), ${result.stats.draftArticles} draft(s)).`
  );
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  main();
}
