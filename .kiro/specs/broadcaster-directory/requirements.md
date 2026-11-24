# Requirements Document

## Project Description (Input)
**Who**: Football fans and AI/search crawlers visiting cardapiofc.com across all 9 editions (Global, UK, Ireland, Brazil, Portugal, Argentina, USA, China, Japan) searching for official football TV channels, streaming platforms, and included broadcasters (e.g. GE TV / Globo, SporTV, CazéTV, Sky Sports, BBC, ESPN), plus the site operator maintaining the static site within Cloudflare's 20,000-file free tier.

**Current situation**: `channels/<CC>.json` is already loaded into `dataset.channels` during the Hugo build (180 country-scoped channels across 5 populated regional editions; 0 currently in `en-us`, `zh-cn`, `ja`), but live feeds lack editorial descriptions/FAQs and contain occasional placeholder/CTA artifacts (`canal-a-confirmar`, `nao-confirmado`, trailing spaces, `(Watch it live)` / `(Ver ao vivo)` suffixes). `/faq/` hardcodes 11 generic Q&As separately from `seo/jsonld.html` with no "Included Broadcasters & Services" directory, and no `/channels/` hub or country-scoped broadcaster detail pages exist despite high GSC demand. Built `public/` is already at 17,104 / 20,000 files.

**What should change**: Implement a Hugo-native `broadcaster-directory` feature using a content adapter (`content/en/channels/_content.gotmpl`) and repo-side YAML overlay (`data/cfc/broadcasters.yaml`) without changing Retool or Data Contract v1: add a shared adapter-safe `cfcdata/broadcasters.html` partial (with placeholder denylist, display-name normalization, flagship descriptions/FAQs, and persistent evergreen channels), generate a `/channels/` hub in all 9 editions and country-scoped `/{ed}/channels/{slug}/` detail pages on regional editions only (0 child pages on Global `/`, country-scoped `translationKey` + `hreflang` isolation), enrich `/faq/` with an "Included Broadcasters & Services" section and unified `cfcpage/faq-page-items.html` synced 1:1 with `FAQPage` JSON-LD, and wire all SEO, IndexNow, file-budget, i18n-parity, verification-script, and exact `/channels/` Cloudflare geo-routing seams while reusing existing edition OG PNGs. See `brief.md`.

## Introduction
The Broadcaster Directory introduces official TV and streaming broadcaster discovery across all nine CardápioFC editions (Global, UK, Ireland, Brazil, Portugal, Argentina, USA, China, and Japan). It turns the per-country broadcast channel data already published in each Dataset — enriched with operator-maintained editorial descriptions, broadcaster-specific FAQs, name cleanup rules, and placeholder exclusions — into three user-facing surfaces: a broadcaster directory hub (`/channels/`), country-scoped broadcaster detail pages (`/{edition code}/channels/{broadcaster slug}/`), and an enriched "Included Broadcasters & Services" section on every edition's `/faq/` page.

Primary actors: **visitors** (football fans looking up which official TV channels and streaming platforms cover football in their country and which upcoming matches air on a given broadcaster), **search and AI crawlers** (indexing official broadcaster coverage, channel schedules, and FAQ answers), and the **site operator** (curating flagship broadcaster descriptions and keeping the static output within the deployment File Budget without modifying the upstream data export).

Terms: a **Broadcaster** is an official, licensed television channel or streaming service (categorised as Free TV, Pay TV, or Streaming); the **Curated Overlay** is the repository-maintained broadcaster metadata supplying editorial descriptions, broadcaster-specific Q&As, persistent flagship entries, display-name normalization rules, and placeholder exclusion entries; a **Regional Edition** is any country-specific edition (`en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`, `en-us`, `zh-cn`, `ja`); the **Global Edition** is the unprefixed worldwide English edition (`/`).

## Boundary Context
- **In scope**:
  - Merging live per-country broadcast channel data with the Curated Overlay (descriptions, broadcaster FAQs, persistent flagship broadcasters, display-name cleanup, and placeholder exclusion) without changing the upstream data export contract.
  - Generating a broadcaster directory hub page at `{edition prefix}channels/` in every edition (country-grouped on Global; category-grouped on regional editions) and adding it to site navigation.
  - Generating country-scoped broadcaster detail pages at `/{edition code}/channels/{broadcaster slug}/` on regional editions only (zero child pages on Global), displaying channel info, curated editorial overview/FAQs, upcoming fixtures on that broadcaster, and official platform / app CTAs.
  - Enriching `/faq/` in every edition with a visible "Included Broadcasters & Services" section and maintaining strict 1:1 parity between visible `/faq/` Q&As and `FAQPage` structured data.
  - Internal linking from match-page channel listings to regional broadcaster detail pages while keeping match-list channel-hiding rules intact.
  - Broadcaster SEO metadata, structured data (`BroadcastService`, collection/item-list, `BreadcrumbList`, `FAQPage`), cross-country `hreflang` isolation on detail pages, sitemap and indexing notification inclusion, edition-switcher fallback, exact `/channels/` geo-routing, localization parity, file-budget accounting, and automated verification coverage.
