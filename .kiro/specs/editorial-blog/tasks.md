# Implementation Plan: editorial-blog

- [ ] 1. Foundation — navigation, localization, seed content, styles, media pipeline, and budget guard
- [x] 1.1 (P) Register blog navigation, edition-switcher fallback, and seven-table localization parity
  - Add the blog hub link to both primary header and footer navigation across all nine editions (`blog` at weight 6, shifting `faq`/`about` to 7/8 and footer `updates` to 9 to avoid weight collision) while preserving relative menu ordering and route conventions
  - Update the edition switcher so switching editions from an article page falls back to the target edition's blog hub when an edition-specific translation is absent
  - Add all required blog UI labels, reading-time templates, publication/update labels, editorial pillar names, empty-state copy, app download CTA copy, and blog hub SEO metadata strings across all seven base localization tables, keeping the Brazilian Portuguese symlink intact and supplying regional English variants
  - Observable completion: Primary and footer navigation include the blog hub across all nine editions, edition switching from blog articles falls back to the target blog hub, the Brazilian Portuguese symlink remains intact, and localization key parity passes with zero missing keys
  - _Boundary: BlogNavigationAndI18n_
  - _Requirements: 5.1, 5.4_

- [x] 1.2 (P) Create nine-edition blog section scaffolds, shared cover illustration, and localized launch seed article
  - Create the blog section index pages across all nine editions linked by a shared hub translation identifier
  - Author one localized launch seed article across all nine editions using an identical lowercase ASCII slug and matching translation identifier, complete required metadata, a valid editorial pillar, official-broadcasters-only/zero-ads content, and structured FAQ items, paired with one central editorial cover illustration
  - Observable completion: All nine editions contain localized blog hub and launch seed article content referencing one shared cover illustration, ready for media processing, template rendering, and contract validation
  - _Boundary: BlogContentContract_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 4.3, 6.4_

- [x] 1.3 (P) Create sharp-corner blog component styles using CFC design tokens and typography
  - Author dedicated blog layout, card, article header, metadata strip, hero figure, typography prose, and back-navigation styles using existing sharp-corner design tokens and dark-mode contrast variables, and import them into the custom stylesheet entry point
  - Ensure zero FontAwesome icon classes and zero match-list broadcast channel badge classes are introduced while keeping the home page weight within the 100 KB gzip budget
  - Observable completion: Styles compile cleanly into the site bundle with compliant light/dark contrast, zero radius values, and home page weight remaining under 100 KB gzip
  - _Boundary: BlogPresentation_
  - _Requirements: 2.6_

- [x] 1.4 (P) Implement the additive build-time blog budget guard and restore the post-build static file-count guard
  - Create an additive build-time blog file-budget estimator layering blog hubs, published articles, and five processed image outputs per unique cover illustration onto the existing broadcaster budget baseline (warning at 18,001–20,000 and failing above 20,000 under the default budget while honoring explicit `HUGO_CFC_FILE_BUDGET` overrides) without altering the upstream data-pages budget estimator or its unit assertions
  - Restore the empty post-build static file-count guard script to count every file in the generated output directory, log a breakdown and AI full-text summary file size, emit a warning above 18,000 files, and exit non-zero above 20,000 files
  - Observable completion: Build-time budget accounting logs combined totals without regressing upstream dataset budget tests, and the post-build file-count guard passes under 18,000, warns between 18,001 and 20,000, and exits non-zero above 20,000
  - _Boundary: BlogBudgetAndValidation_
  - _Requirements: 4.5, 6.1_

- [x] 1.5 Build the single-source cover image and social preview media pipeline with immutable cache headers
  - Implement a cached media resolver that accepts the central editorial cover illustration path, crops and encodes fingerprinted responsive WebP variants for article cards and hero banners with explicit numeric width and height attributes, and generates a 1200x630 JPEG social preview image compressed within the 300,000-byte ceiling
  - Provide safe fallback behavior when a source cover illustration is absent or exceeds the social preview byte ceiling so page generation never fails unexpectedly
  - Add a long-lived immutable response caching rule for fingerprinted blog image assets in the edge headers configuration
  - Observable completion: Processing the seed cover illustration produces five shared fingerprinted image outputs (WebP card/hero variants and a 1200x630 JPEG <= 300,000 bytes) once across all nine editions, and the edge headers configuration caches blog image outputs immutably
  - _Boundary: BlogMediaPipeline_
  - _Depends: 1.2_
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 2. Core — blog hub and editorial article templates
- [x] 2.1 Implement blog summary card partial and blog hub layout
  - Build the reusable sharp-corner blog summary card partial displaying the responsive WebP cover image with explicit numeric dimensions, editorial pillar pill, title, summary description, locale-formatted publication date, and estimated reading time with zero FontAwesome icons
  - Override the theme's blog list template at root without touching vendored theme directories, rendering breadcrumbs, a localized page hero, the additive build-time blog budget check, a newest-first grid of summary cards, a localized empty state when zero articles are published, and an app download call to action
  - Observable completion: All nine editions render a styled blog hub at their localized paths displaying the seed post card newest-first with zero FontAwesome icons or disabled taxonomy/author links
  - _Boundary: BlogPresentation_
  - _Depends: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Requirements: 2.1, 2.2, 2.5, 2.6, 3.2_

