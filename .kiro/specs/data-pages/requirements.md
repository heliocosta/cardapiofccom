# Requirements Document

## Project Description (Input)
**Who**: visitors of cardapiofc.com in six editions (Global, UK, Ireland, Brazil, Portugal, Argentina), the site operator who publishes data from the Retool/Postgres database, and downstream specs (seo-social, app-deeplinks, edge-delivery).

**Current situation**: league, team, match and lineup pages are baked by an unknown pipeline; they show no TV channels, kick-off times are mislabelled and duplicate URL families exist (`/match/…` vs `/en/matches/where_to_watch_…`). No data layer, content adapters or entity templates exist in the repository.

**What should change**: define a documented, versioned, pre-indexed JSON contract that the operator's Retool export publishes to Firebase Storage; have the Hugo build fetch it once per build, validate it and generate interconnected League, Team, Match and Lineup pages for every edition using the app's URL structure (`/match/{home}-vs-{away}-{yyyy-mm-dd}`, `/match/{slug}/lineup?l={base64}` rendered client-side, `/team/{teamSlug}`, `/league/{leagueSlug}`; Global unprefixed, other editions prefixed), with kick-off times in the edition time zone, country-specific TV/streaming channels (Global lists all supported countries grouped by country), a home page of today's/upcoming matches, lightweight pages, a local sample dataset, and output under the Cloudflare free cap of 20,000 files. Postponement handling is out of scope. See `brief.md`.

## Introduction
data-pages turns a small, operator-published football dataset into the core pages of CardápioFC: one page per match, lineup, team and league, plus the matches shown on each edition's home page. It defines the published **Data Contract** (the documented, versioned file set the operator's export produces), loads and validates that data during the **Site Build**, and renders the pages in every edition with local kick-off times and the TV/streaming channels relevant to the edition's country. Page addresses mirror the mobile app's deep links so shared links open the same content on the web.

Primary actors: **visitors** (read match, team, league and lineup pages in their edition), the **site operator** (publishes the dataset, runs builds, works locally with sample data) and **downstream spec implementers** (seo-social, app-deeplinks, edge-delivery) who consume the page data, entity list and address map this feature exposes.

Terms: the **Dataset** is one published set of Data Contract files; the **Sample Dataset** is a small Dataset kept in the repository for local work; an **Entity** is a league, team or match in the Dataset; an **edition** and the **edition registry**, interface strings, time display rules, page shells, extension slots and UI components are provided by site-foundation; the **Site Build check** is the automated verification the operator runs after a production build; the **File Budget** is the maximum number of output files allowed for one deployment across all editions.

## Boundary Context
- **In scope**: the Data Contract document and machine-readable schema; the Sample Dataset; loading the Dataset once per build with explicit validation; generating match, lineup, team and league pages and a league directory for every edition; the home page match listing; kick-off time, status, score, venue and round display; TV/streaming channel display per edition; official lineup display and client-side custom formations; internal links between pages; page size limits and the build-time file-count estimate; the page data, entity list and address map offered to downstream features.
- **Out of scope**: the export job that queries the database and uploads the Dataset (the operator builds it against the Data Contract); postponed or rescheduled matches changing address (no previous-address handling); structured data, Open Graph, canonical, hreflang, sitemaps (seo-social); search page, search index output, app banners and well-known files (app-deeplinks); hosting, deploy triggers, redirects including trailing-slash and geo/legacy redirects, and the final output file-count check on the deployed artefact (edge-delivery); analytics events beyond the tracking attributes already defined by site-foundation components (analytics-consent); live score updates after the build.
- **Adjacent expectations**: site-foundation provides the six-edition registry, the time display rules (which reject times without a zone offset), the shared UI components and their match status values, page shells, the home page extension slot and the base interface-string files to which this feature appends its own keys. The operator's export publishes files that conform to the Data Contract and publishes the dataset index last. edge-delivery triggers builds after each publication and at least once per day, so that "today" on the home page and match statuses are refreshed.

## Requirements

### Requirement 1: Data Contract and Sample Dataset
**Objective:** As the site operator, I want a documented, versioned data contract and a sample dataset, so that I can build the export once and develop pages without network access.