- **Out of scope**:
  - Modifying the upstream data export pipeline or Data Contract v1 schema.
  - Generating per-broadcaster social preview image files (reuses existing edition branded preview images).
  - Adding broadcaster routes to mobile app deep-link manifests (broadcaster pages are web-only routes).
  - Advertisements or promotion of unofficial/pirated streaming sources (100% official licensed broadcasters only, zero ads).
  - Cross-border editorial guides (e.g. English/Spanish "Watch Football in Brazil", Brasileirão abroad, VOD/replays), off-season league/team persistence, or new language/country editions.
  - Legacy FAQ/About 301 redirect additions and Portuguese homepage TV-guide copy tuning (tracked separately as direct implementation items on the project roadmap).
- **Adjacent expectations**:
  - `site-foundation` supplies the nine-edition registry, time-zone formatting rules, base page shells, navigation menus, and localization files.
  - `data-pages` supplies the loaded Dataset (including per-country channel listings and match records), match-list rendering with channels hidden on lists, entity address helpers, and the build-time File Budget guard.
  - `seo-social` supplies head metadata, canonicals, `hreflang`, social tags, structured data rendering, sitemaps, and SEO verification checks.
  - `edge-delivery` supplies edge geo-routing rules and the static deployment file-count ceiling (20,000 files).

## Requirements

### Requirement 1: Broadcaster Catalog, Curated Enrichment, and Normalization
**Objective:** As the site operator, I want live per-country channel data merged with curated editorial metadata and cleanup rules without changing the upstream export contract, so that visitors see accurate, clean, and informative broadcaster listings across every edition.

#### Acceptance Criteria
1. The Broadcaster Directory shall build each regional edition's broadcaster catalog by combining the broadcasters present in that edition's country channel data with any broadcaster entries defined for that country in the Curated Overlay, without requiring changes to the upstream Dataset format.
2. When a broadcaster identifier or name matches the Curated Overlay's placeholder exclusion list (including unconfirmed placeholders such as "Canal a confirmar" and "Não confirmado"), the Broadcaster Directory shall exclude that entry from broadcaster hubs, broadcaster detail pages, and FAQ broadcaster directories.
3. When a raw broadcaster name contains leading or trailing whitespace or watch-action call-to-action suffixes (such as "(Watch it live)", "(Ver ao vivo)", or "(Ver en vivo)"), the Broadcaster Directory shall normalize the display name before rendering it on broadcaster pages and directories.
4. Where the Curated Overlay marks a flagship broadcaster as persistent for a country (including initial flagship broadcasters across populated editions such as GE TV, TV Globo, SporTV, Premiere, CazéTV, ESPN, Disney+, Max, Prime Video, Sky Sports, BBC, ITV, DAZN, and Sport TV), the Broadcaster Directory shall include that broadcaster in the country's catalog even when it has zero matches in the current fixture window.
5. Where the Curated Overlay provides an editorial description or broadcaster-specific questions and answers for a broadcaster, the Broadcaster Directory shall attach them to that broadcaster's resolved record in the edition's language, falling back gracefully when an edition-specific translation is omitted.
6. If a regional edition's country has no channel data file in the Dataset, then the Site Build shall treat its live channel list as empty without failing the build or emitting spurious missing-channel warnings for broadcaster directory pages.
7. The Broadcaster Directory shall include only official, licensed television broadcasters and legal streaming services and shall display zero advertisements.

### Requirement 2: Broadcaster Directory Hub Page
**Objective:** As a visitor, I want a dedicated broadcaster directory page in my edition, so that I can browse all official TV channels and streaming platforms showing football in my country or compare supported countries worldwide.

#### Acceptance Criteria
1. The Broadcaster Directory shall generate a broadcaster directory hub page in every edition at `{edition prefix}channels/`, where `{edition prefix}` is `/` for the Global Edition and `/{edition code}/` for each Regional Edition.
2. While the visitor is on a Regional Edition broadcaster hub that has at least one valid broadcaster, the Broadcaster Directory shall display that country's broadcasters grouped by broadcast category (Free TV, Pay TV, and Streaming), sorted alphabetically by normalized display name within each group.
3. For each broadcaster shown on a Regional Edition hub, the Broadcaster Directory shall display the normalized broadcaster name, broadcast type label, optional broadcaster logo with explicit dimensions, upcoming match count where matches are scheduled, and a link to that broadcaster's detail page in the same edition.
4. If a Regional Edition has zero valid broadcasters in both live data and the Curated Overlay, then the broadcaster hub shall render a localized empty state explaining that official broadcaster listings for the region are being added and directing visitors to the CardápioFC mobile app.
5. While the visitor is on the Global Edition broadcaster hub (`/channels/`), the Broadcaster Directory shall group official broadcasters by supported regional country in edition order, displaying each country's heading, a link to that country's regional broadcaster hub, and links to that country's regional broadcaster detail pages.
6. The CardápioFC Site shall link to the current edition's broadcaster hub from both the primary navigation and the footer navigation, and the hub page shall display a breadcrumb trail from the edition home page.

