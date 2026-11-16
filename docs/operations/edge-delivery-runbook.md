# Edge delivery runbook

Hosting: Cloudflare Workers Static Assets (`wrangler.jsonc`, no Worker code). CI: `.github/workflows/deploy.yml`.

## 1. GitHub secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Workers Scripts: Edit** (add Zone → Workers Routes: Edit if using routes) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

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
