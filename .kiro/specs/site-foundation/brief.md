# Brief: site-foundation

## Problem
CardápioFC is going from Brazil-only to worldwide. The repo is a nearly stock hugoplate install with demo content. The working-tree `hugo.toml` is broken: all site config (baseURL, theme, outputs, module mounts, build stats, permalinks, plugins, GA) was replaced by top-level `[en] [en-gb] …` tables that Hugo ignores. Only English i18n exists, there are no per-edition menus and the visual design is stock. Every other spec needs a correct, upgrade-safe base.

## Current State
- Project-setup mode (`themes/hugoplate`, root `hugo.toml`, `config/_default/*`). Hugo 0.165.0 extended, Tailwind v4, pnpm, Hugo modules vendored in `_vendor/`.
- `config/_default/languages.toml` lists en, en-gb, en-ie, pt-br, pt-pt, es-ar, but all use contentDir `content/english` and the locales are wrong. Per-edition timezone, title and params are lost in the invalid hugo.toml.
- `i18n/en.yaml` only (14 stock keys). `menus.en.toml` stock. `params.toml` partially customised (logos, GA/AdSense IDs, keywords). `data/theme.json` has the CardápioFC green palette and Inter + Saira Condensed.
- Live site issues to avoid repeating: kick-off labelled "local" but actually UTC; generic meta descriptions; 1.3 MB list pages.

## Desired Outcome
- A valid `hugo.toml` restored from `HEAD` and cleaned up. A single **edition registry** for each edition: code, locale (BCP47), country ISO, timeZone, URL prefix, hreflang, i18n file, title/description. Global `en` is served unprefixed at root (`defaultContentLanguageInSubdir = false`). The others use `/en-gb/`, `/en-ie/`, `/pt-br/`, `/pt-pt/`, `/es-ar/`.
- Adding a new edition = add the registry entry + i18n file (if a new language) + JSON. No template changes.
- `i18n/en.yaml`, `pt.yaml`, `es.yaml`, plus regional overrides where wording differs (e.g. `pt-pt.yaml` "equipa" vs "time", `en-gb.yaml` "fixtures"/"kick-off").
- Demo content (blog, authors, testimonials, elements, sitepins demo) removed. Unused outputs/kinds disabled (taxonomy, term, RSS, per-page md where unneeded).
- A redesigned, mobile-first visual system: tokens in `data/theme.json`, light/dark, header with edition switcher, footer, page shells for list/detail pages, and accessible, fast components (match card, team crest, channel badge, date group). Minimal JS.
- All customisation lives in root `layouts/`, `assets/`, `config/`, `i18n/`, `data/`. Nothing in `themes/hugoplate` or `_vendor`.

## Approach
Use hugoplate as-is wherever possible: `baseof`, essentials, images module, theme generator, language switcher. Override only specific partials from root `layouts/_partials/`. Keep edition data in config `languages.<code>.params` (Hugo-native) so templates read `site.Params` / `site.Language.Locale`. Use `time.In` with the edition timezone, plus `time.Format`/`lang.FormatDate` for localised dates.

## Scope
- **In**: config repair, edition registry, content dirs per edition, i18n, menus, demo cleanup, design tokens, base layouts/partials, home page shell (the data comes from data-pages), 404 per edition, edition switcher, CI version consistency (pick one Go version, remove unused deploy configs or mark them as such), pnpm as the only lockfile.
- **Out**: data fetching and entity pages (data-pages), SEO tags (seo-social), tracking (analytics-consent), hosting (edge-delivery).

## Boundary Candidates
- Configuration and edition registry
- i18n strings and localised date/time formatting helpers
- Design system (tokens, components) and base layouts

## Out of Boundary
- Any remote data access or page generation
- Meta/JSON-LD/hreflang output
- Redirects, hosting, analytics

## Upstream / Downstream
- **Upstream**: hugoplate theme, gethugothemes modules, Hugo 0.165.0
- **Downstream**: every other spec (edition registry, time helpers, components)

## Existing Spec Touchpoints
- **Extends**: none
- **Adjacent**: data-pages (components it renders), seo-social and analytics-consent (head partial hook points)

## Constraints
- Follow AGENTS.md: project-setup mode, new template system paths, Tailwind v4 via theme.json, `pnpm dev`/`build` only, and the pre-flight checks (Hugo extended == netlify.toml HUGO_VERSION).
- Do not run `remove-multilang`. `pnpm update-theme` must still work after this spec.
- Language codes stay lowercase for URLs (`en-gb`); locales are BCP47 (`en-GB`).
