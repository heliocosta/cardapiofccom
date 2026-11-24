# Research & Design Decisions: broadcaster-directory

---
**Feature**: `broadcaster-directory`
**Discovery Scope**: Extension (Light Discovery — integration-focused analysis against Hugo 0.169.0 extended and existing `site-foundation`, `data-pages`, `seo-social`, and `edge-delivery` seams)
**Consulted Skills / Guidance**: `hugo-template-guidance` (`references/project-architecture.md`, `references/content-management.md`), `kiro-spec-design` (`design-principles.md`, `design-discovery-light.md`, `design-synthesis.md`, `design-review-gate.md`)
---

## Summary
Light discovery verified that Approach 1 (Hugo `_content.gotmpl` content adapter + `data/cfc/broadcasters.yaml` overlay) integrates cleanly with Hugo 0.169.0 extended and zero new external dependencies. Five concrete codebase constraints shaped the final architecture: (1) Hugo content adapters cannot call `site.Home`-dependent `edition/*` partials, (2) shared broadcaster slugs across countries require country-scoped `translationKey` and `hreflang` isolation so `check-seo-social.mjs` does not fail on missing `x-default`, (3) `check-data-pages.mjs` Check 6d forbids `cfc-channel-badge` outside match pages, (4) `cfcdata/budget.html` and `data/cfc/settings.yaml` must stay unmodified to preserve formula compatibility (noting `test-cfc-dataset-budget.mjs` itself is a legacy 6-edition test predating the 9-edition expansion), with combined budget + overflow tests living in `scripts/test-broadcaster-directory.mjs`, and (5) `public/` already has 17,104 files so per-broadcaster OG PNG generation must be avoided.

## Research Log

### Topic 1: Hugo 0.169.0 Content Adapter Execution & Edition Context
- **Source**: `content/en/leagues/_content.gotmpl`, `content/en/team/_content.gotmpl`, `layouts/_partials/edition/current.html:4`, `layouts/_partials/edition/all.html:6`.
- **Finding**: `edition/current.html` and `edition/all.html` call `$s.Home`, which is unavailable during Hugo content-adapter execution. Existing adapters never call `edition/*`; they rely on `site.Language.Lang` and `site.Params`.
- **Implication**: `content/en/channels/_content.gotmpl` and `layouts/_partials/cfcdata/broadcasters.html` must read `site.Params.edition` (`isGlobal`/`isglobal`, `country`) and `site.Language.Lang` directly, and accept explicit `country`/`editionCode`/`lang` arguments when invoked for another country (such as Global `/channels/` or Global match pages).

### Topic 2: Live Channel Inventory, Absent Country Files, and Data Artifacts
- **Source**: `contract/cfc-data-v1.schema.json`, `layouts/_partials/cfcdata/dataset.html:96-129,210-229`, `assets/cfc-data/sample/index.json`, built `public/{ed}/match/*/index.html`.
- **Finding**:
  - `channels/<CC>.json` conforms to `Channel { id, name, type ("tv"|"streaming"|"free_tv"), logo, url }` + `matches: Record<MatchSlug, ChannelId[]>`.
  - Live production counts: `pt-br` 36 (incl. `Ge TV`), `en-gb` 51, `en-ie` 44, `pt-pt` 23, `es-ar` 26 = **180 unique country-scoped channels** (`en-us`, `zh-cn`, `ja` currently have 0 live channels and absent `channels/{US,CN,JP}.json` files in both sample and production datasets).
  - Live names contain feed artifacts: placeholders (`canal-a-confirmar`, `nao-confirmado`, `to-be-confirmed`), trailing spaces (`Amazon Prime Video `), and CTA suffixes (`(Watch it live)`, `(Ver ao vivo)`, `(Ver en vivo)`, `(Ver en directo)`, `(Míralo en vivo)`). Also note `i18n/pt-br.yaml` is a symlink (`pt-br.yaml -> pt.yaml`), so Portuguese edits target `i18n/pt.yaml` while preserving the symlink.
- **Implication**: `cfcdata/broadcasters.html` must probe `dataset.channels` keys silently (no `warnf` when a country file is absent) and apply deterministic denylist filtering + regex display-name normalization from `data/cfc/broadcasters.yaml`.

