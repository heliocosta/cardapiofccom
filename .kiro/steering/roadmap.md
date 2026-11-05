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

## Specs (dependency order)
- [x] site-foundation -- Repair config, define the 6-edition registry (locale prefixes, timezones, i18n en/pt/es + regional overrides), remove demo content, establish upgrade-safe override structure and the redesigned visual system/base layouts. Dependencies: none
- [x] data-pages -- Define the pre-indexed JSON contract with the user and generate League/Team/Match/Lineup pages per edition from Firebase Storage via content adapters, with local kick-off times and country channels, using the app's URL structure. Dependencies: site-foundation
- [x] analytics-consent -- Fix GA4 (remove GA4-ID-in-GTM misconfig), Consent Mode v2 with region-aware cookie banner (UK/IE/PT), Cloudflare Web Analytics cookieless baseline, key event tracking (store/app opens, channel clicks, search); zero ads / AdSense removed. Dependencies: site-foundation
- [x] app-deeplinks -- Web search, app landing pages (/favourites, /my_agenda, /settings), /favorites alias, smart app banner and store fallbacks, apple-app-site-association + assetlinks.json covering unprefixed and edition-prefixed paths. Dependencies: site-foundation, data-pages
- [x] seo-social -- SportsEvent/BroadcastEvent, BreadcrumbList, Organization/WebSite JSON-LD (fixing double-encoding), locale hreflang with x-default to Global, canonicals, localised Open Graph/Twitter previews for WhatsApp, sitemaps, robots, llms.txt. Dependencies: site-foundation, data-pages
- [x] edge-delivery -- Free Cloudflare static hosting, CI build triggered by Retool webhook with exact Hugo pin, file-count guard, geo-routing Redirect Rules (bots excluded), legacy URL 301s (/en/matches/where_to_watch_…, /pt/jogos/…, zh/hi/fr/ar/es), headers and caching. Dependencies: site-foundation, data-pages
