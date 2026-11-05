# Requirements Document

## Project Description (Input)
CardápioFC visitors and search/AI discovery engines currently suffer from broken and incomplete SEO/social metadata: JSON-LD on the live site is double-encoded as an unparseable string, there is no SportsEvent, BroadcastEvent, or FAQPage structured data, page meta descriptions are generic duplicates, hreflang alternates are inconsistent and incorrectly point x-default to the current page, the SearchAction target 404s, and social preview images are oversized and unoptimized for WhatsApp sharing. Search engines and AI answer engines cannot reliably index match kickoffs, local broadcasters, or entity relations across the site's six regional editions. The site requires root-level overrides producing valid, typed JSON-LD structured data (SportsEvent with BroadcastEvent per edition channel, SportsTeam, SportsLeague/SportsOrganization series, BreadcrumbList, WebSite with working SearchAction, and Organization with MobileApplication links), consistent BCP 47 hreflang alternates with x-default pointing to the Global edition, self-referencing canonicals, localised data-driven page titles and descriptions, WhatsApp-friendly Open Graph / Twitter share previews (≤300 KB, 1200×630), comprehensive multilingual sitemaps, robots.txt, llms.txt, and answer-first FAQ copy with FAQPage schema for Generative Engine Optimization (GEO).

## Introduction
This specification defines the Search Engine Optimization (SEO), Generative Engine Optimization (GEO), structured data, and social sharing capabilities for CardápioFC across its six launch editions (Global, UK, Ireland, Brazil, Portugal, Argentina). The primary consumers of this feature are search engine crawlers (Google, Bing), AI answer engines and LLM crawlers (ChatGPT, Perplexity, Claude), messaging and social platform preview extractors (WhatsApp, Telegram, Twitter/X, Facebook, iMessage), and human visitors sharing or discovering match pages.

The subject "SEO & Social Layer" denotes the website capabilities delivered by this feature; "Site Build" denotes the Hugo build and verification process.

## Boundary Context
- **In scope**:
  - Head SEO hook implementation (`head-seo.html`) providing `<title>`, meta description, robots meta, canonical link, BCP 47 hreflang alternates with Global `x-default`, Open Graph tags, and Twitter Card tags.
  - JSON-LD structured data emitted as valid JSON objects without string double-encoding: `SportsEvent` with `BroadcastEvent`, `SportsTeam`, `SportsLeague` / `SportsOrganization`, `BreadcrumbList`, `WebSite` with working `SearchAction`, `Organization` with `MobileApplication`, and `FAQPage`.
  - Answer-first FAQ presentation and copy for generative engine optimization (GEO) on match and entity pages.
  - Social preview image strategy ensuring WhatsApp compatibility (≤ 300 KB, 1200×630) within Hugo build time and file count budgets.
  - Multilingual XML sitemaps covering all indexable pages across all editions with `lastmod` and alternate links.
  - `robots.txt` configuration pointing to sitemaps and managing crawler access.
  - `llms.txt` and `llms-full.txt` structured summaries for LLM crawlers.
  - Build-time automated verification script checking structured data validity, hreflang reciprocity, canonical consistency, and image budgets.
- **Out of scope**:
  - Analytics and consent scripts, or cookie banners (owned by `analytics-consent`). No ads exist on the site.
  - Search UI and dynamic search index generation (owned by `app-deeplinks`).
  - Mobile app deep linking files `apple-app-site-association` and `assetlinks.json` (owned by `app-deeplinks`).
  - Edge redirects, Cloudflare geo-routing rules, and legacy 301 URL maps (owned by `edge-delivery`).
  - Core entity data fetching, dataset models, content adapters, and entity page layouts (owned by `data-pages`).
  - Modifying vendored theme or module files under `themes/hugoplate/` or `_vendor/`.
- **Adjacent expectations**:
  - `site-foundation` provides the `head-seo` hook slot in `<head>`, the edition registry (`edition/*` partials) with locale, timezone, and hreflang metadata, and base layout shells.
  - `data-pages` provides `.Params.cfc` on generated pages, the `cfcdata/page-entity.html` contract, and `cfcdata/channels.html` contract with kickoff times, venues, teams, leagues, and broadcaster lists.

## Requirements

### Requirement 1: Structured Data (JSON-LD)
**Objective:** As a search engine crawler or AI engine, I want valid, typed JSON-LD structured data on every page, so that match schedules, broadcast services, teams, leagues, and breadcrumbs are accurately indexed and eligible for rich search results.

