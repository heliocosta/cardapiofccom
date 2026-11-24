# Brief: broadcaster-directory

## Problem
Searchers and AI answer engines already rank CardápioFC for broadcaster and channel discovery queries — notably `"cardápiofc faq included broadcasters and services"` (187 impressions at avg pos 1.0–3.3, 0 clicks; `/en/faq/` 3,912 imp, `/pt/perguntas-frequentes/` 2,242 imp), `"ge tv cardápiofc what is it globo"` (19 imp, pos 2.58), `"brazil football tv channel"` (38 imp, 4 clicks, pos 9.42), and specific broadcaster/channel queries (`espn`, `sportv`, club TVs) — yet the redesigned site has no "Included Broadcasters & Services" directory on `/faq/`, no `/channels/` directory hub, and no country-scoped broadcaster pages explaining networks such as GE TV, Globo, SporTV, CazéTV, Sky Sports, or BBC.

## Current State
- `channels/<CC>.json` is already loaded into `dataset.channels` during the Hugo build (`{ id, name, type ("tv"|"streaming"|"free_tv"), logo, url }` plus match mappings). Live production feeds currently provide 180 country-scoped channels across 5 populated regional editions (`pt-br`: 36 incl. `Ge TV`, `en-gb`: 51, `en-ie`: 44, `pt-pt`: 23, `es-ar`: 26; `en-us`, `zh-cn`, and `ja` currently have 0 live channels, and the local sample dataset contains only `AR`, `BR`, `GB`, `IE`, and `PT`).
- Live channel feeds lack editorial descriptions/FAQs and contain occasional placeholder or CTA artifacts (`canal-a-confirmar`, `nao-confirmado`, trailing spaces, `(Watch it live)`, `(Ver ao vivo)`, `(Ver en vivo)`).
- `/faq/` (`layouts/faq/list.html`) hardcodes 11 generic Q&As separately from `layouts/_partials/seo/jsonld.html` (which loops `seq 1 11` over `i18n`) and has no broadcasters directory.
- Built `public/` currently contains 17,104 files (`fileBudget: 18000` in `data/cfc/settings.yaml`, Cloudflare free hard cap `20,000`, with `static/og/` alone accounting for 1,702 files).