### Requirement 3: Country-Scoped Broadcaster Detail Pages
**Objective:** As a visitor searching for a specific TV channel or streaming service (such as GE TV, SporTV, CazéTV, or Sky Sports), I want a dedicated broadcaster page in my country's edition showing what the service is and which upcoming matches air on it, so that I know what I can watch there.

#### Acceptance Criteria
1. When a Regional Edition's merged broadcaster catalog contains a valid broadcaster, the Broadcaster Directory shall generate a country-scoped detail page at `/{edition code}/channels/{broadcaster slug}/`.
2. The Broadcaster Directory shall generate zero individual broadcaster detail pages under the Global Edition (`/channels/{slug}/`).
3. Every broadcaster detail page shall display a breadcrumb trail (`Home > Channels > {Broadcaster}`), the broadcaster's normalized display name, broadcast type label, optional logo (with graceful fallback when unavailable), and the dataset freshness timestamp formatted in the edition's local time zone.
4. Where the broadcaster has a curated editorial overview, the broadcaster detail page shall display that overview prominently above or alongside the schedule; where the broadcaster has curated broadcaster-specific FAQs, the page shall render them in a visible FAQ section.
5. When the broadcaster has upcoming scheduled, live, halftime, postponed, or suspended matches in the edition's country, the broadcaster detail page shall list those matches grouped by edition-local day in ascending kick-off order, each linking to its match page in the same edition.
6. If the broadcaster has no upcoming matches in the current Dataset, then the broadcaster detail page shall display a localized message stating that no upcoming matches are currently scheduled on that broadcaster while retaining its editorial overview, official platform link where available, and mobile app call to action.
7. Where a broadcaster record provides an official website or platform URL, the broadcaster detail page shall render it as an external link that opens without passing referrer context, alongside a CardápioFC mobile app download call to action.
8. When a visitor on a broadcaster detail page switches editions using the edition switcher, the CardápioFC Site shall navigate to the target edition's broadcaster directory hub (`{target edition prefix}channels/`) rather than an unrelated or nonexistent address.

### Requirement 4: Enriched FAQ "Included Broadcasters & Services" and FAQ Parity
**Objective:** As a visitor or AI answer engine querying CardápioFC's FAQ for included broadcasters and services (such as Globo, GE TV, SporTV, CazéTV, or Sky Sports), I want an up-to-date broadcasters directory and matching FAQ answer directly on `/faq/`, so that my question is answered immediately and accurately.

#### Acceptance Criteria
1. The Broadcaster Directory shall render a visible "Included Broadcasters & Services" directory section on the `/faq/` page in every edition, populated from the same resolved broadcaster catalog used by `/channels/`.
2. While the visitor is on a Regional Edition `/faq/` page, the "Included Broadcasters & Services" section shall list that country's official broadcasters grouped by broadcast category with links to each broadcaster's detail page and a link to the full `/channels/` hub; while on the Global Edition `/faq/` page, it shall summarise official broadcasters by supported country with links to each regional hub.
3. The `/faq/` page shall include a dedicated FAQ question and answer specifically addressing which official broadcasters and streaming services are included for the edition's country (explicitly reflecting flagship services such as TV Globo, GE TV, SporTV, Premiere, and CazéTV in Brazil).
4. The CardápioFC Site shall source the visible FAQ questions and answers on `/faq/` and the `FAQPage` structured data emitted for `/faq/` from a single shared definition so that every visible Q&A item on `/faq/` matches its structured data entry verbatim in plain text.

### Requirement 5: Internal Linking and Match-List Channel Isolation
**Objective:** As a visitor viewing a match's confirmed broadcasters, I want to navigate directly to a broadcaster's detail page to see what else airs on that network, while keeping match lists clean and uncluttered.

