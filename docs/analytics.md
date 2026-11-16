# Analytics and consent

Measurement is GA4 (consent-gated) plus optional Cloudflare Web Analytics (cookieless). The site contains **no ads**; `google_adsense` and `google_tag_manager` must stay empty.

## Settings (`config/_default/params.toml`)

| Key | Meaning |
|---|---|
| `[analytics] ga4_id` | GA4 measurement ID, same for all editions (`G-667SFTMKPH`). Empty disables GA4 (build warning). |
| `cf_web_analytics` | `embedded` (beacon with `cf_beacon_token`), `zone` (Cloudflare injects automatically) or `off`. Never use `embedded` and automatic injection together. |
| `[analytics.consent] region` | Countries (ISO) where consent defaults to denied: EEA, UK, CH. |
| `timezones` | Device time-zone prefixes that also show the banner (covers VPN/mislocated visitors). |
| `outside_region_default` | `granted` or `denied` outside the region. Currently `granted`. |
| `policy_version` | Bump to ask everybody again. Choices expire after `retention_days` (180). |
| `[analytics.privacy] controller, contact_email` | Required for production builds; shown on the privacy pages. |

Build validation errors are prefixed `analytics-consent:`.

## Behaviour

- A synchronous inline script (first in `<head>`) sets Google Consent Mode v2 defaults before any tag. Advertising signals are always denied; `Sec-GPC` is honoured.
- The banner shows only when the edition country is in `region` or the device time zone matches, and no valid choice is stored. Reject and Accept have equal weight.
- GA4 loads only after `load` and only when analytics is granted. Withdrawal deletes `_ga*` cookies.
- In non-production builds nothing is sent; actions are logged as `[cfc-analytics]` in the console.
- Choice is stored in `localStorage["cfc_consent"]` (no identifier).

## Events

Defined in `data/analytics/events.yaml` (the contract for other features): `match_open`, `channel_click`, `edition_switch`, `app_open`, `store_click`, `share`, `search`, `geo_landing`. Markup uses `data-cfc-event="<name>"` plus `data-cfc-*` attributes; other code calls `cfcq.push([name, params])` (works before the runtime loads). Every event carries `edition` and `page_type`.

Geo redirects append `?cfc_geo=<COUNTRY>`; the runtime strips it and sends `geo_landing`. `?edition=` on Global marks `edition_source=manual`.

## GA4 setup

Register these as event-scoped custom dimensions: `edition`, `page_type`, `edition_source`, `match_slug`, `channel_id`, `store`, `placement`, `method`, `geo_country`. Turn off Enhanced Measurement "site search" (search is sent as an explicit event).

## CSP origins (edge-delivery)

script: `www.googletagmanager.com`, `static.cloudflareinsights.com`, inline; connect: `*.google-analytics.com`, `*.analytics.google.com`, `www.googletagmanager.com`, `cloudflareinsights.com`; img: `*.google-analytics.com`.

## Checks and fixture

- `pnpm check:analytics` (after `pnpm build`): consent script first in head, no GTM/AdSense/cookie-box strings, GA4 ID matches config, no `ads.txt`, six privacy pages, cookie control and privacy link on every page, JS ≤ 6 KB gzip, fixture absent.
- Dev fixture: `/analytics-fixture/demo/` (excluded from production via `ignoreFiles`).

## Decisions

- **Privacy policy text:** the current drafts in `content/<edition>/privacy.md` are the official texts for now (decided 2026-11-16). A legal review is still recommended, especially for UK, Ireland and Portugal (GDPR).
- **Outside-region default:** `granted` for now, including Brazil and Argentina (LGPD, Ley 25.326 not yet reviewed). To require consent everywhere, set `outside_region_default = "denied"` in `config/_default/params.toml`.

## Open decisions

1. Cloudflare Web Analytics mode and token (currently `off`).
2. No Google Tag Manager container is delivered.
