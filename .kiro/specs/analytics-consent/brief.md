# Brief: analytics-consent

## Problem
Analytics is key to the business, but the live setup is misconfigured:
- GA4 `G-667SFTMKPH` is loaded via gtag, and a GTM loader is fed a GA4 ID (`G-4PSY14GVNT`).
- There are no meaningful product events.

Going worldwide (UK, IE, PT) requires GDPR/UK-GDPR-compliant consent. The website will have zero advertisements (no AdSense, no ad slots, no ads.txt).

## Current State
- `params.toml`: `google_tag_manager = "G-4PSY14GVNT"` (wrong type), `google_adsense = "ca-pub-3291953828047935"`. The `services.googleAnalytics` config was lost from the broken hugo.toml.
- The hugoplate cookie-consent module is disabled. Legacy AdSense configuration must be purged/neutralized.

## Desired Outcome
- A single GA4 property, with the measurement ID confirmed by the user and set in config. No GA4-in-GTM misuse.
- Google Consent Mode v2: default `denied` for EEA/UK visitors, `granted` elsewhere where lawful. A lightweight, localised cookie banner that updates consent and stores the choice (`analytics_storage`).
- Cloudflare Web Analytics (cookieless) as an always-on baseline, enabled at the zone or via the beacon.
- Key events, with the edition as a parameter:
  - app open attempt, store click (iOS/Android)
  - channel/broadcaster click
  - search query, edition switch
  - geo-redirect landing, share click
- Zero ads across the entire website: legacy theme AdSense module disabled/neutralized, no ad slots rendered, no `ads.txt`.

## Approach
Override the hugoplate essentials and cookie-consent hooks from root `layouts/_partials/`, keeping the vendored modules intact (disable them via params where they conflict). Track events with small inline handlers using `data-*` attributes, with no extra libraries.

## Scope
- **In**: GA4 config, consent banner and Consent Mode, Cloudflare Web Analytics, event taxonomy and implementation, privacy policy text per edition.
- **Out**: SEO tags (seo-social), hosting (edge-delivery), app analytics, advertisements/AdSense (explicit non-goal; zero ads on site).

## Boundary Candidates
- Consent management
- Measurement (GA4 events, Cloudflare Web Analytics)

## Out of Boundary
- Mobile app analytics, server-side tagging, advertisements/ad networks

## Upstream / Downstream
- **Upstream**: site-foundation (head/footer hooks, i18n), app-deeplinks (store/app events)
- **Downstream**: none

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: seo-social (shared `<head>`), edge-delivery

## Constraints
- Performance first: defer and lazy-load all third-party scripts, with no measurable LCP regression.
- Confirm which GA4 ID is canonical (`G-667SFTMKPH` vs `G-4PSY14GVNT`).