## Desired Outcome
- Every edition has an enriched `/faq/` featuring an **"Included Broadcasters & Services"** directory (grouped by Free TV / Pay TV / Streaming on regional editions; grouped by country on Global `/`) plus a synced `FAQPage` JSON-LD Q&A via a shared partial (`cfcpage/faq-page-items.html`).
- Every edition has a `/channels/` hub page (Global `/` groups by country and links to regional broadcaster pages; regional editions list their country's broadcasters by type and handle empty feeds like `en-us`/`zh-cn`/`ja` gracefully).
- Every regional edition generates country-scoped broadcaster detail pages at `/{ed}/channels/{slug}/` (0 child pages on Global `/`) listing upcoming matches on that channel, channel type/metadata, official platform / app CTA, and optional curated editorial descriptions & FAQs from `data/cfc/broadcasters.yaml`.
- Placeholder entries (`canal-a-confirmar`, `nao-confirmado`) are filtered out and display names are normalized without modifying Retool or Data Contract v1.
- All existing build, SEO, and site verification gates (`check-seo-social.mjs`, `check-site.mjs`, `check-data-pages.mjs`, file budget) pass with valid JSON-LD, clean canonicals/hreflang, and ~189–210 net new HTML files (zero new OG PNGs).

## Approach
**Approach 1 — Hugo Content Adapter (`content/en/channels/_content.gotmpl`) + Repo YAML Overlay (`data/cfc/broadcasters.yaml`)**.

A shared adapter-safe partial (`cfcdata/broadcasters.html`) merges `dataset.channels` for the edition's country with `data/cfc/broadcasters.yaml` (flagship editorial blurbs & FAQs, persistent evergreen channels that survive quiet fixture weeks, display-name normalization, and placeholder denylist) and feeds `/channels/`, `/{ed}/channels/{slug}/`, `/faq/`, `budget.html`, and `seo-social`.

Chosen over hybrid Markdown leaf bundles (avoids dual-source slug drift) and curated-allowlist-only pages (captures newly launched broadcasters like `Ge TV` automatically on day 1 while staying well within the file budget).

## Scope
- **In**:
  - `data/cfc/broadcasters.yaml` overlay schema & initial curated entries for flagship broadcasters across BR/UK/IE/PT/AR (incl. GE TV / Globo, SporTV, Premiere, CazéTV, ESPN, Disney+, Max, Prime Video, Sky Sports, BBC, ITV, DAZN, Sport TV) + placeholder denylist + display-name cleanup rules.
  - Adapter-safe `layouts/_partials/cfcdata/broadcasters.html` (handles missing `US`/`CN`/`JP` channel files silently; never touches `site.Home`).
  - `content/en/channels/_index.md` (`sites.matrix.languages: ["**"]`) and `content/en/channels/_content.gotmpl` (`.EnableAllLanguages`, country-scoped pages on regional editions only, 0 child pages on Global `/`, country-scoped `translationKey`).
  - Templates `layouts/channels/list.html` and `layouts/channels/page.html` using dedicated `cfc-broadcaster-*` CSS classes (never `cfc-channel-badge`, which `check-data-pages.mjs` Check 6d forbids outside match pages) and explicit numeric `width`/`height` on all `<img>` tags (`check-site.mjs`).
  - Shared `layouts/_partials/cfcpage/faq-page-items.html` unifying `layouts/faq/list.html` and `layouts/_partials/seo/jsonld.html`, plus the visible "Included Broadcasters & Services" directory section on `/faq/`.
  - Seam wiring: `cfcdata/url.html` (`channel`, `channels`), `cfcdata/page-entity.html`, `cfc/edition-switcher.html` (fallback to `/{ed}/channels/` on channel detail pages), `seo/context.html`, `seo/hreflang.html` & `layouts/sitemap.xml` (skip cross-country `hreflang` on `kind == "channel"`, preserve 9-edition reciprocal `hreflang` + `x-default` on `/channels/`), `seo/opengraph.html`, `seo/jsonld.html` & `seo/jsonld-breadcrumb.html` (`BroadcastService`, `CollectionPage`/`ItemList`, `BreadcrumbList`, `FAQPage`), `budget.html` awareness, i18n keys across all 7 base `i18n/*.yaml` files, `scripts/check-seo-social.mjs`, `scripts/indexnow.mjs`, and exact `/channels` + `/channels/` geo-route in `cloudflare/redirect-rules.json` (NOT `starts_with` `/channels/`).
- **Out**:
  - Changes to Retool workflows or Data Contract v1 (`channels/<CC>.json` stays untouched).
  - Per-channel OG PNG generation in `scripts/generate_og_images.py` (reuse `static/og/editions/og-{ed}.png`).
  - Mobile app deep-link routes (`apple-app-site-association`, `assetlinks.json` — web-only routes).
  - Cross-border editorial guides (EN/ES "Watch Football in Brazil", Brasileirão abroad, VOD/replays), off-season league/team persistence, or new language/country editions (`es-es`, `fr`).
  - Direct-implementation quick SEO wins tracked separately on the roadmap (legacy FAQ/About 301s in `layouts/home.redirects` and PT-BR `guia de jogos` copy tuning in `i18n/pt.yaml`).

## Boundary Candidates
- Broadcaster data resolution & normalization (`data/cfc/broadcasters.yaml` + `cfcdata/broadcasters.html`).
- Channel hub & country-scoped detail page generation (`content/en/channels/`, `layouts/channels/`).
- Unified FAQ content + "Included Broadcasters & Services" section (`cfcpage/faq-page-items.html`, `layouts/faq/list.html`).
- SEO/Schema/hreflang isolation, IndexNow, edge geo-routing for `/channels/`, and automated verification checks.

## Out of Boundary
- Retool/Firebase export pipeline and Data Contract v1 schema changes.
- Legacy 301 redirects in `layouts/home.redirects` and PT-BR homepage/matches copy tuning (handled directly outside this spec).
- Match-page channel badge rendering (`cfc-channel-badge` / Req 5.6 of `data-pages`).
- Mobile app navigation/deep links and `static/og/` image generation.

## Upstream / Downstream
- **Upstream**: `site-foundation` (9-edition registry, base shells, i18n parity, design tokens), `data-pages` (`dataset.channels`, `cfcdata/url.html`, `cfcdata/page-entity.html`, `cfcdata/budget.html`, `cfcpage/match-days.html`), `seo-social` (`head-seo`, `seo/context`, `seo/hreflang`, `seo/jsonld*`, `sitemap.xml`, `check-seo-social.mjs`), `edge-delivery` (`cloudflare/redirect-rules.json`, file-count cap).
- **Downstream**: Future web search integration (`app-deeplinks` search index could optionally include channels), future cross-border editorial guides and league TV-rights summaries linking directly into `/{ed}/channels/{slug}/`.

## Existing Spec Touchpoints
- **Extends**: None required as formal spec rewrites (Phase-1 specs are complete); integrates via their documented seams.
- **Adjacent**: `data-pages` (preserve raw `dataset.channels` contract and `check-data-pages.mjs` Check 6d), `seo-social` (preserve `check-seo-social.mjs` reciprocal `hreflang` + `x-default` guarantees and `FAQPage` 1:1 parity), `edge-delivery` (exact `/channels/` geo-route only; stay under 20k Cloudflare file cap).

## Constraints
- Hugo 0.169.0 extended; new template system (`layouts/_partials/`); never edit `themes/hugoplate/*` or `_vendor/*`.
- **Adapter safety**: `_content.gotmpl` and any partial it calls MUST NOT invoke `edition/current.html` or `edition/all.html` (which call `site.Home`); read `site.Params.edition` and `site.Language.Lang` directly.
- **Cross-country `hreflang` isolation**: Channel detail pages MUST set country-scoped `"translationKey"` (e.g. `channel-{cc}-{slug}`) and be excluded from cross-edition `hreflang` in `seo/hreflang.html` and `layouts/sitemap.xml` so shared slugs (`espn`, `apple-tv`, `disney-premium`, etc.) do not emit broken alternates missing `x-default`.
- **File budget**: `public/` is currently 17,104 files vs `fileBudget: 18000` (Cloudflare cap 20,000); reuse edition OG PNGs (0 new OG files) and keep channel pages strictly country-scoped (~189–210 files).
- **Verification rules**: Never use `cfc-channel-badge` outside match pages (`check-data-pages.mjs` Check 6d); explicit numeric `width`/`height` on every `<img>` inside `cfc-*` (`check-site.mjs`); maintain strict key parity across all 7 base i18n files (`en`, `pt`, `pt-pt`, `es`, `es-ar`, `zh-cn`, `ja`); preserve `budget.html` log/formula compatibility with `test-cfc-dataset-budget.mjs`.
- 100% official licensed broadcasters only; zero ads.
