# CardápioFC Editorial Blog Playbook

Version-controlled editorial strategy, compliance rules, regional adaptation standards, and technical publishing contract for CardápioFC's nine-edition blog (`docs/blog-editorial/playbook.md`).

Every weekly automated run and manual editorial contribution must follow this playbook together with `data/blog-topics.yaml`, `data/cfc/broadcasters.yaml`, and `config/_default/languages.toml`.

---

## 1. Four Editorial Pillars & Rotation Policy

Every published post belongs to exactly one `pillar` enum value defined in the `editorial-blog` contract (`scripts/validate-blog.mjs`).

| Pillar (`pillar`) | Core Subject Scope | Target Reader Intent | Example Topics |
| --- | --- | --- | --- |
| `app-guides` | CardápioFC mobile app and web guide workflows: following clubs in `/favourites/`, building kick-off alerts in `/my_agenda/`, filtering official channels, lineups, time-zone sync, and 1-on-1 head-to-head app comparisons (`CardápioFC vs. <Competitor>`). | **Product / Utility intent**: Supporters looking for a faster way to track match schedules, get pre-kick-off reminders, find official channels on iOS/Android, or compare CardápioFC against an alternative app. | "How to Build a Custom Matchday Agenda with Kick-Off Alerts", "CardápioFC vs. LiveSoccerTV: Which Football TV Guide Fits Your Matchday?" |
| `watch-guides` | Competition, tournament, derby, or matchday viewing guides grounded in verified fixture dates and official licensed broadcasters per edition. | **Transactional / Viewing intent**: Fans searching "where to watch [competition/match] on TV and streaming" in their territory. | "Where to Watch the UEFA Champions League Knockout Stage", "Domestic Cup Viewing Guide: Free-to-Air vs. Pay-TV Channels" |
| `rights-changes` | Verified broadcast and streaming rights renewals, new market entrants, sublicensing deals, free-to-air packages, or platform transitions. | **Informational / News intent**: Subscribers and cord-cutters checking which network or app holds rights for an upcoming cycle or season. | "New Domestic League Broadcast Cycle: What Changes for Viewers", "How Sublicensing Splits Midweek European Matches" |
| `market-analysis` | Sports broadcasting and streaming industry trends: distribution shifts, FTA vs. pay-TV reach, multi-service fragmentation, kick-off scheduling economics, and consolidated multi-competitor app roundups (`Best Football TV Guide Apps Compared`). | **Analytical / Research intent**: Readers, journalists, and AI answer engines seeking clear, factual explanations of why football TV rights work the way they do and how football TV guide tools compare side by side. | "Why Football Broadcast Rights Split Across Multiple Streaming Apps", "Best Football TV Guide Apps Compared: CardápioFC vs. Top Alternatives" |

### Pillar Rotation & Topic Deduplication Rules

1. **Inspect `data/blog-topics.yaml` first**: Review all existing entries in `topics` before proposing any candidate subject.
2. **Exclude duplicates**: Reject any candidate topic, angle, keyword cluster, or `slug` that substantially overlaps an already-published entry in `data/blog-topics.yaml`.
3. **Avoid consecutive repeats**: Do **not** select the same `pillar` as the most recent published entry in `data/blog-topics.yaml`, unless urgent major broadcast rights news justifies an exception.
4. **Balance across the last 4 entries**: Prioritize the least-recently published (or missing) `pillar` across the last 4 entries in `data/blog-topics.yaml`, while weighing current football calendar relevance (upcoming tournament windows, seasonal kick-offs) and verified broadcasting developments.

### Competitor Comparison Series (Hub-and-Spoke Strategy)

To capture high-intent comparison searches without turning the blog into repetitive product promos, run competitor comparisons as a staggered two-phase hub-and-spoke series:

1. **Phase 1 — Individual 1-on-1 Comparisons (`pillar: "app-guides"`)**:
   - Publish one dedicated post per competitor using a clean slug pattern (`cardapiofc-vs-<competitor>`), selecting the next uncovered competitor from the starter queue below by checking `data/blog-topics.yaml`:
     - `cardapiofc-vs-livesoccertv` (LiveSoccerTV)
     - `cardapiofc-vs-fotmob` (FotMob)
     - `cardapiofc-vs-onefootball` (OneFootball)
     - `cardapiofc-vs-sofascore` (SofaScore)
     - `cardapiofc-vs-flashscore` (Flashscore)
     - `cardapiofc-vs-live-football-on-tv` (Live Football on TV)
     - `cardapiofc-vs-wosti` (Wosti)
