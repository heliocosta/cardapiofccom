# Research & Design Decisions: analytics-consent

## Summary
- **Feature**: `analytics-consent`
- **Discovery Scope**: Complex Integration (third-party measurement/ads services, legal constraints, static hosting, upstream template contracts). Full discovery executed.
- **Key Findings**:
  1. Google Consent Mode v2 supports region-specific defaults via the `region` parameter of `gtag('consent','default', …)`, evaluated by Google at tag runtime from the visitor's IP — the only zero-infrastructure way to make consent defaults depend on visitor location on a static site.
  2. Google's EU User Consent Policy requires a **Google-certified IAB TCF CMP** for personalised ads in the EEA, UK (since 2024-01-16) and Switzerland (since 2024-07-31). Without one, EEA/UK/CH traffic is ineligible for personalised ads and is served limited/non-personalised ads at best. A custom banner can therefore gate GA4 and AdSense loading but cannot unlock personalised AdSense in those regions.
  3. The theme's reused `essentials/script.html` (kept by site-foundation) renders the AdSense module partial `adsense-script.html` whenever `params.google_adsense` is set — i.e. AdSense is currently loaded ungated through a foundation-reused path. This feature must neutralise that path.

## Research Log

### Upstream contract (site-foundation)
- **Context**: Where may this feature render output and which data may it read?
- **Sources Consulted**: `.kiro/specs/site-foundation/design.md` (Shared Contracts, Hook Slot Contract, Tracking Data Attribute Contract, Edition Contract, CheckScript), `requirements.md` 10.5.
- **Findings**:
  - Owned slots: `head-analytics` (right after charset/viewport, before any other script), `body-start-analytics` (first element in `<body>`), `footer-consent` (footer bottom bar next to copyright), `body-end-analytics` (last element in `<body>`). Rendered by `site/hook.html` with the Page as context; must not be `partialCached` without a per-page key.
  - Edition data must be read via `partial "edition/current.html" .` (keys `code`, `country`, `isGlobal`, `locale`, …); never `site.Params.edition.*`.
  - Foundation emits `data-cfc-event` = `match_open`, `channel_click`, `edition_switch` with `data-cfc-match`, `data-cfc-channel`, `data-cfc-channel-type`, `data-cfc-target-edition`, `data-cfc-edition`; ships no listener.
  - Switcher links targeting Global append `?edition=en` (edition-choice marker).
  - Foundation keeps `params.google_tag_manager`, `params.google_adsense`, `params.cookies`, `services.googleAnalytics.ID` keys but their **values are owned by analytics-consent**.
  - Downstream may only append to `[outputs]`, `[outputFormats]`, `[security.http]`, `[caches]`, module imports; i18n keys may be appended to base files (append-only seam).
  - Foundation CheckScript check (e) asserts absence of `gtag(`, `googletagmanager.com/gtm.js`, `adsbygoogle`, `cookie-box`; its HookDispatcher notes scope this to "while no hooks exist". First-party JS budget ≤ 10 KB gzip; shell ≤ 100 KB gzip.
  - `assets/css/custom.css` imports an explicit list of component CSS files (foundation-owned) — a new CSS file from this spec would not be imported.
- **Implications**: Use the four slots; style the banner with Tailwind utilities in markup (picked up through `hugo_stats.json`) instead of a CSS file; add i18n keys to all base files to keep parity; coordinate check (e) gating with foundation rather than editing `scripts/check-site.mjs`.

