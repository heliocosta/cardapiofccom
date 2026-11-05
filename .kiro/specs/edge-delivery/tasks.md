# Implementation Plan: edge-delivery

> Conventions: run every command through the project's pnpm scripts (`pnpm dev`, `pnpm build`, `pnpm check`); never edit `themes/hugoplate/` or `_vendor/`; follow the new template system paths (`layouts/_partials/`, `layouts/home.html`, top-level `layouts/baseof.html`). Component names below refer to `design.md` → Components and Interfaces.

- [ ] 1. Foundation: Version Single Source of Truth, Deployment Cleanup, and Hosting Manifest

- [ ] 1.1 Establish toolchain version single source of truth and retire obsolete CI configs
  - Create `.tool-versions` and `config/build.json` declaring the authoritative version pins for the project: Hugo Extended `0.165.0`, Go `1.25.1`, Node `22.14.0`, and pnpm `10.5.2`
  - Remove obsolete deploy manifests from the repository root: `amplify.yml`, `.gitlab-ci.yml`, and `vercel.json`
  - Update `AGENTS.md` and repository pre-flight documentation to reference `config/build.json` and `.tool-versions` instead of `netlify.toml`
  - Update `netlify.toml` with a deprecation notice pointing to `.tool-versions` as the version authority
  - Done when `.tool-versions` and `config/build.json` exist with exact version specifications, obsolete deployment files are removed, `AGENTS.md` reflects the new source of truth, and `pnpm build` continues to succeed
  - _Boundary: VersionConfigManager_
  - _Requirements: 2.3, 9.1, 9.2, 9.3_

- [ ] 1.2 Configure Cloudflare Workers Static Assets deployment manifest
  - Create `wrangler.jsonc` declaring the project name `cardapiofc`, compatibility date, and static assets configuration pointing to `./public`
  - Configure `html_handling: "auto-trailing-slash"` to match Hugo's directory output structure (`/match/{slug}/index.html`)
  - Configure `not_found_handling: "404-page"` to ensure missing requests serve `./public/404.html` with an HTTP 404 status
  - Verify that no worker script entrypoint is declared on the request path, ensuring 100% free-tier static asset execution
  - Done when `wrangler.jsonc` exists at the repository root, conforms to the Wrangler JSON schema, specifies `./public` with auto-trailing-slash and 404-page, and defines zero worker compute
  - _Boundary: WranglerConfig_
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Edge Rules: Routing, Redirects, and Response Headers

- [ ] 2.1 (P) Implement static HTTP 301 redirect map for legacy URLs and deep-link aliases
  - Create `static/_redirects` and delete the orphan root `_redirects` file so Hugo copies the rules directly to `public/_redirects` during build
  - Add deep-link alias redirects for both root and edition-prefixed routes: `/favorites` to `/favourites`, `/reminder` to `/my_agenda`, and edition variants (`/:splat/favorites` to `/:splat/favourites`, `/:splat/reminder` to `/:splat/my_agenda`) with status `301`
  - Add legacy Brazilian Portuguese mappings: `/pt/jogos/onde_assistir_*` and `/pt/jogos/*` to `/pt-br/`, `/pt/times/*` to `/pt-br/`, `/pt/campeonatos/*` to `/pt-br/league/`, and `/pt/*` to `/pt-br/` with status `301`
  - Add legacy English mappings: `/en/matches/where_to_watch_*` and `/en/matches/*` to `/`, `/en/teams/*` to `/`, `/en/leagues/*` to `/league/`, and `/en/*` to `/` with status `301`
  - Add retired language mappings: `/es/*` to `/es-ar/`, and `/fr/*`, `/zh/*`, `/hi/*`, `/ar/*` to `/` with status `301`
  - Done when `static/_redirects` exists, root `_redirects` is deleted, `pnpm build` outputs `public/_redirects`, and all alias and legacy patterns are mapped with 301 status and query preservation
  - _Boundary: StaticRedirectMap_
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 9.4_

