# Research & Design Decisions: editorial-blog

## Discovery Classification
- **Type**: Extension to an existing Hugo Extended `0.169.0` multi-edition static site (`site-foundation`, `seo-social`, `edge-delivery`, `analytics-consent`).
- **Process**: Light Discovery (`design-discovery-light.md`) + Design Synthesis (`design-synthesis.md`), grounded in direct inspection of all existing SEO, layout, analytics, edge, and verification files.

## Skills & Guidance Consulted
- `.agents/skills/hugo-template-guidance/SKILL.md` (`references/project-architecture.md`, `adding-new-pages.md`, `content-management.md`, `i18n-guidance.md`, `styling-and-theming.md`, `page-configuration.md`): verified Hugo 0.169.0 new template system (`layouts/_partials/`, root `layouts/blog/{list,single}.html` overriding `themes/hugoplate`), Tailwind CSS v4 CSS-first `@tailwindcss/typography` + `hugo_stats.json`, and upgrade-safety rules (`themes/hugoplate/*` and `_vendor/*` untouched).

## Codebase Inspection Findings & Integration Seams

### 1. Theme Blog Override & Check-Site Constraints
- `themes/hugoplate/layouts/blog/{list,single}.html` and `themes/hugoplate/layouts/_partials/components/blog-card.html` use FontAwesome `fa-*` icon classes, link to `/categories/`, `/tags/`, and `/authors/`, and pull sidebar widgets.
- `hugo.toml` sets `disableKinds = ["taxonomy", "term", "RSS"]`.
- `scripts/check-site.mjs` currently includes `'public/blog'` in `forbiddenPaths` (line 210), bans `.woff`/`.woff2`/FontAwesome assets in `public/`, enforces WCAG contrast & Home page weight `<= 100 KB` gzip / JS `<= 10 KB`, and in `--components` mode checks that `<img>` elements inside `cfc-*` markup have explicit numeric `width` and `height` attributes.
- **Implication**: Root `layouts/blog/list.html`, `layouts/blog/single.html`, and custom `layouts/_partials/blog/*` partials completely shadow the theme without modifying `themes/hugoplate/*`, use `cfc/icon.html` (inline Material SVGs) instead of `fa-*`, and remove only `'public/blog'` from `check-site.mjs` `forbiddenPaths`.

### 2. SEO Context, Breadcrumbs, Open Graph, and JSON-LD Seams
- **`layouts/_partials/seo/context.html`**: Line 52-58 (`{{ else if not $p.IsHome }}`) looks up `seo_<hubKey>_title` and `seo_<hubKey>_desc` where `$hubKey` defaults to `$p.Section`. Without guarding by `$p.IsSection`, adding `seo_blog_title` / `seo_blog_desc` for `/blog/` would overwrite every individual blog post's `<title>` and `<meta name="description">`. Inspection of `content/` confirms all existing `seo_*_title` hubs (`about`, `faq`, `leagues`, `teams`, `matches`, `search`, `favourites`, `my_agenda`, `settings`) are `_index.md` (`IsSection == true`), and `privacy.md` has no `seo_legal_title`. Guarding line 52 with `{{ else if and (not $p.IsHome) $p.IsSection }}` cleanly scopes hub overrides to section hubs only.
- **`layouts/_partials/seo/jsonld-breadcrumb.html`**: Line 14 (`if and (not .ctx.kind) .page.Section`) overwrites `$lastName` to `i18n .page.Section` and omits the intermediate section crumb. Extending it for `and (eq .page.Section "blog") .page.IsPage` inserts `{ name: i18n "blog", url: (("blog/" | relLangURL) | absURL) }` at position 2 and keeps `.page.Title` at position 3 (`Home > Blog > Post Title`), while `blog/_index.md` (`IsSection`) emits 2-level `Home > Blog`.
- **`layouts/_partials/seo/og-image.html`**: Needs a blog-post branch before the edition card fallback. Resolving `$p.Params.image` via `resources.Get (strings.TrimPrefix "/" $imgPath)` and processing `.Fill "1200x630 Center jpeg q80" | fingerprint` produces a `1200x630` JPEG under `/images/blog/...`. Guarding with `le (len $ogRes.Content) 300000` (with fallback to `og/editions/og-{ed}.png` if missing or oversized) ensures runtime safety while `validate-blog.mjs` and `check-seo-social.mjs` fail CI if any post exceeds 300,000 bytes.
- **`layouts/_partials/seo/opengraph.html`**: Needs `and (eq $p.Section "blog") $p.IsPage` added to `og:type = "article"`, plus `<meta property="article:published_time">`, `<meta property="article:modified_time">`, and `<meta property="article:section">` tags.
- **`layouts/_partials/seo/jsonld.html`**: Currently dispatches on `.ctx.kind` or `eq .page.Section "faq"`. Adding branches for `and (eq .page.Section "blog") .page.IsSection` (`seo/jsonld-blog.html` -> `Blog`) and `and (eq .page.Section "blog") .page.IsPage` (`seo/jsonld-blog-posting.html` -> `BlogPosting` + optional `seo/jsonld-faq.html` when `.page.Params.faq` is non-empty) integrates into the unified `@graph` without altering `seo/jsonld-render.html` or `hooks/head-seo.html`.

