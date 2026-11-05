#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isComponentsMode = process.argv.includes('--components');

const failures = [];

function fail(msg) {
  failures.push(msg);
}

// -------------------------------------------------------------
// Relative luminance and contrast ratio (WCAG 2.1)
// -------------------------------------------------------------
function hexToRgb(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// -------------------------------------------------------------
// Minimal YAML key parser for flat/1-level YAML files
// -------------------------------------------------------------
function parseYamlKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`File does not exist: ${filePath}`);
    return new Set();
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_-]+):/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

// -------------------------------------------------------------
// Component Check Mode (--components)
// -------------------------------------------------------------
if (isComponentsMode) {
  console.log('Running Component Checks (--components)...');

  const checkDest = path.join(rootDir, 'resources', '_check');
  try {
    execSync('node scripts/themeGenerator.js && hugo --environment development --destination resources/_check --quiet', {
      cwd: rootDir,
      stdio: 'pipe',
    });
  } catch (err) {
    fail(`Failed to build development styleguide: ${err.message}`);
  }

  if (fs.existsSync(checkDest)) {
    function findHtmlFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(findHtmlFiles(fullPath));
        } else if (file.endsWith('.html')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const htmlFiles = findHtmlFiles(checkDest);
    let cardCount = 0;

    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8');

      // Check match cards outerHTML size <= 2048 bytes
      const cardRegex = /<a[^>]*class="[^"]*\bcfc-match-card\b[^"]*"[\s\S]*?<\/a>/g;
      let cardMatch;
      while ((cardMatch = cardRegex.exec(html)) !== null) {
        cardCount++;
        const cardHtml = cardMatch[0];
        const size = Buffer.byteLength(cardHtml, 'utf8');
        const slugMatch = cardHtml.match(/data-cfc-match="([^"]+)"/);
        const cardId = slugMatch ? slugMatch[1] : `at index ${cardMatch.index}`;

        if (size > 2048) {
          fail(`Component size check failed: Match card "${cardId}" in ${path.relative(rootDir, file)} exceeds 2048 bytes (${size} bytes)`);
        }
      }

      // Check img attributes inside cfc- components
      const imgRegex = /<img\b[^>]*>/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const tag = imgMatch[0];
        // If image is part of cfc component (e.g. cfc-team-crest or adjacent)
        const isCfc = tag.includes('cfc-') || html.substring(Math.max(0, imgMatch.index - 200), imgMatch.index).includes('cfc-');
        if (isCfc) {
          const hasWidth = /\bwidth=["']?[0-9]+/i.test(tag);
          const hasHeight = /\bheight=["']?[0-9]+/i.test(tag);
          if (!hasWidth || !hasHeight) {
            fail(`Component img check failed: <img> tag in ${path.relative(rootDir, file)} lacks width/height attributes: ${tag.slice(0, 100)}`);
          }
        }
      }
    }

    console.log(`Checked ${cardCount} match cards across ${htmlFiles.length} HTML files.`);
  } else {
    fail(`Destination directory not found: ${checkDest}`);
  }

  reportResults();
}

// -------------------------------------------------------------
// Standard Production Output & Invariants Checks
// -------------------------------------------------------------
console.log('Running Site Build Checks...');

const publicDir = path.join(rootDir, 'public');
if (!fs.existsSync(publicDir)) {
  fail('public/ directory does not exist. Run "pnpm build" before "pnpm check".');
  reportResults();
}

// Check A: Edition homes and 404s
const editions = [
  { code: 'en', prefix: '', locale: 'en' },
  { code: 'en-gb', prefix: 'en-gb/', locale: 'en-GB' },
  { code: 'en-ie', prefix: 'en-ie/', locale: 'en-IE' },
  { code: 'pt-br', prefix: 'pt-br/', locale: 'pt-BR' },
  { code: 'pt-pt', prefix: 'pt-pt/', locale: 'pt-PT' },
  { code: 'es-ar', prefix: 'es-ar/', locale: 'es-AR' },
];

