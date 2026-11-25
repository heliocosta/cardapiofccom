# Brief: editorial-blog

## Problem
Cardápio FC has strong programmatic match, team, league, and broadcaster pages across 9 regional editions, but no editorial surface to capture non-fixture organic SEO/GEO search intent (streaming rights changes, football watch guides, app feature guides, broadcasting market analysis) that drives mobile app installs.

## Current State
All 7 prior specs are complete across 9 active editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`). Today:
- `themes/hugoplate` ships stock blog layouts that are incompatible with Cardápio FC's `cfc-*` design system, depend on FontAwesome `fa-*` icons, and link to disabled `/categories/`, `/tags/`, and `/authors/` pages (`disableKinds = ["taxonomy", "term", "RSS"]` in `hugo.toml`).
- `scripts/check-site.mjs` explicitly bans `'public/blog'` in `forbiddenPaths`.
- `layouts/_partials/seo/context.html` overwrites single-page `<title>` and `<meta name="description">` whenever an `i18n "seo_<section>_title"` / `"seo_<section>_desc"` hub key exists, which would clobber individual blog post metadata.
- `layouts/_partials/seo/jsonld-breadcrumb.html` does not handle 3-level blog breadcrumbs (`Home > Blog > Post Title`).
- `layouts/_partials/seo/og-image.html`, `layouts/_partials/seo/opengraph.html`, `layouts/_partials/seo/jsonld.html`, `layouts/_partials/analytics/page-type.html`, and `scripts/check-seo-social.mjs` lack blog support.
- `scripts/check-file-count.mjs` is currently 0 bytes, leaving `.github/workflows/deploy.yml`'s `pnpm check-file-count` step as a no-op despite Cloudflare's 20,000-file static asset limit (~17.1k files in production).

## Desired Outcome
A clean, fast, upgrade-safe Hugo blog section live across all 9 editions with:
- A strict Markdown content and frontmatter contract (`content/<ed>/blog/{slug}.md` with shared ASCII slug + `translationKey`).
- A single shared cover image per post (`assets/images/blog/{slug}`) processed via Hugo Pipes into responsive WebP hero assets and a `1200x630` JPEG (`q80`, ≤ 300 KB) OG image.
- Custom `cfc-*` blog hub and article layouts with reading time, related posts, and app-install CTAs.
- Full SEO/GEO integration (`BlogPosting`, `Blog`/`CollectionPage`, 3-level `BreadcrumbList`, optional `FAQPage` JSON-LD, `og:type="article"` with timestamps, reciprocal `hreflang`, IndexNow priority, and `llms.txt` compatibility).
- Restored `scripts/check-file-count.mjs` (18,000 soft budget / 20,000 hard limit) and a blog contract/9-edition-parity validator.
- 1 launch/seed post published and verified across all 9 editions.

## Approach
**Approach A — Native Hugo Markdown + Root `cfc-*` Overrides + Shared Hugo Pipes Media**:
Store posts as native Markdown files (`content/<ed>/blog/_index.md` and `content/<ed>/blog/{slug}.md`) across all 9 editions linked by shared ASCII slugs and `translationKey`, paired with 1 shared illustration per post under `assets/images/blog/{slug}.{png,jpg,webp}` processed once via Hugo Pipes. Override `themes/hugoplate` solely from root `layouts/blog/{list,single}.html` and `layouts/_partials/` without modifying `themes/` or `_vendor/`.

## Scope
- **In**:
  - Content contract and frontmatter schema (`title`, `description`, `date`, `lastmod`, `translationKey`, `pillar`, `image`, `image_alt`, `faq`, `draft`).
  - `layouts/blog/{list,single}.html` + article cards, reading time, related posts, and app-install CTA partial using `cfc-*` tokens and `@tailwindcss/typography`.
  - Hugo Pipes hero image + `1200x630` JPEG (`q80`, ≤ 300,000 bytes) OG pipeline + cache rule for `/images/blog/*` in `static/_headers`.
  - SEO/GEO hooks: `$p.IsSection` guard in `seo/context.html`, 3-level `seo/jsonld-breadcrumb.html`, `BlogPosting` / `Blog` / optional `FAQPage` in `seo/jsonld.html`, `og:type="article"` + `article:published_time` / `article:modified_time` in `seo/opengraph.html`, and blog image branch in `seo/og-image.html`.
  - `analytics/page-type.html` blog/article classification, `menus.toml` navigation integration, and 100% i18n key parity across all 7 base tables (`en`, `pt`, `pt-pt`, `es`, `es-ar`, `zh-cn`, `ja`).
  - `scripts/indexnow.mjs` blog hub/post priority, removing `'public/blog'` from `scripts/check-site.mjs`, adding `blog-hub` / `blog-post` buckets to `scripts/check-seo-social.mjs`, restoring `scripts/check-file-count.mjs` (18,000/20,000 guard) + blog accounting in `cfcdata/budget.html`, and adding a blog contract / 9-edition parity validator script.
  - Optional `/blog` and `/blog/*` geo-routing rules in `cloudflare/redirect-rules.json` (safe because slugs are shared across all 9 editions).
  - 1 verified seed post across all 9 editions.
- **Out**:
  - Taxonomy, tag, or author archive pages (`disableKinds = ["taxonomy", "term", "RSS"]` remains intact to protect Cloudflare's 20k file cap).
  - RSS feeds (deferrable to a follow-up).
  - Comments, newsletter/email capture, or user-submitted content.
  - Advertisements or sponsorships (zero-ads site policy).
  - The Antigravity scheduled automation, editorial playbook, or topic backlog (owned by `blog-automation`).

## Boundary Candidates
- **Content & frontmatter contract**: Directory structure, shared slug / `translationKey` invariant, and required frontmatter fields.
- **`cfc-*` blog layouts & CTAs**: Hub list, article template, reading time, related posts, and app-install conversion blocks.
- **Hugo Pipes image & OG pipeline**: Single source asset under `assets/images/blog/` producing hero WebP and ≤ 300 KB 1200×630 JPEG OG outputs.
- **SEO/GEO, analytics, i18n & IndexNow seams**: Schema graph, Open Graph, breadcrumbs, menus, and 7-table i18n parity.
- **Validation & budget gates**: `check-site.mjs`, `check-seo-social.mjs`, restored `check-file-count.mjs`, `cfcdata/budget.html`, and blog contract validator.

## Out of Boundary
- Automated topic ideation, web research, AI writing/localization, AI illustration generation, cron scheduling, and git auto-push (owned by `blog-automation`).

## Upstream / Downstream
- **Upstream**:
  - `site-foundation`: 9-edition registry, `cfc-*` Tailwind v4 design system, i18n tables, and `menus.toml`.
  - `seo-social`: `<head>` hooks, JSON-LD `@graph`, Open Graph, reciprocal `hreflang`, and `check-seo-social.mjs`.
  - `edge-delivery`: `deploy.yml`, `static/_headers`, `cloudflare/redirect-rules.json`, `indexnow.mjs`, and 20k Cloudflare Workers Static Assets limit.
- **Downstream**:
  - `blog-automation`: Strictly consumes `editorial-blog`'s Markdown/frontmatter/image contract and local validation commands before pushing posts to `main`.

## Existing Spec Touchpoints
- **Extends**: None directly (integrates via documented seams in `site-foundation`, `seo-social`, and `edge-delivery`).
- **Adjacent**: `seo-social`, `edge-delivery`, `analytics-consent`, `broadcaster-directory`.

## Constraints
- **Hugo pin**: Hugo Extended `0.169.0` exact pin (`netlify.toml`, `.tool-versions`, `config/build.json`), new template system (`layouts/_partials/`, `home.html`, top-level `baseof.html`).
- **Styling**: Tailwind CSS v4 CSS-first (`data/theme.json` → `generated-theme.css`, `@tailwindcss/typography`, `.dark` class dark mode, sharp corners `--cfc-radius-*: 0`).
- **Upgrade safety**: `pnpm` package manager; never edit `themes/hugoplate/*` or `_vendor/*`.
- **Media & SEO limits**: Every `og:image` must be `1200x630` and ≤ 300,000 bytes (`check-seo-social.mjs`); `en` edition must always exist for `x-default` `hreflang`.
- **Cloudflare file cap**: 20,000 hard limit / 18,000 soft budget (`data/cfc/settings.yaml`, pinned by `test-cfc-settings.mjs`).
- **Editorial policy**: Zero ads; 100% official broadcasters only; monitor `llms-full.txt` size as posts accumulate.
