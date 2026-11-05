# Research & Design Decisions: data-pages

## Summary
- **Feature**: `data-pages`
- **Discovery Scope**: New Feature (greenfield data layer + page generation) on top of the site-foundation contracts — full discovery.
- **Key Findings**:
  - Hugo content adapters (`_content.gotmpl`) run once per matching site; `.EnableAllLanguages` expands execution to every language, and front matter `sites.matrix` (v0.153+) lets one `_index.md` exist in every language. One adapter set under the Global content directory can therefore generate pages for all six editions with identical logical paths, which Hugo treats as translations.
  - `resources.GetRemote` errors must be caught with `try` (the `.Err` method was removed in v0.141); an HTTP 404 returns `nil`, not an error. The `getresource` file cache defaults to `maxAge = -1` (never expires), so cache freshness must be designed explicitly (cache keys derived from per-file SHA-256 published in the dataset index).
  - `partialCached` keeps one cache per site (language), so data loading/validation executes up to once per edition; remote fetches are deduplicated by the resource cache. With a small dataset this is acceptable; the network cost is paid once.
  - The Cloudflare free cap (20,000 files/deployment) is the binding constraint: two pages per match per edition dominate the count. The match publishing window is the operator's lever, and the build needs a pre-render estimate that fails early.

## Research Log

### Content adapters and multilingual generation
- **Context**: Requirement 3 (pages for every edition, translations across editions, config-only editions).
- **Sources Consulted**: https://gohugo.io/content-management/content-adapters/ (AddPage, AddResource, Site, Store, EnableAllLanguages, page map keys, page collisions), https://gohugo.io/content-management/front-matter/ (`sites` key, new in v0.153.0), https://gohugo.io/methods/site/Data/ and https://gohugo.io/functions/hugo/Data/.
- **Findings**:
  - The page map accepts any front matter field except `markup` and top-level taxonomies; `path` is required and is relative to the adapter's directory (no leading slash).
  - `kind` can be `page` or `section`; a nested page under an added section is possible by path (`<slug>/lineup`).
  - The `Site` object is not fully initialised in an adapter: methods depending on built pages (`Site.Pages`, `GetPage`, `Home`) are unavailable. `site.Language.Lang` and `hugo.Data` are available.
  - Translations-by-directory: per-language `contentDir`; adapters per directory, or one adapter with `EnableAllLanguages`.
  - Page collisions are indeterminate; `--printPathWarnings` detects them.
  - `site.Data` is deprecated since v0.156.0; use `hugo.Data`.
- **Implications**: Adapters must not call `edition/current.html` (it reads `Home.RelPermalink`); they use only `site.Language.Lang`. Localised titles are resolved from the language code. A spike task validates `EnableAllLanguages` + `sites.matrix` on Hugo 0.165.0 before the rest is built; fallback documented.

### Remote data retrieval, caching, security
- **Context**: Requirement 2 (load once, fresh data, clear failures, credentials).
- **Sources Consulted**: https://gohugo.io/functions/resources/GetRemote/ (options `key`, `headers`, `timeout` new in v0.157.0; caching; security; 404 → nil), https://gohugo.io/functions/go-template/try/, https://gohugo.io/configuration/caches/ (`getresource` default `maxAge = -1`), https://gohugo.io/configuration/security/ (default `http.urls` allows any `https://` host that does not start with a digit; methods GET/POST; `funcs.getenv` allows `^HUGO_`), https://gohugo.io/configuration/introduction/ (environment variables), https://gohugo.io/functions/crypto/SHA256/.
- **Findings**:
  - Default `security.http.urls` already admits `https://firebasestorage.googleapis.com/…`; no allowlist change is required. Media type is resolved from Content-Type/extension/content; JSON is in the default allowlist when the object is uploaded with `Content-Type: application/json`.
  - Misconfigured content types can be bypassed by unmarshalling `.Content` instead of the resource.
  - `crypto.SHA256` over `.Content` gives a hex digest suitable for integrity checks against a manifest.
  - `os.Getenv` is restricted to `^HUGO_` variables by default — sufficient for `HUGO_CFC_*` settings and the optional token.
- **Implications**: Dataset index fetched with a per-build cache key (always fresh); data files fetched with key `url + sha256` (refetched only when content changes, reused across builds and dev rebuilds). `[caches.getresource] maxAge = "720h"` appended to bound disk usage. Export must upload the index last and set `Content-Type: application/json`.

### partialCached scope and global state
- **Context**: Requirement 2.3 and build time (11.6).
- **Sources Consulted**: https://gohugo.io/functions/partials/IncludeCached/ ("Each site, such as each language, has its own cache"), https://gohugo.io/functions/hugo/Sites/ (v0.156.0).
- **Findings**: Loader/validator run once per edition (≤ 6×), fetches once per build.
- **Implications**: Validation is linear in dataset size, so 6× is negligible at ≤ 2,000 matches. No global mutable store is used (simplicity); revisit only if `--templateMetrics` shows the loader dominating.

