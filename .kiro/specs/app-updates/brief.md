# Brief: app-updates

## Problem
Cardápio FC mobile app users, visitors arriving from store or in-app links, and search engines have no dedicated web page showing what changed in the latest iOS and Android releases. Keeping a changelog updated manually across 9 regional site editions is tedious and easy to forget whenever new versions ship on the Apple App Store or Google Play Store.

## Current State
- The site runs on Hugo `0.169.0` extended (`themes/hugoplate`, `project-setup` mode, Tailwind CSS v4, zero-radius `.cfc-*` design system) with 9 regional editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`) and 7 parity-checked base `i18n/*.yaml` files.
- App identifiers and store badge partials already exist in the repo: Apple App Store ID `6745226833` (bundle `br.com.cardapiofutebol`) and Google Play package `br.com.cardapiofutebol`.
- There is no `/updates/` page, no structured release-history dataset in `data/cfc/`, and no daily Antigravity automation checking the app stores.

## Desired Outcome
- A public, SEO-indexed `/updates/` page exists across all 9 editions (`/{ed}/updates/`, Global at `/updates/`), linked in the site **footer** (`[[footer]]`) and explicitly **excluded from the main header menu** (`[[main]]`).
- The page displays a **Latest version summary** (iOS & Android) plus a **chronological changelog history** accumulating detected releases over time, grouping matching iOS/Android releases by version or release-date window with clear platform badges, formatted release notes localized per edition (falling back to English when a store locale is unavailable), and UTM-attributed store download CTAs.
- A daily local **Antigravity scheduled automation** (running at `9:00 AM Europe/London`) checks both app stores with zero secrets, cleanly formats and merges any newly detected release into `data/cfc/app_updates.json`, verifies `pnpm build` and site checks, and — when the git working tree is clean — commits only `data/cfc/app_updates.json` and pushes to `main` (triggering `.github/workflows/deploy.yml` to Cloudflare).

## Approach
**Approach 1 — Git-Tracked Changelog (`data/cfc/app_updates.json`) + Zero-Dep Node Fetcher + Daily Local Antigravity Automation**:
- **Hugo page**: Single multilingual section `content/en/updates/_index.md` using `sites.matrix.languages: ["**"]` with custom template `layouts/updates/list.html` reading `hugo.Data.cfc.app_updates`, reusing existing `.cfc-*` components, `cfc/page-hero.html`, `cfc/breadcrumb.html`, `cfc/store-badges.html`, and `cfc/app-links.html`.
- **Store extractor (`scripts/fetch-app-updates.mjs`)**: Zero-dependency Node 24 ESM script using native `fetch` (preferred over minimally maintained `google-play-scraper`) to query Apple's public iTunes Lookup API (active storefronts `us`, `gb`, `ie`, `br`, `pt`, `ar`, spaced ~500 ms apart) and parse Google Play's public listing `AF_initDataCallback` `ds:5` payload (`en`, `pt_BR`, `pt_PT`, `es_AR`). Live verification confirmed:
  - Google Play returns `version: null` for AAB listings (`br.com.cardapiofutebol`), while `updatedEpoch` and `whatsNew` resolve -> `version` is optional/nullable for Android; deduplicate Android entries by `(releaseDate, normalizedNotes)`.
  - `cn` and `jp` storefronts return empty on both stores -> query active storefronts and automatically fall back `zh-cn`, `ja`, and any missing/empty locale to `en` (`us`).
  - Fail-safe merge: preserve existing `data/cfc/app_updates.json` on HTTP/parse/empty errors; never write `fetchedAt`-only diffs.
- **Antigravity scheduled automation**: Configured under `~/.gemini/config/sidecars/<sidecar-id>/sidecar.json` (`"builtin": "schedule"`, `CRON_TZ=Europe/London 0 9 * * *`, `"restart_policy": "always"`), with narrowly scoped `agent_permissions` verified via a live test run (and left paused for the user to enable in the Automations dashboard). Runs on **This Computer** (Antigravity's scheduled sidecars are local desktop automations), and remains future-proof if cloud automations launch later because the fetcher script and data schema live in the repository.

## Scope
- **In**:
  - Multilingual `/updates/` page across all 9 editions (`content/en/updates/_index.md`, `layouts/updates/list.html`, scoped CSS in `assets/css/cfc/`).
  - Footer-only menu entry in `config/_default/menus.toml` (`[[footer]]`, `identifier = "updates"`, `weight = 8`) and complete 7-file i18n parity (`en.yaml`, `pt.yaml`, `pt-pt.yaml`, `es.yaml`, `es-ar.yaml`, `zh-cn.yaml`, `ja.yaml`).
  - SEO/OG/hreflang/BreadcrumbList JSON-LD/sitemap integration (plus optional `"updates"` registration in `scripts/indexnow.mjs` `HUB_SEGMENTS` and `scripts/check-seo-social.mjs` `bucket()`).
  - `data/cfc/app_updates.json` schema definition and initial seed from live Apple App Store & Google Play data.
  - Zero-dep `scripts/fetch-app-updates.mjs` extractor + merge/deduplication logic + fixture-based unit tests (`scripts/test-app-updates.mjs`).
  - Local Antigravity scheduled automation (`CRON_TZ=Europe/London 0 9 * * *`) with git clean-tree guard, build verification, single-file commit & push to `main`, and permission-verifying test run.
- **Out**:
  - Adding `/updates/` to the main header menu (`[[main]]`).
  - GitHub Actions store-checking cron workflow.
  - Developer API credentials/secrets (App Store Connect API key, Google Play Developer API service account).
  - Adding `/updates/` to `apple-app-site-association` or `assetlinks.json` (stays a web page, not an in-app deep link).
  - RSS/Atom feeds, email/push notifications, or geo-redirect rules in `cloudflare/redirect-rules.json` (behaves like `/about/` and `/faq/`).

## Boundary Candidates
- **Data contract & store extraction seam**: `data/cfc/app_updates.json` schema + `scripts/fetch-app-updates.mjs` + unit tests (pure Node, testable offline with fixtures).
- **Hugo presentation & SEO seam**: `content/en/updates/_index.md`, `layouts/updates/list.html`, `.cfc-updates-*` styles, `config/_default/menus.toml` (`[[footer]]`), and 7-file `i18n/*.yaml` keys.
- **Local Antigravity automation seam**: `~/.gemini/config/sidecars/<sidecar-id>/sidecar.json` prompt, schedule (`CRON_TZ=Europe/London 0 9 * * *`), clean-tree git workflow, and verified `agent_permissions`.

## Out of Boundary
- Modifying `themes/hugoplate/*` or `_vendor/*`.
- Modifying `data/cfc/settings.yaml` `fixedPerEdition` (asserted as `5` by `scripts/test-cfc-settings.mjs`).
- Modifying `.github/workflows/deploy.yml` (pushing a new commit to `main` triggers existing deploy automatically).
- Mobile app changes or Retool export pipeline changes.

## Upstream / Downstream
- **Upstream**: `site-foundation` (9-edition registry, 7-table i18n parity, `.cfc-*` sharp-corner design system, footer menu), `app-deeplinks` (app IDs `6745226833` / `br.com.cardapiofutebol`, `cfc/app-links.html`, `cfc/store-badges.html`), `seo-social` (`seo/context.html`, `seo/hreflang.html`, `seo/jsonld-breadcrumb.html`, `seo/og-image.html`, `sitemap.xml`, `indexnow.mjs`), `edge-delivery` (`deploy.yml` push-to-`main` Cloudflare deployment).
- **Downstream**: Future in-app "What's New" web links pointing to `https://cardapiofc.com/updates/` (or edition equivalents); potential migration of the automation to cloud if Antigravity adds cloud-hosted scheduled automations.

## Existing Spec Touchpoints
- **Extends**: None — integrates cleanly via documented Phase-1 seams without modifying prior specs.
- **Adjacent**:
  - `app-deeplinks`: Reuses store link/badge partials; explicitly keeps `/updates/` out of AASA and `assetlinks.json`.
  - `seo-social`: Follows `seo_updates_title` / `seo_updates_desc` / `updates` i18n conventions and avoids daily-changing timestamps in `<main>` so `scripts/indexnow.mjs` `fingerprintHtml` does not churn on unchanged runs.
  - `edge-delivery`: Relies on existing `push` to `main` trigger in `.github/workflows/deploy.yml`; adds only 9 HTML files against the 18,000-file budget.

## Constraints
- Hugo `0.169.0` extended exact pin; new template system (`layouts/_partials/`, root `layouts/` overrides only); never edit `themes/hugoplate/*` or `_vendor/*`.
- Tailwind v4 CSS-first with zero-radius sharp-corner design tokens (`assets/css/cfc/`); zero runtime JS framework; stay within existing page/JS budgets.
- Data file MUST use underscore naming (`data/cfc/app_updates.json`) for safe Hugo Go-template dot-access (`hugo.Data.cfc.app_updates`).
- Zero new secrets and zero new npm runtime/dev dependencies (use Node 24 native `fetch`).
- Strict 100% i18n key parity across all 7 base `i18n/*.yaml` tables (`pnpm check`).
- No `fetchedAt`-only commits and no daily-changing timestamp inside `<main>` (prevents unnecessary deploys and IndexNow spam).
- Antigravity automation must never auto-enable itself in `config.json`, must abort safely if `git status --porcelain` is dirty, and must stage only `data/cfc/app_updates.json`.