#### Acceptance Criteria
1. The data-pages feature shall provide a Data Contract document that specifies, for every file in a Dataset, its location relative to the Dataset root, its fields, field types, required/optional status, allowed values and an example.
2. The Data Contract shall carry a version number in the format MAJOR.MINOR.PATCH, and every Dataset file shall declare the contract version it conforms to.
3. The Data Contract shall identify every league, team and match by exactly one lowercase, hyphen-separated, language-independent slug, and every match slug shall have the form `{home team slug}-vs-{away team slug}-{yyyy-mm-dd}` exactly as the app uses it.
4. The Data Contract shall organise leagues, teams, matches, channel listings and lineups as collections keyed by slug, and shall include for each league and team the ordered list of its match slugs, so that a page never needs to search a whole collection.
5. The Data Contract shall require every kick-off time to be expressed in UTC with an explicit zone designator.
6. The Data Contract shall provide localised names for leagues and teams per supported language and edition, with English required and a documented fallback order.
7. The Data Contract shall provide, per supported channel country, the list of channels (name, logo, type, link) for each match broadcast in that country.
8. The Data Contract shall define a dataset index that lists the contract version, generation time, the Dataset files with an integrity value per file, and Entity counts, and shall require the export to publish the dataset index after all other files.
9. The Data Contract shall document a method to estimate the output file count of a Dataset for all editions against the File Budget, with a worked example.
10. The Repository shall contain a Sample Dataset that conforms to the Data Contract and covers: at least two leagues, a match in each match status, a match with an official lineup, a match without a lineup, a match with channels in every supported channel country, a match with no channels, and a kick-off that falls on different calendar days in different editions.

### Requirement 2: Dataset loading and build validation
**Objective:** As the site operator, I want each build to read the published dataset once and stop with a clear message when it is unusable, so that broken or partial data never reaches visitors.

#### Acceptance Criteria
1. When a production build runs, the Site Build shall read the Dataset from the configured remote location and generate pages from it.
2. When a development build runs without remote data being requested, the Site Build shall read the Sample Dataset from the Repository and generate pages from it without network access.
3. The Site Build shall read each Dataset file at most once per build, regardless of the number of editions and pages.
4. When the operator publishes a new Dataset and a new build runs, the Site Build shall use the newly published files rather than files kept from an earlier build.
5. If a Dataset file cannot be retrieved, is empty or is not valid JSON, then the Site Build shall fail with a message naming the file and the problem.
6. If the dataset index declares a contract major version different from the one the site supports, then the Site Build shall fail with a message naming the declared and supported versions.
7. If a Dataset file's content does not match the integrity value listed in the dataset index, then the Site Build shall fail with a message naming the file.
8. If a required field is missing or has an invalid value (slug format, kick-off without zone designator, unknown match status, unknown channel type), then the Site Build shall fail with a message naming the file, the Entity slug and the field.
9. If a match refers to a league or team that is not in the Dataset, or a channel listing or lineup refers to a match or channel that is not in the Dataset, then the Site Build shall fail with a message naming both slugs.
10. If an edition's channel country has no channel file in the Dataset, then the Site Build shall emit a warning naming the country and shall render that edition's match pages with the no-broadcaster state.
11. Where a credential for the remote location is configured for the build, the Site Build shall use it for every Dataset request without writing it into any output file.

### Requirement 3: Page generation and addresses
**Objective:** As a visitor following a link shared from the app, I want every league, team, match and lineup to have a stable page at the same address the app uses, so that links open the right content in my edition.

#### Acceptance Criteria
1. The CardápioFC Site shall generate, in every edition, one page per match at `{edition prefix}match/{match slug}/`, one lineup page per match at `{edition prefix}match/{match slug}/lineup/`, one page per team at `{edition prefix}team/{team slug}/` and one page per league at `{edition prefix}league/{league slug}/`, where the edition prefix is `/` for Global and `/{edition code}/` for other editions.
2. The CardápioFC Site shall generate, in every edition, a league directory page at `{edition prefix}league/` listing every league in the Dataset.
3. The CardápioFC Site shall not generate listing pages at `{edition prefix}match/` or `{edition prefix}team/`, nor any page under the legacy `/en/matches/` or `/pt/jogos/` address families.
4. When an Entity is present in the Dataset, the CardápioFC Site shall generate its pages in every edition; when an Entity is absent from the Dataset, the CardápioFC Site shall not generate pages for it.
5. The CardápioFC Site shall relate the pages of the same Entity across editions, so that the edition switcher leads to the same Entity's page in the target edition.
6. If two Entities would produce the same page address, then the Site Build shall fail with a message naming the address.
7. When an operator adds an edition through the edition registry, the CardápioFC Site shall generate that edition's league, team, match and lineup pages without changes to page templates.