- [ ] 2.2 (P) Implement static response headers for MIME types, caching policies, and security
  - Create `static/_headers` so Hugo outputs it to `public/_headers` at build time
  - Configure `Content-Type: application/json` and `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` on `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  - Configure revalidation cache headers on all HTML documents (`/*.html` and `/` -> `Cache-Control: public, max-age=0, must-revalidate`) to guarantee instantaneous updates upon new deployments
  - Configure 1-year immutable caching on fingerprinted static assets (`/assets/*`, `/js/*`, `/css/*` -> `Cache-Control: public, max-age=31536000, immutable`)
  - Configure standard security headers across all paths (`/*`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, and `Permissions-Policy`
  - Configure a Content-Security-Policy baseline permitting first-party assets, inline theme scripts, Google Analytics, and Cloudflare Web Analytics beacons
  - Done when `static/_headers` exists, `pnpm build` outputs `public/_headers`, and the file contains explicit rules for `.well-known` JSON types, HTML cache revalidation, immutable assets, and security headers
  - _Boundary: StaticHeaderMap_
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.4_

- [ ] 2.3 (P) Define declarative Cloudflare Single Redirect Rules for zero-worker geo-routing
  - Create `cloudflare/redirect-rules.json` and `cloudflare/redirect-rules.tf` declaring the exact Cloudflare Single Redirect Rules configuration
  - Define 5 country geo-routing rules for GB (`/en-gb`), IE (`/en-ie`), BR (`/pt-br`), PT (`/pt-pt`), and AR (`/es-ar`) targeting unprefixed routes (`/`, `/match/*`, `/team/*`, `/league/*`, `/search`, `/favourites`, `/favorites`, `/my_agenda`, `/reminder`, `/settings`)
  - Include mandatory exclusion expressions in all rules: `not cf.client.bot` (verified bots stay on requested path), `not http.request.uri.query contains "edition="` (manual query parameter override), and `not http.cookie contains "cfc_edition="` (manual cookie override)
  - Configure dynamic target expression `concat("/<edition>", http.request.uri.path, if(http.request.uri.query ne "", concat("?", http.request.uri.query, "&cfc_geo=<COUNTRY>"), "?cfc_geo=<COUNTRY>"))` with HTTP status `302` to preserve queries and signal `cfc_geo` to `analytics-consent`
  - Verify that visitors from all other countries remain on the Global edition (`/`) without redirection, and that total rules count is exactly 5 (well within the 10-rule free quota)
  - Done when `cloudflare/redirect-rules.json` and `cloudflare/redirect-rules.tf` contain valid declarative definitions for all 5 rules with bot exclusion, manual override checks, 302 status, and query parameter preservation
  - _Boundary: CloudflareSingleRedirectRules_
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4_

- [ ] 3. Automation: Build Guard and GitHub Actions CI/CD Pipeline

- [ ] 3.1 Implement output file-count budget guard script
  - Create `scripts/check-file-count.mjs` using Node.js built-ins to audit the generated `public/` directory immediately following `pnpm build`
  - Recursively count all files, verify no single file exceeds Cloudflare's 25 MiB limit, and group counts by edition (`en`, `en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`) and path kind (`match`, `team`, `league`, `assets`)
  - Format and log a diagnostic breakdown of the output directory
  - If total file count is greater than or equal to 18,000 files, output an actionable error message and exit with `process.exit(1)`
  - If total file count is below 18,000 files, output budget verification summary and exit with `process.exit(0)`
  - Add script definition `"check-file-count": "node scripts/check-file-count.mjs"` to `package.json`
  - Done when running `pnpm check-file-count` on the build output prints the file breakdown, exits 0 when within budget (< 18,000), and exits 1 with diagnostic logging when the budget is reached
  - _Boundary: FileCountGuard_
  - _Requirements: 1.4, 4.1, 4.2, 4.3_

- [ ] 3.2 Build the GitHub Actions CI/CD deployment workflow
  - Create `.github/workflows/deploy.yml` configuring triggers for `push` to `main`, `repository_dispatch` (types: `[dataset_updated]`), manual `workflow_dispatch`, and daily cron `schedule` (`0 5 * * *`)
  - Set concurrency group `deploy-production` with `cancel-in-progress: true` to prevent concurrent deployments during rapid Retool updates
  - Setup environment with Node 22, pnpm (configured from `packageManager`), Go `1.25.1`, and exact Hugo Extended `0.165.0`
  - Add a pre-flight verification step executing `hugo version` to assert that output contains `extended` and matches `v0.165.0` exactly, failing the job otherwise
  - Run `pnpm install --frozen-lockfile`
  - Run production build `pnpm build` with `--cleanDestinationDir` and `--gc` so stale remote JSON is never reused across Retool rebuilds
  - Run `pnpm check-file-count` to verify output size against the 18,000-file threshold
  - Deploy to Cloudflare Workers Static Assets using `cloudflare/wrangler-action@v3` authenticated by secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
  - Done when `.github/workflows/deploy.yml` exists, passes GitHub Action syntax validation, sets up the exact pinned toolchain, runs build with cache cleanliness, enforces the file guard, and deploys via Wrangler
  - _Boundary: GitHubActionsPipeline_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Verification and Operational Governance

- [ ] 4.1 Implement deployment smoke test and verification script
  - Create `scripts/verify-deployment.mjs` using Node.js native `fetch` with `redirect: "manual"` to run post-deployment smoke tests against any specified target host (`--url=https://...` or `http://localhost:8787`)
  - Verify trailing slash normalization and custom 404 response on nonexistent paths
  - Verify HTTP 301 redirects for deep-link aliases (`/favorites` -> `/favourites`, `/reminder` -> `/my_agenda`) and legacy paths (`/pt/jogos/...` -> `/pt-br/`, `/en/matches/...` -> `/`)
  - Verify `Content-Type: application/json` headers on `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  - Verify `Cache-Control` response headers on HTML documents (revalidate) and hashed static assets (immutable)
  - Add script definition `"verify-deployment": "node scripts/verify-deployment.mjs"` to `package.json`
  - Done when running `pnpm verify-deployment` against a local Wrangler preview server (`wrangler dev`) or live domain executes all assertions and reports pass/fail status
  - _Boundary: VerificationSuite_
  - _Requirements: 1.2, 1.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4_

- [ ] 4.2 Create operations runbook for DNS cutover, rollback, Retool webhook, and scaling
  - Create `docs/operations/edge-delivery-runbook.md` providing step-by-step procedures for operators and developers
  - Document the Retool webhook specification: endpoint URL (`POST /repos/:owner/:repo/dispatches`), required fine-grained PAT scopes (`contents: write` or `actions: write`), headers, and payload schema (`{"event_type": "dataset_updated", "client_payload": {...}}`)
  - Document required GitHub repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) with minimum permission scopes
  - Document Cloudflare DNS cutover procedure from Firebase Hosting to Workers Static Assets (custom domains registration, automated edge certificate provisioning, and DNS record migration)
  - Document emergency rollback procedure to restore DNS to Firebase Hosting in the event of an unresolvable edge delivery failure
  - Document operational scaling paths if site file count approaches or exceeds 20,000 files (upgrading to Workers Paid at $5/month for 100,000 files or partitioning by edition into separate free Workers projects)
  - Done when `docs/operations/edge-delivery-runbook.md` exists and covers webhook payload specs, secret setup, DNS cutover, rollback steps, and file-count budget contingency procedures
  - _Boundary: OperationalRunbook_
  - _Requirements: 3.2, 4.4, 10.1, 10.2, 10.3, 10.4_
