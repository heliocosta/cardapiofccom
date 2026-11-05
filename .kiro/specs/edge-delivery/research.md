# Research & Design Decisions: edge-delivery

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design for Cloudflare Workers Static Assets hosting, GitHub Actions CI/CD with Hugo 0.165.0 extended, automated Retool triggers, edge geo-routing, legacy redirects, response headers, and operational cutover.
---

## Summary
- **Feature**: `edge-delivery`
- **Discovery Scope**: Complex Integration & Infrastructure
- **Key Findings**:
  - Cloudflare Workers Static Assets (announced 2024/2025) is Cloudflare's recommended successor to Pages for static hosting, offering €0 recurring cost, 20,000 files per deployment on the free tier, 25 MiB max per file, zero compute execution overhead on the hot path, and native parsing of `_headers` and `_redirects` placed inside the asset directory (`./public`).
  - GitHub Actions provides the exact build environment needed: pinned Hugo Extended 0.165.0, Go 1.25.1, Node 22, and pnpm 10.x. Webhook triggering is natively supported via `repository_dispatch` with an event type filter (`dataset_updated`), enabling Retool to initiate rebuilds immediately following remote JSON publication to Firebase Storage.
  - Zero-worker edge geo-routing can be implemented entirely with Cloudflare Single Redirect Rules (free tier allows up to 10 rules). With 5 regional editions (GB, IE, BR, PT, AR) and Global (unprefixed fallback), exactly 5 Single Redirect Rules are required (302 redirects). Exclusions for verified search engine bots (`cf.client.bot`), the manual query parameter `?edition=`, and switcher cookies ensure full SEO crawlability and uninterrupted manual navigation.
  - Legacy URL equity (thousands of indexed URLs across `/pt/jogos/...`, `/en/matches/...`, `/es/...`, `/fr/...`, etc.) and app deep-link aliases (`/favorites`, `/reminder`) are preserved with fast HTTP 301 redirects declared in `static/_redirects`.
  - Content headers in `static/_headers` serve `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` as `application/json`, enforce security headers, and establish cache policies (revalidate for HTML, 1-year immutable for fingerprinted static assets).
  - Obsolete deploy configurations (`amplify.yml`, `.gitlab-ci.yml`, `vercel.json`) can be retired, and the authoritative `HUGO_VERSION` and `GO_VERSION` pins transitioned from `netlify.toml` to a standard `.tool-versions` file with corresponding AGENTS.md rule alignment.

## Research Log

### Topic 1: Cloudflare Workers Static Assets vs Cloudflare Pages
- **Context**: Cloudflare historically offered Pages for static sites and Workers for serverless compute. In 2024–2025, Cloudflare introduced Workers Static Assets, unifying the platform under Wrangler.
- **Sources Consulted**:
  - Cloudflare Workers Documentation: Static Assets Configuration (`wrangler.jsonc`)
  - Cloudflare Free Tier Quotas & Limits
- **Findings**:
  - Workers Static Assets supports pure static asset hosting configured via `assets.directory` in `wrangler.jsonc`.
  - When no worker script is bound to the fetch event or when static assets match first, requests are served directly from Cloudflare's global cache/storage with zero compute cost and zero CPU execution time.
  - Static asset limits on the Free Plan: up to 20,000 files per deployment, 25 MiB max per file, unlimited requests and bandwidth.
  - Cloudflare Workers Static Assets natively parses `_headers` and `_redirects` files located in the root of the assets directory (`./public`).
  - Configuration options in `wrangler.jsonc`:
    - `html_handling`: `"auto-trailing-slash"` automatically matches Hugo's directory structure (`/match/{slug}/index.html`).
    - `not_found_handling`: `"404-page"` serves `./public/404.html` with HTTP status 404 for unmatched paths.
- **Implications**:
  - Perfect fit for Hugo output (`./public`).
  - No custom worker JavaScript required on the request path, ensuring 100% free-tier compliance.

