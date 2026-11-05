# Requirements Document: app-deeplinks

## Introduction
CardápioFC provides mobile football guide applications for iOS and Android, alongside a multi-edition static web presence. When mobile users share deep links to matches, lineups, teams, leagues, search queries, favourites, agenda, or settings, those links must open directly in the mobile application when installed, or seamlessly render a fully functional, localised web experience when viewed in a web browser.

This specification defines the web-side search interface and its per-edition lightweight index, localised app landing pages for mobile-centric features (`/favourites`, `/my_agenda`, `/settings`), store fallback mechanisms with marketing attribution, redirect specifications for legacy aliases (`/favorites`, `/reminder`), Apple App Site Association (AASA) and Android Digital Asset Links (`assetlinks.json`) association files supporting all editions, smart app banners for mobile browsers, and footer app download promotions.

## Boundary Context
- **In scope**:
  - Web search page at `/search` and per-edition prefixes (e.g. `/pt-br/search`) with URL query parameter pre-fill (`?q=`).
  - Search index output format per edition generated from site entities, optimized for low payload size (< 1 MB).
  - Client-side search interface with diacritic-insensitive matching, type filtering, keyboard navigation, and zero heavy frameworks.
  - Localised landing pages for `/favourites`, `/my_agenda`, and `/settings` explaining features and prompting app launch or store download.
  - Client-side store fallback logic for custom schemes (`cardapiofc://`, `cfc://`) and store download links with UTM attribution parameters.
  - Specification of canonical aliases and 301 redirects for `/favorites` -> `/favourites` and `/reminder` -> `/my_agenda` across all editions.
  - Generation of `.well-known/apple-app-site-association` (AASA) supporting modern `components` syntax for production and development app IDs across unprefixed and edition-prefixed paths.
  - Generation of `.well-known/assetlinks.json` supporting Android App Links with release and debug SHA-256 fingerprints across unprefixed and edition-prefixed paths.
  - Smart app banner integration on iOS via standard `<meta name="apple-itunes-app">` with route-specific deep-link arguments, and a lightweight, dismissible smart banner for Android.
  - Hook slot implementations for `head-app`, `body-start-app`, `footer-app`, and `body-end-app`.
  - Localization strings for English, Portuguese, Spanish, and regional edition overrides.
  - Event tracking markup and dispatch aligned with the shared analytics taxonomy for `app_open`, `store_click`, and `search`.
- **Out of scope**:
  - Mobile application native codebase, URL scheme handler registration, and mobile app entitlement modifications (managed by the app development repository).
  - Implementation of HTTP response headers (`Content-Type: application/json` for association files) and edge redirect rules on CDN (owned by `edge-delivery`).
  - Generation of Match, Team, and League core entity pages and data hydration (owned by `data-pages`).
  - Cookie consent banner and third-party analytics loading infrastructure (owned by `analytics-consent`).
- **Adjacent expectations**:
  - `site-foundation` provides base layouts, hook dispatcher `site/hook.html`, edition registry `edition/current.html`, i18n infrastructure, and component styling.
  - `data-pages` provides the entity collection feed (`cfcdata/entity-list.html`) listing matches, teams, and leagues for search indexing.
  - `edge-delivery` will configure Cloudflare headers for `apple-app-site-association` and `assetlinks.json` without redirect, and implement URL rewrites/redirects for `/favorites` and `/reminder`.
  - `analytics-consent` provides the global event dispatcher and consent management listening to `data-cfc-event` attributes and `cfcq` events.

## Requirements

### Requirement 1: Per-Edition Search Page and Query Handling
**Objective:** As a website visitor, I want to access a search page in my preferred edition and query matches, teams, and leagues, so that I can quickly find live football broadcasts.

