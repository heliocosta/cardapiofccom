# Requirements Document

## Project Description (Input)
**Who**: The CardápioFC site operator publishing weekly SEO- and AI-answer-optimized editorial football articles, plus football fans across all nine CardápioFC editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`) discovering official match broadcasts and the CardápioFC mobile app.

**Current situation**: No editorial playbook, topic deduplication history, or automated publishing workflow exists in the repository. Publishing regionally adapted articles across nine editions every week by hand is unsustainable, leaving organic search growth and mobile app-install acquisition under-leveraged. Meanwhile, production deployment automatically builds, deploys, and submits URLs on every push to the primary branch (plus a daily scheduled build at `05:00 UTC`), without running full site or SEO verification suites in cloud CI.

**What should change**: Establish a zero-touch weekly scheduled local automation backed by a version-controlled editorial playbook and published-topic registry that selects an uncovered topic across the four editorial pillars, verifies facts and official broadcasters, generates one copyright-safe editorial illustration, regionally adapts all nine editions to conform strictly to the editorial blog contract, runs all local build, site, SEO, contract, and file-budget verification gates, and commits and pushes directly to the primary branch only when every check passes. See `brief.md`.

## Introduction
Blog Automation operationalizes CardápioFC's nine-edition editorial publishing workflow at a sustainable cadence of one article per week. By combining repository-tracked editorial strategy and topic-deduplication history with a self-contained local scheduled automation, CardápioFC can consistently publish factually verified, regionally adapted football articles—without advertisements, unofficial streams, or manual multi-locale translation overhead—while keeping static asset growth safely within deployment file limits.

Primary actors: **the site operator** (maintaining the editorial playbook, reviewing topic history, and enabling the paused scheduled automation after verifying permissions) and the **Weekly Blog Automation** (an unattended local scheduled run that selects topics, conducts live research, generates copyright-safe cover art, adapts nine regional editions, verifies site quality, and publishes cleanly).

Terms: the **Editorial Playbook** is the version-controlled editorial strategy, pillar rotation, compliance, and regional adaptation guide; the **Topic Registry** is the structured repository record of published article slugs, dates, pillars, and covered angles; a **Pillar** is one of the four editorial content pillars (`app-guides`, `watch-guides`, `rights-changes`, `market-analysis`); and the **Publishing Gate** is the full suite of local build, blog contract, site quality, SEO/social, and static file-count checks required before pushing to the primary branch.

## Boundary Context
- **In scope**:
  - Version-controlled Editorial Playbook covering the four editorial pillars, answer-first SEO and AI-answer structure, factual verification and official-broadcasters-only compliance, copyright-safe illustration rules, and regional adaptation voice/locale guidelines for all nine editions.
  - Machine-readable Topic Registry tracking published slugs, dates, pillars, and covered angles to prevent duplicate topics and balance pillar rotation.
  - Unattended weekly topic selection, live factual and official-broadcaster research, copyright-safe single cover illustration generation, and nine-edition regional article authoring conforming to the editorial blog contract.
  - Weekly local scheduled automation configuration with a self-contained execution prompt, non-colliding weekly schedule, and narrowly scoped verified permissions.
  - Pre-run workspace hygiene checks, fail-closed local Publishing Gate execution, atomic commit and push to the primary branch on pass, and a guided one-shot test run before operator activation.
- **Out of scope**:
  - Defining or modifying blog page layouts, styling, structured data builders, media processing templates, or validation script internals (owned by `editorial-blog`).
  - Cloud-hosted CI scripts, external LLM API orchestration services, or custom CMS/approval web dashboards.
  - Social media cross-posting to external platforms.
  - Modifying cloud deployment triggers or daily cloud deployment schedules.
  - Automatically enabling the scheduled automation in global user configuration without explicit operator action.
- **Adjacent expectations**:
  - `editorial-blog` owns the nine-edition blog content contract, single-source cover image contract, and local blog contract, site, SEO, and file-budget verification commands consumed by this automation.
  - `edge-delivery` owns the automated build, static deployment, and search-indexing submission triggered on pushes to the primary branch, as well as the daily `05:00 UTC` production build window that this weekly schedule avoids.
  - `broadcaster-directory` and `data-pages` provide curated official broadcaster reference data and live match/channel routes that articles cite and link to internally.
  - `app-updates` runs a daily `09:00 Europe/London` local scheduled automation; this weekly schedule runs outside that window to avoid git working-tree or push contention.

## Requirements

### Requirement 1: Version-Controlled Editorial Playbook and Regional Adaptation Guide
**Objective:** As the site operator, I want a version-controlled editorial playbook defining content pillars, SEO and AI-answer structure, editorial compliance rules, and regional adaptation standards across all nine editions, so that automated articles stay consistent, accurate, and effective at driving mobile app installs.

#### Acceptance Criteria
1. The Editorial Playbook shall define all four editorial content pillars (`app-guides`, `watch-guides`, `rights-changes`, `market-analysis`), target reader intent for each pillar, and rotation rules to avoid concentrating consecutive posts in a single pillar.
2. The Editorial Playbook shall require every article to follow an answer-first SEO and AI-answer structure featuring a direct opening summary, scannable descriptive headings, factual tables or lists where helpful, optional structured question-and-answer items, natural CardápioFC mobile app calls to action, and internal links to relevant CardápioFC match, league, team, or broadcaster pages.
3. The Editorial Playbook shall enforce zero advertisements or sponsorships, strictly official licensed broadcasters and legal streaming platforms only, and explicit verification of facts and rights details before drafting.
4. The Editorial Playbook shall specify regional adaptation guidelines for all nine CardápioFC editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`), covering local terminology (including Global/UK/Ireland "football" versus US "soccer", Brazilian versus European Portuguese, Argentine Spanish, Simplified Chinese, and Japanese), regional time-zone conventions, and locally relevant official broadcasters rather than literal translation.
5. The Editorial Playbook shall document the required article metadata fields, shared lowercase ASCII slug rules, cover artwork rules, and validation checks required by the site's editorial blog contract.