### Topic 2: GitHub Actions CI Environment and Retool Webhook Trigger
- **Context**: Retool publishes JSON datasets to Firebase Storage and must trigger an automated site build. The build must run exact Hugo 0.165.0 extended with pnpm and Go.
- **Sources Consulted**:
  - GitHub REST API: Create a repository dispatch event (`POST /repos/{owner}/{repo}/dispatches`)
  - `peaceiris/actions-hugo` GitHub Action documentation
  - Hugo remote resource caching documentation
- **Findings**:
  - GitHub Actions supports `repository_dispatch` triggers filtered by `types: [dataset_updated]`.
  - Retool can trigger this via a simple HTTP POST request using a fine-grained GitHub Personal Access Token (PAT) with `contents: write` or `metadata: read` / actions dispatch permissions.
  - Payload schema: `{"event_type": "dataset_updated", "client_payload": {"generatedAt": "...", "version": "1.0.0"}}`.
  - Hugo's `resources.GetRemote` caches downloaded data according to `[caches.getresource]` in `hugo.toml`. If CI caches Hugo resources across workflow runs, Hugo might not fetch newly published JSON files.
  - Solution: In CI, Hugo must run with `--gc` and the workflow must not restore stale Hugo remote caches during `dataset_updated` dispatches, or must invoke `hugo --cleanDestinationDir`.
- **Implications**:
  - Workflow will support `push` (main branch), `workflow_dispatch` (manual), `repository_dispatch` (Retool), and daily `schedule` (cron).
  - CI pre-flight step will strictly verify `hugo version` equals `0.165.0 extended` before executing the build.

### Topic 3: Zero-Code Edge Geo-Routing via Cloudflare Single Redirect Rules
- **Context**: Visitors on unprefixed routes (`/`, `/match/*`, `/team/*`, `/league/*`, etc.) should be 302-redirected to their country's edition without incurring worker compute costs or blocking search engine crawlers.
- **Sources Consulted**:
  - Cloudflare Ruleset Engine & Single Redirect Rules documentation
  - Cloudflare Bot Management: `cf.client.bot` field definition
- **Findings**:
  - Cloudflare Free Tier grants 10 Single Redirect Rules per zone.
  - Dynamic expressions support string concatenation (`concat()`), URL path (`http.request.uri.path`), and query preservation. `regex_replace()` is unavailable on the Free Plan, but not needed because prefixing requires only `concat("/<edition>", http.request.uri.path)`.
  - We have 5 regional editions requiring geo-routing:
    - GB -> `/en-gb`
    - IE -> `/en-ie`
    - BR -> `/pt-br`
    - PT -> `/pt-pt`
    - AR -> `/es-ar`
  - Global visitors (all other countries) remain on `/` without redirection.
  - Exactly 5 rules are needed—comfortably within the 10-rule free quota.
  - Crawler protection: The rule condition `not cf.client.bot` excludes verified search engine crawlers (Googlebot, Bingbot, Applebot, etc.) from geo-redirection. Crawlers see the raw URL and follow `hreflang` tags without being trapped in redirect loops.
  - Manual override protection: The rule condition `not http.request.uri.query contains "edition=" and not http.cookie contains "cfc_edition="` prevents redirect loops when a visitor manually selects an edition using the switcher.
- **Implications**:
  - Zero Worker scripts needed for geo-routing.
  - Zero recurring cost.
  - Documented as code in `cloudflare/redirect-rules.json` and Terraform HCL.

### Topic 4: Legacy URL Redirection and Deep-Link Aliases (`_redirects`)
- **Context**: Thousands of legacy URLs are indexed from the previous Brazilian (`/pt/...`) and English (`/en/...`) sites. Furthermore, `app-deeplinks` requires `/favorites` and `/reminder` to redirect to `/favourites` and `/my_agenda`.
- **Sources Consulted**:
  - Cloudflare Static Assets `_redirects` documentation
  - Data-pages and App-deeplinks specifications
