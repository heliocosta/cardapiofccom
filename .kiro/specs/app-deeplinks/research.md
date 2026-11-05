# Research & Design Decisions: app-deeplinks

## Summary
- **Feature**: `app-deeplinks`
- **Discovery Scope**: Extension / Complex Integration (combining Hugo static generation, custom output formats, client search, mobile deep link schemes, store fallbacks, AASA/Asset Links association files, and hook slots).
- **Key Findings**:
  - Search Index Bloat Mitigation: The legacy search index was 18.5 MB due to serialized HTML and full entity tables. By leveraging the upstream `data-pages` contract (`cfcdata/entity-list.html`), a stripped-down per-edition index (containing only slug, name, altNames, kind, url, appPath, crest, kickoff) is ~260 KB uncompressed (< 50 KB gzip), satisfying Requirement 2.4 (< 1 MB).
  - Scheme Multiplexing: Mobile applications register two custom schemes: `cardapiofc://` (for home, match, lineup, team, league, favourites, my_agenda) and `cfc://` (for search, settings, my_agenda, reminder). The store fallback and smart app banner must resolve the exact scheme per route.
  - Universal Links Path Coverage: Both Apple App Site Association (AASA) and Android Digital Asset Links (`assetlinks.json`) must explicitly cover both unprefixed paths (Global edition) and prefixed paths (`/{edition}/*`) so shared links in any language open natively without intermediate web redirects.
  - Non-Intrusive Hook Slot Integration: Following `site-foundation`, zero foundation templates need to be modified. All UI injections are cleanly isolated in `head-app.html`, `body-start-app.html`, `footer-app.html`, and `body-end-app.html`.

## Research Log

### Topic: Hugo Custom Output Formats for Search Index
- **Context**: How should the lightweight search index be published for each edition without external scripts?
- **Sources Consulted**: Hugo official documentation on Custom Output Formats (`outputFormats`, `outputs`), Hugo Multilingual output resolution.
- **Findings**:
  - Defining `[outputFormats.SearchIndex]` with `mediaType = "application/json"`, `baseName = "search-index"`, `isPlainText = true`, and `notAlternative = true` allows Hugo to render `search-index.json`.
  - Attaching `SearchIndex` to the `section` or `page` output definition of the `/search` content page automatically produces `/search/search-index.json` for Global and `/{edition}/search/search-index.json` for regional editions.
  - Layout `layouts/search/index.json` (or `layouts/search/section.searchindex.json`) calls `partialCached "cfcdata/entity-list.html" . site.Language.Lang | jsonify`.
- **Implications**: Clean, native Hugo build step. No Node pre-build or post-build script required. Rebuilds automatically when remote data updates.

### Topic: iOS Universal Links (AASA) Modern Syntax vs Compatibility
- **Context**: The existing AASA only listed the development bundle `G3QW878YXD.br.com.cardapiofutebol.dev` and legacy paths.
- **Sources Consulted**: Apple Developer Documentation on Universal Links and `apple-app-site-association` specification (iOS 13+ `components` format).
- **Findings**:
  - Modern iOS (iOS 13+) uses `applinks.details` with an `appIDs` array and a `components` array containing path patterns, query constraints, and exclusion objects (`exclude: true`).
  - Including both production (`G3QW878YXD.br.com.cardapiofutebol`) and development (`G3QW878YXD.br.com.cardapiofutebol.dev`) in `appIDs` enables seamless testing across staging and App Store builds.
  - Path components must include edition prefixes (`/*/match/*`, `/*/team/*`, `/*/league/*`, `/*/favourites`, etc.) as well as unprefixed routes.
  - Critical exclusions: `static/` assets, images, `/assets/*`, `/*.ico`, `/*.json`, `/*.txt`, `/*.xml`, and `/.well-known/*` must be excluded so system fetches (and search index requests) are never intercepted by iOS.
- **Implications**: Static file placed at `static/.well-known/apple-app-site-association` (and symlinked or copied to root `/apple-app-site-association` if requested by edge-delivery).

### Topic: Android App Links & Digital Asset Links
- **Context**: Requirements for `assetlinks.json` with autoVerify.
- **Sources Consulted**: Android Developers Guide on Handling Android App Links and Digital Asset Links schema.
- **Findings**:
  - `assetlinks.json` must be served at `/.well-known/assetlinks.json` with `Content-Type: application/json` and HTTP 200 without redirects.
  - Must declare relation `["delegate_permission/common.handle_all_urls"]` and target with namespace `android_app`, `package_name: "br.com.cardapiofutebol"`, and an array of `sha256_cert_fingerprints`.
  - Adding both release and debug SHA-256 fingerprints allows internal QA and production devices to auto-verify App Links.
- **Implications**: File placed at `static/.well-known/assetlinks.json`.