### Existing theme/module code paths
- **Context**: Which vendored code can still emit tracking output?
- **Sources Consulted**: `themes/hugoplate/layouts/_partials/essentials/{head,script}.html`, `_vendor/github.com/gethugothemes/hugo-modules/{adsense,components/cookie-consent,seo-tools/google-tag-manager}`.
- **Findings**:
  - `essentials/head.html` (not used by foundation's `site/head.html`) calls `google_analytics.html`, `gtm.html`, `custom-script.html`.
  - `essentials/script.html` (reused by foundation) calls `partialCached "cookie-consent.html"` (renders only when `params.cookies.enable`) and `partialCached "adsense-script.html"` (renders whenever `params.google_adsense` is non-empty; injects `adsbygoogle.js` after first mousemove/scroll or 5 s).
  - The module `gtm.html` blindly uses `params.google_tag_manager` as a GTM container ID — the root cause of "GTM loader fed a GA4 ID".
- **Implications**: (1) blank `google_tag_manager` and `google_adsense`; (2) keep `cookies.enable = false`; (3) shadow `adsense-script.html` from root `layouts/_partials/` with an empty template so the ungated loader can never come back via configuration; (4) move the AdSense client ID to `params.analytics.adsense.client`.

### Google Consent Mode v2
- **Context**: Requirements 2.x, 4.x, 5.x.
- **Sources Consulted**: developers.google.com/tag-platform/security/guides/consent (consent default/update, `region`, `wait_for_update`, `ads_data_redaction`); Google Analytics consent-mode help pages; Simo Ahava consent-mode notes.
- **Findings**:
  - Four v2 types: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`.
  - Multiple `default` commands allowed; one with `region: [ISO 3166-2 codes]` applies to visitors in those regions, one without `region` is the fallback. Most-specific region wins.
  - Defaults must be set before `gtag.js` loads; returning visitors' choices should be applied with `consent update` as early as possible (same inline script).
  - `ads_data_redaction: true` redacts ad click identifiers while `ad_storage` is denied.
  - Basic implementation = tags not loaded until consent; Advanced = tags load with denied state and send cookieless pings.
- **Implications**: Region-specific defaults via `region` (EEA + GB + CH = 32 codes) with configurable fallback; a hybrid Basic/Advanced loading policy (see Decision "Region-aware defaults on a static site").

### AdSense and consent
- **Context**: Requirement 9.
- **Sources Consulted**: support.google.com/adsense (EU user consent policy, Google-certified CMP requirement, limited ads, Privacy & messaging); support.google.com/adsense "Ads.txt guide".
- **Findings**:
  - Certified TCF CMP required for EEA/UK/CH personalised ads; without TC string, limited ads may serve (no cookies/local storage for ad purposes).
  - AdSense Privacy & messaging offers a free certified CMP (Funding Choices) that also signals Consent Mode; it replaces the publisher banner in those regions and is delivered by Google's script.
  - `requestNonPersonalizedAds = 1` on the `adsbygoogle` array still requests non-personalised ads.
  - Responsive ad units take the size of their container when the `ins` element has explicit CSS dimensions — enables CLS-safe fixed-height slots.
  - `ads.txt` must be at the root of the domain.
- **Implications**: v1 uses the custom banner; whenever the banner context applies, AdSense is requested non-personalised. Adopting Google's certified CMP is recorded as an open decision (revenue vs. weight/UX); switching later replaces only the banner component.

### Cloudflare Web Analytics
- **Context**: Requirement 6.
- **Sources Consulted**: developers.cloudflare.com/web-analytics (manual JS snippet, automatic setup for proxied sites, privacy: no cookies/localStorage).
- **Findings**: Beacon `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"…"}'>`; automatic injection works only for proxied hostnames and can be switched to "JS snippet installation"; enabling both double-counts; no client-side state.
- **Implications**: Config value `cf_beacon_token`; embed when set (deterministic, works on Workers static assets); otherwise rely on zone automatic setup documented for edge-delivery.

### GA4 event conventions
- **Context**: Requirement 7.
- **Sources Consulted**: developers.google.com/analytics/devguides/collection/ga4/reference/events (recommended `search`, `share`, `select_content`); GA4 limits (event name ≤ 40 chars, param value ≤ 100 chars, ≤ 25 params/event); `content_group` parameter.
- **Findings**: Use recommended names where they exist (`search` with `search_term`; `share` with `method`, `content_type`, `item_id`); custom names in snake_case otherwise; custom params must be registered as custom dimensions to appear in reports; Enhanced Measurement "site search" would also fire on `/search?q=` URLs.
- **Implications**: Taxonomy keeps foundation's names 1:1, adds `app_open`, `store_click`, `share`, `search`, `geo_landing`; `edition`/`page_type` on every hit; operator doc instructs registering custom dimensions and disabling Enhanced Measurement site search to avoid duplicates.