### URL shape, permalinks and ownership
- **Context**: Requirement 3.1 and the app URL contract.
- **Sources Consulted**: https://gohugo.io/configuration/permalinks/ (map form; array form with page matchers new in v0.161.0), https://gohugo.io/content-management/urls/ (`url`/`slug` front matter).
- **Findings**: Path-derived URLs already produce `/{prefix}match/{slug}/`. A lineup at `/match/{slug}/lineup/` is obtained by making each match page a `section` and adding the lineup as a child `page`, with no `[permalinks]` or `url` overrides.
- **Implications**: data-pages does not touch `[permalinks]` (foundation-owned config, not an append seam). Hugo emits directory-style URLs with trailing slash; serving `/match/{slug}` without slash (as the app shares it) and preserving `?l=` is an edge-delivery concern (revalidation trigger recorded).

### Source database mapping
- **Context**: Requirement 1 (contract must be buildable from Postgres by Retool).
- **Sources Consulted**: brief.md and the caller's DB facts: `fixtures` (uuid, timestamp, date, league_uuid, team_home_uuid, team_away_uuid, venue_uuid, status_short/long, goals_*, round, team_home_lineup/team_away_lineup jsonb), `teams` (name_*/alias_*, logo_url), `leagues` (name_<locale>, popular), `countries`, `channels` (name, image, type, country_code, website), `fixture_channel_country`, `venues`; crest URLs `https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/teams%2Fcrests%2F{uuid}.webp?alt=media`.
- **Findings**: `status_short` follows API-Football codes (NS, TBD, 1H, HT, 2H, ET, BT, P, LIVE, INT, FT, AET, PEN, PST, CANC, ABD, SUSP, AWD, WO); lineups follow API-Football shape (formation, startXI[].player{name, number, pos, grid}, substitutes, coach). Slugs are not DB columns named in the facts; the export must produce the app's slugs.
- **Implications**: Contract carries normalised `status` (site-foundation enum) plus raw `statusShort`; a mapping table is part of the contract. Lineups are normalised (flattened player objects). Slug generation is the export's responsibility (open question: confirm the app's slug source and date basis).

### File budget
- **Context**: Requirement 11.3–11.5; roadmap scale decision.
- **Findings**: Output files per edition = match pages + lineup pages + team pages + league pages + league directory + fixed edition outputs (home, 404, manifest/llms outputs ≈ 5). Crest images are hot-linked (0 files). Static assets are a constant (≈ 150–250).
- **Implications**: With 6 editions, ~400 teams and ~25 leagues, the export can publish ≈ 1,250 matches with lineup pages for all matches, or ≈ 2,500 with lineup pages only where a lineup exists. Formula and worked example in design.md.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A1 One adapter set + EnableAllLanguages (selected) | `content/en/{match,team,league}/_content.gotmpl`, `_index.md` with `sites.matrix.languages = ["**"]` | One copy of generation logic; same logical path ⇒ translations; new edition needs no new files | Relies on v0.153+ sites matrix semantics with per-language `contentDir` | Spike task validates on 0.165.0 |
| A2 Thin per-edition adapters (fallback) | `content/<code>/{match,team,league}/_content.gotmpl` each a one-line call to a shared partial | Documented "translations by directory" pattern | 18 files; a new edition needs 3 content folders | Used only if A1 fails the spike |
| B Node pre-fetch into `data/` | Script downloads JSON before Hugo | Simple Hugo side | Extra code path; rejected in roadmap | — |
| C Permalink rewrite (`[permalinks]` array form) | Lineup pages in their own section mapped to `/match/:slug/lineup/` | Flat match pages | Edits foundation-owned config | Rejected |
| D Mount shared adapter into each contentDir | `module.mounts` with language targeting | One file | Mounts are foundation-owned, not an append seam | Rejected |

## Design Decisions

### Decision: Pre-indexed, slug-keyed, multi-file contract with manifest
- **Context**: O(1) lookups (brief), incremental caching, integrity.
- **Alternatives Considered**: 1) single `dataset.json`; 2) per-entity files (one per match); 3) multi-file by collection (selected).
- **Selected Approach**: `index.json` (manifest with sha256 + counts) + `leagues.json`, `teams.json`, `matches.json`, `lineups.json`, `channels/{CC}.json`. Collections are objects keyed by slug; leagues/teams carry ordered `matchSlugs`; `matches.json` carries `order` (all slugs by kick-off).
- **Rationale**: Few HTTP requests, partial cache reuse (channels change more often than teams), integrity per file, reverse indices computed once by the export (SQL `array_agg … order by timestamp`).
- **Trade-offs**: Export does a bit more work; Hugo validates index consistency.
- **Follow-up**: JSON Schema in `contract/cfc-data-v1.schema.json`.

