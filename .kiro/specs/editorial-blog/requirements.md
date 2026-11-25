# Requirements Document

## Project Description (Input)
**Who**: Football fans searching for broadcasting rights changes, watch guides, app feature guides, and broadcasting market analysis across all 9 CardápioFC editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`), plus the site operator publishing editorial articles and maintaining the static build under Cloudflare's 20,000-file limit.

**Current situation**: CardápioFC has programmatic match, team, league, and broadcaster pages across 9 editions, but no editorial blog surface to capture non-fixture organic search and AI answer-engine intent driving mobile app installs. Stock theme blog layouts link to disabled taxonomy/author routes (`disableKinds = ["taxonomy", "term", "RSS"]`) and rely on banned icon fonts, the site validation gate bans `public/blog`, head SEO context overwrites single-page titles/descriptions whenever a section hub key exists, breadcrumbs/OG/JSON-LD/analytics/IndexNow lack blog support, and the post-build file-count guard (`scripts/check-file-count.mjs`) is empty (0 bytes) while production output sits near ~17.1k files.

**What should change**: Deliver an upgrade-safe native Markdown editorial blog across all 9 editions (`content/<ed>/blog/{slug}.md` with shared ASCII slugs and `translationKey`), one shared cover illustration per post processed into responsive hero images and a 1200×630 JPEG (`≤ 300,000` bytes) OG image, custom `cfc-*` hub and article layouts (reading time, related posts, optional article FAQs, app-install CTAs), full SEO/GEO/OpenGraph/analytics/menu/i18n/IndexNow/geo-routing integration, restored 18k/20k static file-count guard plus blog budget accounting and 9-edition contract validator, and 1 published launch seed post across all 9 editions. See `brief.md`.

## Introduction
The Editorial Blog introduces a multilingual editorial publishing surface across all nine CardápioFC editions (Global, UK, Ireland, USA, Brazil, Portugal, Argentina, China, and Japan). It enables CardápioFC to publish long-form guides and analysis across four core editorial pillars—streaming rights changes, football watch guides, mobile app feature guides, and broadcasting market analysis—to capture non-fixture organic search and AI-assistant traffic and convert readers into CardápioFC mobile app users.

Primary actors: **readers** (football supporters researching where and how to watch competitions legally, streaming rights shifts, and app capabilities), **search and AI answer crawlers** (indexing structured article metadata, breadcrumbs, and optional article FAQs), and the **site operator** (authoring or reviewing 9-edition articles within strict content, media, SEO, and static file-count guardrails).

Terms: an **Article** is an editorial post localized per edition and linked across all nine editions by a shared ASCII URL slug and cross-edition translation identifier; a **Pillar** is one of the four permitted editorial categories (`rights-changes`, `watch-guides`, `app-guides`, `market-analysis`); the **Blog Hub** is the edition-scoped article index page (`{edition prefix}blog/`); and the **File Budget** is the 18,000-file soft warning threshold protecting the 20,000-file static deployment ceiling.

## Boundary Context
- **In scope**:
  - Multilingual editorial blog hub and article pages across all nine editions using native localized content files linked by shared ASCII slugs and cross-edition translation identifiers.
  - Strict article metadata and content contract (required metadata fields, four editorial pillars, optional article FAQs, draft exclusion, zero-ads and official-broadcasters-only editorial compliance).
  - Shared single-source cover illustration workflow per article producing responsive web hero/card images and a 1200×630 JPEG social preview image within the 300,000-byte limit, with immutable asset caching.
  - Article reading experience: breadcrumbs, reading time, publication/modification timestamps, related articles, optional visible FAQ section, and CardápioFC mobile app install CTAs aligned with the sharp-corner light/dark visual system.
  - SEO, Open Graph, structured data (`Blog`, `BlogPosting`, 2-level and 3-level `BreadcrumbList`, optional `FAQPage`), reciprocal 9-edition `hreflang` + `x-default`, XML sitemaps, AI summary compatibility (`llms.txt` / `llms-full.txt`), indexing priority, edge geo-routing for `/blog` routes, site navigation, analytics page-type classification, and 7-table localization parity.
  - Restored post-build static file-count guard (18,000 soft warning / 20,000 hard limit), build-time blog file-budget accounting, automated 9-edition blog contract validator, updated SEO/site checks, and 1 launch seed article published across all nine editions.
- **Out of scope**:
  - Category, tag, or author archive pages (taxonomy and term generation remain disabled to protect the 20,000-file deployment ceiling).
  - RSS or Atom syndication feeds.
  - Reader comments, newsletter/email capture, or user-submitted content.
  - Advertisements, sponsored posts, or promotion of unofficial/pirated streams.
  - Automated topic ideation, web research, AI writing/translation, AI illustration generation, recurring local scheduling, and automated git pushing (owned by downstream `blog-automation`).
- **Adjacent expectations**:
  - `site-foundation` provides the nine-edition registry, sharp-corner visual design tokens, base page shell, navigation menus, and localization tables.
  - `seo-social` provides the head metadata orchestration, structured data rendering, reciprocal alternate link rules, sitemaps, AI summary outputs, and SEO verification harness.
  - `edge-delivery` provides the deployment workflow, static response headers, edge geo-routing rules, indexing notification client, and the 20,000-file static asset deployment cap.
  - `analytics-consent` provides consent-aware analytics configuration and page-type event tagging.
  - `blog-automation` consumes this specification's content, metadata, image, and validation contracts downstream when generating weekly posts.

## Requirements

### Requirement 1: Multilingual Blog Content and Metadata Contract
**Objective:** As the site operator, I want a strict multilingual content and metadata contract for blog hubs and articles across all nine editions, so that every published article stays consistent, valid, and safe for downstream editorial publishing.

#### Acceptance Criteria
1. The Editorial Blog shall expose a blog hub at `{edition prefix}blog/` and individual article pages at `{edition prefix}blog/{slug}/` across all nine active editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`), where `{edition prefix}` is `/` for the Global edition and `/{edition code}/` for each regional edition.
2. The Editorial Blog shall require every published article to use an identical lowercase ASCII kebab-case URL slug and identical cross-edition translation identifier across all nine editions.
3. The Editorial Blog shall require every article to declare a non-empty title, concise summary description, publication timestamp, last-modified timestamp, cross-edition translation identifier, editorial pillar matching one of the four permitted pillars (`rights-changes`, `watch-guides`, `app-guides`, `market-analysis`), shared cover image path, descriptive alternative text, and draft status, and shall support optional structured question-and-answer items.
4. While an article is marked as a draft, the Site Build shall exclude that article from published blog hubs, article routes, sitemaps, and search indexing submissions.
5. The Editorial Blog shall generate zero taxonomy, tag, author, or RSS archive pages, display zero advertisements or sponsored placements, and reference only official, licensed broadcasters and legal streaming services.

