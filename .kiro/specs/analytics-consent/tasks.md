# Implementation Plan

> Conventions: run every command through the project's pnpm scripts (`pnpm dev`, `pnpm build`, `pnpm check`); never edit `themes/hugoplate/` or `_vendor/`; follow the new template system paths (`layouts/_partials/`, `layouts/home.html`, top-level `layouts/baseof.html`). Component names below refer to `design.md` → Components and Interfaces.

- [ ] 1. Foundation: configuration, event vocabulary, build validation and legacy neutralisation

- [ ] 1.1 Configure analytics parameters and blank legacy tracking keys
  - Add the `[analytics]` configuration table to `config/_default/params.toml` with default settings (GA4 ID placeholder, Cloudflare Web Analytics mode and token placeholder, Consent Mode settings with 32-country EEA/UK/CH region list and European timezone prefixes, and privacy controller fields)
  - Clear legacy `google_tag_manager` and `google_adsense` keys in `config/_default/params.toml` and confirm `[cookies]` enable is false; clear `[services.googleAnalytics] ID` in `hugo.toml` with a comment redirecting to `params.analytics.ga4_id`
  - Ensure no `ads.txt` file is generated or published at root or under any edition prefix
  - Done when `config/_default/params.toml` contains the complete `[analytics]` schema with legacy keys blanked and Hugo build succeeds
  - _Requirements: 1.1, 1.4, 1.6, 2.6, 9.2, 9.3_

- [ ] 1.2 Define the product event vocabulary contract and legacy AdSense neutraliser
  - Create the machine-readable event vocabulary `data/analytics/events.yaml` establishing the taxonomy contract consumed by downstream specs and the client runtime (defining triggers, parameter constraints, enums, length limits, and derived parameters for `match_open`, `channel_click`, `edition_switch`, `app_open`, `store_click`, `share`, `search`, and `geo_landing`)
  - Create the empty override partial `layouts/_partials/adsense-script.html` to neutralize any theme or module invocations of the legacy ungated AdSense script
  - Done when `data/analytics/events.yaml` defines all eight core product events with strict parameter schemas, and the empty `adsense-script.html` partial prevents theme scripts from emitting AdSense tags
  - _Requirements: 1.6, 7.2, 7.3, 9.2_

- [ ] 1.3 Implement analytics settings, build-time validator, and page-type resolution
  - Implement returning partial `layouts/_partials/analytics/settings.html` to build the validated, cached per-edition view-model combining environment flags, identifiers, consent settings, and edition metadata
  - Implement `layouts/_partials/analytics/validate.html` enforcing fail-fast build assertions (format validation for `ga4_id`, warning if empty, rejection if GTM contains a GA4 ID or invalid ID, token format for embedded Cloudflare analytics, valid ISO country codes in consent regions, and non-empty privacy controller and email in production)
  - Implement returning partial `layouts/_partials/analytics/page-type.html` mapping page front matter, home status, and URL sections to standardized page types (`home`, `match`, `team`, `league`, `search`, `app_landing`, `legal`, `other`)
  - Done when `pnpm build` succeeds with valid settings, fails with descriptive error messages when invalid GA4 or GTM identifiers are configured, warns when GA4 is disabled, and resolves page types correctly across sections
  - _Requirements: 1.2, 1.3, 1.5, 2.6, 5.2, 11.7_

- [ ] 2. Consent Bootstrap and Default State Management

- [ ] 2.1 Implement shared consent utilities and the synchronous head bootstrap script
  - Create `assets/js/analytics/shared.js` providing constants, consent state types, stored choice serialization, expiration logic (180 days retention or policy version mismatch), and timezone prefix matching
  - Create `assets/js/analytics/head.js` to establish Google Consent Mode v2 defaults (`analytics_storage` driven by region/stored choice; `ad_storage`, `ad_user_data`, `ad_personalization` permanently denied) via `gtag` before any tag executes, honoring the 32-country consent region (denied) and outside-region fallback (granted), applying Global Privacy Control (GPC) overrides, and reading valid stored choices
  - Initialize the early API event queue (`window.cfcq`), inspect and strip the geo-landing URL marker (`cfc_geo`) via `history.replaceState` or detect manual edition choice (`edition` query param on Global), and record boot state on `window.__cfc`
  - Done when the bootstrap script executes synchronously without runtime errors, establishes Consent Mode v2 defaults with GPC handling, recovers prior consent from `localStorage`, strips the geo query parameter, and initializes `window.cfcq`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.4, 8.1, 8.2, 8.3, 8.4, 9.4_