#### Acceptance Criteria
1. The Search System shall render a dedicated search page at `/search` for the Global edition and at `/{edition}/search` for each regional edition (UK, Ireland, Brazil, Portugal, Argentina).
2. When a visitor arrives with a `q` URL search parameter (e.g. `/search?q=flamengo`), the Search System shall populate the search input with the decoded query text upon initial page load.
3. When a visitor arrives with a valid `q` URL search parameter containing at least 2 characters, the Search System shall automatically execute the search and present matching results immediately.
4. When a visitor clears or modifies the search input, the Search System shall update the browser URL search parameters without reloading the page.
5. If the search query yields no matching entities, the Search System shall display a localised empty-state message offering helpful query suggestions.
6. The Search System shall integrate into the primary site navigation across all editions.

### Requirement 2: Lightweight Search Index Output Format
**Objective:** As a website visitor on mobile or metered connection, I want the search index to be lightweight and fast to load, so that searching does not consume excessive bandwidth or cause lag.

#### Acceptance Criteria
1. The Build System shall generate a separate, standalone JSON search index for each configured edition.
2. The Search Index shall only include published matches, teams, and leagues available to that edition.
3. For each indexed entity, the Search Index shall store the entity kind, slug, primary name, alternative names/aliases, relative page URL, app deep-link path, crest/logo URL, and for matches, kickoff timestamp and league name.
4. The uncompressed file size of each generated search index shall remain strictly under 1 megabyte for the standard published dataset.
5. The Build System shall ensure search index files are content-fingerprinted or cache-controlled to guarantee instant freshness upon site updates.

### Requirement 3: Client-Side Search Interaction and Performance
**Objective:** As a website visitor, I want fast, responsive, and accessible search feedback as I type, so that I can discover content effortlessly on any device.

#### Acceptance Criteria
1. The Search Client shall defer fetching the search index until the user focuses the search input or a pre-filled `q` parameter is present.
2. While the search index is loading, the Search Client shall display a subtle, accessible loading indicator.
3. When the user types into the search input, the Search Client shall debounce evaluation by no more than 250 milliseconds.
4. The Search Client shall perform diacritic-insensitive and case-insensitive matching across entity names and alternative names (e.g. matching "São Paulo" with "sao paulo").
5. The Search Client shall categorize results into Leagues, Teams, and Matches, displaying entity crests or logos, names, and for matches, kickoff times and status.
6. The Search Client shall support keyboard navigation (Arrow Up, Arrow Down, Enter, Escape) across the search input and results list.
7. The total compressed JavaScript bundle for the search client shall not exceed 15 kilobytes gzip and shall operate without third-party frameworks.
8. The Search Client shall sanitize all displayed user input to prevent script injection vulnerabilities.

### Requirement 4: App Landing Pages
**Objective:** As a mobile app user opening shared links to app-only features, I want clear web landing pages explaining the feature and offering app launch or download, so that I understand how to access my content.

#### Acceptance Criteria
1. The Content System shall publish localized app landing pages at `/favourites`, `/my_agenda`, and `/settings` for the Global edition and with corresponding edition prefixes (`/{edition}/...`).
2. Each App Landing Page shall present clear, localized visual explanations and value propositions for the respective app feature (Favourites, My Agenda / Match Reminders, App Settings).
3. When viewed on an iOS or Android device, each App Landing Page shall present a prominent call-to-action button that triggers opening the native app via its registered deep-link scheme.
4. When the native app is not installed, or when viewed on a desktop browser, each App Landing Page shall present direct store download badges for Apple App Store and Google Play Store.
5. All store links shall include tracking UTM parameters identifying the source edition, page feature, and web referral medium.

### Requirement 5: App Deep-Link Fallback and Store Routing
**Objective:** As an app marketer and product owner, I want mobile links to invoke the appropriate custom URI scheme or Universal Link and fall back reliably to the respective app stores, so that user acquisition and engagement are maximized.

