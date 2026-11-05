# Implementation Plan

> Conventions: run every command through the project's pnpm scripts (`pnpm dev`, `pnpm build`, `pnpm check`, `pnpm check:components`); never edit `themes/hugoplate/` or `_vendor/`; follow the new template system paths (`layouts/_partials/`, `layouts/home.html`, top-level `layouts/baseof.html`). Component names below refer to `design.md` → Components and Interfaces.

- [ ] 1. Foundation: configuration, registry and test harness

- [ ] 1.1 Run pre-flight checks and confirm Hugo behaviours on the pinned version
  - Confirm Node, pnpm and Hugo extended exactly matching the `HUGO_VERSION` in `netlify.toml` (0.169.0); stop and ask the user to install it (mise) if it does not match
  - In a throwaway site outside the repository, confirm on 0.169.0: per-key i18n merge with single-file base mounts declared before the `i18n` directory mount, `time.AsTime` location trick, localised `time.Format` layouts, root `404.html` precedence over a theme `404.en.html`, and removal of the `/en/` alias with `disableDefaultLanguageRedirect`
  - Done when every behaviour listed in the design's research findings is confirmed on 0.169.0, or any deviation is reported to the user before further work
  - _Requirements: 1.1, 12.1_

- [ ] 1.2 Settle the package manager, align build tooling and remove unused deployment configurations
  - Align the Go version in the development container with the pinned version, declare pnpm as the project package manager and rename the package, delete the npm lock file and the Vercel, Amplify and GitLab configurations, and leave the Netlify configuration as the version source of truth
  - Run `pnpm install` so the pnpm lock file is the only one and later tasks resolve the package manager unambiguously
  - Done when the repository contains only the pnpm lock file, the retained configurations pin Hugo 0.169.0 and Go 1.25.1, and `pnpm install` succeeds (the build itself is repaired in 1.3)
  - _Requirements: 12.1, 12.2, 12.3_

- [ ] 1.3 Restore and clean the site configuration
  - Restore the full configuration from the last committed version, keeping the theme line where the theme generator expects it, and apply the design's changes: production base URL, global site settings, Global unprefixed with the default-language alias disabled, disabled taxonomy/term/RSS kinds, trimmed outputs without the search index format, retained analytics placeholder
  - Replace the plugin lists with the single lazy stylesheet and single lazy script placeholders, create those placeholder assets, and override the theme's main script with an empty script so the removed slider plugin is never referenced
  - Done when `pnpm build` completes, the theme generator regenerates the theme tokens without errors, and the build output contains no taxonomy pages, feeds, per-page Markdown copies or slider/lightbox assets
  - Leave the i18n mount block to task 1.4 (it is appended to the module mounts in the root `hugo.toml`)
  - _Requirements: 1.2, 1.3, 3.4, 3.5_

- [ ] 1.4 Define the six-edition registry, edition content folders and the i18n mount chain
  - Write the registry entries for Global, UK, Ireland, Brazil, Portugal and Argentina with every field of the design's registry schema, moving titles, descriptions and per-edition copyright notices from the broken configuration
  - Create one content folder per edition with a home page front matter (heading, intro, description)
  - Append the base-to-edition i18n mounts followed by the project i18n directory mount to the module mounts in the root `hugo.toml`, and create minimal base tables for English, Portuguese and Spanish holding the base-language marker
  - Done when `pnpm build` produces a home page at `/`, `/en-gb/`, `/en-ie/`, `/pt-br/`, `/pt-pt/` and `/es-ar/`, and no `/en/` page exists
  - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.7, 3.1, 3.2_

- [ ] 1.5 Remove demo content and stock configuration
  - Delete the demo content tree, the demo content-management configuration and the demo images, keeping favicon, logos and the share image
  - Remove demo-only parameters (main sections, search, navigation button, widgets, map, subscription, comments, announcement, preloader, diagrams) while leaving analytics, ads, consent and SEO parameters untouched
  - Replace the English-only menu file with a site-wide menu file containing the home entry identified for translation
  - Keep the build green while the theme page templates are still active: if the theme home template requires removed demo front matter or data, add a minimal temporary root home template that task 4.4 replaces
  - Done when `pnpm build` succeeds and no blog, author, elements, about, contact or testimonial pages exist in the output
  - _Requirements: 3.3, 6.5_

