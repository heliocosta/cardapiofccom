#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_SOFT_BUDGET = 18000;
const DEFAULT_HARD_LIMIT = 20000;

/**
 * Reads the default soft budget (`fileBudget`) from `data/cfc/settings.yaml`.
 */
function readDefaultSoftBudget(rootDir) {
  const settingsPath = path.join(rootDir, 'data', 'cfc', 'settings.yaml');
  if (!fs.existsSync(settingsPath)) return DEFAULT_SOFT_BUDGET;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const match = raw.match(/^\s*fileBudget:\s*(\d+)\b/m);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Fall back to default soft budget if settings.yaml cannot be read.
  }
  return DEFAULT_SOFT_BUDGET;
}

/**
 * Parses a positive integer CLI argument value.
 */
function parsePositiveInt(value, flagName) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid value for ${flagName}: "${value}" (expected positive integer)`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flagName}: "${value}" (must be > 0)`);
  }
  return parsed;
}

/**
 * Parses CLI flags: --dir=<path>, --soft=<int>, --hard=<int>.
 */
function parseArgs(argv, rootDir) {
  let dir = path.join(rootDir, 'public');
  let soft = readDefaultSoftBudget(rootDir);
  let hard = DEFAULT_HARD_LIMIT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--dir=')) {
      dir = path.resolve(process.cwd(), arg.slice('--dir='.length));
    } else if (arg === '--dir' && i + 1 < argv.length) {
      dir = path.resolve(process.cwd(), argv[++i]);
    } else if (arg.startsWith('--soft=')) {
      soft = parsePositiveInt(arg.slice('--soft='.length), '--soft');
    } else if (arg === '--soft' && i + 1 < argv.length) {
      soft = parsePositiveInt(argv[++i], '--soft');
    } else if (arg.startsWith('--hard=')) {
      hard = parsePositiveInt(arg.slice('--hard='.length), '--hard');
    } else if (arg === '--hard' && i + 1 < argv.length) {
      hard = parsePositiveInt(argv[++i], '--hard');
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return { dir, soft, hard };
}

/**
 * Recursively counts all files inside `rootDir` and aggregates per top-level bucket.
 */
function collectFileCounts(targetDir) {
  let total = 0;
  const buckets = new Map();

  function addCount(bucket) {
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  function walk(currentDir, topBucket) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const bucket = topBucket ?? (entry.isDirectory() ? `${entry.name}/` : '(root)');
      if (entry.isDirectory()) {
        walk(fullPath, bucket);
      } else if (entry.isFile()) {
        total++;
        addCount(bucket);
      } else if (entry.isSymbolicLink()) {
        try {
          const st = fs.statSync(fullPath);
          if (st.isDirectory()) {
            walk(fullPath, topBucket ?? `${entry.name}/`);
          } else if (st.isFile()) {
            total++;
            addCount(topBucket ?? '(root)');
          }
        } catch {
          // Ignore broken symlinks.
        }
      }
    }
  }

  walk(targetDir, null);
  return { total, buckets };
}

/**
 * Returns the byte size of `llms-full.txt` at the root of `targetDir`, or null if absent.
 */
function getLlmsFullBytes(targetDir) {
  const llmsPath = path.join(targetDir, 'llms-full.txt');
  if (!fs.existsSync(llmsPath)) return null;
  const stat = fs.statSync(llmsPath);
  return stat.isFile() ? stat.size : null;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), ROOT_DIR);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }

  const { dir, soft, hard } = opts;

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`::error::Target directory does not exist or is not a directory: ${dir}`);
    process.exit(1);
  }

  const { total, buckets } = collectFileCounts(dir);
  const llmsBytes = getLlmsFullBytes(dir);
  const displayDir = path.relative(ROOT_DIR, dir) || '.';

  console.log(`Static file count check (${displayDir}): ${total} files (soft budget: ${soft}, hard limit: ${hard})`);

  if (llmsBytes !== null) {
    console.log(`llms-full.txt: ${llmsBytes} bytes (${(llmsBytes / 1024).toFixed(1)} KB)`);
  } else {
    console.log('llms-full.txt: not present (0 bytes)');
  }

  const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sortedBuckets.length > 0) {
    console.log('Top-level bucket breakdown:');
    for (const [bucket, count] of sortedBuckets) {
      console.log(`  - ${bucket}: ${count}`);
    }
  }

  if (total > hard) {
    console.error(`::error::Static file count ${total} exceeds hard limit ${hard} (soft budget ${soft}) in ${displayDir}`);
    process.exit(1);
  }

  if (total > soft) {
    console.log(`::warning::Static file count ${total} exceeds soft budget ${soft} (hard limit ${hard}) in ${displayDir}`);
    process.exit(0);
  }

  console.log(`PASS: Static file count ${total} is within soft budget ${soft} (hard limit ${hard}).`);
}

main();
