# Brief: blog-automation

## Problem
Publishing SEO/GEO-optimized, regionally adapted articles across 9 editions every week by hand is too time-consuming to sustain consistently, leaving organic search growth and mobile app-install acquisition under-leveraged.

## Current State
- No editorial playbook, topic history, or automated publishing workflow exists in the repository.
- `.github/workflows/deploy.yml` already builds, deploys to Cloudflare Workers Static Assets, and submits URLs to IndexNow on every push to `main` (and runs a daily cron at `05:00 UTC` with `concurrency: cancel-in-progress: true`).
- `deploy.yml` does **not** run `pnpm check` or `pnpm check:seo` in CI, so automated pushes to `main` must pass all local validation gates beforehand.
- `~/.gemini/config/sidecars/` is available on the user's Mac for Antigravity scheduled automations (`"builtin": "schedule"`).

## Desired Outcome
A reliable, zero-touch weekly Antigravity scheduled automation (1 post/week) backed by a version-controlled editorial playbook and topic registry in the repository that:
1. Picks an uncovered topic across the core content pillars (app features/guides, football events/watch guides, streaming & broadcast rights, sports/broadcasting market).
2. Researches verified facts and official broadcasters.
3. Generates one copyright-safe AI editorial illustration (`assets/images/blog/{slug}`).
4. Drafts and regionally adapts all 9 editions (`content/<ed>/blog/{slug}.md`) conforming strictly to `editorial-blog`'s frontmatter and Markdown contract.
5. Runs all local build, SEO, i18n, contract, and file-budget checks, and commits & pushes directly to `main` (aborting cleanly without pushing if any check fails).

## Approach
**Approach A — Repo Editorial Playbook & Registry + Antigravity Scheduled Automation**:
Keep editorial strategy, pillar rotation, regional voice/broadcaster guidance (`docs/blog-editorial/playbook.md`), and published-topic history (`data/blog-topics.yaml`) version-controlled in the repository, and configure an Antigravity scheduled sidecar (`~/.gemini/config/sidecars/cardapiofc-weekly-blog/sidecar.json` with `"builtin": "schedule"`, `restart_policy: "always"`, `CRON_TZ=<user-iana-tz>`, scheduled away from `05:00 UTC`). Each run uses Antigravity's built-in web research and `image-generator` with minimal scoped `agent_permissions` (`workspace_uris` + exact `command(...)` grants), verified via a guided test run before the user enables it in the Automations dashboard.

## Scope
- **In**:
  - Editorial playbook (`docs/blog-editorial/playbook.md`) covering 4 pillars (Cardápio FC app features/guides, football watch guides, streaming & broadcast rights, sports/broadcasting market), SEO/GEO article structure (answer-first intros, scannable headings, FAQ blocks, natural app-install CTAs, internal links to matches/broadcasters), strict official-broadcasters-only & factual-grounding rules, and regional adaptation rules across all 9 editions (`en`, `en-gb`, `en-ie`, `en-us`, `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, `ja`).
  - Machine-readable published-topic registry (`data/blog-topics.yaml`) for topic deduplication, pillar rotation, and slug tracking.
  - Self-contained Antigravity automation prompt and `sidecar.json` configuration (1 post/week, away from `05:00 UTC`), with exact scoped `agent_permissions`.
  - Pre-push gating and git hygiene workflow (`git pull --rebase`, `pnpm build && pnpm check && pnpm check:seo && pnpm check-file-count` + blog validator, abort on failure without pushing, conventional commit + `git push origin main` on pass).
  - Guided one-shot test run during implementation to verify permissions and behavior before asking the user to enable the automation in the Automations dashboard.
- **Out**:
  - Hugo layouts, CSS, SEO/JSON-LD partials, and validation script internals (owned by `editorial-blog`).
  - Cloud GitHub Actions LLM/API scripts or custom API orchestration runners.
  - External CMS UIs or manual approval dashboards.
  - Social media cross-posting (X, Instagram, LinkedIn, etc.).
  - Modifying `.github/workflows/deploy.yml` CI triggers.
  - Automatically enabling `user_config.json` for the sidecar (user enables explicitly via the Antigravity Automations dashboard).

## Boundary Candidates
- **Editorial playbook & regional adaptation guide**: Pillar definitions, tone/locale rules per edition, and SEO/GEO article checklist.
- **Topic registry & deduplication state**: Tracks published slugs, pillars, dates, and avoids duplicate angles.
- **Illustration & content generation workflow**: Prompting `image-generator` for copyright-safe editorial art and authoring all 9 Markdown files.
- **Antigravity sidecar & permission profile**: `sidecar.json` cron schedule, self-contained prompt, `workspace_uris`, and exact `access_grants`.
- **Pre-push verification & git publish protocol**: Clean pull/rebase, local test/build/SEO/budget gates, and fail-closed push behavior.

## Out of Boundary
- Rendering blog HTML/CSS/JSON-LD, modifying Hugo configuration or themes, or auto-enabling the sidecar in Antigravity's user config.

## Upstream / Downstream
- **Upstream**:
  - `editorial-blog`: Owns the `content/<ed>/blog/{slug}.md` and `assets/images/blog/` contract plus the local validation commands.
  - `edge-delivery`: Owns `.github/workflows/deploy.yml` push-to-`main` deployment and IndexNow submission.
  - `broadcaster-directory` / `data-pages`: Provides live dataset & official broadcaster reference data for factual grounding and internal links.
- **Downstream**:
  - Future cadence expansion (e.g., 1 → 2 posts/week), optional social distribution, or switching to PR-based review.

## Existing Spec Touchpoints
- **Extends**: None.
- **Adjacent**: `editorial-blog`, `edge-delivery`, `broadcaster-directory`.

## Constraints
- **Antigravity `automation` skill rules**: Config at `~/.gemini/config/sidecars/<sidecar-id>/sidecar.json`; snake_case fields (`restart_policy: "always"`, `display_name`, `agent_permissions`, `access_grants`, `workspace_uris`); `args[0]` prefixed with `CRON_TZ=<IANA zone>`; `"--"` before the prompt; never use wildcard permission grants (`command(*)`, `read_file(*)`, etc.); never auto-enable the automation in `user_config.json`.
- **Execution environment**: Runs locally on the host Mac (runs missed while the Mac is asleep or Antigravity is closed skip until the next scheduled slot or manual trigger).
- **CI scheduling**: Weekly slot must avoid `deploy.yml`'s `05:00 UTC` daily cron window (`concurrency: cancel-in-progress: true`).
- **Fail-closed publishing**: Never `git push origin main` unless `pnpm build`, `pnpm check`, `pnpm check:seo`, `pnpm check-file-count`, and the blog validator all exit `0`.
- **Cadence & budget**: Start at 1 post/week (~520–624 files/year across 9 editions) to stay comfortably within Cloudflare's 18,000/20,000 static asset budget.
- **Editorial & IP policy**: Copyright-safe AI-generated editorial illustrations only (no scraped photos/logos/broadcast stills); zero ads; 100% official broadcasters only.
