# CardápioFC Scale Benchmark and Full Integration Report

**Date**: November 5, 2026  
**Specification**: `.kiro/specs/data-pages/`  
**Task**: 8.3 Execute full integration build and scale benchmark  
**Runner Script**: `scripts/benchmark-data-pages.mjs` (`pnpm benchmark`)  

---

## 1. Executive Summary

A comprehensive scale benchmark and full integration verification was conducted against a synthesized dataset of **1,260 matches** distributed across **80 teams**, **4 leagues**, and **6 localized editions** (`en` Global, `en-gb` UK, `en-ie` Ireland, `pt-br` Brazil, `pt-pt` Portugal, and `es-ar` Argentina).

All critical performance criteria, file budget boundaries, downstream contract obligations, and user constraints were verified and passed with zero failures:

1. **Build Performance (Req 11.6)**: Clean production Hugo build completed in **11.43 seconds**, well below the continuous integration threshold of 30.0 seconds.
2. **File Budget Enforcement (Req 11.3 & 11.4)**:
   - Hugo reported an estimated output of **8,300 files** against the configured hard budget of **18,000 files** in the build log.
   - Actual output files generated in `public/` totaled **8,126 files** (45.1% budget utilization), strictly conforming to Requirement 11.4.
3. **Downstream Feature Contracts (Req 12.1, 12.2, 12.3, 12.5)**:
   - `cfcdata/page-entity.html` verified across match, team, league, and league directory pages.
   - `cfcdata/entity-list.html` verified across all 6 editions, returning all **1,344 entities** in strict order (leagues with popular first, teams alphabetically, matches by kickoff) with localized names and URLs.
   - `cfcdata/channels.html` verified for Global 5-country aggregation and regional single-country isolation.
4. **Lineup Isolation (USER DIRECTIVE)**:
   - Lineups were treated as strictly out of scope ($\Lambda = 0$).
   - Verified 0 lineup pages, 0 lineup scripts (`cfc-lineup.js`), and 0 lineup markup or link occurrences across all 8,082 generated HTML files.
5. **Post-Benchmark Restoration**:
   - Synthesized benchmark dataset (`assets/cfc-data/bench-1260/`) cleaned up.
   - Standard sample dataset build restored and verified via `scripts/check-data-pages.mjs` (all 125 output checks passed).

---

## 2. Test Environment

| Component | Version / Specification |
| :--- | :--- |
| **Operating System** | macOS (Darwin arm64) |
| **Node.js** | v22+ |
| **Package Manager** | `pnpm` 10.16.1 |
| **Hugo Extended** | `hugo v0.169.0+extended+withdeploy darwin/arm64` |
| **Tailwind CSS** | Tailwind CSS v4 (`@tailwindcss/cli` 4.3.0) |
| **Dataset Source** | Synthesized Data Contract v1 (`assets/cfc-data/bench-1260/`) |

---

## 3. Scale Benchmark Dataset Details

The synthetic benchmark dataset was generated using `node scripts/cfc-data-index.mjs --synthesize 1260 assets/cfc-data/bench-1260`:

- **Total Matches ($M$)**: 1,260
- **Total Teams ($T$)**: 80 (20 teams per league across 4 leagues)
- **Total Leagues ($L$)**: 4 (2 popular: Brasileirão Série A, Premier League; 2 regular: La Liga, UEFA Champions League)
- **Active Editions ($E$)**: 6 (`en`, `en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`)
- **Broadcasting Channels**: 5 regional country manifests (`GB`, `IE`, `BR`, `PT`, `AR`)
- **Data Integrity**: Verified via `node scripts/cfc-data-index.mjs --check assets/cfc-data/bench-1260` (all SHA-256 hashes, byte sizes, and foreign key references verified).

---

## 4. Benchmark Execution Results

### 4.1. File Count & Budget Audit (Requirements 11.3 & 11.4)

Hugo computes estimated files using the formula:
$$\text{Total} = E \times (M + T + L + 1 + c) + S$$

With $\Lambda = 0$ (lineups out of scope), $c = 5$ (fixed pages per edition), and $S = 200$ (static asset reserve):
$$\text{perEdition} = 1260 + 80 + 4 + 1 + 5 = 1,350$$
$$\text{Total} = 6 \times 1,350 + 200 = 8,300 \text{ files}$$

| Metric | Budget Target | Measured | Result |
| :--- | :--- | :--- | :--- |
| **Hugo Log Estimate** | $\le 18,000$ | `8300/18000` | ✅ PASS |
| **Actual `public/` Files** | $\le 18,000$ | `8,126` | ✅ PASS |
| **Netlify Cap Margin** | $< 20,000$ | 11,874 files remaining | ✅ PASS |
| **Budget Utilization** | $\le 100\%$ | 45.1% | ✅ PASS |

Build log confirmation:
```
WARN data-pages: estimated output files 8300/18000 (matches 1260, teams 80, leagues 4, editions 6)
```