#### Acceptance Criteria
1. When rendering confirmed broadcast channels on a Regional Edition match page, where a channel resolves to a generated broadcaster detail page in that edition, the CardápioFC Site shall link the channel's name to its broadcaster detail page while preserving the existing channel app-launcher action.
2. When rendering country-grouped broadcast channels on a Global Edition match page, where a channel resolves to a generated broadcaster detail page in that country's regional edition, the CardápioFC Site shall link the channel's name to that regional broadcaster detail page while preserving the existing app-launcher action.
3. If a broadcast channel on a match page is excluded by the placeholder exclusion list or has no generated broadcaster detail page, then the match page shall render the channel name as plain text without a broken link.
4. The Broadcaster Directory shall preserve existing match-list presentation rules by displaying zero per-match broadcast channel badges inside match lists on home, team, league, or broadcaster detail pages.

### Requirement 6: SEO Metadata, Structured Data, Cross-Country Isolation, and Edge Discovery
**Objective:** As a search engine or AI crawler, I want accurate localized metadata, valid structured data, clean country-scoped canonical/alternate links, and proper sitemap and geo-routing behavior, so that broadcaster hubs and detail pages are indexed cleanly without cross-country duplication errors.

#### Acceptance Criteria
1. Every broadcaster hub page and broadcaster detail page shall emit a unique, localized `<title>`, `<meta name="description">`, self-referencing `<link rel="canonical">`, Open Graph tags, and Twitter Card tags.
2. Every broadcaster hub page and broadcaster detail page shall reuse its edition's existing branded social preview image rather than generating new per-broadcaster social preview image files.
3. Every broadcaster hub page (`{edition prefix}channels/`) shall emit bidirectional reciprocal `hreflang` alternate links across all editions with `x-default` pointing to the Global `/channels/` hub, matching the alternate links in the XML sitemap.
4. Every country-scoped broadcaster detail page (`/{edition code}/channels/{broadcaster slug}/`) shall emit a self-referencing canonical URL and shall emit zero cross-edition `hreflang` alternate links and zero `x-default` links—even when two regional editions share an identical broadcaster slug (such as `espn`, `apple-tv`, or `disney-premium`)—and its sitemap entry shall likewise omit cross-edition alternate links.
5. Every broadcaster detail page shall emit valid JSON-LD containing a `BroadcastService` entity (specifying broadcaster name, broadcast service category, served country, canonical URL, and official website URL where available), a `BreadcrumbList` entity, and—where visible broadcaster-specific FAQs are rendered—a `FAQPage` entity matching those visible FAQs verbatim.
6. Every broadcaster hub page shall emit valid JSON-LD containing a collection/item-list representation of its listed broadcasters and a `BreadcrumbList` entity.
7. All generated broadcaster hub and detail pages shall be included in their edition's XML sitemap and assigned explicit indexing notification priority (prioritizing broadcaster hubs alongside top-level directory hubs and broadcaster detail pages above uncategorised URLs).
8. When a human visitor from a supported country requests the unprefixed Global broadcaster hub (`/channels` or `/channels/`), the edge routing layer shall redirect them to their regional edition's broadcaster hub (`/{edition code}/channels/`) while excluding search/AI crawlers and without geo-redirecting child `/channels/{slug}` paths.

### Requirement 7: Localization Parity and Regional Time Formatting
**Objective:** As an international visitor, I want all broadcaster directory labels, descriptions, and schedules rendered consistently in my edition's language and time zone, so that pages never mix languages or misstate kick-off times.

#### Acceptance Criteria
1. The Broadcaster Directory shall source all user-visible interface labels, headings, broadcast category labels, meta templates, navigation entries, empty states, and FAQ copy from the site's localized string tables with complete key parity across all supported base languages and regional variants.
2. Every kick-off time and dataset freshness timestamp rendered on a broadcaster detail page shall be converted to and labelled in the current edition's local time zone.

### Requirement 8: Build Safety, File Budget, and Automated Verification
**Objective:** As the site operator, I want broadcaster generation to stay safely within the static hosting file budget and be verified automatically on every build, so that deployments never break or exceed free-tier limits.

#### Acceptance Criteria
1. The Site Build shall generate broadcaster hub pages, country-scoped broadcaster detail pages, and enriched FAQ pages cleanly using either remote production data or the local sample dataset, including for editions with absent channel files.
2. The Site Build shall account for generated broadcaster pages in build-time file-count estimation so that total output stays below the configured File Budget (default 18,000 files, under the 20,000-file deployment cap) without introducing per-broadcaster image file expansion or breaking existing budget-estimation tests.
3. The automated verification suite shall verify broadcaster hub pages, sampled broadcaster detail pages, and the enriched `/faq/` page for valid JSON-LD syntax and expected schema types (`BroadcastService`, `BreadcrumbList`, `FAQPage`), self-referencing canonicals, reciprocal `hreflang` + `x-default` on `/channels/` hubs, absence of invalid cross-country `hreflang` on detail pages, explicit numeric width and height attributes on all broadcaster logos, localization key parity across all base languages, and compliance with match-list channel-hiding checks.