- [x] 2.2 Implement deterministic related-posts selector and editorial article layout
  - Implement a deterministic related-posts selector returning up to three sibling articles in the current edition, prioritizing matching editorial pillars and newest publication dates without relying on disabled Hugo taxonomies
  - Override the theme's blog single template at root to display a three-level breadcrumb trail, editorial pillar badge, title, locale-formatted publication and optional last-updated dates, estimated reading time, eager hero cover image with explicit numeric dimensions and alternative text, typography-styled long-form body, optional visible FAQ accordion matching structured data verbatim, related posts when available, mobile app download CTA, and back-to-blog link
  - Observable completion: Published seed articles render across all nine editions with three-level breadcrumbs, reading time, hero WebP images with explicit dimensions, visible FAQs matching declared items, and app-install CTAs
  - _Boundary: BlogPresentation_
  - _Depends: 1.1, 1.2, 1.3, 1.5, 2.1_
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.2_

- [ ] 3. Integration — SEO metadata, structured data, analytics, edge routing, and IndexNow
- [x] 3.1 Guard hub SEO overrides, fix three-level blog breadcrumbs, and wire blog OG and article tags
  - Restrict section-level SEO hub metadata overrides to section hubs so individual blog posts retain their own titles and descriptions
  - Update the breadcrumb structured data builder to emit three levels (Home, Blog, Article Title) on blog posts and two levels on blog hubs
  - Wire the media pipeline's 1200x630 <= 300,000-byte JPEG social preview into the OG image resolver with safe edition-card fallback, and emit article Open Graph type with published, modified, and section tags on blog posts
  - Observable completion: Blog hubs and seed articles across all nine editions emit distinct titles, descriptions, three-level breadcrumbs on articles, article Open Graph timestamps, and 1200x630 <= 300,000-byte JPEG OG images without breaking existing hub pages
  - _Boundary: BlogSeoHead_
  - _Depends: 1.1, 1.2, 1.5, 2.1, 2.2_
  - _Requirements: 3.3, 4.1, 4.2_

- [x] 3.2 Build Blog and BlogPosting structured data builders and wire optional FAQPage output
  - Create dedicated Blog and BlogPosting structured data builders referencing CardápioFC's Organization publisher/author and resolved OG image URL, and wire them into the unified JSON-LD graph alongside optional FAQPage structured data matching visible article FAQs verbatim
  - Observable completion: Built blog hubs emit valid Blog + BreadcrumbList JSON-LD and built seed articles emit valid BlogPosting + BreadcrumbList + verbatim FAQPage JSON-LD inside a single graph script
  - _Boundary: BlogSeoJsonLd_
  - _Depends: 3.1_
  - _Requirements: 4.4_

- [x] 3.3 (P) Classify blog hubs and articles in analytics page-type configuration
  - Extend the allowed analytics page-type vocabulary and classification logic to distinguish blog hubs from individual editorial articles across all editions without altering consent defaults or zero-ad rules
  - Observable completion: Built blog hubs emit the blog page type and built seed articles emit the article page type in runtime analytics config
  - _Boundary: BlogAnalytics_
  - _Depends: 1.2, 2.1, 2.2_
  - _Requirements: 5.3_

- [x] 3.4 (P) Configure blog geo-routing rules and IndexNow URL priority classification
  - Add unprefixed blog hub and article path matching across all eight regional Cloudflare redirect rules while preserving search/AI crawler exclusions and edition opt-outs
  - Add the blog hub segment and article priority rules to the IndexNow classifier and expand its unit test suite to cover Global and regional blog hubs and posts
  - Observable completion: Edge redirect configuration parses cleanly with blog geo-routing across all eight country rules, and IndexNow unit tests pass with blog hub priority 0 and article priority 2
  - _Boundary: BlogEdgeAndDiscovery_
  - _Requirements: 4.5, 5.2_