#### Acceptance Criteria
1. The SEO & Social Layer shall emit all JSON-LD structured data as valid, native JSON objects inside `<script type="application/ld+json">` tags without string wrapping or double JSON escaping.
2. When rendering a match page, the SEO & Social Layer shall emit a `SportsEvent` schema containing:
   - `@context`: `"https://schema.org"`
   - `@type`: `"SportsEvent"`
   - `name`: Match title (e.g. "Home vs Away")
   - `startDate`: Match kickoff timestamp in ISO 8601 format with timezone offset
   - `eventStatus`: Schema.org `EventStatusType` mapped from the match status (`EventScheduled`, `EventPostponed`, `EventCancelled`, `EventRescheduled`, or `EventMovedOnline`)
   - `homeTeam`: `SportsTeam` object with team name, optional crest URL, and page URL
   - `awayTeam`: `SportsTeam` object with team name, optional crest URL, and page URL
   - `sport`: `"Soccer"`
3. Where a match has venue information, the SEO & Social Layer shall include `location` as a `Place` object with the venue name and optional city in the `SportsEvent` schema.
4. Where a match belongs to a league, the SEO & Social Layer shall include `superEvent` or `organizer` as a `SportsLeague` or `SportsOrganization` object in the `SportsEvent` schema.
5. Where a match page has broadcast channels in the current edition, the SEO & Social Layer shall emit a `BroadcastEvent` object for each channel inside `publication` (or as linked broadcast events), specifying:
   - `@type`: `"BroadcastEvent"`
   - `name`: Broadcaster coverage name
   - `isLiveBroadcast`: `true`
   - `startDate`: Match kickoff timestamp in ISO 8601 format
   - `publishedOn`: `BroadcastService` object with broadcaster name, optional broadcast type, and official website URL where available.
6. When rendering a team page, the SEO & Social Layer shall emit a `SportsTeam` schema containing the team name, alternative names in other languages, crest URL, sport `"Soccer"`, and canonical URL.
7. When rendering a league page, the SEO & Social Layer shall emit a `SportsLeague` (or `SportsOrganization`) schema containing the league name, logo URL, sport `"Soccer"`, and canonical URL.
8. When rendering any match, lineup, team, or league page, the SEO & Social Layer shall emit a `BreadcrumbList` schema containing an ordered `itemListElement` array representing the navigational breadcrumb hierarchy from Home to the current page.
9. When rendering the home page of any edition, the SEO & Social Layer shall emit:
   - A `WebSite` schema containing the site name, URL, and a `potentialAction` of type `SearchAction` with `target` pointing to the working search URL pattern `https://cardapiofc.com/search?q={search_term_string}` and `query-input` equal to `"required name=search_term_string"`.
   - An `Organization` schema representing CardápioFC, containing organization name, logo URL, official URL, description, and `publishingPrinciples` or `sameAs` links.
   - A `MobileApplication` schema linked to the organization, referencing the CardápioFC iOS and Android applications with operating system and download identifiers.
10. Where a page contains an FAQ section, the SEO & Social Layer shall emit a `FAQPage` schema containing `mainEntity` array with `Question` and `Answer` objects matching the visible FAQ content.

### Requirement 2: Canonical URLs and hreflang Alternate Links
**Objective:** As a search engine, I want unambiguous canonical URLs and bidirectional BCP 47 hreflang alternates across all editions, so that regional searchers see the correct local edition and duplicate content penalties are avoided.

#### Acceptance Criteria
1. The SEO & Social Layer shall emit a single self-referencing `<link rel="canonical">` on every indexable page, pointing to that page's absolute permalink.
2. When rendering a page that has translations across editions (including match, team, league, lineup, and home pages), the SEO & Social Layer shall emit `<link rel="alternate" hreflang="...">` tags for every available edition of that page.
3. The SEO & Social Layer shall format the `hreflang` attribute values using standard BCP 47 syntax:
   - Global edition: `"en"`
   - United Kingdom: `"en-GB"`
   - Ireland: `"en-IE"`
   - Brazil: `"pt-BR"`
   - Portugal: `"pt-PT"`
   - Argentina: `"es-AR"`
4. On all translated pages, the SEO & Social Layer shall emit `<link rel="alternate" hreflang="x-default">` pointing to the corresponding URL of the Global (unprefixed) edition.
5. If a specific translation of a page does not exist in an edition, the SEO & Social Layer shall omit that edition from the `hreflang` list and ensure only mutually existing reciprocal translations are declared.
6. When rendering an error page (such as 404) or a page marked with `noindex`, the SEO & Social Layer shall emit `<meta name="robots" content="noindex, follow">` (or `noindex, nofollow`) and shall omit `hreflang` alternate links.

