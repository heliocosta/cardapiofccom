# Requirements Document

## Project Description (Input)
CardápioFC needs to be hosted for free, rebuild automatically when Retool updates the remote dataset, route visitors to their country's regional edition, and preserve search engine equity by redirecting indexed legacy URLs. Currently, the site runs on Firebase Hosting behind Cloudflare with legacy CI configurations (Netlify, Vercel, Amplify, GitLab), no automated deploy webhook, no edge geo-routing, no static headers configuration, and thousands of indexed legacy URLs. This feature delivers Cloudflare Workers Static Assets free-tier hosting on a single project with an output file count guard (≤20k files, failing at 18k), a GitHub Actions CI workflow pinned to exact Hugo 0.165.0 extended with Node and pnpm, a webhook trigger via repository_dispatch for Retool, Cloudflare Single Redirect Rules for zero-worker geo-routing (respecting ?edition= and bot exclusion), 301 legacy redirects generated into _redirects, security/caching and well-known JSON headers via _headers, and clean retirement of unused deployment configurations.

## Introduction
This specification defines the hosting, continuous deployment, edge routing, HTTP header delivery, and operational governance for CardápioFC across its six editions (Global, UK, Ireland, Brazil, Portugal, Argentina). The primary actors are **visitors** (who must experience instant edge delivery, correct country routing, and seamless bookmark preservation), **search engine crawlers** (which must crawl and index all editions without geo-redirect loops), the **site operator** (who triggers automated rebuilds from Retool and monitors deployment budgets), and **developers** (who maintain a clean, single-pipeline deployment workflow).

The subject "Edge Delivery Pipeline" denotes the end-to-end hosting and build system; "CI Workflow" denotes the GitHub Actions continuous integration and deployment automation; "Edge Routing Layer" denotes Cloudflare Single Redirect Rules and edge redirection; "Edge Header Layer" denotes HTTP response headers applied at the edge; "Build Guard" denotes automated file count and budget verification.

## Boundary Context
- **In scope**: Cloudflare Workers Static Assets configuration (`wrangler.jsonc`); GitHub Actions workflow with exact Hugo 0.165.0 extended and pnpm pin; Retool webhook trigger via `repository_dispatch`; deployment file-count budget guard (failing at 18,000 files); Cloudflare Single Redirect Rules for country-based geo-routing with verified bot exclusion and manual override preservation; legacy URL HTTP 301 redirection (`_redirects`); deep-link alias redirects (`/favorites`, `/reminder`); HTTP response headers (`_headers`) for caching, security, and `.well-known` JSON MIME types; retirement of legacy deployment configs (`amplify.yml`, `.gitlab-ci.yml`, `vercel.json`); establishment of `HUGO_VERSION` authoritative pin; DNS cutover and rollback operational runbook.
- **Out of scope**: Hugo page generation, templates, content adapters, or view-models (data-pages, site-foundation); JSON data contract generation or Retool export script logic (data-pages, site operator); mobile application code, custom URL schemes, or entitlements configuration (app-deeplinks); structured data, Open Graph tags, sitemaps, or robots.txt content (seo-social); analytics beacons or consent banner logic (analytics-consent); advertisements (the site has zero ads).
- **Adjacent expectations**: site-foundation provides the authoritative build scripts (`pnpm build`), edition registry URL prefixes (`/en-gb/`, `/en-ie/`, `/pt-br/`, `/pt-pt/`, `/es-ar/`), and manual edition choice query parameter (`?edition=en`). data-pages generates pre-rendered trailing-slash HTML pages within the 18,000 file budget. app-deeplinks outputs static `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` files and defines alias routes (`/favorites` to `/favourites`, `/reminder` to `/my_agenda`). analytics-consent provides the Cloudflare Web Analytics token or embed script.

## Requirements

### Requirement 1: Static Hosting and Asset Serving
**Objective:** As a site operator, I want the site hosted on Cloudflare Workers Static Assets with zero per-request compute fees, so that hosting remains permanently free and globally performant.

#### Acceptance Criteria
1. The Edge Delivery Pipeline shall serve all pre-rendered HTML, stylesheets, scripts, and static media from Cloudflare Workers Static Assets without executing custom worker script compute on the request path.
2. When a visitor requests any valid entity or edition route without a trailing slash, the Edge Delivery Pipeline shall normalize the request to the canonical trailing-slash path or serve the corresponding index document.
3. When a visitor requests a nonexistent path, the Edge Delivery Pipeline shall return an HTTP 404 status code and serve the pre-rendered 404 error page.
4. The Edge Delivery Pipeline shall serve requests for uncompressed and pre-compressed static assets within Cloudflare's free-tier limits of 25 MiB maximum individual file size.

### Requirement 2: Automated Continuous Integration and Deployment
**Objective:** As a site operator, I want every change to the main branch to automatically build and deploy using exact pinned tool versions, so that deployments are consistent and reproducible.