### Topic 3: Cross-Country Slug Collisions, `hreflang`, and `check-seo-social.mjs`
- **Source**: `layouts/_partials/seo/hreflang.html:3-10`, `layouts/sitemap.xml:6-24`, `layouts/_partials/seo/opengraph.html:11`, `scripts/check-seo-social.mjs:71-115`.
- **Finding**: ~30+ channel slugs overlap across countries (`espn`, `espn-3`, `espn-4`, `disney-premium`, `apple-tv`, `onefootball`, `hbo-max`, etc.). With `.EnableAllLanguages` and matching `path`, Hugo groups same-slug regional pages into `.AllTranslations` without Global (`en`), causing `seo/hreflang.html` and `sitemap.xml` to emit cross-country alternates missing `x-default`, which fails `scripts/check-seo-social.mjs:86-90`.
- **Implication**: Pass country-scoped `"translationKey": printf "channel-%s-%s" (lower $country) $slug` in `$.AddPage`, and guard `seo/hreflang.html` and `layouts/sitemap.xml` when `eq .Params.cfc.kind "channel"`. `/channels/` (`_index.md`) retains full 9-edition reciprocal `hreflang` + `x-default`.

### Topic 4: Existing Verification Gates & File Budget Headroom
- **Source**: `scripts/check-data-pages.mjs:621-640`, `scripts/check-site.mjs:126-140,250-271`, `scripts/test-cfc-dataset-budget.mjs:11-15,206-272`, `data/cfc/settings.yaml`, `scripts/indexnow.mjs:21,608-623`, `public/` file count (`17,104`).
- **Finding**:
  - `check-data-pages.mjs` Check 6d fails if `cfc-channel-badge` or `cfc-match-card__channels` appears outside `match/{slug}` pages.
  - `check-site.mjs` enforces strict i18n key parity across all 7 base YAML files (`en`, `pt`, `pt-pt`, `es`, `es-ar`, `zh-cn`, `ja`) and explicit numeric `width`/`height` on every `<img>` inside `cfc-*` markup.
  - `cfcdata/budget.html` and `data/cfc/settings.yaml` follow the formula `E * (M + T + L + 1 + c) + S` (leaving them untouched preserves formula compatibility; note `test-cfc-dataset-budget.mjs` is a legacy 6-edition test predating the 9-edition expansion, so combined budget + overflow tests live in `scripts/test-broadcaster-directory.mjs`).
  - `public/` has 17,104 files (`static/og/` is 1,702 files) vs `fileBudget: 18000` and Cloudflare's 20,000 hard limit. Adding ~189–210 HTML pages (with 0 new OG PNGs) stays within budget (~17,293–17,314 files).
- **Implication**: Use `cfc-broadcaster-*` CSS classes (never `cfc-channel-badge`), keep `cfcdata/budget.html` untouched and add an additive `cfcdata/broadcaster-budget.html` guard, reuse `static/og/editions/og-{ed}.png`, update all 7 base `i18n/*.yaml` files in lockstep, and add `"channels"` to `HUB_SEGMENTS` and `urlPriority()` in `scripts/indexnow.mjs`.

### Topic 5: `/faq/` Rendering vs `FAQPage` JSON-LD & Edge Geo-Routing
- **Source**: `layouts/faq/list.html:22-75`, `layouts/_partials/seo/jsonld.html:11-19`, `cloudflare/redirect-rules.json:6-115`, `static/.well-known/apple-app-site-association`.
- **Finding**: `layouts/faq/list.html` hardcodes 11 Q&As with inline fallbacks while `seo/jsonld.html` loops `seq 1 11` over `i18n` separately. `cloudflare/redirect-rules.json` uses an explicit path allowlist (excluding bots), and AASA excludes `/channels/*` (no app deep-link conflict).
- **Implication**: Extract `layouts/_partials/cfcpage/faq-page-items.html` consumed by both `layouts/faq/list.html` and `seo/jsonld.html` (covering Q1–Q12 including included broadcasters), render the visual "Included Broadcasters & Services" directory outside the accordion using a shared `cfcpage/broadcasters-directory.html` partial, and add exact `http.request.uri.path eq "/channels"` / `"/channels/"` (never `starts_with`) to `cloudflare/redirect-rules.json`.