### Requirement 4: Kick-off time, status and match facts
**Objective:** As a visitor, I want to see when a match kicks off in my local time and what state it is in, so that I do not miss it or misread the time.

#### Acceptance Criteria
1. The CardápioFC Site shall display every kick-off time converted to the edition's time zone, together with the edition's visible zone label and UTC offset, following site-foundation's time display rules.
2. The Global edition shall display kick-off times in UTC with the label "UTC".
3. The CardápioFC Site shall display the match status from the Dataset using site-foundation's status presentation: kick-off time for scheduled matches, a live indicator for live and half-time matches, score and finished label for finished matches, and the status text instead of a time for postponed, cancelled and suspended matches.
4. Where the Dataset provides a score, the match page shall display it for live, half-time and finished matches.
5. Where the Dataset provides a round or a venue, the match page shall display them; where it does not, the match page shall omit them without an empty label.
6. The CardápioFC Site shall state on match, team, league and home pages the date and time at which the displayed data was generated, in the edition's time zone.

### Requirement 5: TV and streaming channels
**Objective:** As a visitor, I want to know where a match is shown in my country, so that I can watch it.

#### Acceptance Criteria
1. While the visitor is in a regional edition, the match page shall list only the channels the Dataset gives for that edition's country, each with name, type and, where provided, logo and link.
2. While the visitor is in the Global edition, the match page shall list the channels of every supported channel country that has at least one channel for the match, grouped by country under a heading naming the country, in edition registry order.
3. If no channels are listed for the match in the countries the edition shows, then the match page shall display a "no broadcaster listed — check the app" message instead of a channel list.
4. While the visitor is in a regional edition, the match page shall link to the same match in each other edition whose country has at least one channel for the match.
5. When a channel has a link, the CardápioFC Site shall open it as an external link without passing referrer context to the destination.
6. The CardápioFC Site shall not display channels on team, league or home page match lists other than through a count or the match page link.

### Requirement 6: Lineup page
**Objective:** As a visitor, I want to see the official lineup or a custom formation shared from the app, so that lineup links from the app work on the web.

#### Acceptance Criteria
1. When the Dataset includes an official lineup for a match, the lineup page shall display, for each team, the formation, the starting players with shirt numbers and positions, the substitutes and the coach where provided.
2. When the Dataset includes no official lineup for a match, the lineup page shall display a "lineup to be announced" state with the match kick-off time and a prompt to build a lineup in the app.
3. When a visitor opens a lineup page with a valid custom-formation parameter `l`, the lineup page shall display the custom formation, labelled as a custom formation, on the same page without a further page load.
4. If the `l` parameter is absent, cannot be decoded, is larger than 2 KB or does not describe a valid formation, then the lineup page shall display the official lineup when available, otherwise the "lineup to be announced" state.
5. The lineup page shall display text from the `l` parameter only as plain text and shall never execute or render it as markup.
6. While scripting is unavailable in the visitor's browser, the lineup page shall still display the official lineup or the "lineup to be announced" state.
7. The lineup page shall link to its match page, and the match page shall link to its lineup page.

### Requirement 7: Team page
**Objective:** As a visitor, I want a team page with its next and recent matches, so that I can follow my team.

#### Acceptance Criteria
1. The team page shall display the team's localised name and crest, falling back to initials when the crest is unavailable.
2. The team page shall list up to 10 upcoming matches and up to 5 most recent finished matches of the team, each linking to its match page, grouped by edition-local day.
3. The team page shall link to the page of every league the team plays in within the Dataset.
4. If the team has no upcoming matches in the Dataset, then the team page shall display a "no upcoming matches" message in place of the upcoming list.

### Requirement 8: League page and league directory
**Objective:** As a visitor, I want a league page with its fixtures and a directory of leagues, so that I can browse competitions.