### Decision: Channel files normalised per country
- **Context**: Requirement 5; channels repeat across hundreds of matches.
- **Selected Approach**: `channels/{CC}.json` = `{ channels: {id: Channel}, matches: {matchSlug: [channelId]} }`.
- **Rationale**: Small files, O(1) lookups, Global edition reads all countries listed in the index; new country = new file + edition config.

### Decision: Match pages as sections, lineup as child page
- **Context**: `/match/{slug}/lineup/` without permalink config.
- **Selected Approach**: AddPage `kind = "section"` for matches, `kind = "page"` path `<slug>/lineup` for lineups. Section indexes `/match/` and `/team/` have `build.render = "never"`, `list = "always"`.
- **Trade-offs**: Match pages appear as sections in collections (downstream sitemap must use `.Params.cfc.kind`, documented).

### Decision: Lineup pages for every match by default; client-side custom formation
- **Context**: `?l=` links must resolve for matches without an official lineup.
- **Selected Approach**: `lineupPages = "all"` default; `"available"` option halves lineup cost. Custom formation decoded by a small module script only on lineup pages; text inserted with `textContent`.
- **Follow-up**: confirm the app's `l` payload schema (open question).

### Decision: Reference time ("as of")
- **Context**: Home/team/league windows depend on "now"; sample builds must be deterministic.
- **Selected Approach**: `HUGO_CFC_NOW` if set; else sample mode → `index.generatedAt`; else build time.

### Decision: Settings in a data-pages-owned data file
- **Context**: Foundation owns `config/_default/params.toml`; only `[outputs]`, `[security.http]`, `[caches]`, module imports are append seams.
- **Selected Approach**: `data/cfc/settings.yaml` read via `hugo.Data`, with `HUGO_CFC_*` environment overrides for CI/dev.

### Generalisations (synthesis)
- One **time-window selector** (`cfcdata/window.html`) serves home, team and league lists (all are "pick slugs from a kick-off-ordered list between two instants, up to N, optional status filter").
- One **match view-model** (`cfcdata/match.html`) feeds cards, match page, lineup page and downstream contracts (Requirement 12.5 by construction).
- One **URL builder** for all kinds and editions (internal links, edition links, entity list, budget doc).

### Build vs adopt (synthesis)
- Adopt Hugo built-ins only: content adapters, `resources.GetRemote`, `try`, `transform.Unmarshal`, `crypto.SHA256`, `js.Build`, file caches. No npm runtime dependencies. One Node built-ins script (`scripts/cfc-data-index.mjs`) regenerates sample index hashes and validates a local export.
- JSON Schema (draft 2020-12) adopted as the operator-facing machine-readable contract; Hugo does not run a schema validator (no built-in) — template validation implements the subset that matters for rendering.

### Simplifications (synthesis)
- No pagination (would multiply files); fixed windows instead.
- No per-edition league filtering (possible future lever, open question).
- No global store/memoisation beyond `partialCached`.
- No new CSS files: data-pages templates use existing `cfc-*` component classes and Tailwind utilities (foundation's `custom.css` import list stays untouched).

## Risks & Mitigations
- `EnableAllLanguages` + `sites.matrix` behaviour differs on 0.165.0 → spike task first; fallback A2 is a mechanical change (same partials).
- Firebase objects uploaded with wrong Content-Type → loader unmarshals `.Content`; contract mandates `application/json`.
- Partial publication (index points to files not yet uploaded) → index uploaded last + sha256 check fails the build instead of rendering mixed data.
- File budget exceeded as leagues grow → pre-render estimate fails early with contributors; operator shortens window or sets `lineupPages: available`.
- Stale "today" between builds → edge-delivery schedules daily builds (adjacent expectation); pages show data generation time.
- App slug/date basis mismatch → contract says slugs are copied verbatim from the app's logic; open question to confirm with app code.

## References
- https://gohugo.io/content-management/content-adapters/ — AddPage, EnableAllLanguages, collisions
- https://gohugo.io/content-management/front-matter/ — `sites` matrix (v0.153.0)
- https://gohugo.io/functions/resources/GetRemote/ — options, caching, 404 semantics, security
- https://gohugo.io/functions/go-template/try/ — error handling
- https://gohugo.io/configuration/caches/ — getresource cache
- https://gohugo.io/configuration/security/ — http allowlist, getenv
- https://gohugo.io/configuration/introduction/ — HUGO_ environment variables
- https://gohugo.io/functions/partials/IncludeCached/ — per-site cache
- https://gohugo.io/functions/hugo/Data/, https://gohugo.io/functions/hugo/Sites/ — v0.156.0 APIs
- https://gohugo.io/configuration/permalinks/, https://gohugo.io/content-management/urls/ — URL rules
- https://gohugo.io/functions/crypto/SHA256/ — integrity digest
- `.kiro/specs/site-foundation/design.md` — Shared Contracts Consumed by Downstream Specs
