# Roadmap

## Overview
Redesign cardapiofc.com from a Brazil-only football TV guide into a worldwide, multi-edition static site that is beautiful, fast, free to host and easy to maintain. The site stays on Hugo (hugoplate theme, project-setup mode, Hugo 0.165.0 extended, Tailwind v4) and pre-renders every League, Team, Match and Lineup page from remote JSON published to Firebase Storage by a Retool workflow.

Six regional editions ship first — Global (EN, unprefixed root), UK `/en-gb/`, Ireland `/en-ie/`, Brazil `/pt-br/`, Portugal `/pt-pt/`, Argentina `/es-ar/` — each with localised UI, local kick-off time zones and country-specific TV/streaming channels. New editions must be addable by configuration + JSON only. URLs mirror the mobile app's deep-link structure so shared links open in the app or on the web; visitors on unprefixed links are geo-redirected to their edition.

## Approach Decision
- **Chosen**: Approach A — Hugo-native remote data. Hugo fetches a small, pre-indexed JSON contract from Firebase Storage via `resources.GetRemote` and generates pages with content adapters (`_content.gotmpl`). Built by GitHub Actions (or Cloudflare Workers Builds) on a deploy webhook called by Retool after JSON upload; hosted as static assets on Cloudflare (free); geo-routing via Cloudflare Redirect Rules (free, no code).
- **Why**: Fewest moving parts, documented Hugo features only (upgrade-safe), €0 hosting with unlimited static bandwidth, domain already on Cloudflare, automatic rebuild when JSON changes.
- **Rejected alternatives**:
  - B — Node pre-fetch script into `data/`: extra code to maintain; validation can live in templates/CI instead.
  - C — Keep Firebase Hosting: Spark plan 360 MB/day transfer cap; geo-routing needs Blaze + Functions.
  - Netlify: user does not want to pay; credit-limited free plan.
  - On-demand Worker rendering: moves away from Hugo, more custom code.
- **Scale decision**: Full DB is ~64k teams / 3.8k leagues / 35k future fixtures (~800k pages across 6 editions) — exceeds Cloudflare free file limit (20k files/deployment) and CI memory. The user will export a **small dataset covering only current leagues**. All entities in the export are pre-rendered. A build guard fails CI if output approaches 20k files; fallback paths documented in `edge-delivery`.

## Scope
- **In**: config repair + editions, redesign (home, league, team, match, lineup, search, app landing pages), JSON data contract, dynamic page generation, deep-link compatible URLs, AASA/assetlinks, geo-routing, legacy URL redirects, SEO/GEO (SportsEvent JSON-LD, hreflang, OG), sitemaps, analytics with consent, free hosting + automated builds.
- **Out**: advertisements/AdSense (the website will have zero ads; no ad slots and no ads.txt); changes to the mobile app; the Retool/DB export pipeline itself (user owns it, against our contract); user accounts; server-side features; editions beyond the first six (must be *possible*, not delivered); live scores in real time.

## Constraints
- Hugo 0.169.0 extended, exact pin (netlify.toml/CI). New template system: `layouts/_partials/`, `home.html`, top-level `baseof.html`.
- Tailwind v4 CSS-first via `data/theme.json` → `generated-theme.css`; no `tailwind.config.js`.
- Package manager: pnpm (pnpm-lock.yaml).
- Never edit `themes/hugoplate/*` or `_vendor/*`; override from root `layouts/`, `assets/`, `config/` so `pnpm update-theme` / `update-modules` keep working.
- €0 recurring hosting cost; performance first (minimal JS, no framework).
- Builds: target fast (<10 s ideal); user accepts >30 s. Cloudflare free: ≤20,000 files/deployment, 25 MiB/file.
- Must not change the app's URL structure: `/match/{slug}` (slug = `{home}-vs-{away}-{yyyy-mm-dd}`), `/match/{slug}/lineup?l={base64}`, `/team/{teamId}` and `/league/{leagueId}` (text slugs, e.g. `flamengo`, `brasileirao-serie-a`), `/search?q=`, `/favourites` (+ `/favorites` redirect), `/my_agenda` (+ `/reminder` alias), `/settings`. App custom schemes: `cardapiofc://`, `cfc://`.
- GDPR/UK-GDPR consent required for UK, IE, PT.
- Working-tree `hugo.toml` is currently broken (site config replaced by invalid edition tables) — must be repaired first.