#### Acceptance Criteria
1. The league page shall display the league's localised name and logo where provided.
2. The league page shall list the league's matches from 7 days before the build up to 30 days after the build, grouped by edition-local day, with at most 100 matches, each linking to its match page.
3. Where the Dataset provides rounds for the listed matches, the league page shall show each match's round.
4. The league page shall link to the team page of every team that appears in its listed matches.
5. If the league has no matches in its listing window, then the league page shall display a "no matches scheduled" message and its next match outside the window when one exists.
6. The league directory shall list every league with its localised name, placing leagues flagged as popular in the Dataset first, followed by the others in alphabetical order of the localised name.

### Requirement 9: Home page matches
**Objective:** As a visitor, I want the home page to show today's and upcoming matches in my local time, so that I can see what is on at a glance.

#### Acceptance Criteria
1. The home page shall list matches from the start of the current edition-local day up to the end of the seventh edition-local day after it, grouped by edition-local day in ascending kick-off order.
2. The home page shall list at most 120 matches; when more qualify, it shall keep the earliest kick-offs and link to the league directory.
3. The home page shall place matches of leagues flagged as popular before other matches within each day while preserving kick-off order within each group.
4. If no matches qualify for the home page window, then the home page shall display site-foundation's empty state with a link to the league directory.
5. The home page match listing shall render inside site-foundation's home page extension slot without changing site-foundation's home page shell.

### Requirement 10: Names, localisation and internal links
**Objective:** As a visitor, I want names and labels in my edition's language and every page connected to related pages, so that I can navigate naturally.

#### Acceptance Criteria
1. The CardápioFC Site shall display league and team names in the edition's language using the Data Contract's fallback order, and shall never display an empty name.
2. The CardápioFC Site shall display all labels added by this feature from site-foundation's interface-string files, with regional wording where the edition defines it.
3. The match page shall link to both team pages and the league page, the team page to its match and league pages, and the league page to its match and team pages.
4. Every page generated by this feature shall show a breadcrumb trail from the edition home page to the current page.
5. The CardápioFC Site shall build every internal link generated by this feature within the current edition, except the explicit links to other editions defined in Requirement 5.4.

### Requirement 11: Lightweight pages, file budget and build time
**Objective:** As the site operator, I want small pages, a predictable output size and a fast build, so that hosting stays free and visitors get fast pages.

#### Acceptance Criteria
1. Each match, lineup, team, league and home page shall stay within site-foundation's compressed page-weight budget.
2. The CardápioFC Site shall not include full Entity lists on any page other than the league directory.
3. When the Site Build starts generating pages, it shall estimate the total output file count for all editions from the Dataset and report it in the build log.
4. If the estimated output file count exceeds the configured File Budget (default 18,000, below the 20,000-file deployment cap), then the Site Build shall fail before writing pages, with a message giving the estimate, the budget and the largest contributors.
5. When the operator chooses to generate lineup pages only for matches with an official lineup, the CardápioFC Site shall generate lineup pages only for those matches.
6. While building a Dataset within the File Budget on the project's continuous-integration runner, the Site Build shall complete in at most 30 seconds.
7. The CardápioFC Site shall load the lineup page's custom-formation script only on lineup pages, and shall add no script to match, team, league or home pages.

### Requirement 12: Contracts for downstream features
**Objective:** As a downstream spec implementer, I want stable page data, an entity list and an address map, so that structured data, search and redirects can be built without re-reading the Dataset.

#### Acceptance Criteria
1. The CardápioFC Site shall expose, on every match, lineup, team and league page, the Entity's data needed for structured data and social previews: Entity kind, slug, localised names, crest or logo, kick-off time, status, score, venue, round, league and teams, the app-equivalent path, and the Dataset generation time.
2. The CardápioFC Site shall provide, for each edition, a list of every Entity with kind, slug, localised name, alternative names, page address and, for matches, kick-off time and league, for use by a search index.
3. The CardápioFC Site shall provide, for any match and edition, the channel groups that edition shows for that match.
4. The data-pages feature shall document the address pattern of every page kind per edition, the relation between app deep links and web addresses, and the output file-count formula used by the File Budget.
5. When a downstream feature reads these contracts, the CardápioFC Site shall return the same values that the pages display.