- [ ] 2.2 Wire the head analytics hook with inline bootstrap rendering
  - Create `layouts/_partials/analytics/head-inline.html` to serialize the minimal `HeadConfig` JSON and inline the minified, IIFE-bundled bootstrap script using `js.Build`
  - Connect the hook slot `layouts/_partials/hooks/head-analytics.html` to invoke `analytics/head-inline.html` directly before any subsequent scripts
  - Done when inspecting page output confirms that the consent bootstrap `<script data-cfc-consent-defaults>` is the first script tag inside `<head>`, adds no external blocking requests, and bundles under the 1.5 KB compressed head budget
  - _Requirements: 2.1, 12.1_

- [ ] 3. Consent User Interface and State Lifecycle

- [ ] 3.1 (P) Add consent banner and cookie settings interface strings across all editions
  - Append consent management strings to base dictionary files `i18n/en.yaml`, `i18n/pt.yaml`, and `i18n/es.yaml` with identical key sets (banner title, purpose explanation, accept/reject button labels, category labels, privacy policy link, and footer cookie settings trigger)
  - Add regional override strings for UK (`en-gb.yaml`), Ireland (`en-ie.yaml`), Portugal (`pt-pt.yaml` vs `pt.yaml` wording differences like "definições" vs "configurações"), and Argentina (`es-ar.yaml` using voseo)
  - Done when all three base i18n files and regional override files pass dictionary completeness checks and expose identical consent string keys
  - _Boundary: AnalyticsI18n_
  - _Requirements: 3.5, 4.4_

- [ ] 3.2 (P) Build the accessible localised consent banner and cookie settings controls
  - Implement `layouts/_partials/analytics/banner.html` rendering a hidden semantic `<section id="cfc-consent" role="region">` fixed bottom sheet containing primary action row with "Reject all", "Accept all", and "Customise" buttons of equal visual weight, and secondary customization panel with an independent toggle for analytics
  - Ensure banner markup complies with accessibility guidelines (operable by keyboard alone, accessible names, visible focus ring from theme tokens, WCAG AA contrast, no content shift when shown, and copy sized to avoid becoming mobile LCP)
  - Implement `layouts/_partials/analytics/settings-button.html` rendering a hidden button control (`data-cfc-consent-open`) for the footer, and create `layouts/_shortcodes/cookie-settings.html` for inline policy use
  - Connect hook slots `layouts/_partials/hooks/body-start-analytics.html` (rendering the banner) and `layouts/_partials/hooks/footer-consent.html` (rendering the settings button)
  - Done when the banner markup renders as hidden at the start of `<body>`, footer contains the consent settings button, no markup appears with scripting disabled, and controls meet accessibility and design standards
  - _Boundary: ConsentBanner, SettingsControl_
  - _Requirements: 3.3, 3.4, 3.6, 3.7, 3.9, 3.10, 4.4, 11.6_

- [ ] 3.3 Implement client consent storage with retention and cookie cleanup on withdrawal
  - Create `assets/js/analytics/store.js` providing the `ConsentStore` module to persist visitor choices in `localStorage` under `cfc_consent` with version, policy version, and timestamp
  - Implement graceful error handling around `localStorage` exceptions (e.g. private browsing or quota limits) applying preferences in-memory for the current page session
  - Implement withdrawal mechanics: when analytics consent is withdrawn, signal `gtag` consent update to denied and actively delete first-party Google Analytics cookies (`_ga`, `_ga_*`, `_gid`, `_gcl_*`) across the host and domain
  - Done when choices are stored and retrieved across sessions, expired choices or version mismatches trigger re-prompting, and analytics withdrawal deletes `_ga` cookies and updates Consent Mode states immediately
  - _Boundary: ConsentStore_
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.7_

- [ ] 3.4 Implement the client banner controller for interaction handling and preference updates
  - Create `assets/js/analytics/banner.js` managing banner visibility based on `__cfc.needsBanner` (unhiding the banner only when required by region or European timezone detection and absent prior choice)
  - Attach event handlers for "Accept all" (grant analytics), "Reject all" (deny analytics), "Customise" (toggle details view), and "Save choices", closing the banner and delegating state updates to `ConsentStore`
  - Wire click handlers for all `[data-cfc-consent-open]` controls to re-open the banner with current choices reflected and manage keyboard focus (moving focus into banner and restoring it upon dismissal)
  - Ensure banner dismissal occurs only upon explicit visitor action (never on scroll, navigation, or escape key dismissal)
  - Done when the banner appears for visitors in consent regions or European timezones, records no choice on passive browsing, correctly updates Consent Mode upon choice, and re-opens accurately via footer settings controls
  - _Boundary: BannerController_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8, 4.1, 4.4_