### Requirement 3: Localised Data-Driven Head Metadata
**Objective:** As a searcher or browser user, I want clear, localised, data-driven page titles and descriptions in SERPs, so that I understand exactly what match or league information is provided for my country.

#### Acceptance Criteria
1. When rendering a match page, the SEO & Social Layer shall generate a `<title>` tag combining the team names, league name, kickoff time formatted in the edition's local timezone with timezone label, and edition country broadcast context.
2. When rendering a match page, the SEO & Social Layer shall generate a `<meta name="description">` providing a natural language summary specifying where to watch the match live on TV and online streaming in the target country, including kickoff time and named broadcaster channels.
3. Where a match has no confirmed broadcasters in the edition's country, the SEO & Social Layer shall emit a meta description indicating that broadcast details are pending or available via the mobile app, avoiding misleading statements.
4. When rendering a lineup page, the SEO & Social Layer shall generate a `<title>` indicating the starting lineups and confirmed formations for the match, and a `<meta name="description">` detailing confirmed and expected player selections.
5. When rendering a team page, the SEO & Social Layer shall generate a `<title>` and `<meta name="description">` detailing the team's upcoming fixtures, recent results, and where to watch matches live in the current edition.
6. When rendering a league page or league directory, the SEO & Social Layer shall generate a `<title>` and `<meta name="description">` summarizing league fixtures, schedule, and TV channels for the current edition.
7. When rendering the home page of an edition, the SEO & Social Layer shall emit the edition's configured title and description.
8. The SEO & Social Layer shall ensure that every indexable page has a non-empty, unique `<title>` and `<meta name="description">`.

### Requirement 4: Open Graph and Twitter Social Previews
**Objective:** As a user sharing a link on WhatsApp, Twitter/X, Telegram, or Facebook, I want an attractive, accurate preview card with correct local time, channel info, and an optimized image that loads immediately.

#### Acceptance Criteria
1. On every page, the SEO & Social Layer shall emit Open Graph meta tags:
   - `og:site_name`: `"CardápioFC"`
   - `og:title`: Localised page title
   - `og:description`: Localised page summary
   - `og:url`: Canonical page URL
   - `og:type`: `"website"` (or `"video.other"` for live matches where appropriate)
   - `og:locale`: Matching the edition's Open Graph locale identifier (e.g. `en_US`, `en_GB`, `en_IE`, `pt_BR`, `pt_PT`, `es_AR`)
2. Where a page has translations in other editions, the SEO & Social Layer shall emit `og:locale:alternate` tags for each available alternate edition locale.
3. On every page, the SEO & Social Layer shall emit Twitter Card meta tags:
   - `twitter:card`: `"summary_large_image"`
   - `twitter:title`: Localised page title
   - `twitter:description`: Localised page summary
   - `twitter:image`: Absolute URL of the preview image
4. The SEO & Social Layer shall specify `og:image`, `og:image:width`, `og:image:height`, and `og:image:alt` on every indexable page.
5. The social share image for every page shall have target dimensions of 1200×630 pixels (1.91:1 aspect ratio) and a file size not exceeding 300 KB.
6. The SEO & Social Layer shall provide distinct, branded fallback preview images for home, league directory, teams, and leagues.
7. Where match preview images are generated or composed, the image generation mechanism shall not cause the total Hugo build duration to exceed 30 seconds or generate files exceeding the deployment budget.

### Requirement 5: Multilingual Sitemaps and Crawler Directives
**Objective:** As a search engine or LLM crawler, I want clean, comprehensive sitemaps, robots.txt directives, and llms.txt summaries, so that content discovery is efficient and thorough across all editions.

#### Acceptance Criteria
1. The SEO & Social Layer shall generate a valid XML sitemap index at `/sitemap.xml` that references individual sitemaps for each of the six editions, or a unified multilingual sitemap containing all indexable URLs.
2. The sitemap shall include all indexable match pages, team pages, league pages, lineup pages, and edition home pages, and shall exclude non-rendered section listings, debug pages, 404 pages, and `noindex` pages.
3. Each `<url>` entry in the sitemap shall include `<loc>`, `<lastmod>` derived from the entity's `generatedAt` or modification date, and `<xhtml:link rel="alternate" hreflang="..." href="...">` entries for each translated counterpart.
4. The SEO & Social Layer shall generate a `robots.txt` file at `/robots.txt` that:
   - References the absolute URL of `sitemap.xml`
   - Allows standard web crawlers and AI bots access to all public edition paths
   - Disallows indexing of draft, debug, or internal query parameters