#### Acceptance Criteria
1. When a commit is pushed to the main repository branch, the CI Workflow shall initiate an automated build and deployment job.
2. When a manual workflow trigger is invoked by an operator, the CI Workflow shall initiate an automated build and deployment job.
3. The CI Workflow shall execute using Hugo Extended version 0.165.0, Node LTS (>= 20), and pnpm matching the repository package manager configuration.
4. If the Hugo version installed in the build environment does not match version 0.165.0 extended exactly, then the CI Workflow shall fail the build and output a version mismatch error.
5. When executing the build command, the CI Workflow shall run theme generation and Hugo build with garbage collection and asset minification enabled.
6. While caching dependencies across workflow runs, the CI Workflow shall purge or bypass remote data resource caches to ensure the build never serves stale remote data files.

### Requirement 3: Webhook Build Triggering for Remote Data Updates
**Objective:** As a site operator, I want Retool data exports to trigger a rebuild via a secure webhook, so that fresh fixture and channel data goes live immediately after publishing.

#### Acceptance Criteria
1. When a valid repository_dispatch webhook event with the dataset update event type is received, the CI Workflow shall initiate an automated build and deployment job.
2. If an incoming webhook request lacks valid authentication credentials, then the repository platform shall reject the request.
3. If an incoming repository_dispatch event specifies an unrecognized event type, then the CI Workflow shall ignore the dispatch without executing a deployment.
4. Where a scheduled cron trigger fires, the CI Workflow shall initiate a safety rebuild to verify upstream data consistency and refresh expiring content.

### Requirement 4: Deployment File-Count Guard and Budget Enforcement
**Objective:** As a site operator, I want automated verification of the output file count before deployment, so that builds never exceed Cloudflare's 20,000 file free-tier limit.

#### Acceptance Criteria
1. When Hugo finishes generating the static site output, the Build Guard shall calculate the total number of files in the output directory.
2. If the total output file count is greater than or equal to 18,000 files, then the Build Guard shall fail the CI job before deployment and log the file count alongside a breakdown by edition and path type.
3. While the total output file count remains below 18,000 files, the Build Guard shall log the count and permit deployment to proceed.
4. If the deployment fails due to exceeding platform asset quotas, then the Edge Delivery Pipeline documentation shall provide step-by-step procedures for path-based multi-project partitioning and plan upgrades.

### Requirement 5: Country-Based Edge Geo-Routing
**Objective:** As a visitor arriving on a root or unprefixed entity link, I want to be redirected to my country's localized edition, so that I immediately see local kick-off times and domestic broadcasters.

#### Acceptance Criteria
1. When a visitor with an IP address from Great Britain (GB) requests an unprefixed path (`/`, `/match/*`, `/team/*`, `/league/*`, `/search`, `/favourites`, `/favorites`, `/my_agenda`, `/reminder`, `/settings`), the Edge Routing Layer shall issue an HTTP 302 redirect to the corresponding `/en-gb/` path.
2. When a visitor with an IP address from Ireland (IE) requests an unprefixed path, the Edge Routing Layer shall issue an HTTP 302 redirect to the corresponding `/en-ie/` path.
3. When a visitor with an IP address from Brazil (BR) requests an unprefixed path, the Edge Routing Layer shall issue an HTTP 302 redirect to the corresponding `/pt-br/` path.
4. When a visitor with an IP address from Portugal (PT) requests an unprefixed path, the Edge Routing Layer shall issue an HTTP 302 redirect to the corresponding `/pt-pt/` path.
5. When a visitor with an IP address from Argentina (AR) requests an unprefixed path, the Edge Routing Layer shall issue an HTTP 302 redirect to the corresponding `/es-ar/` path.
6. When a visitor with an IP address from any country outside the five regional editions requests an unprefixed path, the Edge Routing Layer shall serve the Global edition at the requested path without redirection.
7. When issuing a geo-routing redirect, the Edge Routing Layer shall preserve all URL query parameters, including lineup parameters (`?l=`) and search parameters (`?q=`).
8. The Edge Routing Layer shall implement all geo-routing rules using Cloudflare Single Redirect Rules within the free-tier quota of at most 10 rules.

### Requirement 6: Bot and Manual-Selection Exceptions to Geo-Routing
**Objective:** As a search engine crawler or a visitor who chose an edition manually, I want geo-routing to be bypassed, so that all editions are indexable and user preferences are honored.

#### Acceptance Criteria
1. When a request originates from a verified search engine crawler (`cf.client.bot`), the Edge Routing Layer shall bypass all geo-routing rules and serve the exact requested path.
2. When a request includes the manual edition query parameter `?edition=`, the Edge Routing Layer shall bypass all geo-routing rules and serve the requested edition.
3. When a request contains a cookie indicating a prior manual edition selection, the Edge Routing Layer shall bypass all geo-routing rules and honor the selected edition.
4. When an existing visitor uses the on-site edition switcher to navigate to the Global edition, the Edge Routing Layer shall allow access to the unprefixed URL without redirecting back to the visitor's geographic edition.

