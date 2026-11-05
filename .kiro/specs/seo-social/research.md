# Research & Design Decisions: seo-social

---
**Purpose**: Capture discovery findings, architectural investigations, schema specifications, and rationale that inform the technical design for SEO, GEO, structured data, and social preview capabilities.

**Usage**:
- Document discovery findings and trade-offs.
- Record schema mapping details and external validator standards.
- Provide evidence for architectural decisions in `design.md`.
---

## Summary
- **Feature**: `seo-social`
- **Discovery Scope**: Extension & Integration (overriding head SEO, structured data, sitemaps, and social cards on top of `site-foundation` and `data-pages`)
- **Key Findings**:
  1. **JSON-LD Native Dict Architecture**: The current live site double-encodes JSON-LD because templates run string serialization on already-encoded data or fail to use Go-template typed dicts. Generating nested Go `dict` structures and passing them to `jsonify | safeJS` produces clean, valid JSON-LD objects compliant with Google Search Central and Schema.org standards.
  2. **WhatsApp & Social Image Budget**: Generating dynamic PNG/canvas images per match inside Hugo would create ~7,500+ images (exceeding Cloudflare's 20,000 total deployment file budget and blowing build times past 30 seconds). A hybrid static-template model with dedicated, highly optimized 1200×630 cards per edition and competition category stays under 80 KB per file (well below WhatsApp's strict 300 KB limit) with zero build overhead.
  3. **Bidirectional hreflang & x-default**: To pass search engine audits, `hreflang` must strictly use BCP 47 standard formatting (`en`, `en-GB`, `en-IE`, `pt-BR`, `pt-PT`, `es-AR`), every translation must link back reciprocally to all other existing translations, and `x-default` must point to the Global edition's unprefixed URL (`https://cardapiofc.com/...`), not the current page URL.
  4. **Generative Engine Optimization (GEO)**: AI answer engines (ChatGPT Search, Perplexity, Google AI Overviews) rely on direct answer-first headings and matching `FAQPage` schema. Answering "Where to watch {Home} vs {Away} in {Country}?" immediately in paragraph 1 with matching `BroadcastEvent` and `FAQPage` schema maximizes retrieval probability.

## Research Log

### Topic 1: Schema.org SportsEvent & BroadcastEvent Modeling
- **Context**: Football TV guides need Google Search to index live kickoff times and local television channels for rich match carousels and Knowledge Graph entries.
- **Sources Consulted**:
  - Google Search Central: Sports Event Structured Data (`SportsEvent`)
  - Schema.org: `SportsEvent`, `BroadcastEvent`, `BroadcastService`, `SportsTeam`, `SportsLeague`
  - Current CardápioFC upstream contract: `data-pages` `PageEntity`, `MatchVM`, `ChannelGroup`
- **Findings**:
  - A `SportsEvent` must contain `name`, `startDate` (ISO 8601 with timezone offset), `homeTeam` (`SportsTeam`), `awayTeam` (`SportsTeam`), and `eventStatus`.
  - Broadcasters are modeled using `publication`: a slice of `BroadcastEvent` objects where each broadcast has `isLiveBroadcast: true` and `publishedOn: BroadcastService`.
  - In Hugo, `startDate` formatted with `2006-01-02T15:04:05-07:00` guarantees valid timezone offsets.
- **Implications**:
  - `layouts/_partials/seo/jsonld-match.html` will consume `PageEntity.match` and `cfcdata/channels.html` to generate compliant `SportsEvent` and `BroadcastEvent` schemas.

### Topic 2: Avoiding Double-Encoding in Hugo JSON-LD
- **Context**: Live site currently has `<script type="application/ld+json">"{\"@context\": ...}"</script>`, which search crawlers reject as an unparsed string.
- **Sources Consulted**:
  - Hugo Documentation: `jsonify`, `safeJS`, and Contextual Escaping
  - Go `html/template` specifications
- **Findings**:
  - When raw string JSON is placed inside `<script type="application/ld+json">`, Hugo's contextual escaper treats the content as JSON and escapes quotes unless `safeJS` is piped.
  - When building structured data via Go maps/dicts (`dict "@context" "https://schema.org" ...`), `jsonify (dict "indent" "  ") | safeJS` produces formatted JSON objects without double quotes or `\u0022` entity encoding.
- **Implications**:
  - All JSON-LD partials will construct structured dictionaries and invoke a central serialization partial `seo/jsonld-render.html`.

### Topic 3: Social Preview Image Size & WhatsApp Limit
- **Context**: Users frequently share match links via WhatsApp, Telegram, Twitter/X, and iMessage. WhatsApp has a hard limit where it discards preview images larger than 300 KB.
- **Sources Consulted**:
  - WhatsApp Link Preview Crawler Specifications (max 300 KB, recommended 1200×630, 1.91:1)
  - Cloudflare Pages / Static Hosting limit: ≤ 20,000 files total per deployment
  - Roadmap constraints: build time target < 10 s, budget ≤ 18,000 files
- **Findings**:
  - Hugo image generation (`images.Process`, SVG rendering) for 1,260 matches across 6 editions would generate 7,560 images per build, consuming 38% of the deployment file budget and adding 15–30 seconds of build latency.
  - Static edition-branded and league-branded share images (e.g. `assets/images/og/og-{edition}.png`, `assets/images/og/og-league-{slug}.png`) can be authored at 1200×630, compressed with WebP/PNG to ~40–80 KB, and cached indefinitely.
  - A fallback cascade in `seo/og-image.html` checks for match/league-specific images before falling back to edition-specific cards.