## Architecture Pattern Evaluation
- **Chosen**: Approach 1 — Hugo Content Adapter (`content/en/channels/_content.gotmpl`) + Repo YAML Overlay (`data/cfc/broadcasters.yaml`) + unified `cfcdata/broadcasters.html` resolver.
- **Rejected**:
  - Approach 2 (Hybrid Adapter + Per-Channel Markdown): Dual content sources risk slug drift with live `ChannelId`s and complicate hub/FAQ sync.
  - Approach 3 (Curated Allowlist-Only Detail Pages): Misses newly launched official networks (like `Ge TV`) until manually allowlisted, and prevents full match-page → broadcaster internal linking.

## Design Decisions (Synthesis Outcomes)

### Decision 1: Single Adapter-Safe Broadcaster Catalog Resolver (Generalization)
Consolidate merging, denylist exclusion, display-name normalization, curated overlay enrichment, and chronological match-list inversion into one cached partial (`layouts/_partials/cfcdata/broadcasters.html`) returning `{ bySlug, list, groups, country, editionCode, totalUpcoming }`. All four consumers (content adapter, hub/FAQ directory, detail page/JSON-LD, and match-page linker) read the same cached output, eliminating drift and redundant passes.

### Decision 2: Reusable Directory Partial & Unified FAQ Items Partial (Generalization + Simplification)
- Extract `layouts/_partials/cfcpage/broadcasters-directory.html` (with a `compact` mode) shared by `/channels/` (`layouts/channels/list.html`) and `/faq/` (`layouts/faq/list.html`).
- Extract `layouts/_partials/cfcpage/faq-page-items.html` shared by `layouts/faq/list.html` and `layouts/_partials/seo/jsonld.html`, mirroring `cfcpage/faq-items.html`.

### Decision 3: Additive Broadcaster Budget Guard (Backward Compatibility + Simplification)
Leave `layouts/_partials/cfcdata/budget.html` and `data/cfc/settings.yaml`'s `fixedPerEdition: 5` untouched to preserve formula compatibility (noting `test-cfc-dataset-budget.mjs` is a legacy 6-edition test predating the 9-edition expansion). Enforce combined file budget in `layouts/_partials/cfcdata/broadcaster-budget.html` (invoked once via `partialCached` from `content/en/channels/_content.gotmpl`) plus combined budget and overflow tests in `scripts/test-broadcaster-directory.mjs`.

### Decision 4: Build vs. Adopt — 100% Hugo-Native, Zero New Dependencies
Adopt Hugo 0.169.0 content adapters, `site.Data` YAML loading, existing `cfc/*` and `cfcpage/match-days.html` UI primitives, and existing edition OG cards (`static/og/editions/og-{ed}.png`). No new npm, Go, or Python packages are introduced.

## Risks & Mitigations
- **Risk**: Shared slugs across countries accidentally trigger cross-country `hreflang` and break `check-seo-social.mjs`.
  - **Mitigation**: Set country-scoped `translationKey` in `_content.gotmpl`, explicitly guard `seo/hreflang.html` and `layouts/sitemap.xml` on `kind == "channel"`, and assert 0 `hreflang` links on sampled channel detail pages in `scripts/check-seo-social.mjs`.
- **Risk**: Match-page channel links 404 for denylisted or absent channels.
  - **Mitigation**: `layouts/_partials/cfcpage/channels.html` resolves links strictly via `index $catalog.bySlug $chId`; missing/excluded IDs fall back to plain text.
- **Risk**: Curated persistent broadcasters push file count over 18,000 when live feeds grow.
  - **Mitigation**: `cfcdata/broadcaster-budget.html` halts builds if combined estimate exceeds `fileBudget` (`18,000`), and zero new OG PNGs are generated.
- **Risk**: `en-us`, `zh-cn`, `ja` have no live channel files yet.
  - **Mitigation**: `cfcdata/broadcasters.html` returns an empty live map silently when `channels/<CC>.json` is absent and renders the localized empty state on `/{ed}/channels/` unless persistent curated entries exist.

## References
- `contract/cfc-data-v1.schema.json`
- `.kiro/specs/data-pages/requirements.md`
- `.kiro/specs/seo-social/requirements.md`
- `.kiro/specs/broadcaster-directory/brief.md`
- `.kiro/specs/broadcaster-directory/requirements.md`