- [ ] 1.6 Create the component reference (styleguide) harness
  - Add styleguide pages for the Global, UK, Brazil and Portugal editions, a fixture data file with matches (scheduled, live, finished, postponed, empty channels, broken crest URL, DST transition date, late-night UTC kick-off) and a styleguide layout that only includes one stub partial per section (base, edition, i18n, time, crest-kickoff, channel-icon, match-card, date-group, switcher-menu, page-header, chrome), so each later task edits only its own section partial
  - Exclude the styleguide pages from production builds through production-environment configuration
  - Done when `pnpm dev` serves the styleguide on the four editions and `pnpm build` output contains no styleguide page
  - _Requirements: 3.3, 11.5_

- [ ] 2. Edition, interface-string and time contracts

- [ ] 2.1 Implement the edition contract and registry validation
  - Provide the current-edition and all-editions view-models exactly as specified (derived code, prefix, home URL; weight order; plain values only)
  - Implement the validator with every assertion listed in the design, failing the build with messages naming the edition and field; call it from the edition styleguide section until the root skeleton exists; update only the edition section partial
  - Done when the styleguide lists the six editions with all fields, and temporarily breaking the Portugal time zone or removing its i18n mount fails the build with a message naming `pt-pt` and the field
  - _Requirements: 2.2, 2.5, 2.6, 2.8_

- [ ] 2.2 (P) Complete the base and regional interface-string tables
  - Fill the English, Portuguese and Spanish base tables with the full key set from the design (navigation, switcher, home, empty and not-found states, statuses, channel types, broadcaster message, date/time layouts, theme partial keys)
  - Add the UK, Ireland, Portugal and Argentina override tables containing only differing wording
  - Done when all three base tables have identical key sets, regional tables contain only override keys, and the Portugal edition renders "equipa"-style wording while Brazil renders "time"-style wording on the styleguide
  - Update only the i18n styleguide section partial
  - _Boundary: I18nTables_
  - _Requirements: 2.7, 4.1, 4.2, 4.3, 4.5_

- [ ] 2.3 (P) Implement the time contract
  - Provide parse, local, format, zone, day-key and group-by-day returning partials with the styles, offset formatting and invariants defined in the design
  - Reject time strings without an explicit UTC designator or offset with a build error naming the value
  - Done when the styleguide shows the design's expected outputs: 19:45 with "UK time (UTC+0)" for the November fixture on the UK edition, 16:45 with "horário de Brasília (UTC−3)" on Brazil, UTC+1 for the October fixture on the UK edition, and the late-night fixture grouped under different days on Brazil and Global
  - _Depends: 2.1_
  - Update only the time styleguide section partial
  - _Boundary: TimeContract_
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [ ] 3. Design system and shared components

- [ ] 3.1 Establish design tokens and base styles
  - Extend the theme data file with the semantic light and dark colour tokens while keeping existing keys, and keep the brand fonts and type scale
  - Turn the root custom stylesheet into the entry that adds the extra theme tokens and imports the base, layout and per-component style files (create every component style file as an empty stub so later tasks only edit their own file)
  - Add base styles for the focus ring, skip link, minimum target size, reduced-motion handling and responsive container/header/footer/shell layout
  - Done when the regenerated theme stylesheet contains the new colour tokens, `pnpm build` succeeds, and the base styleguide section shows the visible focus ring and no horizontal scroll at 320 px (update only the base section partial)
  - _Requirements: 1.3, 7.1, 7.3, 7.4, 7.5, 7.6, 11.4_

- [ ] 3.2 (P) Build the kick-off time and team crest components
  - Kick-off time renders a machine-readable timestamp with offset, the localised time and the zone indicator (label and offset, label only for Global)
  - Team crest renders sized images with reserved dimensions, deferred loading, initials underlay revealed on load failure, and a decorative mode hidden from assistive technologies
  - Styles live only in the kick-off time and team crest style files; demo markup only in the crest-kickoff styleguide section
  - Done when the styleguide shows correct times and zone indicators on all four editions and the broken-URL fixture shows initials at the same size as a loaded crest
  - _Depends: 2.3, 3.1_
  - _Boundary: KickoffTime, TeamCrest_
  - _Requirements: 5.2, 5.4, 5.6, 8.5, 8.6, 8.7_

- [ ] 3.3 (P) Build the channel badge and icon components
  - Channel badge renders name, optional sized logo and localised type indicator, links safely in a new browsing context when an address is given, and carries the channel-click tracking attributes
  - Icon component provides the fixed inline icon set replacing the icon font
  - Styles live only in the channel badge style file; demo markup only in the channel-icon styleguide section
  - Done when the styleguide shows linked and unlinked badges, with and without logos, and the rendered links carry the documented data attributes and `rel` values
  - _Depends: 3.1_
  - _Boundary: ChannelBadge, Icon_
  - _Requirements: 8.7, 8.8, 8.9, 8.11, 8.12_