## Boundary Strategy
- **Why this split**: Foundation (config/editions/design system) is the base everything renders on. Data + pages is the core domain. Deep links/app routes, SEO, delivery and analytics are independent seams consuming the page model, and can be built in parallel after the data spec defines URLs and page params.
- **Shared seams to watch**:
  - URL/permalink scheme — owned by `data-pages`; consumed by `app-deeplinks`, `seo-social`, `edge-delivery` (redirects, AASA paths).
  - Edition registry (code, locale, country, timezone, prefix, hreflang) — owned by `site-foundation`; consumed by all.
  - `<head>` partial composition — `seo-social` owns meta/JSON-LD, `analytics-consent` owns tags/consent; agree on hook partials to avoid both overriding the same file.
  - Search index format — owned by `app-deeplinks` (search route), fed by `data-pages` output formats.
  - Broadcaster/channel seam — `dataset.channels` + `data/cfc/broadcasters.yaml` overlay via adapter-safe `cfcdata/broadcasters.html`, country-scoped `translationKey`/hreflang isolation on channel detail pages, `cfc-broadcaster-*` class separation from match-only `cfc-channel-badge`, and unified `cfcpage/faq-page-items.html` keeping visible `/faq/` Q&As in 1:1 parity with `FAQPage` JSON-LD.
  - App updates seam — `data/cfc/app_updates.json` (underscore key) fed by zero-dep `scripts/fetch-app-updates.mjs` + daily local Antigravity automation (`CRON_TZ=Europe/London 0 9 * * *`), rendered on footer-only `/updates/` across 9 editions with 7-table i18n parity and stable `<main>` HTML (no daily timestamp churn for IndexNow).
  - Blog content & publishing seam — `editorial-blog` owns the `content/<ed>/blog/{slug}.md` contract across all 9 active editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`), shared `assets/images/blog/{slug}` Hugo Pipes processing (WebP hero + ≤300 KB 1200×630 JPEG OG), `BlogPosting`/`BreadcrumbList`/OG/i18n/IndexNow hooks, blog contract validator, and restored `scripts/check-file-count.mjs` (18k/20k Cloudflare guard); `blog-automation` produces compliant posts + AI editorial illustrations via a weekly Antigravity scheduled automation and gates direct `main` pushes on local `pnpm build && pnpm check && pnpm check:seo && pnpm check-file-count`.

## Phase 3 Decision — Automated Editorial Blog
- **Goal & Cadence**: Drive organic SEO/GEO traffic to increase Cardápio FC mobile app installs via 1 post/week across all 9 active editions (~520–624 files/year including shared processed images).
- **Chosen Approach (Approach A)**: Native Hugo Markdown (`content/<ed>/blog/{slug}.md` with shared ASCII slug + `translationKey`) + 1 shared AI-generated editorial illustration per post (`assets/images/blog/{slug}` via `image-generator`, Hugo Pipes WebP hero + 1200×630 JPEG q80 ≤300 KB OG) + version-controlled repo editorial playbook & topic registry + Antigravity scheduled automation (`"builtin": "schedule"`) that validates locally and pushes straight to `main` (triggering `deploy.yml` → Cloudflare + IndexNow).
- **Rejected Alternatives**:
  - Approach B (Single multi-edition YAML/JSON bundle + `_content.gotmpl`): harder to diff, lint, and manually edit long-form Markdown.
  - Approach C (Cloud GitHub Actions cron + custom Gemini API script): moves away from the user's goal of an Antigravity automation and adds custom LLM orchestration code + metered API billing.
- **Key Constraints & Risks**: 9 active editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`); keep `disableKinds = ["taxonomy", "term", "RSS"]` to protect Cloudflare's 20k static file cap; restore 0-byte `scripts/check-file-count.mjs`; Antigravity scheduled automations run locally on the host Mac (runs while asleep/closed are skipped until next slot or manual trigger); schedule away from `deploy.yml`'s `05:00 UTC` daily cron; zero ads & official-broadcasters-only policy.

## Existing Spec Updates
- None — Phase-1 specs are complete; Phase-2 specs integrate via their documented seams.

