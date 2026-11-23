# Edge delivery runbook

Hosting: Cloudflare Workers Static Assets (`wrangler.jsonc`, no Worker code). CI: `.github/workflows/deploy.yml`.

## 1. GitHub secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Workers Scripts: Edit** (add Zone → Workers Routes: Edit if using routes) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `INDEXNOW_KEY` | IndexNow API key (8–128 chars `[a-zA-Z0-9-]`; recommended 32 hex chars via `openssl rand -hex 16` or Bing Webmaster Tools) |

## 2. Retool webhook (rebuild after data upload)

Retool uploads the JSON files to Firebase Storage, uploads `index.json` last, then calls:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
Authorization: Bearer <fine-grained PAT>
Accept: application/vnd.github+json
Content-Type: application/json

{"event_type": "dataset_updated", "client_payload": {}}
```

PAT: fine-grained, this repository only, **Contents: Read and write** (required by the dispatches endpoint). Unknown `event_type` values do not trigger the workflow. Rapid successive dispatches cancel earlier in-flight builds (concurrency group `deploy-production`). A daily 05:00 UTC cron also rebuilds as a safety net.

## 3. Geo-routing rules

`cloudflare/redirect-rules.json` (API payload) and `cloudflare/redirect-rules.tf` (Terraform) define 5 Single Redirect Rules (GB, IE, BR, PT, AR; 302). Visitors from other countries stay on Global. Excluded: verified bots, `?edition=` and the `cfc_edition` cookie (set by the edition switcher). Free plan allows 10 rules.

Apply once: dashboard → Rules → Redirect Rules, or `terraform apply -var zone_id=<zone>`, or PUT the JSON to `/zones/<zone>/rulesets/phases/http_request_dynamic_redirect/entrypoint`.

> Validate the expressions in the dashboard before enabling (the `if()` in the target expression is not checked locally).

## 4. DNS cutover from Firebase Hosting

1. Run the workflow manually (Actions → Deploy → Run workflow); confirm success.
2. Verify the preview: `pnpm verify-deployment --url=https://cardapiofc.<account>.workers.dev`.
3. Workers & Pages → `cardapiofc` → Settings → Domains & Routes → add `cardapiofc.com` (and `www`). Cloudflare provisions the certificate.
4. Remove/replace the existing Firebase DNS records for those names (Cloudflare will prompt). Keep the Firebase site deployed until step 6.
5. Apply the geo-routing rules (section 3).
6. Run `pnpm verify-deployment --url=https://cardapiofc.com`; watch for a day, then disable Firebase Hosting.

## 5. Rollback

Re-point `cardapiofc.com` / `www` to Firebase Hosting (restore the previous A/CNAME records, remove the Workers custom domain) and disable the geo-routing rules. Firebase Hosting must still hold the last deploy, so do not delete it until cutover is stable.

## 6. File-count budget

Free limit: 20,000 files per deployment; the build guard (`pnpm check-file-count`) fails at 18,000 and prints a breakdown by edition and kind. Options when reached:

- shrink the exported dataset (fewer leagues/teams);
- partition editions into separate free Workers projects (path routing per edition);
- upgrade to Workers Paid (\$5/month, 100,000 files).

## 7. Redirect limits

Cloudflare `_redirects` allows 2,000 static and 100 dynamic rules. `layouts/home.redirects` therefore emits app-share match redirects for unprefixed paths only (two rules per slug); edition-prefixed variants fall through to the 404 deep-link resolver. 404 fallbacks come from `not_found_handling: "404-page"` (nearest `404.html`), not from `_redirects`.

## 8. Versions

`.tool-versions`, `config/build.json` and `netlify.toml` must agree (Hugo 0.169.0 extended, Go 1.25.1, Node 22.14.0, pnpm 10.16.1). CI reads `config/build.json`.

## 9. IndexNow

Production deploys submit added, substantively modified, and removed canonical URLs to `https://api.indexnow.org/indexnow` (distributing to Microsoft Bing, Yandex, Seznam, Naver, Yep, etc.).

### One-time activation

1. Generate a 32-hex-character key (or reuse an existing key from Bing Webmaster Tools):
   ```sh
   openssl rand -hex 16
   ```
2. Set the `INDEXNOW_KEY` GitHub Actions secret (`gh secret set INDEXNOW_KEY` or Repository → Settings → Secrets and variables → Actions). Do **not** commit `<key>.txt` to `static/`.
3. Trigger a `Deploy` workflow run (push to `main` or Actions → Deploy → Run workflow).

### How CI submission works

1. **Key file generation (pre-deploy):** If `INDEXNOW_KEY` is set, `node scripts/indexnow.mjs write-key` writes `public/<key>.txt` with exact key contents and no trailing newline before `wrangler deploy`. If `INDEXNOW_KEY` is unset, IndexNow steps are skipped with a warning so builds never break.
2. **State cache restore:** Restores `.tmp/indexnow-state.json` from `actions/cache/restore@v4` (`indexnow-state-<branch>-<run_id>-<attempt>` with fallback `indexnow-state-<branch>-`).
3. **Substantive diff & submission:** `scripts/indexnow.mjs submit --soft-fail` parses all URLs in `public/sitemap.xml` (and child sitemaps), fingerprints SEO `<head>` tags plus `<main>` (stripping `<footer class="cfc-freshness">`), diffs against the previous state, polls `GET https://cardapiofc.com/<key>.txt` for up to 60 seconds (`200` exact key body) to absorb Cloudflare propagation, and POSTs prioritized batches (hubs/static → matches → leagues → teams) of up to 10,000 URLs (retrying `429`/`5xx` and first-time `403 SiteVerificationNotCompleted` responses).
4. **Transactional state save:** Only batches accepted with HTTP `200`/`202` update `.tmp/indexnow-state.json`, which is persisted via `actions/cache/save@v4`.

### Fast manual workflow (no Hugo rebuild)

When `public/<key>.txt` is already deployed and you want to test or retry IndexNow without waiting for an 18-minute full site build, trigger **Actions → IndexNow → Run workflow** (`.github/workflows/indexnow.yml`, ~15 seconds):
- **`full` (default):** Fetches the live `sitemap.xml` (and child sitemaps) and submits all canonical URLs.
- **`ping`:** Submits only `https://cardapiofc.com/` as a quick verification test.

### Manual commands

- Preview diff without network calls or state changes: `pnpm indexnow:dry-run`
- Verify the live key file on production: `INDEXNOW_KEY=<key> pnpm indexnow:verify`
- Send a single homepage test ping against live production: `INDEXNOW_KEY=<key> pnpm indexnow:ping`
- Submit all URLs from the live sitemap: `INDEXNOW_KEY=<key> pnpm indexnow:submit-live`
- Force-resubmit all canonical sitemap URLs from local `public/`: `INDEXNOW_KEY=<key> pnpm indexnow:submit -- --all`

### Cloudflare Crawler Hints

Do **not** enable Cloudflare Crawler Hints alongside this workflow. Direct submission proactively notifies IndexNow about newly published or removed URLs right after deploy (without waiting for a human visit to warm cache) and restricts notifications strictly to canonical indexable sitemap URLs.
