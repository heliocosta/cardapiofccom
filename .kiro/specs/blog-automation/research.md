# Research & Design Decisions: blog-automation

## Discovery Classification
- **Type**: Extension and operational automation integrating with `editorial-blog`, `broadcaster-directory`, `edge-delivery`, and `app-updates`.
- **Process**: Light Discovery (`design-discovery-light.md`) + Design Synthesis (`design-synthesis.md`), grounded in direct inspection of `.kiro/specs/editorial-blog/`, `.kiro/specs/app-updates/`, `.github/workflows/deploy.yml`, `package.json`, `config/_default/languages.toml`, `data/cfc/broadcasters.yaml`, `data/cfc/settings.yaml`, and the `automation` skill specification.

## Skills & Guidance Consulted
- `/Users/heliocosta/.gemini/antigravity/builtin/skills/automation/SKILL.md`: Verified `"builtin": "schedule"` sidecar schema under `~/.gemini/config/sidecars/<sidecar-id>/sidecar.json`, `CRON_TZ=<IANA zone>` prefix in `args[0]`, `"--"` argument separator before the prompt, snake_case fields (`restart_policy: "always"`, `display_name`, `agent_permissions`, `workspace_uris`, `access_grants`), strict ban on wildcard grants (`command(*)`, `read_file(*)`, etc.), and the rule never to auto-enable `user_config.json` / `config.json`.
- `.kiro/specs/editorial-blog/{requirements,design,tasks}.md`: Verified the 9-edition content contract, frontmatter schema, 4-pillar enum, shared cover image contract, and validation CLI scripts.
- `.kiro/specs/app-updates/{design,research}.md`: Verified existing local scheduled automation conventions, host timezone (`Europe/London`), and `09:00 Europe/London` daily schedule slot.

## Codebase & Environment Inspection Findings

### 1. Host Timezone & Schedule Collision Avoidance
- **Host timezone**: `/etc/localtime` resolves to `/var/db/timezone/zoneinfo/Europe/London` (confirmed on host Mac).
- **Existing schedules**:
  - `.github/workflows/deploy.yml` runs a daily cron at `"0 5 * * *"` (`05:00 UTC`) with `concurrency: { group: deploy-production, cancel-in-progress: true }`.
  - `app-updates` schedules its local Antigravity automation at `CRON_TZ=Europe/London 0 9 * * *` (09:00 AM daily `Europe/London`).
- **Decision**: Schedule `cardapiofc-weekly-blog` at **`CRON_TZ=Europe/London 30 10 * * 1`** (every Monday at 10:30 AM `Europe/London`).
  - Avoids `05:00 UTC` (05:00 GMT / 06:00 BST) by 4.5–5.5 hours, preventing `deploy-production` concurrency cancellations.
  - Leaves a 90-minute buffer after `app-updates`'s `09:00 Europe/London` daily run, preventing local git working-tree and `main` push contention.
  - Monday mid-morning aligns with host awake hours and covers weekend match outcomes plus midweek European/domestic schedules.