2. **Phase 2 — Consolidated All-Competitors Roundup (`pillar: "market-analysis"`)**:
   - Once all individual 1-on-1 competitor posts in the active queue are recorded in `data/blog-topics.yaml`, publish one consolidated roundup post comparing CardápioFC against all covered competitors together (e.g., `best-football-tv-guide-apps-compared`), linking internally (with each edition's URL prefix) to every individual 1-on-1 post as a hub-and-spoke SEO cluster.
3. **Cadence & Rotation Guardrails**:
   - Interleave competitor posts inside the normal 4-pillar rotation—**never** publish two competitor comparison posts back-to-back.
   - Alternate `app-guides` slots between pure CardápioFC workflow guides and 1-on-1 competitor comparisons while continuing regular `watch-guides`, `rights-changes`, and `market-analysis` posts.
4. **Factual, Fair, and IP-Safe Comparison Rules**:
   - **Live verification mandatory**: Verify each competitor's current features, platforms (iOS/Android/Web), monetization/ad model, TV & streaming channel coverage, and regional support via `search_web` before drafting; never guess or cite outdated facts.
   - **Balanced, objective tone**: Clearly acknowledge where the competitor excels (e.g., deep live match stats, multi-sport coverage, breaking editorial news) alongside where CardápioFC is purpose-built to win (fast official TV & streaming channel discovery per regional edition, automatic local kick-off times, focused matchday agenda/favourites, and a clean clutter-free interface).
   - **Structured comparison table & FAQs**: Include a clear Markdown comparison table (`Primary Focus`, `Official TV & Streaming Listings`, `Regional Editions & Time Zones`, `Matchday Agenda & Alerts`, `Platforms`, `Best For`) plus 2–4 plain-text `faq` items targeting "CardápioFC vs. [Competitor]" or "best football TV guide app" queries.
   - **Zero competitor trademarks/logos/screenshots in artwork**: Follow Section 3 strictly—cover illustrations (`assets/images/blog/{slug}.png`) must be abstract flat/geometric editorial comparison graphics with zero competitor app icons, logos, wordmarks, or UI screenshots.
   - **Regional nuance across 9 editions**: Adapt examples to each market (e.g., Live Football on TV is primarily UK/Ireland-focused for `en-gb`/`en-ie`, US streaming terminology for `en-us`, and local football schedule habits across `pt-br`, `pt-pt`, `es-ar`, `zh-cn`, and `ja`) while keeping verified product facts accurate.

---

## 2. SEO & GEO Article Blueprint

Every edition of an article should be structured for both human skimmers and AI answer engines / featured snippets (GEO):

1. **Answer-First Opening Paragraph**:
   - Open directly below the frontmatter (before the first `##` heading) with a **2–3 sentence** direct summary answering the reader's core question immediately.
   - Include concrete, verified facts (competition scope, regional broadcast structure, or core workflow takeaway) so search snippets and AI citations can quote the lead verbatim.
2. **Scannable Heading Hierarchy**:
   - Use descriptive `##` section headings and `###` subheadings where helpful. (Never use `#` / `<h1>` in Markdown body; the article template renders `<h1>` from `title`.)
   - Keep paragraphs focused (2–4 sentences each) and front-load key facts in each section.
3. **Factual Tables or Structured Bullet Lists**:
   - Use a Markdown comparison/schedule table or bold-labeled bullet list whenever presenting multiple broadcasters, competition packages, kick-off windows, or step-by-step workflows.
4. **Optional Structured Q&A (`faq`)**:
   - When natural reader questions apply, include **2–4** plain-text `{ q, a }` items in YAML frontmatter `faq`.
   - Every `faq` answer must align 100% with verified facts stated in the article body and be written in that edition's language without HTML tags. (Hugo renders visible `.cfc-faq` markup and `FAQPage` JSON-LD directly from frontmatter `faq`.)
5. **Natural CardápioFC Mobile App CTAs**:
   - Include 1–2 concise, helpful mentions linking readers to CardápioFC app workflows—such as edition-prefixed `/favourites/` and `/my_agenda/` pages or official store download links (`https://apps.apple.com/app/id6745226833` for iOS and `https://play.google.com/store/apps/details?id=br.com.cardapiofutebol` for Android)—without repetitive promotional spam. Note that the article template already renders the `cfc/app-download.html` banner below the post body.
6. **Edition-Prefixed Internal Links**:
   - Link naturally to relevant CardápioFC pages using the **current edition's URL prefix** (`/` for `en`, `/{ed}/` for all other 8 editions):
     - Official broadcasters directory: `/channels/` (or `/{ed}/channels/`)
     - Competitions & leagues: `/leagues/` (or `/{ed}/leagues/`)
     - Teams: `/teams/` (or `/{ed}/teams/`)
     - Live match schedules: `/matches/` (or `/{ed}/matches/`)
     - App feature landings: `/favourites/` and `/my_agenda/` (with edition prefix)
   - Never link a localized edition to another edition's prefix (e.g., `pt-br` must link to `/pt-br/channels/`, not `/channels/`).

---

## 3. Editorial, Factual & IP Compliance

### Strict Editorial Rules
- **Zero ads & zero sponsorships**: No sponsored content, affiliate pitches, betting/gambling promotions, display ad placeholders, or commercial endorsements.
- **100% official licensed broadcasters only**: Mention only legitimate free-to-air television channels, pay-TV networks, and official digital streaming platforms holding licensed rights. Never mention, link to, or hint at pirate streams, unofficial aggregators, or geo-bypass workarounds.
- **Pre-draft dual verification (`data/cfc/broadcasters.yaml` + `search_web`)**:
  1. Cross-check regional broadcasters against `data/cfc/broadcasters.yaml` (which curates verified broadcasters for `BR`, `GB`, `IE`, `PT`, and `AR`).
  2. **Respect `denylist` placeholders**: Never treat placeholder slugs (`canal-a-confirmar`, `nao-confirmado`, `to-be-confirmed`, `tba`, `unknown`) or placeholder names (`Canal a Confirmar`, `Não Confirmado`, `To Be Confirmed`, `TBA`, `TBD`) as real channels.
  3. Run live `search_web` checks before drafting to verify current match dates, tournament formats, rights holders, and recent platform rebrands or renewals.
- **Inconclusive verification rule**: If factual dates or official broadcaster rights for a specific region cannot be verified with confidence, **omit the unverified regional claim** rather than guessing—or pivot to an alternative verifiable topic before drafting.

### Copyright-Safe Cover Illustration Rules (`assets/images/blog/{slug}.png`)
- **Single shared source asset**: Generate **one** original widescreen (`16:9`) flat/editorial football illustration per article slug via `image-generator` and save it at `assets/images/blog/{slug}.png`.
- **Minimum source dimensions**: At least **`1200x630`** pixels (recommended `16:9` aspect ratio such as `1344x768`, `1408x768`, or `1600x900`). `scripts/validate-blog.mjs` checks source dimensions pre-build.
- **Strictly prohibited visual content**:
  - Zero scraped or stock third-party photographs.
  - Zero real player faces, likenesses, or kit numbers tied to real individuals.
  - Zero club crests, badges, or distinctive trademarked kits.
  - Zero competition trophies, official tournament logos, or confederation marks.
  - Zero broadcaster logos, channel bugs, or live match broadcast stills/screenshots.
- **OG file-size budget (`<= 300,000` bytes)**: Hugo Pipes crops and encodes the source image into a `1200x630` JPEG at `q80` for `og:image`, and `pnpm check:seo` (`scripts/check-seo-social.mjs`, `OG_MAX = 300000`) fails the build if that JPEG exceeds `300,000` bytes. Prompt for **clean editorial vector/flat illustration style** with restrained visual noise, smooth gradients or solid color fields, and minimal fine grain so JPEG compression remains compact.

---

## 4. Nine-Edition Regional Adaptation Matrix

Every post must be **regionally adapted** across all nine active editions defined in `config/_default/languages.toml`—never mechanically word-for-word translated. Keep core verified facts consistent while adapting local examples, terminology, exact time-zone labels, edition-prefixed links, and locally relevant official broadcasters.

| Edition Code | Region / Label | Locale (`hreflang`) | URL Prefix | Content Dir | Exact `timeZone` | Exact `zoneLabel` | Regional Terminology & Voice | Key Official Broadcasters (Verify via `broadcasters.yaml` & `search_web`) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `en` | Global | `en` | `/` | `content/en` | `UTC` | `UTC` | International English, **"football"**, neutral cross-border perspective, explain territory-split rights clearly. | Multi-market overview referencing official FTA, pay-TV, and streaming models globally without assuming one country. |
| `en-gb` | UK | `en-GB` | `/en-gb/` | `content/en-gb` | `Europe/London` | `UK time` | British English (**"football"**, **"fixtures"**, **"free-to-air"**); account for UK Saturday 3pm blackout context when discussing schedules. | `broadcasters.yaml` (`GB`): Sky Sports (NOW), TNT Sports (discovery+), BBC Sport (BBC One / BBC iPlayer), ITV (ITVX), Amazon Prime Video, DAZN. |
| `en-ie` | Ireland | `en-IE` | `/en-ie/` | `content/en-ie` | `Europe/Dublin` | `Irish time` | Irish English (**"football"**, **"fixtures"**); distinguish Republic of Ireland rights (including Saturday 3pm PL & FTA UEFA coverage) from UK rules. | `broadcasters.yaml` (`IE`): RTÉ2 (RTÉ Player), Virgin Media Two (Virgin Media Play), Sky Sports (NOW), TNT Sports (Sports Extra / discovery+), Premier Sports 1 ROI. |
| `en-us` | USA | `en-US` | `/en-us/` | `content/en-us` | `America/New_York` | `US Eastern` | American English (**"soccer"**, **"kickoff"**, **"over-the-air"**); note morning European windows vs. evening MLS/CONCACAF windows. | Verify via `search_web`: NBC / USA Network / Peacock (Telemundo / Universo), CBS / Paramount+, ESPN / ABC / ESPN+, FOX / FS1, Apple TV (MLS Season Pass). |
| `pt-br` | Brasil | `pt-BR` | `/pt-br/` | `content/pt-br` | `America/Sao_Paulo` | `horário de Brasília` | Brazilian Portuguese (**"futebol"**, **"onde assistir"**, **"transmissão"**, **"celular"**, **"TV aberta/fechada"**); natural direct tone. | `broadcasters.yaml` (`BR`): TV Globo (Globoplay), GE TV, CazéTV, SporTV, Premiere, ESPN, Disney+ Premium, HBO Max (TNT Sports), Amazon Prime Video. |
| `pt-pt` | Portugal | `pt-PT` | `/pt-pt/` | `content/pt-pt` | `Europe/Lisbon` | `hora de Portugal` | European Portuguese (**"onde ver"**, **"em direto"**, **"emissão"**, **"telemóvel"**, **"sinal aberto"**); avoid Brazilian phrasing. | `broadcasters.yaml` (`PT`): Sport TV (Sport TV 1 / Multiscreen), DAZN Portugal (DAZN 1), Canal 11, RTP1 (RTP Play). |
| `es-ar` | Argentina | `es-AR` | `/es-ar/` | `content/es-ar` | `America/Argentina/Buenos_Aires` | `hora de Argentina` | Rioplatense Spanish (**"fútbol en vivo"**, **"por TV y streaming"**, **"celular"**, voseo: *mirá, chequeá, descargá* where natural). | `broadcasters.yaml` (`AR`): ESPN Premium & TNT Sports Premium (Pack Fútbol), TyC Sports (TyC Sports Play), ESPN, Disney+ Premium, DSports (610/1610 / DGO). |
| `zh-cn` | 中国 (简体) | `zh-CN` | `/zh-cn/` | `content/zh-cn` | `Asia/Shanghai` | `北京时间` | Simplified Chinese (**"足球直播"**, **"官方转播"**, **"流媒体平台"**, **"开球时间"**); address overnight European kick-offs in Beijing Time. | Verify via `search_web`: 央视体育 (CCTV-5 / CCTV-5+), 咪咕视频 (Migu), 爱奇艺体育 (iQIYI Sports), and verified official digital broadcasters. |
| `ja` | 日本 | `ja` | `/ja/` | `content/ja` | `Asia/Tokyo` | `日本時間` | Natural polite Japanese (**"サッカー"**, **"テレビ放送"**, **"ネット配信"**, **"キックオフ"**); note late-night/early-morning European kick-offs in JST. | Verify via `search_web`: DAZN, U-NEXT (サッカーパック), WOWOW, NHK / 民放地上波 / ABEMA as officially licensed per competition. |

---

## 5. Frontmatter & Validation Contract Checklist

All nine edition files must satisfy `editorial-blog`'s `BlogContentContract` (`scripts/validate-blog.mjs`) and post-build site/SEO checks.

### Canonical Slug & File Paths
- **Slug format**: Lowercase ASCII kebab-case matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- **Required files per post (10 files total)**:
  - `assets/images/blog/{slug}.png` (1 shared cover illustration, `>= 1200x630` pixels)
  - `content/en/blog/{slug}.md`
  - `content/en-gb/blog/{slug}.md`
  - `content/en-ie/blog/{slug}.md`
  - `content/en-us/blog/{slug}.md`
  - `content/pt-br/blog/{slug}.md`
  - `content/pt-pt/blog/{slug}.md`
  - `content/es-ar/blog/{slug}.md`
  - `content/zh-cn/blog/{slug}.md`
  - `content/ja/blog/{slug}.md`

### Required YAML Frontmatter Schema
```yaml
---
title: "Localized Article Title"
description: "Concise localized summary (recommended 120–160 characters)."
date: "2026-11-30T10:30:00Z"
lastmod: "2026-11-30T10:30:00Z"
translationKey: "blog-{slug}"
pillar: "app-guides" # one of: app-guides | watch-guides | rights-changes | market-analysis
image: "images/blog/{slug}.png"
image_alt: "Localized plain-text description of the editorial illustration"
faq: # optional, 2–4 plain-text items matching article body facts
  - q: "Localized plain-text question?"
    a: "Localized plain-text answer matching the article body."
draft: false
---
```

**Frontmatter invariants**:
- `date` and `lastmod` must be valid RFC 3339 / ISO 8601 timestamps with `lastmod >= date`, consistent across all 9 editions.
- `translationKey` must be identical across all 9 editions, non-empty ASCII without whitespace, following `blog-{slug}`.
- `image` must be identical across all 9 editions (`images/blog/{slug}.png`).
- `draft` must be boolean `false` across all 9 editions when publishing.
- Markdown body must be non-empty in every edition.

### Forbidden Syntax & Content Rules
- **Banned links**: Zero links to `/categories/`, `/tags/`, or `/authors/`.
- **Banned icon/component classes**: Zero FontAwesome classes (`fa-*`, `fas`, `far`, `fab`, `fal`, `fad`) and zero match-card channel badges (`cfc-channel-badge`).
- **Banned FAQ markup**: Zero HTML tags (`<...>`) inside `faq[].q` or `faq[].a`.
- **Banned commercial/unofficial content**: Zero ads, sponsorships, tracking snippets, or unofficial/pirate stream links.

### Sequential Pre-Push Publishing Gate
Before updating `data/blog-topics.yaml` or committing and pushing to `main`, execute all five Publishing Gate commands sequentially and fail closed on the first non-zero exit:

1. `pnpm validate:blog` — Pre-build 9-edition parity, frontmatter schema, pillar enum, banned pattern scan, and `>= 1200x630` source image header check.
2. `pnpm build` — Theme CSS generation (`scripts/themeGenerator.js`), Hugo production build, Hugo Pipes WebP/JPEG generation, and `blog-budget.html` estimate check.
3. `pnpm check` — Site-wide verification of 9-edition outputs, absence of taxonomy/FontAwesome leaks, 7-table i18n parity, WCAG contrast, and JS/gzip budgets.
4. `pnpm check:seo` — Post-build verification of canonicals, reciprocal 9-edition `hreflang` + `x-default`, `Blog` / `BlogPosting` / `BreadcrumbList` / `FAQPage` JSON-LD parity, `article:*` OG tags, sitemaps, and `1200x630` JPEG OG size `<= 300,000` bytes (`OG_MAX = 300000`).
5. `pnpm check-file-count` — Post-build Cloudflare Workers static asset guard (warns above `18,000` files, fails above `20,000` files).