### 4.2. Build Duration & Throughput (Requirement 11.6)

| Phase | Duration | Status |
| :--- | :--- | :--- |
| **Theme Generator (`themeGenerator.js`)** | 0.85s | Complete |
| **Clean Hugo Compilation (`hugo --gc --minify`)** | **11.43s** | ✅ PASS ($\le 30.0$s) |
| **Generation Throughput** | ~710 pages/second | Fast |

Hugo Site Summary from 1,260-match build:
```
           │  EN  │ EN - GB │ EN - IE │ PT - BR │ PT - PT │ ES - AR 
───────────┼──────┼─────────┼─────────┼─────────┼─────────┼─────────
 Pages     │ 1352 │    1351 │    1351 │    1351 │    1351 │    1351 
 Paginator │    0 │       0 │       0 │       0 │       0 │       0 
 Static    │    4 │       4 │       4 │       4 │       4 │       4 
 Processed │    9 │       0 │       0 │       0 │       0 │       0 
```

### 4.3. Downstream Feature Contracts (Requirement 12)

Contract behavior was verified via probe execution against the synthesized dataset across all 6 editions:

#### A. `cfcdata/page-entity.html` (Req 12.1)
- **Match Pages**: Returns structured `PageEntity` containing `kind: "match"`, current edition code, `generatedAt`, full `MatchVM` (slug, title, home, away, league, kickoff, venue, status), and `channels` array.
- **Team Pages**: Returns `PageEntity` with `kind: "team"`, full `TeamVM` (slug, localized name, crest, country).
- **League Pages**: Returns `PageEntity` with `kind: "league"`, full `LeagueVM` (slug, localized name, logo, popular flag).
- **Leagues Directory**: Returns `PageEntity` with `kind: "leagues"` containing all 4 leagues.
- **Non-CFC Pages**: Cleanly returns `nil`.

#### B. `cfcdata/entity-list.html` (Req 12.2)
- Evaluated for each edition; returns **1,344 entities** ($4 + 80 + 1260$):
  - **4 Leagues**: Listed first, prioritized by `popular: true` (Brasileirão, Premier League), followed by alphabetical order.
  - **80 Teams**: Listed second, sorted alphabetically by localized name.
  - **1,260 Matches**: Listed third, sorted chronologically by kickoff timestamp.
- Each entry contains `{ kind, slug, name, altNames, url, appPath }` (and kickoff/league for matches).
- All URLs strictly localized to the requesting edition (`/match/...` for Global, `/en-gb/match/...` for UK, `/pt-br/match/...` for Brazil, etc.).

#### C. `cfcdata/channels.html` (Req 12.3 & 12.5)
- **Global Edition (`en`)**: Returns 5 grouped country manifests (`GB`, `IE`, `BR`, `PT`, `AR`).
- **Regional Editions (`en-gb`, `pt-br`, etc.)**: Returns only the country manifest applicable to the edition.
- **Contract Consistency (Req 12.5)**: The channels array exposed on `cfcdata/page-entity.html` matches `cfcdata/channels.html` byte-for-byte.

### 4.4. Lineup Isolation Audit (USER DIRECTIVE)

- Total files inspected: 8,126
- HTML documents inspected: 8,082
- Lineup URLs generated (`/lineup/`): **0**
- Lineup JS files generated (`cfc-lineup*.js`): **0**
- Lineup references or markup in HTML: **0**

---

## 5. Verification Checklist & Results

| Check Item | Requirement | Target | Observed | Status |
| :--- | :--- | :--- | :--- | :--- |
| **File estimate in log** | Req 11.3 | Printed in build log | `8300/18000` | ✅ PASS |
| **Estimated count budget** | Req 11.4 | $\le 18,000$ files | 8,300 files | ✅ PASS |
| **Actual output file count** | Req 11.4 | $\le 18,000$ files | 8,126 files | ✅ PASS |
| **CI build duration** | Req 11.6 | $\le 30.0$ seconds | 11.43 seconds | ✅ PASS |
| **PageEntity contract** | Req 12.1 | Valid on all entity pages | Valid (all 6 editions) | ✅ PASS |
| **EntityList contract** | Req 12.2 | 1,344 entities, sorted | 1,344 entities, sorted | ✅ PASS |
| **Channels contract** | Req 12.3 | Regional & Global groups | Valid (all 6 editions) | ✅ PASS |
| **Contract consistency** | Req 12.5 | Matches rendered values | Identical | ✅ PASS |
| **Lineup exclusion** | User Directive | $\Lambda = 0$, no files/markup | 0 files, 0 references | ✅ PASS |
| **Sample dataset restore** | System Integrity | 100% check pass | 125 / 125 checks pass | ✅ PASS |

---

## 6. How to Run the Benchmark

The benchmark runner is registered in `package.json`:

```bash
pnpm benchmark
```

Or via direct invocation:

```bash
node scripts/benchmark-data-pages.mjs
```
