# Research & Discovery Log: app-updates

## Summary
Light integration discovery and live-endpoint verification were conducted for `app-updates` against the existing Hugo `0.169.0` extended codebase, public Apple App Store / Google Play Store endpoints, and Antigravity automation documentation.

## Live Store & Codebase Findings

### 1. App Store Identifiers & Existing Repo Seams
- **iOS**: App Store numeric ID `6745226833`, bundle ID `br.com.cardapiofutebol` (`static/.well-known/apple-app-site-association`, `layouts/_partials/hooks/head-app.html`).
- **Android**: Package ID `br.com.cardapiofutebol` (`static/.well-known/assetlinks.json`).
- **Reusable Partials**:
  - `layouts/_partials/cfc/app-links.html`: generates localized UTM-tagged iOS and Android store URLs.
  - `layouts/_partials/cfc/store-badges.html`: renders App Store + Google Play badges with `data-cfc-event="store_click"`.
  - `layouts/_partials/cfc/app-download.html`, `layouts/_partials/cfc/page-hero.html`, `layouts/_partials/cfc/breadcrumb.html`, `layouts/_partials/cfc/empty-state.html`, `layouts/_partials/cfc/icon.html` (`apple`, `google-play`, `calendar`, etc.).

### 2. Live Apple iTunes Lookup API Probe (2026-11-24)
- Endpoint: `https://itunes.apple.com/lookup?id=6745226833&country=<cc>`
- **Active storefronts**: `us`, `gb`, `ie`, `br`, `pt`, `ar` all returned `resultCount: 1` with `version: "1.60.0"`, `currentVersionReleaseDate: "2026-11-17T22:15:18Z"`, and localized `releaseNotes` (EN, PT, ES).
- **Unsupported storefronts**: `cn` and `jp` returned `resultCount: 0`.
- **Rate limits & caching**: Apple enforces ~20 req/min per IP and Akamai CDN caching can lag 24–48h. Pacing storefront requests by ~500 ms and treating `resultCount: 0` as non-fatal avoids rate-limit throttling and data loss.

### 3. Live Google Play Public Listing Probe (2026-11-24)
- Endpoint: `https://play.google.com/store/apps/details?id=br.com.cardapiofutebol&hl=<hl>&gl=<gl>`
- Payload: Embedded `AF_initDataCallback({key: 'ds:5', ... data: [...], sideChannel: {}})` JSON array inside HTML (~1.17 MB).
- **Empirically verified fields** under `data[1][2]`:
  - `app[140][0][0][0]` (`version`): **`null`** on live AAB listing (no semver string in `ds:5` because Google Play omits web version strings for AABs).
  - `app[144][1][1]` (`whatsNew`): resolved cleanly (`"Correções e melhorias"`). Note: Play may serve default app language text even on `hl=en&gl=US` if store listing lacks separate English What's New text.
  - `app[145][0][0]` (localized date text, e.g. `"Nov 17, 2026"`) and `app[145][0][1][0]` (`updatedEpoch`: `1794899049`): resolved cleanly for `US`, `GB`, `BR`, `PT`, `AR`.
  - `gl=CN` and `gl=JP` returned `{}` (not distributed).
- **Implication**: Android entries MUST accept `version: null` and deduplicate by `(releaseDate, normalizedNotes)`.

### 4. Build-vs-Adopt Evaluation (`fetch` vs `google-play-scraper`)
- `google-play-scraper` (v10.1.4, MIT) is minimally maintained (author no longer actively uses it) and parses the exact same `AF_initDataCallback` `ds:5` array.
- **Decision**: Build a zero-dependency Node 24 ESM fetcher (`scripts/fetch-app-updates.mjs`) using built-in `fetch` + a defensive `ds:5` parser. Keeps `package.json` and `pnpm-lock.yaml` free of unmaintained third-party dependencies.

### 5. Repo Guardrails & SEO / Indexing Seams
- **Hugo data naming**: Hyphenated `data/cfc/app-updates.json` causes a Go template parse error with dot-access (`hugo.Data.cfc.app-updates`). Must use underscore **`data/cfc/app_updates.json`** (`hugo.Data.cfc.app_updates`).
- **i18n parity (`scripts/check-site.mjs`)**: Check C enforces 100% key parity across 7 base YAML files: `en.yaml`, `pt.yaml`, `pt-pt.yaml`, `es.yaml`, `es-ar.yaml`, `zh-cn.yaml`, `ja.yaml` (`pt-br.yaml` symlinks/mounts `pt.yaml`).
- **SEO & Breadcrumbs (`layouts/_partials/seo/context.html`, `jsonld-breadcrumb.html`)**: Setting section `updates` with `sites.matrix.languages: ["**"]` in `content/en/updates/_index.md` automatically wires `seo_updates_title`, `seo_updates_desc`, `i18n "updates"`, reciprocal `hreflang` + `x-default`, `sitemap.xml`, and edition OG images (`static/og/editions/og-<ed>.png`).
- **IndexNow (`scripts/indexnow.mjs`)**: `fingerprintHtml` hashes `<main>`. Embedding a daily-changing `fetchedAt` check date in `<main>` would trigger needless IndexNow submissions across all 9 editions; `data/cfc/app_updates.json` must omit `fetchedAt` and templates must render only release dates. Registering `"updates"` in `HUB_SEGMENTS` gives it hub priority (`0`) when real releases ship.
- **File budget (`data/cfc/settings.yaml`, `scripts/test-cfc-settings.mjs`)**: `test-cfc-settings.mjs` asserts `fixedPerEdition === 5`. Do NOT change `fixedPerEdition`; +9 HTML files against `fileBudget: 18000` passes cleanly.
- **Zero-radius CSS (`assets/css/custom.css`)**: All `.cfc-*` components use `border-radius: 0` and `.dark` mode class support.

### 6. Antigravity Scheduled Automation Platform Findings
- Official Antigravity documentation (`antigravity.google/docs/sidecars`, `antigravity.google/docs/commands/automation`, `antigravity.google/docs/remote-agents`, and recent changelog) confirms:
  - Remote Agents run cloud conversations, whereas scheduled automations (`"builtin": "schedule"` in `~/.gemini/config/sidecars/<id>/sidecar.json`) run locally on **"This Computer"**.
  - Host timezone detected via `/etc/localtime`: `Europe/London` (`CRON_TZ=Europe/London 0 9 * * *`).
  - Automations must remain paused (`config.json` not modified by agent) until the user enables them in the Automations dashboard, and scoped `agent_permissions` should be verified via a dry-run.

## Consulted Skills
- `hugo-template-guidance` (`references/adding-new-pages.md`, `references/page-configuration.md`, `references/i18n-guidance.md`)
- `automation`, `antigravity-guide`, `kiro-discovery`, `kiro-spec-requirements`, `kiro-spec-design`, `kiro-spec-tasks`