### Requirement 2: Blog Hub and Editorial Article Reading Experience
**Objective:** As a football fan landing on CardápioFC's blog, I want clean, fast, localized blog hub and article pages with reading time, related posts, and clear app-install calls to action, so that I can read helpful football TV guides and easily install the CardápioFC app.

#### Acceptance Criteria
1. While viewing an edition's blog hub with one or more published articles, the Editorial Blog shall display those articles ordered newest-first by publication date, showing each article's cover image with explicit dimensions, editorial pillar label, title, summary description, publication date formatted in the edition's locale, and estimated reading time.
2. If an edition's blog hub has zero published articles, then the Editorial Blog shall render a localized empty state directing visitors to match schedules and the CardápioFC mobile app.
3. When viewing an individual article page, the Editorial Blog shall render a 3-level breadcrumb trail (`Home > Blog > {Article Title}`), editorial pillar label, article title, publication and last-updated dates formatted in the edition's locale/time zone, estimated reading time, hero cover image with explicit numeric dimensions and alternative text, readable long-form body typography, and a navigation link back to the edition's blog hub.
4. Where an article declares one or more structured FAQ items, the Editorial Blog shall render them in a visible FAQ section whose question and answer plain text matches the article's `FAQPage` structured data verbatim.
5. When other published articles exist in the same edition, the Editorial Blog shall display up to three related articles on the article page (prioritizing articles in the same editorial pillar), and every article page and blog hub shall display a CardápioFC mobile app download call-to-action.
6. The Editorial Blog shall adhere to CardápioFC's sharp-corner design tokens with compliant light and dark mode contrast, zero font-icon dependencies, and zero match-list broadcast channel badges.

### Requirement 3: Shared Cover Illustration and Social Preview Pipeline
**Objective:** As the site operator, I want a single shared cover illustration per article to automatically produce optimized web images and compliant social preview cards without per-edition image duplication, so that build size and repository weight stay low.

#### Acceptance Criteria
1. The Editorial Blog shall require every article to reference one shared cover image asset stored centrally once per article slug rather than duplicating cover image files across the nine editions.
2. When rendering cover images on blog hubs and article pages, the Media Pipeline shall generate compressed responsive WebP images from the single source asset and emit explicit numeric width and height attributes on every rendered image element.
3. When generating social preview metadata for an article with a valid cover image, the Media Pipeline shall produce a `1200x630` JPEG social preview image compressed to at most `300,000` bytes; for the blog hub, or if an article omits or lacks a resolvable source cover image, the Editorial Blog shall fall back safely to its edition's existing `1200x630` social preview image.
4. The Edge Delivery configuration shall serve generated blog image assets with long-lived immutable cache headers.

