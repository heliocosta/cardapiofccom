# Brief: data-pages

## Problem
The site must build interconnected League, Team, Match and Lineup pages for every edition, directly from JSON in Firebase Storage. Today pages are baked from an unknown pipeline. They show no TV channels, kick-off times are mislabelled, and there are duplicate URL families (`/match/…` vs `/en/matches/where_to_watch_…`).

## Current State
- No data layer, content adapters or entity templates exist in the repo.
- Source of truth: the Retool Postgres DB, with tables `fixtures` (incl. `team_home_lineup`, `team_away_lineup`, `channels_uuids`, `timestamp`, `round`, `status_*`), `teams`, `leagues` (localised `name_<locale>` columns, `popular`), `countries`, `channels`, `fixture_channel_country`, `country_leagues`, `venues`, `standings`. Channel coverage today: BR, IE, GB, AR, PT.
- The user will export a **small dataset covering only current leagues** to Firebase Storage, in whatever shape we define.
- Crest images are already public in Firebase Storage (`cardapiofutebol.appspot.com/o/teams%2Fcrests%2F{uuid}.webp`).

## Desired Outcome
- A documented, versioned **JSON contract**, pre-indexed for O(1) lookups:
  - `index.json` (version, generatedAt, edition list, file manifest)
  - `leagues.json`, `teams.json` (maps keyed by id, localised names per locale, crest URL)
  - `matches.json` (keyed by slug: UTC ISO kick-off, league id, home/away ids, venue, status, round)
  - `channels/{country}.json` (match slug → channel list with name/logo/type/url)
  - `lineups/{slug}.json` or embedded (only when available)
- Hugo fetches each file once per build (`resources.GetRemote` + `try`, `partialCached`, explicit `[caches.getresource]` maxAge, `[security.http]` allowlist). The build fails clearly on contract or version mismatch.
- Content adapters (`content/<edition>/…/_content.gotmpl`) generate pages per edition:
  - `/match/{slug}`, `/match/{slug}/lineup` (only when a lineup exists, otherwise a "lineup TBA" state), `/team/{id}`, `/league/{id}`
  - These are prefixed per edition (`/pt-br/match/{slug}` …); Global is unprefixed.
- Pages link to each other:
  - match ↔ teams ↔ league
  - team: upcoming and recent matches
  - league: fixtures grouped by date/round
  - home: today/upcoming matches grouped by date, in the edition's timezone
- Kick-off is rendered in the edition timezone, with the zone shown explicitly. TV/streaming channels come from the edition's country file, with a graceful "no broadcaster listed — check the app" state. Global edition channel policy is to be decided (none, or per-visitor-country client hint).
- Lightweight pages: no full-list dumps; pagination or date windows on list pages.

## Approach
Approach A (Hugo-native). Use content adapters with `.AddPage` per edition, using shared partials that receive `(edition, entity)`. Use dict lookups instead of `where` scans to keep builds near-linear. Store slugs/ids exactly as the app uses them so deep links match.

## Scope
- **In**: JSON contract doc + sample fixtures for local dev, data access partials, content adapters, templates for home/league/team/match/lineup (using site-foundation components), time-zone and channel rendering, internal linking, build-time validation, local dev mode against a sample JSON.
- **Out**: the Retool/SQL export job itself (the user implements it against the contract), JSON-LD/OG (seo-social), search index UI (app-deeplinks), redirects (edge-delivery).

## Boundary Candidates
- JSON contract and data access layer
- Page generation (content adapters, permalinks)
- Entity templates and rendering logic (time zones, channels, lineups)

## Out of Boundary
- Export pipeline from Postgres
- SEO markup, analytics, hosting

## Upstream / Downstream
- **Upstream**: site-foundation (edition registry, components, i18n/time helpers), the Retool export, Firebase Storage
- **Downstream**: seo-social (page params for JSON-LD/OG), app-deeplinks (search index, URL paths), edge-delivery (URL map for legacy redirects, file-count budget)

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: seo-social, app-deeplinks, edge-delivery

## App URL Contract (confirmed by user, from the app's DeepLinkHelper doc)
| Entity | Web URL | App URI |
|---|---|---|
| Match | `/match/{slug}` e.g. `/match/flamengo-vs-palmeiras-2026-05-10` | `cardapiofc://match/{slug}` |
| Lineup | `/match/{slug}/lineup?l={base64}` (`l` = base64 JSON custom formation, e.g. `{"formation":"4-3-3"}`) | `cardapiofc://match/{slug}/lineup?l={base64}` |
| Team | `/team/{teamId}`, where teamId is a text slug, e.g. `/team/flamengo` | `cardapiofc://team/{teamId}` |
| League | `/league/{leagueId}`, where leagueId is a text slug, e.g. `/league/brasileirao-serie-a` | `cardapiofc://league/{leagueId}` |

- The match slug format is `{home-slug}-vs-{away-slug}-{yyyy-mm-dd}`. Team and league ids are kebab-case slugs, not UUIDs. The JSON export must carry exactly these slugs (one canonical slug per entity, language-independent).
- **Lineup page:** pre-render the official lineup when one exists. The `?l=` custom formation is decoded and rendered **client-side** on the same static page (it's a query string, so no extra files). Invalid or absent `l` falls back to the official lineup, or a "build your lineup in the app" state.
- **App share texts to mirror in OG/meta** (seo-social): match "Flamengo vs Palmeiras, domingo, 10 de maio - Premiere, Globo via CardápioFC"; team "Matches for Flamengo …"; league "Matches in Brasileirão Série A …".
- **Global edition channels — default decision (user may override):** Global match pages list the channels for **every supported country, grouped by country** (static, SEO-friendly "where to watch in UK / Ireland / Brazil / Portugal / Argentina"). Regional editions show only their own country's channels, with a link to the other countries.

## Constraints
- **Postponements are out of scope (user decision).** No slug-change handling and no `previousSlugs`.
- Output must stay under the Cloudflare free cap of 20,000 files per deployment, all editions included. Estimate the file count from the export in the design phase.
- Build target is as fast as possible (<10 s ideal, >30 s acceptable).
- Firebase Storage objects must be publicly readable, or use a token in a CI secret.
