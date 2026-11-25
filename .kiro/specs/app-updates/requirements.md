# Requirements Document

## Project Description (Input)
**Who**: Cardápio FC mobile app users, visitors arriving from store or in-app links, search engines across all 9 regional site editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`), and the site operator maintaining the static Hugo site.

**Current situation**: The site runs on Hugo `0.169.0` extended (`themes/hugoplate`, `project-setup` mode, Tailwind CSS v4, zero-radius `.cfc-*` design system) with 9 regional editions, 7 parity-checked base `i18n/*.yaml` tables, and existing app store IDs/partials (`6745226833` on iOS, `br.com.cardapiofutebol` on Android). There is no `/updates/` changelog page, no structured release-history dataset in `data/cfc/`, and no daily Antigravity automation checking the Apple App Store and Google Play Store.

**What should change**: Implement the `app-updates` feature: a public, SEO-indexed multilingual `/updates/` page across all 9 editions (`sites.matrix.languages: ["**"]`), linked in `[[footer]]` only (excluded from `[[main]]`), displaying a Latest version summary plus chronological changelog history backed by `data/cfc/app_updates.json` (underscore key), a zero-dependency Node 24 ESM store extractor (`scripts/fetch-app-updates.mjs`) with fixture unit tests handling live store realities (Google Play nullable web `version` + `cn`/`jp` fallback to `en` + fail-safe merge with no `fetchedAt`-only diffs), and a daily local Antigravity scheduled automation (`CRON_TZ=Europe/London 0 9 * * *`) with clean-tree git guard, build verification, single-file commit & push to `main`, and scoped permissions verified via test run. See `brief.md`.

## Introduction
The App Updates feature introduces a public, multilingual mobile app release-notes hub at `/updates/` across all nine regional editions of cardapiofc.com (Global, UK, Ireland, Brazil, Portugal, Argentina, USA, China, and Japan), paired with a daily automated store-monitoring workflow. It allows mobile app users, prospective downloaders, and search crawlers to inspect the latest iOS and Android release versions and historical changelog entries in their edition's language without cluttering the primary top navigation menu.

Primary actors: **visitors and mobile app users** (checking recent improvements, bug fixes, and download links for iOS and Android), **search and AI crawlers** (indexing structured, localized release history), and the **site operator** (relying on zero-secret daily automation to detect new store releases, format notes cleanly, verify site integrity, and publish updates safely).

## Boundary Context
- **In scope**:
  - Public, SEO-indexed App Updates Page at `/updates/` across all nine site editions (`/{edition}/updates/` and Global `/updates/`).
  - Footer-only navigation link across all nine editions while excluding the page from the primary header navigation menu.
  - Latest Releases summary (iOS and Android) plus chronological changelog history grouped by release version or release-date window with platform badges, formatted notes, localized dates, and store download calls to action.
  - Zero-secret store monitoring across active Apple App Store and Google Play Store storefronts, resilient handling of omitted Android web version numbers, English fallback for unsupported locales/regions, and persistent deduplicated release history supporting manual backfills.
  - Daily local Antigravity scheduled automation (`09:00 Europe/London`) with clean working-tree safety checks, build verification, scoped permissions, and single-dataset publishing.
  - Automated offline unit tests for store parsing/merging and compatibility with existing site, SEO, deep-link, analytics, and file-budget checks.
- **Out of scope**:
  - Exposing the App Updates Page in the primary header navigation menu.
  - Cloud-hosted CI cron jobs for store scraping or adding store developer API credentials/secrets.
  - Registering `/updates/` in mobile app deep-link association manifests (remains a web-only route).
  - RSS/Atom feeds, email/push notifications, geo-routing redirect rules, or modifications to the mobile application or Retool data export pipeline.
- **Adjacent expectations**:
  - Site foundation supplies the nine-edition registry, base page layout, footer navigation slot, sharp-corner visual system, and seven-table translation parity enforcement.
  - App deep-links supplies the canonical iOS/Android store identifiers and store download link/badge components.
  - SEO/social supplies canonical tags, reciprocal regional alternate links, breadcrumbs, edition fallback social preview images, sitemap generation, and indexing notifications.
  - Edge delivery supplies automated production deployment whenever an updated release-history commit is pushed to the primary branch.

## Requirements

### Requirement 1: Multilingual App Updates Page & Discovery
1.1 The Site shall publish an App Updates Page at the `/updates/` route across all nine regional editions (Global at `/updates/` and each regional edition at `/{edition}/updates/`).
1.2 The Site Navigation shall include a link to the App Updates Page in the site footer across all nine editions.
1.3 The Site Navigation shall exclude the App Updates Page from the primary header navigation menu across all nine editions.
1.4 The App Updates Page shall remain indexable by search engines with self-referencing canonical links, reciprocal regional alternate links with a default Global fallback, breadcrumb metadata, social preview metadata, and inclusion in the site sitemap.
1.5 The App Updates Page shall remain a web-only route and shall not be registered in mobile app deep-link association manifests.

### Requirement 2: Release Presentation, Grouping & Store Calls to Action
2.1 When release history data is available, the App Updates Page shall display a Latest Releases summary at the top showing the most recent release state for iOS and Android alongside store download links.
2.2 When release history data contains one or more entries, the App Updates Page shall render a chronological release timeline ordered from newest release to oldest release.
2.3 When iOS and Android releases share the same version identifier or land within the same release window, the App Updates Page shall group them cleanly with distinct platform badges, and where a release applies to only one platform, the App Updates Page shall display only that platform's badge.
2.4 Where a platform release includes a version number, the App Updates Page shall display the version identifier alongside its release date; where a platform store omits the version number, the App Updates Page shall display the release date and platform badge cleanly without showing raw missing values or broken placeholders.
2.5 When rendering release notes, the App Updates Page shall present structured, readable formatting (paragraphs or bulleted items) rather than unformatted raw text walls.
2.6 If no release entries exist yet, then the App Updates Page shall display a localized empty state and store download links without failing page rendering.

### Requirement 3: Regional Localization & Fallback
3.1 The App Updates Page shall localize all interface copy (headings, breadcrumbs, platform labels, footer link label, metadata, and download calls to action) across all nine site editions with complete translation parity.
3.2 When release notes are available in an edition's language, the App Updates Page shall display the release notes in that edition's language.
3.3 If release notes are unavailable for an edition's language or storefront (including regions where the mobile app is not distributed), then the App Updates Page shall fall back cleanly to the English release notes without omitting the release entry.
3.4 The App Updates Page shall format release dates cleanly per edition and shall not embed daily-changing check timestamps in the primary page content when no new app release has occurred.

### Requirement 4: Zero-Secret Multi-Store Update Monitoring
4.1 When triggered, the Store Update Monitor shall query public Apple App Store and Google Play Store listings for the Cardápio FC mobile app across all active regional storefronts without requiring developer API credentials or secret keys.
4.2 When the Apple App Store returns release details, the Store Update Monitor shall capture the version identifier, release date, and localized release notes per active storefront.
4.3 When the Google Play Store returns release details, the Store Update Monitor shall capture the release date, localized release notes, and version identifier when present, while gracefully accepting an omitted version identifier.
4.4 If a storefront returns no listing (such as unsupported regions) or a transient network or parsing error occurs for one store or locale, then the Store Update Monitor shall log a clear warning and preserve existing release data without corrupting or erasing stored history.
4.5 The Store Update Monitor shall pace outbound store requests to avoid triggering public endpoint rate limits.

### Requirement 5: Release History Persistence & Deduplication
5.1 When a newly detected iOS or Android release (or materially updated release notes for an existing release) is found, the Release History Store shall append or merge the update while preserving all historical releases.
5.2 When a store check detects no new version and no material change to release notes, the Release History Store shall remain unchanged so no redundant update or site rebuild is triggered.
5.3 Where a platform release has a version identifier, the Release History Store shall deduplicate by platform and version; where a platform omits the version identifier, the Release History Store shall deduplicate by platform, release date, and normalized release notes.
5.4 The Release History Store shall support manual operator edits or historical backfills without being overwritten by subsequent automated checks.

### Requirement 6: Daily Local Antigravity Automation & Safe Publishing
6.1 The Daily Update Automation shall be configured to run once per day at 9:00 AM in the operator's local timezone (`Europe/London`) on the operator's machine via Antigravity's scheduled automation system.
6.2 When a scheduled run starts, the Daily Update Automation shall verify that the local repository working tree has no unrelated uncommitted modifications before making changes; if unrelated local edits exist, then the Daily Update Automation shall abort safely without altering or committing them.
6.3 When a new or updated release is detected, the Daily Update Automation shall format and update the Release History Store, verify that the full site build and automated quality checks pass, and commit and push only the updated release history data to the primary branch so production deployment runs automatically.
6.4 If no new release is detected, or if store fetching or site verification fails, then the Daily Update Automation shall leave the repository unchanged and report the outcome clearly.
6.5 When created, the Daily Update Automation shall declare only narrowly scoped permissions verified through an initial test run and shall remain paused until the operator explicitly enables it in the Automations dashboard.

### Requirement 7: Site Quality, Design System & Verification Compatibility
7.1 The App Updates Page shall conform to the site's sharp-corner visual design system, dark-mode support, accessible semantics, and performance budgets without adding client-side frameworks or third-party runtime dependencies.
7.2 The App Updates feature shall pass all existing site, SEO, deep-link, analytics, and file-budget verification checks without altering unrelated configuration invariants.
7.3 The Store Update Monitor and release-history merge behavior shall be covered by automated offline verification tests using representative store payloads (including missing version strings, unsupported storefronts, unchanged runs, and malformed responses).