- [ ] 3.4 Build the match card component
  - Compose crest, kick-off time and channel badge into a single-link card with the status rules, optional league, optional channel list with the localised no-broadcaster message, and match-open tracking attributes
  - Keep each rendered card within 2 KB of HTML; styles live only in the match card style file; demo markup only in the match-card styleguide section
  - Done when the styleguide shows every status fixture correctly (score for live/finished, status text instead of time for postponed), the empty-channel fixture shows the localised message, and no card renders empty containers
  - _Depends: 3.2, 3.3_
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.11, 8.12, 11.3_

- [ ] 3.5 Build the date group component
  - Render a labelled section with a localised day heading and machine-readable date, followed by that day's match cards in kick-off order; render nothing for an empty day
  - Styles live only in the date group style file; demo markup only in the date-group styleguide section
  - Done when the styleguide groups fixtures by edition-local day in kick-off order on Global and Brazil
  - _Depends: 2.3, 3.4_
  - _Requirements: 5.8, 8.10, 8.12_

- [ ] 3.6 (P) Build the edition switcher and menu renderer
  - Edition switcher uses a native disclosure listing every edition by localised name, marks the current one, links to the translated page or the target edition home, appends the edition-choice marker for Global, and carries edition-switch tracking attributes
  - Menu renderer shows translated labels from menu identifiers, marks the active entry and omits the list when the menu is empty
  - Replace the empty main script with the switcher enhancement (Escape, outside-click closing, and setting `cfc_edition` cookie on selection for edge geo-routing bypass) within the JavaScript budget; styles live only in the switcher and menu style files; demo markup only in the switcher-menu styleguide section
  - Done when, with JavaScript disabled, the switcher on the styleguide opens and navigates by keyboard, the Global option link ends with `?edition=en`, selecting an edition sets the `cfc_edition` cookie, and an edition with no menu entries renders no empty list
  - _Depends: 2.1, 2.2, 3.1, 3.3_
  - _Boundary: EditionSwitcher, MenuRenderer, ClientScript_
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.11, 11.1_

- [ ] 3.7 (P) Build the page header, breadcrumb and empty state components
  - Page header renders the single top-level heading, optional intro and optional breadcrumb; breadcrumb renders a visual trail only (no structured data); empty state renders a localised message with optional action
  - Styles live only in the page header and empty state style files; demo markup only in the page-header styleguide section
  - Done when the styleguide shows the page header with and without breadcrumb and intro, and the empty state with and without an action
  - _Depends: 2.2, 3.1_
  - _Boundary: PageHeader, Breadcrumb, EmptyState_
  - _Requirements: 8.12, 9.3, 9.5_

- [x] 4. Site chrome, skeleton and page shells

- [x] 4.1 Implement the hook dispatcher, SEO fallback and document head
  - Hook dispatcher renders a whitelisted slot's hook file with the page as context, else its fallback, else nothing, and fails the build on unknown slot names
  - SEO fallback renders the title and meta description from the page or the edition registry
  - Document head renders the meta tags, head slots in the specified order, theme colour, favicon and manifest, and no analytics, tag-manager, verification or custom-script output
  - Demonstrate the dispatcher in the chrome styleguide section (a whitelisted slot and the head/SEO fallback output rendered as escaped source)
  - Done when an uncommitted temporary hook file is rendered in its slot on the styleguide, deleting it leaves the slot empty with the build still succeeding, and calling the dispatcher with an unknown slot name fails the build
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 4.2 Implement the site header and footer
  - Header shows the logo linked to the edition home (logo text while the light logo is missing), the main menu, the edition switcher and the reused theme light/dark control
  - Footer shows the app and consent slots, the footer menu, links to every edition home (Global with the edition-choice marker) and the edition copyright
  - Preview header and footer inside the chrome styleguide section until the root skeleton exists
  - Done when header and footer render with edition-specific labels and copyright in the chrome styleguide section of all four editions
  - _Depends: 3.6_
  - _Requirements: 6.1, 6.8, 7.2, 10.1_

- [x] 4.3 Replace the document skeleton
  - Create the root skeleton with the edition locale and direction on the document, no microdata, the skip link, header/main/footer landmarks, the theme style and script bundles, all body slots in the specified positions, and the once-per-edition validator call (remove the temporary validator call from the edition styleguide section and the inline header/footer preview from the chrome styleguide section to avoid duplicate landmarks)
  - Done when every built page uses the new skeleton, declares the edition locale as its language, contains a working skip link, exactly one header/main/footer landmark, and no preloader, announcement, search modal or tag-manager markup, and `pnpm build` succeeds while the theme home/list/single templates are still active
  - _Depends: 4.1, 4.2_
  - _Requirements: 1.5, 2.4, 2.5, 9.5, 10.1, 10.5_

