# Implementation Plan: blog-automation

- [ ] 1. Foundation — editorial playbook and published-topic registry
- [x] 1.1 (P) Author the version-controlled editorial playbook for four pillars and nine editions
  - Define the four editorial content pillars, reader intent, and pillar-rotation rules to avoid concentrating consecutive posts in a single pillar
  - Specify the answer-first SEO and AI-answer article structure, scannable descriptive headings, factual tables or lists, optional structured question-and-answer items, natural mobile app download calls to action, and internal links to match, league, team, and broadcaster pages
  - Document strict editorial compliance rules (zero advertisements or sponsorships, official licensed broadcasters only, pre-draft fact verification, and copyright-safe widescreen editorial illustration guidelines keeping processed social previews compact)
  - Establish regional adaptation guidelines across all nine site editions (Global/UK/Ireland football vs. US soccer, Brazilian vs. European Portuguese, Argentine Spanish, Simplified Chinese, and Japanese terminology, time-zone conventions, and local broadcaster relevance) plus the required article frontmatter and validation checklist
  - Observable completion: Editorial playbook exists in the repository with complete pillar, SEO/GEO, compliance, nine-edition voice, and upstream blog-contract guidance ready for automated runs
  - _Boundary: EditorialPlaybook_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.3, 3.4, 4.2_

- [ ] 1.2 (P) Create the machine-readable published-topic registry seeded with the launch article
  - Define the structured published-topic history schema storing canonical slug, publication date, editorial pillar, concise topic title, and covered angles or keywords alongside pillar-rotation metadata
  - Seed the registry with the upstream launch guide article so the first automated run avoids repeating the launch topic and rotates away from its editorial pillar
  - Verify the registry parses cleanly as valid YAML and causes zero regressions in the static site build
  - Observable completion: Published-topic registry exists in the repository with valid YAML structure and the seeded launch entry intact
  - _Boundary: TopicRegistry_
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2. Configure the weekly scheduled automation and self-contained execution prompt
  - Create the local scheduled automation configuration set to run once weekly on Monday mid-morning in the operator's local timezone (`Europe/London`), avoiding both the daily site deployment window and the daily app-updates check window, and relying on host schedule behavior to skip missed sleep or closed windows cleanly
  - Author a self-contained execution instruction referencing the editorial playbook, published-topic registry, curated broadcaster reference data, and local validation commands so fresh runs require zero prior conversation memory
  - Encode the end-to-end run protocol: clean primary-branch and remote-sync guard before editing, duplicate-excluding topic selection prioritizing underrepresented pillars, live factual and official-broadcaster verification (omitting unverified claims or switching topics if inconclusive), single copyright-safe widescreen editorial illustration generation, nine-edition regional adaptation with plain-text FAQs and zero prohibited links or icon classes, fail-closed execution of all build, blog contract, site quality, SEO/social, and static file-count checks with working-tree rollback on any failure, and deferred registry update plus single conventional commit and push only on full pass
  - Declare baseline narrowly scoped workspace and command permissions with zero wildcard grants, while keeping the automation paused and unenabled in global user configuration
  - Observable completion: Weekly scheduled automation configuration exists with valid cron timezone syntax, self-contained instructions, zero wildcard grants, and paused initial activation state
  - _Boundary: WeeklyScheduleSidecar_
  - _Depends: 1.1, 1.2_
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

- [ ] 3. Validation — structural audit and guided one-shot verification run
- [ ] 3.1 Audit playbook completeness, topic registry parsing, and automation schema safety
  - Validate that the editorial playbook documents all four pillars, all nine editions, upstream frontmatter/media/validation rules, and official-broadcaster and copyright-safe illustration constraints
  - Verify the topic registry parses cleanly and confirm the weekly automation configuration parses as valid JSON with the expected schedule prefix, argument separator, non-colliding timing, paused global activation state, and zero wildcard permission grants
  - Observable completion: Structural audit confirms playbook completeness, valid registry YAML, valid automation JSON configuration, and non-enabled global state with zero findings
  - _Boundary: Integration_
  - _Depends: 1.1, 1.2, 2_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 5.1, 5.2, 5.3, 5.4_

- [ ] 3.2 Execute a guided one-shot verification run and lock scoped automation permissions
  - Confirm upstream `editorial-blog` prerequisites are implemented on disk (nine-edition blog section, launch guide matching the seeded registry entry, and working blog contract, site, SEO, and static file-count validation scripts) before executing the supervised workflow
  - Execute the self-contained automation workflow once under operator supervision—verifying clean primary-branch synchronization, duplicate-free topic selection, live broadcaster verification, copyright-safe illustration creation, nine-edition regional authoring, and the full local Publishing Gate
  - Verify fail-closed cleanup behavior on simulated or actual gate failure (confirming the topic registry and working tree remain clean without partial commits or remote pushes), lock only the exact verified workspace and command permission grants in the paused automation configuration, and either commit/push with explicit operator confirmation or restore test artifacts cleanly before presenting the automation display name and Automations dashboard link for operator activation
  - Observable completion: Guided one-shot run passes all local validation gates, exact non-wildcard permissions are locked in the paused automation configuration, and the operator receives clear activation instructions
  - _Boundary: Integration_
  - _Depends: 3.1_
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5_

## Implementation Notes
- Keep `sidecar.json` paused by default (`user_config.json` / `config.json` untouched) and never add wildcard grants (`command(*)`, `read_file(*)`, etc.) to `agent_permissions`.
- Maintain strict schedule separation from `.github/workflows/deploy.yml` (`05:00 UTC` daily) and `daily-app-updates` (`09:00 Europe/London` daily) via `CRON_TZ=Europe/London 30 10 * * 1`.
- Ensure `editorial-blog` tasks are implemented prior to running Task `3.2` so `validate:blog` and restored `check-file-count.mjs` are active on disk.
- Task-graph sanity review (`kiro-spec-tasks` Step 3.5) verdict: `PASS` (mode: `independent`).