### Topic: Client-Side Deep Link Fallback Mechanics
- **Context**: When a user clicks "Open in App" or visits an app landing page, how to invoke the app and gracefully fall back to the app store if not installed?
- **Sources Consulted**: WebKit / Chrome intent navigation behaviors, web fallback patterns.
- **Findings**:
  - Custom URI schemes (`cardapiofc://`, `cfc://`) cannot be checked synchronously in JS without triggering navigation.
  - Standard robust pattern: On user click, record timestamp, navigate via `window.location.href = schemeUrl`, and start a timer (1500ms). Listen for `visibilitychange` or `blur`. If the app opens, the browser enters background / loses focus, and the timer is cleared or ignored. If the timer fires and document is still visible, navigate to the App Store or Google Play Store URL with pre-attached UTM parameters.
  - For Android, Chrome Intent URIs (`intent://...#Intent;scheme=cardapiofc;package=br.com.cardapiofutebol;S.browser_fallback_url=...;end`) can also provide zero-delay fallback directly in the Android OS.
- **Implications**: A tiny vanilla script (`assets/js/cfc-app-runtime.js`, < 3 KB gzip) handles fallback clicks and manages banner dismissal without external dependencies.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Decision |
|--------|-------------|-----------|---------------------|----------|
| A: Client-side dynamic search with Hugo custom output format | Search index built via Hugo template (`entity-list.html`), client fetches JSON on demand | Pure Hugo static generation, zero extra server infrastructure, fast instant search | Index size must be strictly controlled | **Selected**: Meets < 1 MB constraint with ~260 KB uncompressed index |
| B: Third-party hosted search (Algolia/Pagefind) | External indexer or heavy client WASM library | Rich search features out of the box | Adds dependencies, vendor lock-in or extra WASM payload (> 300 KB), contravenes zero-cost / minimal JS constraint | **Rejected** |
| C: Serverless API search (Cloudflare Worker) | Worker queries remote D1 or Firebase on query | No index payload on client | Latency on every keystroke, introduces server-side operational runtime and billing complexity | **Rejected** |

## Design Decisions

### Decision: Separate Scheme Resolution per Route
- **Context**: The app uses `cardapiofc://` for entities and favourites, but `cfc://` for search, settings, and reminders.
- **Alternatives Considered**:
  1. Force all routes through a single synthetic scheme.
  2. Map route types strictly to the app's confirmed custom scheme contract.
- **Selected Approach**: Option 2. Define a pure route mapping utility in both Hugo templates (for meta tags / SSR links) and JS runtime (for client fallback).
- **Rationale**: The mobile app is already deployed in production; changing app-side URL schemes is explicitly out of scope.
- **Follow-up**: Verify route scheme map against all confirmed routes in brief.

### Decision: Search Index Composition and Compression
- **Context**: Legacy index was 18.5 MB. Must remain strictly under 1 MB uncompressed.
- **Selected Approach**: Rely on `cfcdata/entity-list.html` from `data-pages`. Store only essential search fields: `{k, s, n, a, u, p, c, t, l}` using short keys or clean compact JSON. AltNames contains only unique alternate translations. Matches include kickoff timestamp and league name.
- **Rationale**: 1,400 entities produce ~260 KB uncompressed JSON, gzip/brotli compresses to ~45 KB. Instant fetch on focus.

### Decision: Smart App Banner Isolation
- **Context**: iOS supports standard `<meta name="apple-itunes-app">`. Android has no native meta equivalent.
- **Selected Approach**: iOS handled strictly via `head-app.html` meta tag with dynamic `app-argument`. Android handled via a lightweight HTML banner injected via `body-start-app.html`, initially hidden, revealed via client script only on Android user agents when not previously dismissed.
- **Rationale**: Standard iOS banner uses 0 KB JS. Android banner is tiny, dismissible, and respects user preference (14 days dismissal stored in `localStorage`).

## Risks & Mitigations
- **Risk 1: Search index stale after data updates**
  - *Mitigation*: Index URL includes content hash or is served with appropriate `Cache-Control` (`must-revalidate`, max-age=300).
- **Risk 2: Universal Links breaking web navigation on mobile Safari**
  - *Mitigation*: AASA file carefully specifies `exclude: true` for all assets, APIs, and static assets, and only intercepts actual content routes.
- **Risk 3: Store fallback causing unwanted "Cannot open page" alerts on iOS**
  - *Mitigation*: Store fallback timer only activates upon explicit user click, avoiding alert suppression traps. Universal links preferred over custom schemes where supported.

## References
- [Apple Universal Links Specification](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Android App Links Documentation](https://developer.android.com/training/app-links)
- [Hugo Custom Output Formats](https://gohugo.io/templates/output-formats/)
- [Google Analytics Recommended Events (Search & Share)](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