### Requirement 4: SEO Metadata, Structured Data, Sitemaps, and Discovery
**Objective:** As a search engine or AI answer crawler, I want accurate per-article metadata, valid schema graphs, reciprocal multilingual links, and indexing signals, so that every blog post is indexed cleanly in its target region and language.

#### Acceptance Criteria
1. The Editorial Blog shall emit a unique localized page title, meta description, and self-referencing canonical link on every blog hub and individual article page, and shall restrict section-level hub metadata overrides to section hubs so individual article titles and descriptions are never overwritten.
2. The Editorial Blog shall emit `og:type` set to `"article"` together with `article:published_time`, `article:modified_time`, and `article:section` Open Graph tags on every individual article page, `og:type` set to `"website"` on every blog hub, and complete Twitter Card tags on both.
3. The Editorial Blog shall emit bidirectional reciprocal `hreflang` alternate links across all nine editions with `x-default` pointing to the Global (`en`) URL on every blog hub and every nine-edition published article, mirrored identically in each edition's XML sitemap.
4. The Editorial Blog shall emit valid structured data containing a `Blog` node and a 2-level `BreadcrumbList` node on every blog hub, and a `BlogPosting` node (headline, description, image, publication and modification dates, language, and CardápioFC publisher/author), a 3-level `BreadcrumbList` node, and—where visible article FAQs are rendered—a verbatim-matching `FAQPage` node on every individual article page.
5. The Editorial Blog shall include published blog hubs and articles in the site's AI discovery summaries (`llms.txt` and `llms-full.txt`, monitoring `llms-full.txt` size as content accumulates) and assign explicit indexing notification priority (prioritizing blog hubs alongside top-level directory hubs and article pages alongside entity detail pages above uncategorized routes).

### Requirement 5: Navigation, Edge Geo-Routing, Analytics, and Localization Parity
**Objective:** As an international visitor, I want to reach the blog from site navigation, land on my regional edition's version of an article, and read every interface element in my edition's language, so that the blog feels native to my region.

#### Acceptance Criteria
1. The CardápioFC Site shall link to the current edition's blog hub from both the primary header navigation and the footer navigation across all nine editions, and when a visitor switches editions from an article page via the edition switcher, the CardápioFC Site shall navigate to that same article in the target edition (falling back to the target edition's blog hub if an edition version is absent).
2. When a human visitor from a supported country requests an unprefixed Global blog path (`/blog`, `/blog/`, or `/blog/{slug}/`), the Edge Delivery routing configuration shall redirect the visitor to the matching regional edition path (`/{edition code}/blog/...`) while excluding search and AI crawlers and preserving explicit edition query or cookie preferences.
3. The Analytics integration shall classify blog hubs and individual article pages distinctly from `other` pages while preserving consent defaults and zero-ad rules.
4. The Editorial Blog shall source all user-visible navigation labels, headings, editorial pillar labels, reading-time labels, date labels, empty states, calls-to-action, and blog hub SEO strings from the site's localization tables with 100% key parity across all seven base tables, preserving the Brazilian Portuguese symlink and supporting regional English variants.

### Requirement 6: Static File Budget Guard, Contract Validator, and Launch Seed Article
**Objective:** As the site operator, I want automated build-time and post-build file-count enforcement, 9-edition blog contract validation, and a live verified seed article, so that weekly publishing never breaks builds or breaches Cloudflare's 20,000-file cap.

#### Acceptance Criteria
1. When the post-build static file-count guard runs against the generated output directory, it shall count all generated static files, emit a warning if total files exceed the `18,000` soft budget, and exit non-zero if total files exceed the `20,000` hard limit; while building the site, build-time budget estimation shall account for blog hubs, published articles, and processed blog images without breaking existing dataset-budget assertions.
2. When the blog contract validator runs against repository content and media assets, it shall verify that every non-draft article exists across all nine editions with identical ASCII slugs and matching cross-edition translation identifiers, valid required frontmatter fields and pillar identifiers, non-empty body content, a resolvable shared cover image, and zero leaked taxonomy or icon-font references.
3. When the site validation and SEO verification suites run after a production or sample build, they shall permit `/blog` output while continuing to block forbidden taxonomy/author/demo paths and icon fonts, and shall verify blog hubs and sampled articles for canonicals, reciprocal `hreflang`, `1200x630` `≤ 300,000`-byte social preview images, Open Graph article tags, `Blog`/`BlogPosting`/`BreadcrumbList` structured data, and visible-to-`FAQPage` parity.
4. The Editorial Blog shall ship one verified launch seed article published across all nine editions with a shared cover illustration that passes full site build, site check, SEO check, blog contract validation, indexing priority tests, and file-count guard checks.