for (const ed of editions) {
  const homePath = path.join(publicDir, ed.prefix, 'index.html');
  const notFoundPath = path.join(publicDir, ed.prefix, '404.html');

  if (!fs.existsSync(homePath)) {
    fail(`Missing edition home: ${path.relative(rootDir, homePath)}`);
  } else {
    const content = fs.readFileSync(homePath, 'utf8');
    const langRegex = new RegExp(`<html[^>]*\\blang=["']?${ed.locale}["']?[\\s>]`, 'i');
    if (!langRegex.test(content)) {
      fail(`Edition home ${ed.code} does not declare locale "${ed.locale}" in <html lang="...">: ${path.relative(rootDir, homePath)}`);
    }
  }

  if (!fs.existsSync(notFoundPath)) {
    fail(`Missing edition 404: ${path.relative(rootDir, notFoundPath)}`);
  } else {
    const content = fs.readFileSync(notFoundPath, 'utf8');
    const langRegex = new RegExp(`<html[^>]*\\blang=["']?${ed.locale}["']?[\\s>]`, 'i');
    if (!langRegex.test(content)) {
      fail(`Edition 404 ${ed.code} does not declare locale "${ed.locale}" in <html lang="...">: ${path.relative(rootDir, notFoundPath)}`);
    }
    const expectedLink = ed.prefix ? `/${ed.prefix}` : '/';
    if (!content.includes(`href="${expectedLink}"`) && !content.includes(`href=${expectedLink}`)) {
      fail(`Edition 404 ${ed.code} does not link to edition home "${expectedLink}": ${path.relative(rootDir, notFoundPath)}`);
    }
  }
}

// Check B: Absence of forbidden outputs
const forbiddenPaths = [
  'public/en/index.html',
  'public/tags',
  'public/categories',
  'public/index.xml',
  'public/blog',
  'public/authors',
  'public/elements',
  'public/styleguide',
];

for (const fp of forbiddenPaths) {
  const full = path.join(rootDir, fp);
  if (fs.existsSync(full)) {
    fail(`Forbidden output exists: ${fp}`);
  }
}

// Check for markdown files or icon-font/search/preloader assets in public
function scanPublicDir(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanPublicDir(full);
    } else {
      if (entry.endsWith('.md')) {
        fail(`Markdown file leaked into build output: ${path.relative(rootDir, full)}`);
      }
      const lower = entry.toLowerCase();
      if (lower.includes('fontawesome') || lower.includes('font-awesome') || lower.endsWith('.woff') || lower.endsWith('.woff2')) {
        fail(`Icon-font asset leaked into output: ${path.relative(rootDir, full)}`);
      }
      if (lower.includes('search.json') || lower.includes('search.js')) {
        fail(`Search asset leaked into output: ${path.relative(rootDir, full)}`);
      }
      if (lower.includes('preloader')) {
        fail(`Preloader asset leaked into output: ${path.relative(rootDir, full)}`);
      }
    }
  }
}
scanPublicDir(publicDir);

// Check C: i18n key parity across base tables
const baseFiles = ['i18n/en.yaml', 'i18n/pt.yaml', 'i18n/es.yaml'];
const baseKeyMaps = {};
for (const bf of baseFiles) {
  baseKeyMaps[bf] = parseYamlKeys(path.join(rootDir, bf));
}

const allBaseKeys = new Set();
for (const bf of baseFiles) {
  for (const k of baseKeyMaps[bf]) {
    allBaseKeys.add(k);
  }
}

for (const bf of baseFiles) {
  const currentKeys = baseKeyMaps[bf];
  for (const k of allBaseKeys) {
    if (!currentKeys.has(k)) {
      fail(`i18n parity error: key "${k}" is missing in base table ${bf}`);
    }
  }
}