## Direct Implementation Candidates
- [x] legacy-faq-about-redirects -- Add missing explicit 301s in `layouts/home.redirects` (`/pt/perguntas-frequentes` -> `/pt-br/faq/`, `/es/faq` -> `/es-ar/faq/`, `/fr/faq` -> `/faq/`, `/zh/faq` -> `/zh-cn/faq/`, `/es/about` -> `/es-ar/about/`, `/hi/about` -> `/about/`); small static redirect fix requiring no spec.
- [x] pt-br-tv-guide-copy -- Tune PT-BR homepage and matches titles/descriptions/headings in `i18n/pt.yaml` to cover "Guia de Jogos na TV" and "Programação de Futebol na TV"; trivial localized copy update requiring no spec.

## Specs (dependency order)
- [x] site-foundation -- Repair config, define the 6-edition registry (locale prefixes, timezones, i18n en/pt/es + regional overrides), remove demo content, establish upgrade-safe override structure and the redesigned visual system/base layouts. Dependencies: none
- [x] data-pages -- Define the pre-indexed JSON contract with the user and generate League/Team/Match/Lineup pages per edition from Firebase Storage via content adapters, with local kick-off times and country channels, using the app's URL structure. Dependencies: site-foundation
- [x] analytics-consent -- Fix GA4 (remove GA4-ID-in-GTM misconfig), Consent Mode v2 with region-aware cookie banner (UK/IE/PT), Cloudflare Web Analytics cookieless baseline, key event tracking (store/app opens, channel clicks, search); zero ads / AdSense removed. Dependencies: site-foundation
- [x] app-deeplinks -- Web search, app landing pages (/favourites, /my_agenda, /settings), /favorites alias, smart app banner and store fallbacks, apple-app-site-association + assetlinks.json covering unprefixed and edition-prefixed paths. Dependencies: site-foundation, data-pages
- [x] seo-social -- SportsEvent/BroadcastEvent, BreadcrumbList, Organization/WebSite JSON-LD (fixing double-encoding), locale hreflang with x-default to Global, canonicals, localised Open Graph/Twitter previews for WhatsApp, sitemaps, robots, llms.txt. Dependencies: site-foundation, data-pages
- [x] edge-delivery -- Free Cloudflare static hosting, CI build triggered by Retool webhook with exact Hugo pin, file-count guard, geo-routing Redirect Rules (bots excluded), legacy URL 301s (/en/matches/where_to_watch_…, /pt/jogos/…, zh/hi/fr/ar/es), headers and caching. Dependencies: site-foundation, data-pages
- [x] broadcaster-directory -- Country-scoped broadcaster directory (`/channels/`, `/{ed}/channels/{slug}/`) and enriched `/faq/` "Included Broadcasters & Services" section driven by `dataset.channels` + `data/cfc/broadcasters.yaml` overlay. Dependencies: site-foundation, data-pages, seo-social
- [x] editorial-blog -- Native Markdown blog across all 9 editions (`content/<ed>/blog/{slug}.md`), custom `cfc-*` layouts, shared Hugo-processed cover/OG images, `BlogPosting`/OG/hreflang/i18n/IndexNow integration, blog validator, restored `check-file-count.mjs`, and 1 seed post. Dependencies: site-foundation, seo-social, edge-delivery, analytics-consent, broadcaster-directory
- [x] blog-automation -- Repo-versioned editorial playbook & topic registry plus weekly Antigravity scheduled automation (`"builtin": "schedule"`) that researches topics, generates a shared AI editorial illustration, adapts all 9 editions, validates locally, and pushes to `main`. Dependencies: editorial-blog, edge-delivery
- [x] app-updates -- Multilingual `/updates/` app changelog page (footer-only, all 9 editions) backed by `data/cfc/app_updates.json`, zero-dep `scripts/fetch-app-updates.mjs`, and a daily local Antigravity scheduled automation (`09:00 Europe/London`). Dependencies: site-foundation, app-deeplinks, seo-social
- [ ] app-updates -- Multilingual `/updates/` app changelog page (footer-only, all 9 editions) backed by `data/cfc/app_updates.json`, zero-dep `scripts/fetch-app-updates.mjs`, and a daily local Antigravity scheduled automation (`09:00 Europe/London`). Dependencies: site-foundation, app-deeplinks, seo-social
