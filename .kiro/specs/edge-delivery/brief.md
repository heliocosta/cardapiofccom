# Brief: edge-delivery

## Problem
The site must be hosted for free, rebuild automatically when Retool updates the JSON, route visitors to their country's edition, and keep old indexed URLs alive. Today the origin is Firebase Hosting behind Cloudflare. `netlify.toml` exists, but the user doesn't want to pay for Netlify. Thousands of legacy URLs are indexed: `/en/matches/where_to_watch_…`, `/pt/jogos/onde_assistir_…`, `/en/teams/…`, `/en/leagues/…`, and the `zh/hi/fr/ar/es` editions.

## Current State
- Domain on Cloudflare DNS. CI configs for Netlify, Vercel, Amplify and GitLab exist, with inconsistent Go versions. The root `_redirects` file isn't published.
- No deploy hook, no geo-routing, no headers config.

## Desired Outcome
- **Hosting**: free Cloudflare static hosting, Workers Static Assets (recommended over Pages for new projects), on a single project while output stays under 20,000 files.
- **Build**: GitHub Actions workflow (or Workers Builds) that installs exact Hugo 0.165.0 extended, Go, Node and pnpm. It runs `pnpm build` and deploys with wrangler.
  - Triggered by a Retool `repository_dispatch` (or deploy hook) after JSON upload, plus pushes to main and an optional scheduled safety rebuild.
  - Fails if the output reaches ~18k files (guard).
  - Documented fallback if exceeded: split per edition into separate free projects routed by path, or Workers Paid (~\$5/month, 100k files).
- **Geo-routing**: Cloudflare Single Redirect Rules (free, max 10). Unprefixed `/match/*`, `/team/*`, `/league/*`, `/search`, `/favourites`, `/my_agenda`, `/settings` and `/` go to `/{edition}/…` using `ip.src.country`:
  - GB → `en-gb`, IE → `en-ie`, BR → `pt-br`, PT → `pt-pt`, AR → `es-ar`. Other countries stay on Global.
  - Excludes `cf.client.bot`. Uses 302 status. Respects a user's manual edition choice (cookie/query) so the switcher works.
- **Legacy redirects (301)**: old language trees and long slugs map to the new structure, generated at build time (the `_redirects` file supports a limited number of static/dynamic rules, so keep the pattern count small). Unmatched legacy paths go to the edition section page.
- **Headers**: `.well-known` files served as `application/json`, cache-control for HTML vs fingerprinted assets, security headers, HSTS.
- Remove or retire the unused deploy configs (Netlify/Vercel/Amplify/GitLab) to cut maintenance.

## Approach
Static assets only, so there's no Worker script on the hot path and no per-request cost. Redirect Rules are configured at the zone level and documented as code (Terraform or a documented JSON export, kept in the repo).

## Scope
- **In**: CI workflow, hosting config (`wrangler.jsonc`), Retool trigger docs, file-count guard, geo Redirect Rules, legacy redirect map, `_headers`, cutover plan from Firebase Hosting (DNS, rollback).
- **Out**: page content, SEO tags, AASA content (app-deeplinks provides the files; this spec serves them correctly).

## Boundary Candidates
- CI/build pipeline and trigger
- Hosting and headers
- Routing (geo + legacy redirects)

## Out of Boundary
- Page templates and data contract
- Analytics configuration (beyond allowing Cloudflare Web Analytics)

## Upstream / Downstream
- **Upstream**: site-foundation (build scripts, Hugo pin), data-pages (URL map, file count), app-deeplinks (well-known files)
- **Downstream**: analytics-consent (Cloudflare Web Analytics enablement)

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: data-pages, seo-social (canonical vs redirect consistency), app-deeplinks

## Constraints
- €0 recurring cost. Cloudflare free: 20k files/deployment, 25 MiB/file, 10 Redirect Rules. `regex_replace` is paid-only.
- `cf.client.bot` covers verified bots only. Unverified crawlers may be redirected, which is acceptable because hreflang covers indexing.
- `[caches.getresource]` must not serve stale JSON if a CI cache is persisted.
- Exact Hugo pin per AGENTS.md. Move the HUGO_VERSION source of truth if `netlify.toml` is retired (update the AGENTS.md reference).