### 2. Upstream `editorial-blog` Content, Image, & Validation Contract
- **Editions**: 9 active editions defined in `config/_default/languages.toml`: `en` (Global, UTC), `en-gb` (UK, `Europe/London`), `en-ie` (Ireland, `Europe/Dublin`), `en-us` (USA, `America/New_York`), `pt-br` (Brasil, `America/Sao_Paulo`), `pt-pt` (Portugal, `Europe/Lisbon`), `es-ar` (Argentina, `America/Argentina/Buenos_Aires`), `zh-cn` (中国, `Asia/Shanghai`), and `ja` (日本, `Asia/Tokyo`).
- **Content files**: `content/<ed>/blog/{slug}.md` with identical lowercase ASCII `slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), `translationKey: "blog-{slug}"`, `pillar` in `["rights-changes", "watch-guides", "app-guides", "market-analysis"]`, `date`, `lastmod` (`>= date`), `image: "images/blog/{slug}.png"`, `image_alt`, optional plain-text `faq: [{ q, a }]`, and `draft: false`.
- **Image processing constraint**: `layouts/_partials/blog/cover.html` generates 5 fingerprinted files (`480x270` & `800x450` card WebP, `640x360` & `1200x675` hero WebP, and `1200x630` JPEG `q80` OG). The processed `1200x630` JPEG **must be `<= 300,000` bytes** (`OG_MAX` in `scripts/check-seo-social.mjs` and `scripts/validate-blog.mjs`). Requesting a clean 16:9 flat/geometric editorial illustration style from `image-generator` keeps JPEG q80 output well below 300 KB and ensures clean center-cropping at both `16:9` and `1200x630`.
- **Validation scripts**:
  - `package.json` already defines `"build"`, `"check"` (`scripts/check-site.mjs`), `"check:seo"` (`scripts/check-seo-social.mjs`), and `"check-file-count"` (`scripts/check-file-count.mjs`). Note the hyphen in `pnpm check-file-count` (not colon).
  - `editorial-blog` adds `"validate:blog"` (`scripts/validate-blog.mjs`) and `"test:blog"` (`scripts/test-editorial-blog.mjs`).
  - `.github/workflows/deploy.yml` runs `pnpm build` and `pnpm check-file-count` on `main` pushes, and does **not** run `pnpm check`, `pnpm check:seo`, or `pnpm validate:blog`. Therefore, the weekly automation must run all five (`pnpm validate:blog && pnpm build && pnpm check && pnpm check:seo && pnpm check-file-count`) locally before `git push origin main`.

### 3. CI `paths-ignore` & Broadcaster Grounding Seams
- **Deploy trigger impact**: `.github/workflows/deploy.yml` ignores `docs/**`, `.kiro/**`, and `cloudflare/**`, but does **not** ignore `content/**`, `assets/**`, or `data/**`.
  - Editing `docs/blog-editorial/playbook.md` does not trigger a site deploy on its own.
  - Pushing `content/<ed>/blog/{slug}.md`, `assets/images/blog/{slug}.png`, and `data/blog-topics.yaml` triggers `deploy.yml` → Cloudflare Workers Static Assets + IndexNow submission cleanly.
- **Hugo `data/` compatibility**: `data/blog-topics.yaml` uses a hyphenated filename, which is safe because no Hugo template accesses `site.Data.blog-topics` via Go dot-notation; only the editorial automation reads and updates `data/blog-topics.yaml`.
- **Broadcaster reference**: `data/cfc/broadcasters.yaml` provides curated, official licensed broadcaster records across `BR`, `GB`, `IE`, `PT`, and `AR` (`url`, `type`, descriptions, FAQs, and `denylist` for placeholder channels like `canal-a-confirmar` / `tba`). Combining `data/cfc/broadcasters.yaml` with live web search ensures `en-us`, `zh-cn`, `ja`, and breaking rights updates are accurately verified without inventing rights.

## Design Synthesis Outcomes

### 1. Build vs. Adopt
- **Adopted**: Native Antigravity `"builtin": "schedule"` sidecar (`~/.gemini/config/sidecars/cardapiofc-weekly-blog/sidecar.json`), Antigravity's built-in web research (`search_web`) and `image-generator` subagent, and upstream `editorial-blog` validation scripts (`pnpm validate:blog`, `pnpm build`, `pnpm check`, `pnpm check:seo`, `pnpm check-file-count`).
- **Rejected**: Custom Node/Python LLM orchestration scripts, external cron/GitHub Actions LLM runners, and metered Gemini API keys in CI—eliminating extra runtime dependencies, API billing, and custom prompt-runner maintenance.

### 2. Generalization & Simplification
- **Single-source prompt + repo playbook split**: Keep durable editorial strategy, pillar rotation rules, 9-edition voice/terminology tables, and SEO/GEO checklists in `docs/blog-editorial/playbook.md` (easy to review and evolve in git), while keeping the `sidecar.json` prompt concise, self-contained, and deterministic—pointing directly to `docs/blog-editorial/playbook.md`, `data/blog-topics.yaml`, `data/cfc/broadcasters.yaml`, and the exact validation/publishing sequence.
- **Deferred registry write / fail-closed cleanup**: Update `data/blog-topics.yaml` only after `pnpm validate:blog`, `pnpm build`, `pnpm check`, `pnpm check:seo`, and `pnpm check-file-count` all pass (or explicitly roll back all newly created/modified files on failure) so a failed run never leaves dirty files that would block the next week's `git status --porcelain` guard.
- **Cohesive 3-component boundary**: `EditorialPlaybook` (`docs/blog-editorial/playbook.md`), `TopicRegistry` (`data/blog-topics.yaml`), and `WeeklyScheduleSidecar` (`~/.gemini/config/sidecars/cardapiofc-weekly-blog/sidecar.json`), with zero unnecessary wrapper scripts.