- [ ] 4. Measurement and Tag Loading Runtime

- [ ] 4.1 Implement the consent-gated tag loader for Google Analytics
  - Create `assets/js/analytics/loaders.js` evaluating the consent decision table to determine when third-party libraries may load
  - For Google Analytics: load `gtag.js` asynchronously only after window `load` (or idle callback) when analytics consent is granted or permitted; configure initial page view with edition, page type, and edition source parameters without page reload
  - Ensure zero advertising scripts are ever requested or injected
  - In non-production environments (`env !== "production"`), replace actual third-party network script injection with structured `console.info` logging, and handle script loading errors silently without disrupting page usability
  - Done when `gtag.js` loads only under permitted consent conditions after page load, non-production environments emit debug logs, and blocked requests do not throw errors
  - _Boundary: TagLoader_
  - _Requirements: 1.7, 5.1, 5.3, 5.4, 5.5, 5.6, 9.1, 12.1_

- [ ] 4.2 (P) Implement Cloudflare Web Analytics cookieless baseline beacon
  - Create `layouts/_partials/analytics/beacon.html` rendering the Cloudflare Web Analytics beacon script (`static.cloudflareinsights.com/beacon.min.js`) with `defer` when running in production and `cf_web_analytics = "embedded"` with a configured site token
  - Ensure the beacon does not load or emit when disabled, running in development, or set to zone automatic injection mode, and verify that it sets no cookies or local storage
  - Done when production builds output the deferred Cloudflare beacon when token is provided, emit no beacon in development or when disabled, and maintain zero-cookie operation
  - _Boundary: CloudflareBeacon_
  - _Requirements: 1.7, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 4.3 (P) Implement theme AdSense neutralisation check
  - Verify that `layouts/_partials/adsense-script.html` exists and produces zero output, ensuring theme calls to the legacy AdSense partial render nothing
  - Verify that no ad slot markup, container, or script is output anywhere on the site
  - Done when build output contains zero AdSense script tags or ad containers
  - _Boundary: LegacyNeutraliser_
  - _Requirements: 1.6, 9.1, 9.2_

- [ ] 4.4 Implement product event delegation, sanitisation, and beacon transport
  - Create `assets/js/analytics/events.js` to handle trackable interactions via delegated capture `click` listeners matching `[data-cfc-event]`, mapping marker attributes against the event vocabulary (`match_open`, `channel_click`, `edition_switch`, `app_open`, `store_click`, `share`)
  - Implement query sanitization for search events (trimming, lower-casing, 100-character cap, dropping email/phone patterns) and derive helper attributes (`link_domain`, `platform`, `from_edition`, `landing_path`)
  - Drain queued events from `window.cfcq` upon initialization and send `geo_landing` events when a valid geo-marker is detected during bootstrap
  - Dispatch events using `gtag('event', name, { ...params, edition, page_type, transport_type: 'beacon' })` without delaying navigation; buffer early events (up to 20) until the analytics library is ready or drop them if analytics consent is denied
  - Done when clicks on trackable elements and queued API calls correctly format, sanitize, and dispatch GA4 events with edition and page type parameters via beacon transport without impeding user navigation
  - _Boundary: EventDispatcher_
  - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1_

- [ ] 4.5 Assemble the runtime entry bundle and connect body hooks
  - Create `assets/js/analytics/index.js` reading configuration from `#cfc-analytics-config` and `window.__cfc`, initializing `ConsentStore`, `BannerController`, `TagLoader`, and `EventDispatcher`, and revealing hidden `[data-cfc-consent-open]` controls
  - Create `layouts/_partials/analytics/runtime.html` to emit the serialized `RuntimeConfig` JSON and load the deferred, fingerprinted, and SRI-hashed runtime bundle built with `js.Build`
  - Connect the hook slot `layouts/_partials/hooks/body-end-analytics.html` to render `analytics/runtime.html` and `analytics/beacon.html` at the end of `<body>`
  - Done when the deferred runtime bundle builds cleanly via `js.Build`, loads without console errors on all pages, activates footer cookie settings controls, and coordinates banner, tag loading, and event capture
  - _Requirements: 1.7, 5.1, 5.2, 7.4_

- [ ] 5. Localised Privacy Policies and Legal Disclosures