- [x] 4.4 Implement the home, list, detail and not-found page shells
  - Replace the temporary root home template from 1.5 if it exists
  - Home shell renders the page header from home front matter or interface strings and the home main slot with the localised empty-state fallback
  - List and detail shells render the page header, optional breadcrumb, content and (list) child page links
  - Not-found page renders localised title, text and a link to the edition home for every edition
  - Done when `pnpm build` produces six localised home pages showing the empty state and six localised `404.html` pages each linking to its own edition home
  - _Depends: 3.7, 4.3_
  - _Requirements: 3.2, 9.1, 9.2, 9.3, 9.4, 10.6_

- [x] 4.5 Remove unused modules and stock features
  - Remove the module imports listed in the design (adsense, search, icons, videos, accordion, tabs, modal, gallery, table of contents, preloader, social share, announcement, shortcodes, diagrams, comments), keeping the downstream-owned and reused modules
  - Done when `pnpm build` succeeds and the output contains no icon-font, search or preloader assets (and, as a regression check, still no slider or lightbox assets)
  - _Depends: 4.3, 4.4_
  - _Requirements: 3.6, 11.1, 11.2_

- [x] 5. Automated checks

- [x] 5.1 Implement the Site Build check for production output and repository invariants
  - Implement the dependency-free check script and the `check` package script covering edition homes and 404s with correct languages, forbidden outputs, i18n key parity, token contrast pairs, absence of tracking scripts in foundation-owned files (guarded to assert absence in output only when `layouts/_partials/hooks/head-analytics.html` does not exist), page-weight and JavaScript budgets, version pins and lock files, unused deploy configs, and unchanged vendored directories
  - Report each failure with file, key or value and exit non-zero on any failure
  - Done when `pnpm build && pnpm check` passes on the current tree, and deliberately removing a key from one base table or changing the container Go version makes `pnpm check` fail with a message naming it
  - _Depends: 4.5_
  - _Requirements: 1.1, 1.4, 3.3, 3.4, 3.5, 4.4, 7.4, 10.5, 11.1, 11.2, 12.4_

- [x] 5.2 Add the component check mode
  - Add the `check:components` package script that builds the development styleguide into the resources folder and checks match-card size and image dimension attributes
  - Done when `pnpm check:components` passes, and inflating a fixture card beyond 2 KB makes it fail naming the card
  - _Depends: 3.4, 5.1_
  - _Requirements: 8.7, 11.3, 11.5_

- [x] 6. Validation

- [x] 6.1 Run end-to-end build validation and negative tests
  - Run `pnpm build`, `pnpm check` and `pnpm check:components` on a clean checkout; run the validator and time-parse negative cases (time-zone mismatch, missing i18n mount, offset-less fixture) and confirm each fails with the documented message, then restore
  - Verify translated-page switching with a temporary pair of translated pages, regional wording on Portugal versus Brazil, DST offsets and day grouping on the built styleguide
  - Done when all three commands pass and every negative case fails as documented
  - _Requirements: 1.1, 2.5, 2.6, 4.2, 4.3, 5.2, 5.5, 5.7, 5.8, 6.2, 9.4_

- [x] 6.2 Validate upgrade safety
  - In a temporary git worktree, run `pnpm update-theme`, then `pnpm build` and `pnpm check`; discard the worktree afterwards so the vendored theme in the main tree stays unchanged
  - Done when the build and check pass against the updated theme, or any incompatibility is reported with the affected reused theme partial
  - _Requirements: 1.4, 1.5_

- [x] 6.3 Audit accessibility and performance
  - Confirm Lighthouse and Chrome are available (for example `pnpm dlx lighthouse --version`); if not, ask the user before proceeding
  - With `pnpm preview`, run a mobile Lighthouse audit on a home page and the styleguide (development) in light and dark mode, check 320 px layouts, keyboard-only navigation with JavaScript disabled, reduced-motion behaviour and font swap
  - Done when accessibility scores are at least 95, cumulative layout shift is at most 0.1, no horizontal scroll occurs at 320 px, and findings are fixed or reported
  - _Requirements: 6.4, 7.2, 7.3, 7.4, 7.5, 7.6, 9.5, 11.4, 11.5_
