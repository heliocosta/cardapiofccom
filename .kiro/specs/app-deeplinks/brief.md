# Brief: app-deeplinks

## Problem
Links shared from the mobile app must open in the app when it's installed, and show a useful web page otherwise. Today `/match/{slug}/lineup`, `/league/{id}`, `/search`, `/favorites`, `/favourites`, `/settings`, `/reminder` and `/my_agenda` all return 404 on the web. The live `apple-app-site-association` file only lists the `.dev` bundle (`G3QW878YXD.br.com.cardapiofutebol.dev`), and the search index is 18.5 MB.

## Current State
- Live AASA file: `/*` for the dev appID only. The user-supplied AASA lists `/`, `/match/*`, `/favorites`, `/settings`, `/reminder`, `/search`, `/team/*`, `/league/*`.
- assetlinks.json: `br.com.cardapiofutebol`, with a SHA-256 fingerprint (live).
- iOS app id 6745226833 (`apple-itunes-app` meta, `cardapiofc://home`). Android package `br.com.cardapiofutebol`.
- The live site has `app-banner.js` and `app-link-store-fallback.js`.

## Desired Outcome
- `/search` works on the web for every edition (`/pt-br/search` …). It uses a small per-edition index (names, slugs and ids only, lazy-loaded, well under 1 MB) with no framework.
- `/favourites`, `/my_agenda`, `/settings`: localised app landing pages that explain the feature, try the app scheme or universal link, and fall back to the App Store or Play Store with UTM tags. `/favorites` redirects to `/favourites`. Decide whether `/reminder` gets the same treatment.
- `static/.well-known/apple-app-site-association` (modern `components` format, prod and dev appIDs) and `assetlinks.json`, covering unprefixed and edition-prefixed paths (`/*/match/*` etc.), served with `application/json`.
- A localised smart app banner (iOS meta + a lightweight Android banner) on entity pages, with a deep-link argument pointing at the current entity.

## App deep-link facts (confirmed by user)
- **Universal-link routes:** `/`, `/match/{slug}`, `/match/{slug}/lineup?l={base64}`, `/team/{teamId}`, `/league/{leagueId}`, `/favourites`, `/my_agenda`, `/reminder` (legacy alias of My Agenda), `/search`, `/search?q={query}` (URL-encoded, e.g. `São Paulo`), `/settings`.
- **Custom schemes:**
  - `cardapiofc://` handles home, `match/{slug}`, `match/{slug}/lineup`, `team/{id}`, `league/{id}`, `favourites`, `my_agenda`.
  - `cfc://` handles `search[?q=]`, `settings`, `my_agenda`, `reminder`.
  - Store fallbacks must build the right scheme per route.
- **Web behaviour:**
  - `/search?q=` pre-fills and runs the web search.
  - `/reminder` and `/favorites` redirect to `/my_agenda` and `/favourites` (edge-delivery implements this; this spec defines it).
- **Android:** App Links with `autoVerify` for `https://cardapiofc.com`. assetlinks must list the release fingerprints.
- **App UTM:** the app tracks `campaign`/`medium` on deep link open (`NavigationEvents.DeeplinkOpened`). Web store links and banners should pass utm parameters that reach the app.

## Approach
Hugo static pages per edition, generated from site-foundation layouts. The search index is a custom output format built from data-pages entities. The well-known files are static, and their headers are set in edge-delivery.

## Scope
- **In**: search page and index, app landing pages, store fallback logic, app banner, AASA/assetlinks content, `/favorites` alias definition.
- **Out**: app-side changes (adding prefixed paths/`my_agenda` to the app's entitlements is noted as a requirement for the user), HTTP header config (edge-delivery), entity pages (data-pages).

## Boundary Candidates
- Search (index output format and client)
- App landing pages and store fallback
- Association files and app banner

## Out of Boundary
- Mobile app code and entitlements
- Hosting headers and redirects implementation

## Upstream / Downstream
- **Upstream**: site-foundation, data-pages (URLs and entities)
- **Downstream**: edge-delivery (headers, redirect for `/favorites`), analytics-consent (app-open/store-click events)

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: data-pages, edge-delivery, analytics-consent

## Constraints
- Must not change the app's URL structure.
- Confirm the prod iOS appID (team ID + bundle id) and the Android release SHA-256 fingerprints.
- Minimal JS. No 18 MB indexes.