// Check D: WCAG contrast of token pairs from data/theme.json
const themeJsonPath = path.join(rootDir, 'data', 'theme.json');
if (!fs.existsSync(themeJsonPath)) {
  fail('data/theme.json does not exist');
} else {
  try {
    const theme = JSON.parse(fs.readFileSync(themeJsonPath, 'utf8'));
    const modes = [
      { name: 'default', conf: theme.colors.default },
      { name: 'darkmode', conf: theme.colors.darkmode },
    ];

    for (const { name, conf } of modes) {
      const tc = conf.theme_color;
      const txt = conf.text_color;

      const pairs = [
        { name: 'text / body', fg: txt.text, bg: tc.body, min: 4.5 },
        { name: 'text_light / body', fg: txt.text_light, bg: tc.body, min: 4.5 },
        { name: 'primary / body', fg: tc.primary, bg: tc.body, min: 3.0 },
        { name: 'live / surface', fg: tc.live, bg: tc.surface, min: 4.5 },
      ];

      for (const pair of pairs) {
        const ratio = contrastRatio(pair.fg, pair.bg);
        if (ratio < pair.min) {
          fail(`WCAG contrast failure in ${name}: ${pair.name} (${pair.fg} on ${pair.bg}) ratio is ${ratio.toFixed(2)}:1 (minimum ${pair.min}:1)`);
        }
      }
    }
  } catch (err) {
    fail(`Failed to parse/validate data/theme.json: ${err.message}`);
  }
}

// Check E: Absence of tracking scripts
const headAnalyticsHook = path.join(rootDir, 'layouts', '_partials', 'hooks', 'head-analytics.html');
if (!fs.existsSync(headAnalyticsHook)) {
  function checkNoTracking(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        checkNoTracking(full);
      } else if (entry.endsWith('.html')) {
        const html = fs.readFileSync(full, 'utf8');
        const forbiddenPatterns = [
          { pattern: /gtag\(/, desc: 'gtag(' },
          { pattern: /googletagmanager\.com\/gtm\.js/, desc: 'googletagmanager.com/gtm.js' },
          { pattern: /adsbygoogle/, desc: 'adsbygoogle' },
          { pattern: /cookie-box/, desc: 'cookie-box' },
          { pattern: /pagead2\.googlesyndication\.com/, desc: 'pagead2.googlesyndication.com' },
        ];
        for (const fp of forbiddenPatterns) {
          if (fp.pattern.test(html)) {
            fail(`Tracking/ad artifact "${fp.desc}" found in ${path.relative(rootDir, full)} while head-analytics hook is absent`);
          }
        }
      }
    }
  }
  checkNoTracking(publicDir);
}

// Check F: Gzip and JavaScript budgets
const homeHtmlPath = path.join(publicDir, 'index.html');
if (fs.existsSync(homeHtmlPath)) {
  const homeHtml = fs.readFileSync(homeHtmlPath);
  const homeGzipSize = zlib.gzipSync(homeHtml).length;

  const htmlStr = homeHtml.toString('utf8');
  let totalLinkedGzip = homeGzipSize;
  let totalFirstPartyJsSize = 0;

  // Find stylesheets
  const cssMatches = htmlStr.match(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']?([^"'>\s]+)["']?/gi) || [];
  for (const m of cssMatches) {
    const srcMatch = m.match(/href=["']?([^"'>\s]+)["']?/i);
    if (srcMatch && srcMatch[1].startsWith('/')) {
      const assetPath = path.join(publicDir, srcMatch[1]);
      if (fs.existsSync(assetPath)) {
        const assetBuf = fs.readFileSync(assetPath);
        totalLinkedGzip += zlib.gzipSync(assetBuf).length;
      }
    }
  }

  // Find scripts
  const jsMatches = htmlStr.match(/<script[^>]+src=["']?([^"'>\s]+)["']?/gi) || [];
  for (const m of jsMatches) {
    const srcMatch = m.match(/src=["']?([^"'>\s]+)["']?/i);
    if (srcMatch && srcMatch[1].startsWith('/')) {
      const assetPath = path.join(publicDir, srcMatch[1]);
      if (fs.existsSync(assetPath)) {
        const assetBuf = fs.readFileSync(assetPath);
        totalLinkedGzip += zlib.gzipSync(assetBuf).length;
        totalFirstPartyJsSize += assetBuf.length;
      }
    }
  }

  if (totalLinkedGzip > 100 * 1024) {
    fail(`Page weight budget exceeded: Home HTML + linked CSS/JS is ${(totalLinkedGzip / 1024).toFixed(1)} KB (budget: 100 KB)`);
  }

  if (totalFirstPartyJsSize > 10 * 1024) {
    fail(`JavaScript budget exceeded: First-party JS is ${(totalFirstPartyJsSize / 1024).toFixed(1)} KB (budget: 10 KB)`);
  }
}