### Requirement 2: Published-Topic Registry and Deduplication
**Objective:** As the site operator, I want a machine-readable published-topic registry tracked in the repository, so that weekly runs avoid repeating covered subjects, rotate editorial pillars evenly, and maintain an auditable publishing history.

#### Acceptance Criteria
1. The Topic Registry shall store each published article's canonical slug, publication date, editorial pillar, concise topic title or summary, and covered angles or keywords in a structured repository file.
2. When selecting a topic for a new weekly article, the Weekly Blog Automation shall inspect the Topic Registry first and exclude any candidate topic, angle, or slug that substantially duplicates an existing entry.
3. When choosing among eligible uncovered topics, the Weekly Blog Automation shall prioritize underrepresented or least-recently published editorial pillars while factoring in current football calendar relevance and verified broadcasting developments.
4. When a generated article passes the full Publishing Gate, the Weekly Blog Automation shall append the new topic record to the Topic Registry in the same commit as the article files and cover illustration.
5. If a run aborts or fails validation before publishing, then the Topic Registry shall remain unchanged relative to the remote primary branch.

### Requirement 3: Verified Research and Copyright-Safe Cover Illustration
**Objective:** As the site operator, I want every automated article grounded in verified current facts and paired with one original copyright-safe editorial illustration, so that published articles remain trustworthy and legally safe worldwide.

#### Acceptance Criteria
1. When a candidate topic is selected, the Weekly Blog Automation shall verify current dates, competition details, and official licensed broadcasters using live web research together with the repository's existing broadcaster reference data before drafting any edition.
2. If factual or official-broadcaster verification for a candidate topic is inconclusive or unavailable, then the Weekly Blog Automation shall omit unverified claims or switch to an alternative verifiable topic rather than guessing broadcast rights.
3. When creating cover artwork for an article, the Weekly Blog Automation shall generate one original, copyright-safe widescreen editorial illustration stored centrally for the article slug, without scraping, copying, or embedding third-party photographs, club crests, league logos, broadcaster trademarks, or match broadcast stills.
4. The Weekly Blog Automation shall produce a cover illustration whose aspect ratio and visual complexity remain compatible with the site's cover and social preview pipeline without exceeding the social preview file-size ceiling after processing.