### Requirement 7: Legacy URL and Deep-Link Alias Redirection
**Objective:** As a visitor or search engine following an old link or deep-link alias, I want to be permanently redirected to the new URL structure, so that links do not break and search equity is preserved.

#### Acceptance Criteria
1. When a request matches legacy Brazilian Portuguese match paths (`/pt/jogos/onde_assistir_*` or `/pt/jogos/*`), the Edge Routing Layer shall issue an HTTP 301 redirect to the `/pt-br/` edition.
2. When a request matches legacy Brazilian Portuguese team (`/pt/times/*`) or league (`/pt/campeonatos/*`) paths, the Edge Routing Layer shall issue an HTTP 301 redirect to `/pt-br/` or `/pt-br/league/` respectively.
3. When a request matches legacy English paths (`/en/matches/*`, `/en/teams/*`, `/en/leagues/*`), the Edge Routing Layer shall issue an HTTP 301 redirect to the corresponding root Global paths (`/` or `/league/`).
4. When a request matches retired language prefixes (`/zh/*`, `/hi/*`, `/fr/*`, `/ar/*`), the Edge Routing Layer shall issue an HTTP 301 redirect to `/`.
5. When a request matches `/es/*`, the Edge Routing Layer shall issue an HTTP 301 redirect to `/es-ar/`.
6. When a request matches deep-link alias routes `/favorites` or `/*/favorites`, the Edge Routing Layer shall issue an HTTP 301 redirect to `/favourites` or `/:splat/favourites` respectively.
7. When a request matches deep-link alias routes `/reminder` or `/*/reminder`, the Edge Routing Layer shall issue an HTTP 301 redirect to `/my_agenda` or `/:splat/my_agenda` respectively.
8. The Edge Routing Layer shall preserve all query parameters across legacy and alias HTTP 301 redirects.

### Requirement 8: HTTP Response Headers and Caching Policies
**Objective:** As a visitor, I want fast cached assets, instant updates for new content, and secure HTTPS delivery with correct mobile association headers, so that my connection is safe and deep links work reliably.

#### Acceptance Criteria
1. When serving `.well-known/apple-app-site-association` and `.well-known/assetlinks.json`, the Edge Header Layer shall return a `Content-Type: application/json` header.
2. When serving HTML documents, the Edge Header Layer shall return cache headers instructing browsers and edge caches to revalidate on each request (`no-cache` or `max-age=0, must-revalidate`).
3. When serving fingerprinted static assets under `/assets/` or `/js/`, the Edge Header Layer shall return immutable cache headers with a one-year expiration (`public, max-age=31536000, immutable`).
4. The Edge Header Layer shall deliver standard HTTP security headers including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security`.
5. The Edge Header Layer shall serve security policies that permit necessary first-party scripts, Google Analytics, and Cloudflare Web Analytics beacons without breaking theme features.

### Requirement 9: Deployment Configuration Consolidation and Version Alignment
**Objective:** As a developer, I want all obsolete CI and deployment files removed and the Hugo version single source of truth clearly established, so that maintenance overhead is eliminated.

#### Acceptance Criteria
1. The Edge Delivery Pipeline shall remove legacy configuration files `amplify.yml`, `.gitlab-ci.yml`, and `vercel.json` from the repository root.
2. The Edge Delivery Pipeline shall establish a single source of truth for `HUGO_VERSION` and `GO_VERSION` used by CI and local developer tooling.
3. Where `netlify.toml` is retained or superseded, the Edge Delivery Pipeline shall ensure that `AGENTS.md` and repository pre-flight documentation reference the authoritative version source.
4. The Edge Delivery Pipeline shall place all edge redirect and header definitions in version-controlled files within the repository.

### Requirement 10: Cutover, Rollback, and Operational Runbook
**Objective:** As a site operator, I want documented, low-risk procedures for switching DNS from Firebase Hosting to Cloudflare Workers Static Assets and rolling back if necessary, so that production cutover causes zero downtime.

#### Acceptance Criteria
1. The Edge Delivery Pipeline documentation shall provide step-by-step instructions for configuring Cloudflare DNS CNAME and apex records to point to Workers Static Assets.
2. The Edge Delivery Pipeline documentation shall specify the required GitHub repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and their minimum necessary permissions.
3. The Edge Delivery Pipeline documentation shall define a rollback procedure to repoint Cloudflare DNS back to Firebase Hosting in the event of an unresolvable delivery defect.
4. The Edge Delivery Pipeline documentation shall detail the Retool webhook payload and configuration steps for triggering automated deployments.