### Hugo mechanics (verified against gohugo.io)
- **Sources Consulted**: gohugo.io/functions/js/build (options `minify`, `target`, `format`, `params` → `@params`), gohugo.io/functions/resources/fingerprint (SRI `Data.Integrity`), gohugo.io/functions/encoding/jsonify + `safeJS`, gohugo.io/templates/new-templatesystem-overview (`_partials`, `_shortcodes`), gohugo.io/content-management/static-files (static copied to publish root; per-language only with multihost), gohugo.io/content-management/menus (front matter menus), gohugo.io/functions/fmt/errorf + warnf, gohugo.io/functions/partials/includecached.
- **Implications**: Inline head code built from an asset with `js.Build` (minified) and emitted with `safeJS`; deferred runtime bundled with `js.Build` + `fingerprint`; event vocabulary passed via `params`; `static/ads.txt` lands at `/ads.txt` only; privacy pages join the `footer` menu through front matter; validation runs once per edition via `partialCached` keyed by language.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. Custom consent layer (inline defaults + deferred vanilla runtime) | Own banner, Consent Mode signals, loaders, event delegation | Smallest payload (~5 KB), localised via Hugo i18n, full control over LCP/CLS | Not TCF-certified → no personalised ads in EEA/UK/CH | **Selected** |
| B. Google Privacy & messaging CMP | Google-hosted certified TCF banner | Personalised ads in EEA/UK/CH, maintained by Google | Extra third-party script before consent UI, Google-controlled UX/strings, AdSense script must load to show banner | Open decision for operator |
| C. Commercial CMP (Cookiebot, iubenda…) | Hosted TCF CMP | Certified, multilingual | Paid tiers, heavier, violates €0 constraint | Rejected |
| D. Theme cookie-consent module | Existing hugoplate module | Already vendored | Single "I accept" button (non-compliant), needs js-cookie, no Consent Mode | Rejected (kept disabled) |

## Design Decisions

### Decision: Region-aware defaults on a static site
- **Context**: Defaults must be denied for EEA/UK visitors on every edition (2.2) while the site is plain static files on Cloudflare (no per-request code).
- **Alternatives Considered**:
  1. Edition-based defaults only — wrong for EEA visitors on Global (DE, FR, ES, IT… stay on Global after geo-routing) and for travellers.
  2. Cloudflare Worker / Snippet / response-header injection of the visitor country — Workers on every HTML request consume the free 100k/day quota; Snippets are paid; JS cannot read the document's own response headers.
  3. Consent Mode `region` parameter — Google geolocates at tag runtime.
- **Selected Approach**: Two layers. **(a) Consent defaults** use Consent Mode `region` (EEA + GB + CH denied; configurable fallback, launch `granted`) — correct per visitor IP on any edition. **(b) Banner visibility and Basic-mode gating** use a local signal: banner shown if the edition's `country` is in the consent region (auto-derived from the edition registry, so new editions need no code) **or** the device time zone is European (`Europe/*`, Atlantic EU islands, `Arctic/Longyearbyen`). In banner context nothing from Google loads until the visitor grants (Basic); outside banner context GA4 loads after page load with region defaults (Advanced, with Google's region safety net).
- **Rationale**: Zero infrastructure, documented Google behaviour, fails safe: if the local signal misses an EEA visitor, Google's region default still denies storage; if it over-includes (e.g. Russia, Turkey), the visitor merely sees a banner.
- **Trade-offs**: EEA visitors with a non-European device time zone on a non-EEA edition are measured only by cookieless pings and are never asked (compliant, small data loss).
- **Follow-up**: Verify with a VPN (DE IP, `Europe/Berlin`) on Global and with `America/Sao_Paulo` on pt-br during validation.

### Decision: Basic gating where the banner is shown, no GA load after denial
- **Context**: 5.3, 7.7, 12.1; legal debate on cookieless pings in the EEA/UK; performance first.
- **Selected Approach**: GA library loads only when (decided ∧ analytics granted) ∨ (no banner context ∧ no stored choice). After an explicit denial nothing from Google Analytics loads.
- **Rationale**: Privacy-first where consent is expected, saves ~100 KB of third-party JS for refusers, still measures the rest of the world.
- **Trade-offs**: No consent-mode modelling for EEA refusers.