#### Acceptance Criteria
1. The Deep Link System shall map web routes to specific custom URL schemes:
   - `cardapiofc://` for Home, `/match/{slug}`, `/match/{slug}/lineup`, `/team/{id}`, `/league/{id}`, `/favourites`, and `/my_agenda`.
   - `cfc://` for `/search[?q={query}]`, `/settings`, `/my_agenda`, and `/reminder`.
2. When a mobile visitor clicks an "Open in App" action, the Fallback Client shall attempt to navigate to the designated custom scheme URI.
3. If navigation to the custom scheme URI fails or times out without browser blur, the Fallback Client shall redirect the visitor to the corresponding platform app store (Apple App Store for iOS, Google Play Store for Android).
4. Where store links are presented, the Store Router shall append preconfigured UTM parameters (`utm_source=cardapiofc_web`, `utm_medium=deeplink`, `utm_campaign={feature_or_entity}`) to ensure campaign attribution inside the native application.
5. While attempting app invocation, the Fallback Client shall maintain a clean user interface without persistent blocking dialogs or broken navigation states.

### Requirement 6: Legacy Route Aliases and Redirection Contracts
**Objective:** As an existing user with bookmarks or older shared links, I want `/favorites` and `/reminder` to resolve gracefully, so that I never encounter a 404 error.

#### Acceptance Criteria
1. The Specification shall define permanent 301 redirects from `/favorites` and `/{edition}/favorites` to `/favourites` and `/{edition}/favourites` respectively.
2. The Specification shall define permanent 301 redirects from `/reminder` and `/{edition}/reminder` to `/my_agenda` and `/{edition}/my_agenda` respectively.
3. When redirects occur, the Routing Contract shall mandate the preservation of all query parameters (e.g. `?utm_*` or tracking identifiers).
4. The Build System shall produce a machine-readable routing/redirect manifest consumed by the `edge-delivery` CDN deployment.

### Requirement 7: Apple App Site Association (AASA) Configuration
**Objective:** As an iOS user, I want clicking CardápioFC web links in Messages, Safari, or Mail to open the native app directly via Apple Universal Links, so that I experience seamless native navigation.

#### Acceptance Criteria
1. The Build System shall produce a valid `apple-app-site-association` file located at `static/.well-known/apple-app-site-association` (and mirrored for root access).
2. The AASA File shall declare support for both the production application ID (`G3QW878YXD.br.com.cardapiofutebol`) and the development application ID (`G3QW878YXD.br.com.cardapiofutebol.dev`).
3. The AASA File shall format route patterns using the modern Apple `components` specification.
4. The AASA File shall define Universal Link routes for root `/`, `/match/*`, `/match/*/lineup`, `/team/*`, `/league/*`, `/favourites`, `/favorites`, `/my_agenda`, `/reminder`, `/settings`, and `/search`.
5. The AASA File shall explicitly cover both unprefixed paths and edition-prefixed paths (e.g. `/pt-br/match/*`, `/en-gb/team/*`, `/es-ar/search`, etc.).
6. The AASA File shall explicitly exclude static assets, feeds, service files, and administration routes (`/assets/*`, `/css/*`, `/js/*`, `/*.ico`, `/*.json`, `/*.txt`, `/*.xml`, `/.well-known/*`) from Universal Link interception.

### Requirement 8: Android Digital Asset Links Configuration
**Objective:** As an Android user, I want clicking CardápioFC web links to launch the native Android app directly via verified App Links, so that I bypass browser selection disambiguation dialogs.

#### Acceptance Criteria
1. The Build System shall produce a valid `assetlinks.json` file located at `static/.well-known/assetlinks.json`.
2. The Asset Links File shall declare the target package name `br.com.cardapiofutebol` under namespace `android_app`.
3. The Asset Links File shall grant permission relation `delegate_permission/common.handle_all_urls`.
4. The Asset Links File shall include the official release SHA-256 certificate fingerprint(s) and development certificate fingerprint(s).
5. The Asset Links File shall be formatted as valid UTF-8 JSON ready for delivery with `Content-Type: application/json`.