### 3. Build Budget & Post-Build File Count Guard
- `scripts/check-file-count.mjs` is currently 0 bytes, even though `.github/workflows/deploy.yml` executes `pnpm check-file-count` right after `pnpm build`.
- `scripts/test-cfc-dataset-budget.mjs` pins `layouts/_partials/cfcdata/budget.html`'s exact `warnf` text (`"data-pages: estimated output files ..."`) and `E*(M+T+L+1+c)+S` formula. `broadcaster-directory` already established the additive pattern (`layouts/_partials/cfcdata/broadcaster-budget.html`) to avoid breaking `budget.html` tests.
- **Decision**: Keep `cfcdata/budget.html` untouched so `test-cfc-dataset-budget.mjs` remains green; introduce `layouts/_partials/cfcdata/blog-budget.html` (invoked via `partialCached` from `layouts/blog/list.html`) to add blog hubs + published posts + processed blog images onto `broadcaster-budget.html`'s combined total and fail with `errorf` if `combined > budget`; AND restore `scripts/check-file-count.mjs` to walk `public/` post-build (soft warn `> 18,000`, hard fail `> 20,000`, plus `llms-full.txt` byte-size reporting).

### 4. Edition & Language Structure
- `config/_default/languages.toml` defines 9 editions (`en`, `en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`, `en-us`, `zh-cn`, `ja`), each with its own `contentDir` (`content/<ed>`).
- Placing `content/<ed>/blog/_index.md` and `content/<ed>/blog/{slug}.md` across all 9 `contentDir`s with matching `translationKey` causes Hugo to populate `.AllTranslations` natively for `seo/hreflang.html`, `layouts/sitemap.xml`, `seo/opengraph.html` (`og:locale:alternate`), and `cfc/edition-switcher.html`.
- `i18n/` uses 7 base tables (`en.yaml`, `pt.yaml`, `pt-pt.yaml`, `es.yaml`, `es-ar.yaml`, `zh-cn.yaml`, `ja.yaml`) with `i18n/pt-br.yaml -> pt.yaml` symlinked; `scripts/check-site.mjs` Check C enforces 100% key parity across those 7 base tables.

### 5. Analytics, Edge Routing, and IndexNow
- `layouts/_partials/analytics/page-type.html` restricts `$valid` to an explicit slice; adding `"blog"` and `"article"` cleanly distinguishes hub vs post without modifying `assets/js/analytics/*`.
- `cloudflare/redirect-rules.json` geo-routes unprefixed shared paths across all 8 regional rules with bot exclusions; adding `/blog`, `/blog/`, and `starts_with(http.request.uri.path, "/blog/")` works because slugs are identical across all 9 editions.
- `scripts/indexnow.mjs` assigns `0` to `HUB_SEGMENTS` (`tailLen === 1`) and `2` to league/channel detail pages; adding `"blog"` to `HUB_SEGMENTS` and returning `2` when `section === "blog"` and `tailLen > 1` aligns blog priority with existing rules.

## Design Synthesis Outcomes
1. **Generalization**:
   - Extract one shared `layouts/_partials/blog/cover.html` partial that resolves the single source asset under `assets/images/blog/` once and produces both the WebP hero/card variants and the `1200x630` JPEG (`q80`) OG resource via `partialCached`, consumed by `blog/list.html`, `blog/single.html`, `blog/card.html`, and `seo/og-image.html`.
   - Reuse the existing `.cfc-faq` / `.cfc-faq__item` / `.cfc-faq__q` / `.cfc-faq__a` CSS and `seo/jsonld-faq.html` + `check-seo-social.mjs`'s `verifyFaqParity()` for optional article FAQs instead of creating a parallel FAQ schema/check system.
2. **Build vs. Adopt**:
   - Adopt Hugo's native `Page.ReadingTime`, `.WordCount`, Hugo Pipes image resizing/fingerprinting, and `.AllTranslations` instead of custom Node pre-processors.
   - Adopt `@tailwindcss/typography` (`prose` / `dark:prose-invert`, already bundled in `assets/css/main.css`) paired with CFC CSS tokens in `assets/css/cfc/components/blog.css` instead of writing bespoke Markdown element CSS.
   - Build a lightweight zero-dependency Node ESM validator (`scripts/validate-blog.mjs`) for pre-push 9-edition frontmatter/slug/image contract validation (used both in CI/local checks and by downstream `blog-automation`).
3. **Simplification**:
   - Compute related posts directly in `layouts/_partials/blog/related.html` over `where site.RegularPages "Section" "blog"` (same pillar first, newest-first, max 3) instead of enabling Hugo related-index config across disabled taxonomies.
   - Keep `cfcdata/budget.html` untouched and use additive `cfcdata/blog-budget.html` + restored `scripts/check-file-count.mjs`.