### Decision: Single configuration table `params.analytics`
- **Context**: 1.1, 2.6, 11.4; foundation owns the files but delegates these values.
- **Selected Approach**: All feature settings under `[analytics]` in `config/_default/params.toml`; legacy keys blanked; `services.googleAnalytics.ID` set to `""` with a pointer comment (Hugo's embedded GA template is not used by the site).
- **Rationale**: One place for the operator; the GA4 ID is one value (open decision: `G-667SFTMKPH` vs `G-4PSY14GVNT`).

### Decision: No GTM container in v1
- **Context**: Brief allows "optionally a real GTM container"; current GTM usage is the misconfiguration.
- **Selected Approach**: Emit no GTM; validation fails if `google_tag_manager` holds a `G-` ID and warns (ignored) for any other value. Adding a real container later is a revalidation trigger.
- **Rationale**: Simplification — direct gtag covers all requirements with fewer bytes and no double-count risk.

### Decision: Event vocabulary as data, delegation listener in runtime
- **Context**: 7.1–7.3; downstream specs mark up interactions.
- **Selected Approach**: `data/analytics/events.yaml` defines events → allowed marker attributes → GA4 parameter names, enums and max lengths; passed to the runtime with `js.Build` `params`, read by the check script and rendered into operator docs. One delegated `click` listener on `document` handles every `[data-cfc-event]`; non-click events use a queue `window.cfcq.push([name, params])` defined in the head script so early reports are never lost.
- **Rationale**: Generalisation — one mechanism for all present and future events; adding an event is a data change.

### Decision: Banner markup in `body-start-analytics`, runtime in `body-end-analytics`
- **Selected Approach**: Server-rendered, `hidden`, localised banner as the first element of `<body>` (first in tab order, visually a fixed bottom sheet); config JSON + deferred runtime + Cloudflare beacon at body end.
- **Rationale**: Localisation without JS string bundles; keyboard users reach the banner first; fixed positioning causes no layout shift; hidden elements are not LCP candidates until shown, and compact text keeps the banner smaller than the page heading.

### Decision: Fixed-height ad slots consumed by page templates
- **Context**: 9.5–9.8; this spec does not own page templates.
- **Selected Approach**: `partial "ads/slot.html" (dict "page" . "placement" "<name>")` renders a labelled container with fixed per-breakpoint height and an `ins.adsbygoogle` sized to it; placements and slot IDs live in config. data-pages/app-deeplinks call it at the named placements; AdSense Auto ads stay off.
- **Trade-offs**: No ads appear until consumers place slots; unfilled slots keep their reserved space (never collapse → no CLS).

## Synthesis Outcomes
- **Generalisation**: All interactions (click and non-click, present and future) flow through one vocabulary + one dispatcher; banner and footer/privacy "cookie settings" reuse one control partial; the consent state is computed once in the head and shared with the runtime.
- **Build vs. adopt**: Adopt Google Consent Mode, gtag, AdSense, Cloudflare Web Analytics, Hugo `js.Build`/i18n/menus; build only the small banner + dispatcher (commercial/Google CMPs rejected or deferred for weight, cost and UX reasons above).
- **Simplification**: No GTM, no TCF, no CSS file, no Worker, no package.json changes, no collapsing ad logic, `body-start-analytics` used only for banner markup.

## Risks & Mitigations
- **LGPD/Argentine law with `granted` outside-region default** — config-only switch to `denied`; listed as open decision for legal review.
- **No certified CMP → reduced EEA/UK/CH ad revenue** — documented; switching to Google Privacy & messaging replaces the banner component only.
- **Foundation CheckScript (e) flags `gtag(`** — must be gated on hook absence by foundation (its own design wording); reported as integration prerequisite, not edited here.
- **Production build fails until privacy controller/contact configured (11.7)** — launch blocker surfaced in open decisions.
- **Banner becoming LCP element** — compact copy (≤ 160 characters body), font size ≤ base, verified by Lighthouse in validation.
- **CSP** — AdSense requires broad allowlists; recommend edge-delivery keep `script-src` unset or report-only; origin list provided in design.
- **UK Data (Use and Access) Act 2025** may relax analytics consent in the UK — config-only change (time-zone/edition rules, defaults) when commenced.

## References
- https://developers.google.com/tag-platform/security/guides/consent — Consent Mode setup, region-specific defaults
- https://support.google.com/analytics/answer/9976101 — Consent mode in GA4
- https://support.google.com/adsense/answer/13554116 — Google-certified CMP requirement (EEA/UK/CH)
- https://support.google.com/adsense/answer/10924669 — Limited ads
- https://support.google.com/adsense/answer/12171612 — AdSense ads.txt guide
- https://developers.cloudflare.com/web-analytics/ — Web Analytics setup and privacy
- https://developers.google.com/analytics/devguides/collection/ga4/reference/events — GA4 recommended events
- https://gohugo.io/functions/js/build/ — js.Build options and `@params`
- https://gohugo.io/templates/new-templatesystem-overview/ — `_partials`, `_shortcodes`
- https://gohugo.io/content-management/static-files/ — static files location