5. The SEO & Social Layer shall generate `llms.txt` and `llms-full.txt` at the root of the site, providing:
   - Project identity, purpose, and editorial overview of CardápioFC
   - Sitemap reference and URL structure explanation
   - Edition breakdown (countries, languages, time zones, channel availability)
   - Data freshness guarantee and Retool/Firebase export schedule
   - Direct guidance on how LLMs should answer football TV guide queries using the site

### Requirement 6: Generative Engine Optimization (GEO) & Answer-First FAQs
**Objective:** As an AI answer engine or user seeking instant answers, I want clear, structured, answer-first text and FAQ blocks on match pages, so that natural language queries about where to watch matches receive immediate, authoritative answers.

#### Acceptance Criteria
1. When rendering a match page, the SEO & Social Layer shall provide structured, answer-first text answering the primary question: "Where to watch {Home} vs {Away} live on TV and online stream in {Country}?".
2. When rendering a match page with confirmed broadcast channels, the SEO & Social Layer shall provide an FAQ section with concise questions and answers covering:
   - Match kickoff time in the edition's local timezone
   - Confirmed TV broadcast channels and streaming platforms for that country
   - Free-to-air vs subscription availability where indicated by channel metadata
   - Venue and competition round details
3. Where a match has no confirmed broadcasters in the edition's country, the FAQ copy shall state that broadcast information is not yet confirmed and direct users to check the mobile app.
4. The SEO & Social Layer shall ensure that all questions and answers rendered in visible FAQ sections are identically represented in the `FAQPage` JSON-LD schema on that page.
5. All FAQ text and headings shall be localised using the edition's language and regional vocabulary via the template translation system.

### Requirement 7: Template Architecture and Integration
**Objective:** As a site maintainer, I want root-level overrides and cleanly decoupled hook partials, so that theme updates and adjacent features work without conflicts or regressions.

#### Acceptance Criteria
1. The SEO & Social Layer shall implement its `<head>` metadata exclusively within the `layouts/_partials/hooks/head-seo.html` hook slot provided by `site-foundation`, without modifying `layouts/baseof.html` or `layouts/_partials/site/head.html`.
2. The SEO & Social Layer shall not modify or interfere with hook slots owned by `analytics-consent` (`head-analytics.html`, `footer-consent.html`) or `app-deeplinks` (`head-app.html`, `footer-app.html`).
3. The SEO & Social Layer shall override the theme's vendored `basic-seo` module by providing a root-level no-op or complete replacement partial `layouts/_partials/basic-seo.html`, ensuring the vendored basic-seo code is never executed.
4. The SEO & Social Layer shall consume entity data solely through the documented contracts of `site-foundation` (`edition/*`, `time/*`) and `data-pages` (`cfcdata/page-entity.html`, `cfcdata/channels.html`, `.Params.cfc`).
5. If a non-data page (such as a generic content page or styleguide) is rendered, the SEO & Social Layer shall fall back gracefully to site-level defaults for title, description, and Open Graph tags without throwing template errors.

### Requirement 8: Automated Verification and Quality Gates
**Objective:** As a developer or CI workflow, I want automated verification of SEO and social metadata, so that invalid JSON-LD, broken hreflang links, duplicate titles, or oversized preview images are caught before deployment.

#### Acceptance Criteria
1. The SEO & Social Layer shall provide a verification script (`scripts/check-seo-social.mjs`) executable with Node.js without third-party runtime dependencies.
2. The verification script shall inspect the generated `public/` directory after `pnpm build` and verify:
   - JSON-LD syntax on sampled match, team, league, and home pages is valid JSON and not a string literal.
   - Required schema types (`SportsEvent`, `SportsTeam`, `SportsLeague`, `BreadcrumbList`, `WebSite`, `Organization`) are present on their respective page types.
   - Every page has a self-referencing canonical tag matching its permalink.
   - All `hreflang` alternate tags use valid BCP 47 codes and are reciprocal across translated pages.
   - The `x-default` alternate link on translated pages points to the Global edition URL.
   - Meta descriptions and titles are present and distinct across different entity pages.
   - All social share images referenced in `og:image` exist and are ≤ 300 KB.
   - `sitemap.xml`, `robots.txt`, and `llms.txt` exist and contain expected entries.
3. If any SEO, structured data, canonical, hreflang, or image constraint is violated, the verification script shall exit with a non-zero code and output an actionable failure message identifying the page and violation.