- **Implications**:
  - Build times remain under 10 seconds, zero file-count risk, and 100% WhatsApp preview reliability (≤ 80 KB).

### Topic 4: Sitemap Index vs Single Sitemap for Multilingual Editions
- **Context**: CardápioFC operates 6 editions (`en`, `en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`). Search engines require fast discovery of all URLs.
- **Sources Consulted**:
  - Google Search Central: Sitemaps XML format and `xhtml:link` hreflang annotations
  - Hugo Sitemaps Documentation
- **Findings**:
  - Hugo generates a root `/sitemap.xml` sitemap index automatically when multilingual sites are configured, pointing to each language's sitemap.
  - However, default Hugo sitemaps include pages that should not be indexed (e.g. section listings where `build.render = "never"` like `/match/` and `/team/`).
  - By providing a custom sitemap template (`layouts/_default/sitemap.xml`), we can filter specifically for pages where `.Params.cfc.kind` is in `["match", "team", "league", "lineup"]` or home pages, and attach `<xhtml:link>` elements.
- **Implications**:
  - Overriding `layouts/_default/sitemap.xml` and `layouts/sitemapindex.xml` guarantees complete sitemap hygiene.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: Pure Head Hook with Modular Schema Partials | Implement `head-seo.html` hook slot, decomposing into meta, hreflang, open-graph, and jsonld sub-partials | Clean separation of concerns, zero changes to foundation shells, easily testable in isolation | Requires passing Page context through sub-partials | **Chosen approach**: perfectly respects foundation hook slot architecture |
| B: Override Vendored basic-seo directly | Edit vendored `basic-seo.html` in root partials | Reuses basic-seo variable logic | `basic-seo` lacks SportsEvent, BroadcastEvent, and proper BCP 47 x-default logic; brittle | **Rejected**: violates user rules and brief |
| C: Per-Match Dynamic Canvas OG Generation | Generate custom 1200×630 image with team crests for every match at build time | Rich visuals per match | Blows file budget (7.5k+ files), violates build time limit (<10s) | **Rejected**: exceeds file budget and build time |

## Design Decisions

### Decision 1: Structured Data Generation via Dedicated Dict Builder Partials
- **Context**: Multiple complex schema types (`SportsEvent`, `BroadcastEvent`, `SportsTeam`, `SportsLeague`, `BreadcrumbList`, `WebSite`, `Organization`, `FAQPage`) must be emitted without double-encoding.
- **Alternatives Considered**:
  1. Inline strings with formatting (`printf`) — prone to JSON syntax errors and unescaped quotes.
  2. Single monolithic partial — unmaintainable and difficult to test.
  3. Composable Go-template partials returning dicts, serialized by a single renderer — clean, safe, robust.
- **Selected Approach**: Option 3. Composable schema partials (`seo/jsonld-match.html`, `seo/jsonld-team.html`, `seo/jsonld-breadcrumb.html`, etc.) construct native Go dictionaries and pass them to `seo/jsonld-render.html`.
- **Rationale**: Guarantees standard JSON output and makes individual schema testing trivial.

### Decision 2: Static Branded OG Cards with Cascade Strategy
- **Context**: WhatsApp preview images must be ≤ 300 KB, 1200×630, and not exceed deployment budgets.
- **Alternatives Considered**:
  1. Build-time image compositing in Hugo — violates file budget and build speed.
  2. External dynamic image CDN (e.g. Cloudinary/Vercel OG) — introduces external runtime cost/dependency.
  3. Pre-optimized static card cascade (Match/League specific card → Edition card → Global card) — instant builds, €0 cost, 100% WhatsApp reliable.
- **Selected Approach**: Option 3. Deliver pre-optimized 1200×630 cards (each ~50–80 KB) for each edition and major competition.
- **Rationale**: Complies with €0 cost constraint, static hosting limits, and guarantees WhatsApp compatibility.

### Decision 3: Multilingual hreflang with Strict BCP 47 and Global x-default
- **Context**: Current site uses lowercase `.Lang` (`en-gb`) and points `x-default` to the current page, which breaks Google international targeting.
- **Alternatives Considered**:
  1. Use theme defaults — broken.
  2. Custom BCP 47 lookup mapped from `site-foundation` edition registry with `x-default` pointing to `https://cardapiofc.com/...`.
- **Selected Approach**: Option 2. Query `edition/all.html` and `.AllTranslations` to render reciprocal `<link rel="alternate">` tags using `Edition.hreflang` and resolve the Global edition translation for `x-default`.

## Risks & Mitigations
- **Risk 1: Missing translations cause asymmetric hreflang**:
  - *Mitigation*: Only emit `hreflang` for editions where the translation actually exists in `.AllTranslations`.
- **Risk 2: Large sitemap files approaching crawler limits**:
  - *Mitigation*: Hugo sitemap index partitions by language; filtered templates exclude non-indexable shell sections.
- **Risk 3: JSON-LD double-encoding regression**:
  - *Mitigation*: Automated CI check `scripts/check-seo-social.mjs` verifies every sampled page with `JSON.parse()`.

## References
- [Google Search Central: Sports Event](https://developers.google.com/search/docs/appearance/structured-data/sports-event)
- [Schema.org SportsEvent Specification](https://schema.org/SportsEvent)
- [Google Search Central: International SEO & hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Open Graph Protocol](https://ogp.me/)
- [WhatsApp Preview Specs](https://developers.facebook.com/docs/sharing/webmasters/)