### Requirement 4: Nine-Edition Regional Authoring and Contract Compliance
**Objective:** As a football supporter in any supported region, I want each weekly article to read naturally in my edition's language and highlight local official broadcasters, while conforming strictly to the site's editorial blog contract.

#### Acceptance Criteria
1. When authoring a weekly post, the Weekly Blog Automation shall create localized article files across all nine editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`) sharing an identical lowercase ASCII slug, identical cross-edition translation identifier, valid editorial pillar, consistent publication and modification timestamps, descriptive localized image alternative text, and published status.
2. When adapting an article for each edition, the Weekly Blog Automation shall localize examples, regional broadcaster references, football terminology, local time-zone references, and edition-appropriate internal links while keeping core facts consistent across editions.
3. Where an article includes structured question-and-answer items, the Weekly Blog Automation shall write them in plain text matching each edition's language and body content without embedded HTML tags or malformed syntax.
4. The Weekly Blog Automation shall ensure zero advertisements, zero unofficial stream references, zero deprecated taxonomy or author archive links, and zero banned icon classes appear in any authored article.

### Requirement 5: Weekly Local Scheduled Automation and Scoped Permissions
**Objective:** As the site operator, I want a self-contained weekly local scheduled automation with non-colliding timing and strictly scoped permissions, so that weekly publishing runs reliably and safely once I enable it.

#### Acceptance Criteria
1. The Weekly Blog Automation shall run on a once-weekly local schedule in the operator's timezone at a day and time outside the daily production deployment window and the daily app-updates automation window.
2. The Weekly Blog Automation shall include a self-contained execution instruction inside its schedule configuration so every fresh scheduled conversation locates the Editorial Playbook, Topic Registry, broadcaster reference data, validation commands, and publishing rules without relying on prior conversation history.
3. The Weekly Blog Automation shall declare only narrowly scoped workspace access and exact command or tool permissions verified to be necessary, with zero wildcard command, file, or network grants.
4. When installed, the Weekly Blog Automation shall remain paused and unenabled in global user configuration until the operator explicitly activates it via the Automations dashboard.
5. While the host computer is asleep or the automation host application is closed during a scheduled slot, the Weekly Blog Automation shall skip the missed slot cleanly without queuing duplicate catch-up runs until the next weekly slot or a manual operator trigger.

### Requirement 6: Pre-Run Git Hygiene, Fail-Closed Validation, and Direct Publishing
**Objective:** As the site operator, I want strict repository cleanliness checks and fail-closed local validation before any push to the primary branch, so that broken builds, SEO errors, or static file-budget overruns never reach production.

#### Acceptance Criteria
1. When a scheduled run begins, the Weekly Blog Automation shall confirm that the local repository is on the primary branch with no unrelated uncommitted changes and synchronize with the remote primary branch before creating or editing any files; if unrelated local changes exist or synchronization fails, then the Weekly Blog Automation shall abort safely without modifying or pushing repository state.
2. After generating the shared cover illustration, nine-edition article files, and updated Topic Registry, the Weekly Blog Automation shall execute the full local Publishing Gate covering the blog contract validator, production site build, site quality checks, SEO and social metadata checks, and post-build static file-count guard.
3. If any check in the Publishing Gate fails or the static file budget is exceeded, then the Weekly Blog Automation shall abort without pushing to the remote repository, restore or leave the working tree safe without broken commits, and report the exact failing check.
4. When every check in the Publishing Gate passes, the Weekly Blog Automation shall stage only the new cover illustration, nine-edition article files, and updated Topic Registry, create a single descriptive conventional commit, and push directly to the remote primary branch so automated deployment and search indexing run automatically.
5. Before recommending operator activation in the Automations dashboard, implementation shall include a guided one-shot verification run confirming the end-to-end workflow and exact permission grants while keeping the scheduled automation paused.