- [ ] 4. Validation — contract validator, site/SEO suite extensions, and full release gate
- [x] 4.1 Implement the nine-edition blog contract validator CLI and validation script alias
  - Build a zero-dependency Node ESM validator that verifies all nine blog hub pages exist, every non-draft article exists across all nine editions with identical lowercase ASCII slugs and matching translation identifiers, required metadata fields and pillar values are valid with last-modified >= published date, body content is non-empty, shared cover image files exist on disk, are readable, and have source header dimensions >= 1200x630 (with the processed 1200x630 <= 300,000-byte JPEG OG check enforced post-build by SEO/social verification), optional FAQ items are well-formed, and zero banned taxonomy links or FontAwesome classes appear; expose the validation alias in package scripts
  - Observable completion: Running the blog contract validator passes against the nine-edition launch seed post and exits non-zero when tested against missing editions, invalid pillars, or missing cover images
  - _Boundary: BlogBudgetAndValidation_
  - _Depends: 1.2_
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 6.2_

- [ ] 4.2 Extend site validation and SEO/social verification suites for blog hubs and articles
  - Permit blog output in site validation while continuing to forbid taxonomy, author, RSS, demo, and icon-font outputs
  - Extend the SEO/social verification script to bucket blog hubs and blog articles separately, asserting all nine blog hubs exist, canonicals are self-referencing, reciprocal nine-edition hreflang + x-default exist in both HTML and XML sitemaps, article Open Graph timestamps and 1200x630 <= 300,000-byte OG images are valid, and Blog/BlogPosting/BreadcrumbList/FAQPage parity holds
  - Observable completion: Both site validation and SEO/social verification execute against the built site and explicitly report verified blog hubs and sampled blog articles with zero failures
  - _Boundary: BlogBudgetAndValidation_
  - _Depends: 2.1, 2.2, 3.1, 3.2_
  - _Requirements: 2.4, 3.3, 4.1, 4.2, 4.3, 4.4, 6.3_

- [ ] 4.3 Build the editorial blog end-to-end test suite and test script alias
  - Create an end-to-end editorial blog test suite verifying built nine-edition blog HTML, explicit numeric image dimensions, reading time, related posts/CTA blocks, three-level breadcrumbs, immutable blog image cache headers, geo-routing rules, and synthetic threshold tests for the restored post-build file-count guard and additive blog budget partial; expose the blog test alias in package scripts
  - Observable completion: Running the editorial blog test suite passes all HTML, media, edge, and synthetic threshold assertions with zero leftover temporary directories
  - _Boundary: BlogBudgetAndValidation_
  - _Depends: 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 4.4 Run full build, verification, and regression release gate
  - Execute the blog contract validator, production and sample Hugo builds, site checks, component checks, SEO/social checks, analytics checks, post-build file-count guard, IndexNow tests, editorial blog test suite, and upstream dataset budget tests, confirming vendored directories, the upstream dataset budget partial, and the Portuguese i18n symlink remain intact
  - Observable completion: All validation scripts, builds, and regression gates exit 0 across the nine-edition launch seed post with total static output well below the 18,000-file soft budget
  - _Boundary: BlogBudgetAndValidation_
  - _Depends: 4.3_
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

## Implementation Notes
- Never edit `themes/hugoplate/*` or `_vendor/*`; override solely from root `layouts/` and `assets/`.
- Preserve the `i18n/pt-br.yaml -> pt.yaml` symlink when adding localization strings, and verify `pnpm check` Check C after `pnpm build`.
- Leave `layouts/_partials/cfcdata/budget.html` untouched so `scripts/test-cfc-dataset-budget.mjs` remains green; layer blog file estimates in `layouts/_partials/cfcdata/blog-budget.html`.
- Task-graph sanity review (`kiro-spec-tasks` Step 3.5) verdict: `PASS` (mode: `independent`).
- Pre-Task 2.2 expected build note: Once Task `1.2` creates `content/*/blog/`, `pnpm build` falls back to `themes/hugoplate/layouts/blog/single.html` (`partial "toc.html" not found`) until Task `2.2` adds root `layouts/blog/single.html` (and `pnpm check` flags `public/blog` until Task `4.2`); use `hugo list all` for content parsing checks until Task `2.2` lands.