### Requirement 9: Smart App Banner and Entity Deep-Link Integration
**Objective:** As a mobile visitor browsing football matches or teams, I want a non-intrusive option to open or install the mobile app with context preserved, so that I can enjoy push alerts and mobile-optimized features.

#### Acceptance Criteria
1. When rendering on iOS Safari, the System shall output the standard `<meta name="apple-itunes-app">` tag containing the official iOS App ID (`6745226833`).
2. On entity pages (Match, Lineup, Team, League) and search, the iOS Smart Banner meta tag shall supply an `app-argument` deep link corresponding to the active entity or query (e.g. `cardapiofc://match/{slug}`, `cardapiofc://team/{slug}`, `cfc://search?q={query}`).
3. On Android mobile browsers, the System shall render a lightweight, responsive smart banner prompting the user to install or open the Android application.
4. The Android Smart Banner shall preserve the active entity context when constructing the app invocation or Play Store link.
5. When a user dismisses the Android Smart Banner, the System shall remember the dismissal in client storage for at least 14 days and suppress banner display during that period.
6. The Smart Banner markup and client script shall not cause cumulative layout shift (CLS ≤ 0.05).

### Requirement 10: Hook Slot Implementation and Footer App CTAs
**Objective:** As a developer extending the site architecture, I want app deep-link integrations to inject cleanly through site-foundation hook slots without modifying shared templates, so that codebase maintenance remains upgrade-safe.

#### Acceptance Criteria
1. The Feature shall implement `layouts/_partials/hooks/head-app.html` to output iOS smart app banner metadata and store preconnect tags without altering `site/head.html`.
2. The Feature shall implement `layouts/_partials/hooks/body-start-app.html` to inject the Android smart banner markup directly below the skip link.
3. The Feature shall implement `layouts/_partials/hooks/footer-app.html` to output localized "Download on App Store" and "Get it on Google Play" badge links in the site footer.
4. The Feature shall implement `layouts/_partials/hooks/body-end-app.html` to load the deferred app banner and deep-link fallback client scripts.
5. When rendered in development or production, hook slot templates shall compile cleanly and obey site-foundation layout conventions.

### Requirement 11: Internationalization and Localization
**Objective:** As an international football fan, I want all app promotion, search, and landing page copy in my language, so that the experience feels native and welcoming.

#### Acceptance Criteria
1. All user-facing strings for search, landing pages, banners, store badges, and fallback prompts shall be stored in external i18n tables (`i18n/*.yaml`).
2. The Feature shall provide complete string translations across base tables (`en.yaml`, `pt.yaml`, `es.yaml`) and regional overrides (`en-gb.yaml`, `en-ie.yaml`, `pt-pt.yaml`, `es-ar.yaml`).
3. App Store and Google Play store badge graphics and localized badges shall match the language and cultural conventions of the active edition.
4. The Search UI shall display localized placeholder text, filter labels, count indicators, and empty state messages.

### Requirement 12: Analytics and Event Tracking Integration
**Objective:** As a product analyst, I want user interactions with search, app open attempts, and store clicks to be reliably tracked within our analytics taxonomy, so that we can evaluate user acquisition and feature adoption.

#### Acceptance Criteria
1. When a visitor triggers an app open action (via smart banner, entity button, or landing page), the System shall emit an `app_open` event with attributes `app_target` (scheme or universal_link), `placement` (smart_banner, app_landing, entity, footer), and `app_path`.
2. When a visitor clicks a store download badge, the System shall emit a `store_click` event with attributes `store` (app_store or play_store) and `placement`.
3. When a visitor submits a search query or completes a debounced search with at least 2 characters, the System shall emit a `search` event with attributes `search_term` and `results_count` at most once per distinct query per page session.
4. All tracking attributes shall strictly conform to the `data-cfc-event` contract defined in `analytics-consent`.
