# Brief: seo-social

## Problem
Search and AI engines, and social/WhatsApp previews, are the main way people find the site. On the live site:
- JSON-LD is double-encoded as a string, so Google likely can't parse it.
- There's no SportsEvent or FAQPage markup.
- Meta descriptions are the same on every page.
- Duplicate URL families are each self-canonical.
- hreflang is inconsistent.
- The SearchAction target leads to a 404.

## Current State
- The basic-seo module (vendored) emits OG/Twitter and hreflang using `.Lang` (`en-gb`). x-default points at the current page.
- `baseof.html` hard-codes the WebPage itemtype. There's no structured data for matches.
- OG images on the live site are large per-match JPGs (3667×1925, about 120 KB).

## Desired Outcome
- Root-level partial overrides, with no vendored edits:
  - **Match**: `SportsEvent` with `homeTeam`, `awayTeam`, `startDate` (timezone-aware), `location`, `eventStatus`, `organizer`/`superEvent` (league), and `BroadcastEvent` per edition channel (`publishedOn` BroadcastService).
  - **Team**: `SportsTeam`. **League**: `SportsOrganization`/`SportsEvent` series.
  - `BreadcrumbList`, `WebSite` + a working `SearchAction`, and `Organization` + `MobileApplication`.
  - All emitted as valid JSON objects.
- hreflang uses the BCP47 locale (`en-GB`, `pt-BR` …), with `x-default` pointing at the Global unprefixed URL. Every page has a self canonical, and editions are reciprocal.
- Localised, data-driven titles and descriptions (e.g. "Where to watch Fiorentina vs Juventus – Serie A, Sat 8 Nov 19:45 GMT – TV & streaming UK").
- Localised Open Graph and Twitter tags (`og:locale` plus alternates). Share images are WhatsApp-friendly (≤300 KB, 1200×630). Decide between Hugo-generated per-entity images (build-time cost) and a template image with crests.
- Multilingual sitemap index, `robots.txt`, and `llms.txt`.
- FAQ content plus `FAQPage` markup where meaningful. Answer-first copy for generative engines (GEO).

## Approach
Override the head SEO partial from root `layouts/_partials/` and add a JSON-LD partial fed by data-pages page params. Use `jsonify` with dicts so the output never gets double-encoded. Validate with the Rich Results Test or a schema validator in CI on sample pages.

## Scope
- **In**: meta, canonical, hreflang, OG/Twitter, JSON-LD, share images, sitemaps, robots, llms.txt, FAQ blocks.
- **Out**: analytics tags (analytics-consent), redirects for legacy duplicates (edge-delivery), page content/data (data-pages).

## Boundary Candidates
- Structured data (JSON-LD)
- Head meta/hreflang/canonical
- Social share images

## Out of Boundary
- Tracking scripts, redirects, data fetching

## Upstream / Downstream
- **Upstream**: site-foundation (edition registry), data-pages (entity params)
- **Downstream**: edge-delivery (canonical/redirect consistency)

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: analytics-consent (shared `<head>` — agree hook partials), edge-delivery

## Constraints
- OG image generation must not blow up the build time or the 20k file budget.
- Don't fork the vendored basic-seo module. Override it, or disable it via params.