// Check G: Tool version pins and unused deploy configs
const netlifyTomlPath = path.join(rootDir, 'netlify.toml');
const dockerfilePath = path.join(rootDir, '.devcontainer', 'Dockerfile');
const packageJsonPath = path.join(rootDir, 'package.json');

if (fs.existsSync(netlifyTomlPath) && fs.existsSync(dockerfilePath)) {
  const netlifyContent = fs.readFileSync(netlifyTomlPath, 'utf8');
  const dockerContent = fs.readFileSync(dockerfilePath, 'utf8');

  const netlifyHugo = netlifyContent.match(/\bHUGO_VERSION\s*=\s*["']?([^"'\s]+)["']?/);
  const netlifyGo = netlifyContent.match(/\bGO_VERSION\s*=\s*["']?([^"'\s]+)["']?/);

  const dockerHugo = dockerContent.match(/ARG\s+HUGO_VERSION\s*=\s*([^\s]+)/);
  const dockerGo = dockerContent.match(/ARG\s+GO_VERSION\s*=\s*([^\s]+)/);

  if (netlifyHugo && dockerHugo && netlifyHugo[1] !== dockerHugo[1]) {
    fail(`Version mismatch: HUGO_VERSION in netlify.toml (${netlifyHugo[1]}) does not match Dockerfile (${dockerHugo[1]})`);
  }

  if (netlifyGo && dockerGo && netlifyGo[1] !== dockerGo[1]) {
    fail(`Version mismatch: GO_VERSION in netlify.toml (${netlifyGo[1]}) does not match Dockerfile (${dockerGo[1]})`);
  }
}

if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!pkg.packageManager || !pkg.packageManager.startsWith('pnpm@')) {
    fail(`packageManager in package.json must start with "pnpm@": found "${pkg.packageManager}"`);
  }
}

const unusedConfigs = [
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'vercel.json',
  'vercel-build.sh',
  'amplify.yml',
  '.gitlab-ci.yml',
  '.sitepins',
];

for (const cfg of unusedConfigs) {
  if (fs.existsSync(path.join(rootDir, cfg))) {
    fail(`Unused deployment/lock file must not exist: ${cfg}`);
  }
}

// Check H: Vendored directories unchanged
try {
  const gitStatus = execSync('git status --porcelain themes _vendor', { cwd: rootDir, encoding: 'utf8' }).trim();
  if (gitStatus) {
    const lines = gitStatus.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Allow only generated-theme.css
      if (!trimmed.endsWith('generated-theme.css')) {
        fail(`Vendored directory contains modified files: ${trimmed}`);
      }
    }
  }
} catch (err) {
  fail(`Failed to verify git status for themes and _vendor: ${err.message}`);
}

reportResults();

function reportResults() {
  if (failures.length > 0) {
    console.error('\n❌ Site check failed with the following errors:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All site checks passed successfully!');
    process.exit(0);
  }
}