- [ ] 5.1 Create privacy shortcodes and regional supervisory authority translations
  - Implement `layouts/_shortcodes/privacy-services.html` dynamically generating a table of active measurement services (GA4, Cloudflare Web Analytics) with their purposes, storage mechanisms, and consent dependencies, alongside data controller name, contact email, and supervisory authority
  - Add supervisory authority and privacy table strings to `i18n/*.yaml` (en: generic / local authority, en-gb: ICO, en-ie: Data Protection Commission, pt-br: ANPD, pt-pt: CNPD, es-ar: AAIP)
  - Done when the shortcode outputs only services enabled in configuration, displays correct controller information, and reflects regional data protection supervisory authorities
  - _Boundary: PrivacyShortcodes, AnalyticsI18n_
  - _Requirements: 11.2, 11.3, 11.4, 11.5_

- [ ] 5.2 Publish localised privacy policy content pages for all six editions
  - Create `content/en/privacy.md`, `content/en-gb/privacy.md`, and `content/en-ie/privacy.md` in English with front matter setting `page_type: legal` and registering `menus.footer` with weight 90, including the `{{< privacy-services >}}` and `{{< cookie-settings >}}` shortcodes
  - Create `content/pt-br/privacy.md` and `content/pt-pt/privacy.md` with regional Brazilian and European Portuguese legal wording
  - Create `content/es-ar/privacy.md` with Argentina Spanish phrasing
  - Done when `/privacy/`, `/en-gb/privacy/`, `/en-ie/privacy/`, `/pt-br/privacy/`, `/pt-pt/privacy/`, and `/es-ar/privacy/` are published with localised disclosures, active services tables, inline cookie settings triggers, and footer menu entries
  - _Boundary: PrivacyPages_
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

- [ ] 6. Tooling, Verification and Documentation

- [ ] 6.1 (P) Create development analytics test fixture
  - Create `content/en/analytics-fixture/_index.md` (configured with `build.render: never` for production) and `demo.md` utilizing layout `layouts/analytics-fixture.html`
  - Design the fixture template to render interactive test elements exercising trackable interactions (`app_open`, `store_click`, `share`) and a mock search input sending queries via `cfcq.push`
  - Done when `/analytics-fixture/demo/` is accessible in development to test event capture, and is excluded from production builds
  - _Boundary: AnalyticsFixture_
  - _Requirements: 7.1, 7.2, 7.4_

- [ ] 6.2 (P) Implement automated analytics verification script
  - Create `scripts/check-analytics.mjs` running against the Hugo `public/` directory after build using Node.js built-ins
  - Implement checks asserting: consent defaults script is the first script in `<head>`; no legacy GTM, AdSense, or cookie-box strings appear in HTML; configured GA4 ID matches runtime config; no `ads.txt` exists; all six privacy pages exist with footer links and settings controls; first-party JS gzip budget (head inline + runtime) ≤ 6 KB; zero ad slot elements exist; and dev fixture is absent
  - Done when `node scripts/check-analytics.mjs` exits with 0 on compliant builds and exits with 1 with actionable failure messages when invariants are violated
  - _Boundary: AnalyticsCheck_
  - _Requirements: 1.6, 9.1, 9.3, 9.5, 12.2, 12.4_

- [ ] 6.3 (P) Author operator setup and integration documentation
  - Create `docs/analytics.md` documenting configuration parameters, GA4 custom dimension registration (`edition`, `page_type`, `edition_source`, `match_slug`, `channel_id`, `store`, `placement`, `method`, `geo_country`), and Enhanced Measurement settings
  - Document operational choices between embedded beacon and Cloudflare zone injection, Content Security Policy origin requirements, and open legal decisions for Brazil and Argentina
  - Done when `docs/analytics.md` provides clear operational instructions and captures all open decisions
  - _Boundary: OperatorDocs_
  - _Requirements: 6.3, 6.4, 12.5_

- [ ]* 6.4 Verify end-to-end consent flows, Lighthouse performance, and layout stability
  - Test consent banner display, acceptance, rejection, and customization across regional timezones and simulated IP locations using browser DevTools
  - Measure Lighthouse performance across edition home pages to confirm ΔLCP ≤ 100 ms compared to baseline and CLS ≤ 0.1, verifying that the banner is never the LCP element
  - Done when all manual verification matrix scenarios pass, Lighthouse metrics meet performance budgets, and `pnpm check` and `node scripts/check-analytics.mjs` succeed
  - _Requirements: 3.7, 12.1, 12.2, 12.3_