- **Findings**:
  - Cloudflare Static Assets supports standard Netlify-style `_redirects` files.
  - Max redirect rules in `_redirects` is typically 2,000 static lines or 100 wildcard lines.
  - We can cover all legacy patterns using a concise set of ~15 wildcard rules:
    - `/pt/jogos/onde_assistir_* /pt-br/ 301`
    - `/pt/jogos/* /pt-br/ 301`
    - `/pt/times/* /pt-br/ 301`
    - `/pt/campeonatos/* /pt-br/league/ 301`
    - `/pt/* /pt-br/ 301`
    - `/en/matches/where_to_watch_* / 301`
    - `/en/matches/* / 301`
    - `/en/teams/* / 301`
    - `/en/leagues/* /league/ 301`
    - `/en/* / 301`
    - `/es/* /es-ar/ 301`
    - `/fr/* / 301`, `/zh/* / 301`, `/hi/* / 301`, `/ar/* / 301`
    - `/favorites /favourites 301`
    - `/reminder /my_agenda 301`
    - `/*/favorites /:splat/favourites 301`
    - `/*/reminder /:splat/my_agenda 301`
  - Query parameters (`?l=`, `?q=`) are automatically passed through by Cloudflare.
- **Implications**:
  - Placing `_redirects` in `static/_redirects` ensures Hugo automatically outputs it to `public/_redirects`.

### Topic 5: HTTP Headers & Mobile Association Files (`_headers`)
- **Context**: iOS universal links and Android App Links require `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` to be served as `application/json`. Browsers need security headers and optimal caching.
- **Sources Consulted**:
  - Apple Developer: Supporting Associated Domains
  - Google Android: Verify Android App Links
  - Cloudflare Static Assets `_headers` syntax
- **Findings**:
  - The `_headers` file in `public/` applies response headers by path match.
  - Setting `Content-Type: application/json` on `/.well-known/*` satisfies Apple and Google verification requirements.
  - Caching strategy:
    - HTML: `Cache-Control: public, max-age=0, must-revalidate` ensures users receive immediate updates on every rebuild without stale cache delays.
    - Assets: `/assets/*` and `/js/*` (fingerprinted by Hugo/esbuild) receive `Cache-Control: public, max-age=31536000, immutable`.
  - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- **Implications**:
  - Maintained as `static/_headers`, copied into `public/_headers` at build time.

### Topic 6: File-Count Guard and Scaling Architecture
- **Context**: Cloudflare Free Tier limits deployments to 20,000 files. Data-pages estimates 14,000–18,000 files for normal datasets. A CI guard is needed to prevent deployment failure.
- **Sources Consulted**:
  - Data-pages design: File-Count Estimate formula $F = E \times (M + \Lambda + T + L + 1 + c) + S \le 18,000$.
- **Findings**:
  - A lightweight Node/shell verification script (`scripts/check-file-count.mjs`) counts files in `public/`.
  - If count >= 18,000, CI fails with exit code 1 before attempting Wrangler deployment, printing file distribution across editions.
  - If file count permanently exceeds 20k in the future, two documented fallbacks exist:
    1. Workers Paid Plan ($5/month): increases limit to 100,000 files.
    2. Multi-project edition partitioning: route `/en-gb/*`, `/pt-br/*` to separate free Workers projects via Cloudflare Route / Worker Dispatch.
- **Implications**:
  - Hard gate in CI prevents partial or broken deployments.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Decision |
|---|---|---|---|---|
| **A. Workers Static Assets + Single Redirect Rules (Selected)** | Pure static asset hosting with declarative Cloudflare Edge Single Redirect Rules and `_headers`/`_redirects`. | 100% free (€0), zero compute latency, zero cold starts, zero worker maintenance, respects limits. | Cloudflare Free limit: 10 redirect rules, 20k files. | **Adopt**: Perfectly meets requirements and constraints. |
| **B. Cloudflare Pages** | Cloudflare's older Git-integrated static hosting. | Simple dashboard integration. | Being unified into Workers Static Assets; lacks native wrangler.jsonc flexibility for unified Cloudflare platform. | **Reject**: Superseded by Workers Static Assets. |
| **C. Worker Reverse Proxy (Edge Compute Script)** | Custom Worker script inspecting request headers and streaming assets via `env.ASSETS.fetch()`. | Complete programmatic control over headers, redirects, and rewrites. | Consumes Worker request quota (100k requests/day free limit); adds per-request CPU execution time. | **Reject**: Unnecessary compute overhead when free Redirect Rules suffice. |
| **D. Keep Firebase Hosting** | Maintain current hosting behind Cloudflare. | No DNS cutover required. | Spark plan daily bandwidth limit (360 MB/day) too low; Blaze requires billing. | **Reject**: Unstable on free tier for global audience. |

