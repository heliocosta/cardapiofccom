# Implementation Plan: app-updates

- [x] 1. Foundation — release history contract, footer navigation, and localization parity
- [x] 1.1 Establish the release-history data contract and empty-safe schema structure
  - Define the versioned release-history data structure storing app identifiers, latest iOS and Android platform summaries, chronologically ordered release entries, per-edition localized note objects, optional manual curation flags, and no volatile check timestamps
  - Ensure platform entries cleanly represent omitted Android web version numbers without placeholder strings
  - Observable completion: Initial data file exists on disk with valid schema structure ready for both template rendering and automated updates
  - _Boundary: AppUpdatesData_
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 1.2 Add footer-only navigation entry, seven-table localization parity, and task runner aliases
  - Register the updates route in the site footer navigation while keeping the primary header navigation unchanged
  - Add complete localized copy (headings, breadcrumbs, platform labels, footer link label, metadata, empty state, and download calls to action) across all seven parity-enforced language tables
  - Expose convenient package command aliases for checking store updates, writing updates, and running offline unit tests
  - Observable completion: Footer menu configuration, all seven language tables, and package script aliases are updated in sync with zero missing translation keys
  - _Boundary: NavigationSeoI18n_
  - _Requirements: 1.2, 1.3, 3.1_

- [x] 2. Core feature — store monitoring and multilingual updates page
- [x] 2.1 (P) Implement zero-secret multi-store update extractor and fail-safe release merge logic
  - Query public Apple App Store and Google Play Store listings across active regional storefronts using built-in HTTP requests paced to avoid rate limits and requiring zero API secrets
  - Extract version, release date, and localized notes from Apple Store responses, and extract release date, localized notes, and optional version from Google Play listings while gracefully handling omitted version values and unsupported storefronts
  - Normalize raw notes into clean summaries and bulleted items, group matching iOS and Android releases by version or release-date window, deduplicate Android updates by release date and normalized notes, preserve manually curated history, and leave stored history untouched when no material change occurs or when errors occur
  - Observable completion: Running the store extractor in dry-run mode against live stores succeeds with structured JSON output, preserves data on simulated failures, and emits no diff when stores are unchanged
  - _Boundary: StoreUpdateFetcher_
  - _Depends: 1.1_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

- [x] 2.2 (P) Build the multilingual app updates page, localized note fallback resolver, and sharp-corner styles
  - Create the multilingual section entry across all nine site editions (`/{edition}/updates/` and Global `/updates/`) without registering the route in app deep-link manifests
  - Render the Latest Releases summary for iOS and Android with UTM-attributed store download badges, followed by the newest-first chronological release timeline with platform pills, clean omitted-version handling, structured note formatting, empty-state fallback, and final download call to action without embedding daily-changing check timestamps in primary content
  - Implement a localized note resolver that selects the edition's language and falls back cleanly to English for unsupported locales or regions
  - Style the page using sharp-corner design tokens, dark-mode contrast support, responsive grid layout, and zero client-side runtime frameworks
  - Observable completion: Rendering the updates section produces valid, styled HTML across all nine editions with correct regional note fallback and clean empty-state support
  - _Boundary: UpdatesPageUI_
  - _Depends: 1.1, 1.2_
  - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 7.1_

- [ ] 3. Testing, SEO wiring, and full-site verification
- [x] 3.1 (P) Build offline fixture unit tests covering store parsing, deduplication, fallback, and fail-safe merge
  - Write offline test fixtures covering active Apple storefronts, empty unsupported storefronts, Google Play payloads with omitted version strings, malformed/consent-blocked responses, cross-platform release grouping, Android deduplication, manual-entry preservation, and no-op unchanged comparisons
  - Observable completion: Offline test suite executes via the package test command and all assertions pass without network access
  - _Boundary: StoreUpdateFetcher_
  - _Depends: 2.1_
  - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 7.3_

- [ ] 3.2 (P) Register the updates route in indexing priority and SEO verification checks
  - Add the updates hub segment to indexing priority classification and SEO verification reporting while keeping all existing canonical, reciprocal alternate link, breadcrumb, sitemap, and social preview invariants intact
  - Observable completion: Indexing priority and SEO verification scripts recognize the updates route cleanly across all nine editions
  - _Boundary: NavigationSeoI18n_
  - _Depends: 2.2_
  - _Requirements: 1.4, 1.5, 3.4, 7.2_

- [ ] 3.3 Seed live store history and run full site build and verification suite across all nine editions
  - Seed the release-history dataset from the live Apple App Store and Google Play Store listings and verify an immediate second run reports no changes
  - Execute the full static site build and all site, SEO, deep-link, analytics, data-page, and offline unit checks across all nine editions, confirming footer-only navigation visibility, English fallback on unsupported locales, sharp-corner dark/light styling, and budget compliance
  - Observable completion: Full production build and every verification suite pass with zero errors and all nine edition `/updates/` pages verified in generated output
  - _Boundary: Integration_
  - _Depends: 3.1, 3.2_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.6, 3.1, 3.2, 3.3, 7.1, 7.2, 7.3_

- [ ] 4. Daily local Antigravity automation
- [ ] 4.1 Author the daily local Antigravity scheduled automation configuration and self-contained workflow prompt
  - Create the local Antigravity scheduled automation scheduled for 9:00 AM daily in `Europe/London` timezone on the operator's machine
  - Write a self-contained prompt that checks for a clean working tree on the primary branch before acting, fetches store updates, formats newly detected release notes clearly into the release-history dataset, runs build and verification checks, commits and pushes only the release-history dataset when changes exist, and leaves the repository untouched on no-change or failure runs
  - Leave the automation paused without enabling it automatically in global Antigravity settings
  - Observable completion: Automation definition exists in the user's Antigravity sidecar directory with valid schedule syntax, self-contained instructions, and paused initial state
  - _Boundary: AntigravityDailyAutomation_
  - _Depends: 3.3_
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 4.2 Execute a supervised dry-run to verify and lock scoped automation permissions while keeping the automation paused for operator activation
  - Execute the automation's inspection, store-check, and verification workflow in dry-run mode within the workspace to confirm every required command and file path works unattended
  - Record only the exact, narrowly scoped workspace and command permission grants in the automation configuration (avoiding wildcard grants) and present the Automations dashboard link so the operator can enable it
  - Observable completion: Supervised dry-run completes cleanly, verified scoped permissions are saved in the automation configuration, and the automation remains paused ready for operator activation
  - _Boundary: AntigravityDailyAutomation_
  - _Depends: 4.1_
  - _Requirements: 6.2, 6.3, 6.4, 6.5_