## Design Decisions

### Decision 1: Hosting on Cloudflare Workers Static Assets via `wrangler.jsonc`
- **Context**: Need €0 static hosting with unlimited bandwidth.
- **Selected Approach**: Use `wrangler.jsonc` with `assets = { directory: "./public", html_handling: "auto-trailing-slash", not_found_handling: "404-page" }`.
- **Rationale**: Official modern standard for static sites on Cloudflare. Zero compute execution.
- **Follow-up**: Deploy using `cloudflare/wrangler-action` in GitHub Actions.

### Decision 2: Zero-Worker Geo-Routing via 5 Single Redirect Rules
- **Context**: Redirect unprefixed URLs to localized editions based on visitor country without running a Worker script.
- **Selected Approach**: 5 Cloudflare Single Redirect Rules (GB, IE, BR, PT, AR) with `not cf.client.bot` and `not http.request.uri.query contains "edition=" and not http.cookie contains "cfc_edition="`.
- **Rationale**: Consumes 5 of 10 free rules. Completely prevents crawler loops and preserves user manual edition preferences.
- **Follow-up**: Export rule definitions as code in `cloudflare/redirect-rules.json`.

### Decision 3: Pre-Deploy File Count Guard at 18,000 Files
- **Context**: Cloudflare hard limit is 20,000 files.
- **Selected Approach**: `scripts/check-file-count.mjs` runs after `pnpm build` and halts CI with diagnostics if file count >= 18,000.
- **Rationale**: Provides a 2,000-file safety cushion to avoid deployment rejections from Cloudflare.
- **Follow-up**: Include per-edition file breakdown in error diagnostics.

### Decision 4: Authoritative Version Pinning Transition
- **Context**: `netlify.toml` currently holds `HUGO_VERSION = "0.165.0"` and `GO_VERSION = "1.25.1"`. Netlify is being retired.
- **Selected Approach**: Store version pins in `.tool-versions` and `config/build.json`, update `AGENTS.md` and `check-site.mjs` to read this single source of truth, and retire `amplify.yml`, `.gitlab-ci.yml`, `vercel.json`.
- **Rationale**: Eliminates dead configuration drift while keeping local `mise`/`asdf` tooling working seamlessly.

## Risks & Mitigations
- **Risk 1: Retool deployment trigger floods CI runs during batch updates**
  - *Mitigation*: Configure GitHub Actions concurrency group `concurrency: { group: "deploy-production", cancel-in-progress: true }` so rapid subsequent dispatches cancel intermediate builds and only deploy the latest state.
- **Risk 2: Stale Hugo remote cache on rebuilt data**
  - *Mitigation*: Ensure CI executes `pnpm build` with `--gc` and avoids persisting Hugo remote resource cache across `repository_dispatch` runs.
- **Risk 3: Unverified crawlers encountering geo-redirects**
  - *Mitigation*: Unverified crawlers follow standard 302 redirects and read `hreflang` tags on the target edition; `x-default` canonical pointing to Global ensures search engine equity is retained.
- **Risk 4: File count growth as new leagues are added**
  - *Mitigation*: Build guard catches growth at 18k files. Documented operational procedure outlines how to transition to Workers Paid ($5/mo for 100k files) or partition by edition.

## References
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Single Redirect Rules: https://developers.cloudflare.com/rules/url-forwarding/single-redirects/
- Cloudflare Bot Management (`cf.client.bot`): https://developers.cloudflare.com/ruleset-engine/rules-language/fields/#bot-management-fields
- GitHub Actions `repository_dispatch`: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch
