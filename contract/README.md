# CardápioFC Data Contract v1 (Operator-Facing Specification)

This specification defines the contract between the database export job (Retool / PostgreSQL) and the CardápioFC static site generator (Hugo).

The machine-readable JSON Schema Draft 2020-12 definition is located at [`contract/cfc-data-v1.schema.json`](cfc-data-v1.schema.json).

---

## 1. Versioning & SemVer Policy

- **Contract Version**: `1.0.0`
- Every file in the dataset MUST declare `schemaVersion` as a string matching SemVer `MAJOR.MINOR.PATCH`.
- Major version for this specification is `1`. Hugo build validation halts if `schemaVersion` major differs from `1`.
- **Evolution Rules**:
  - **PATCH**: Documentation or non-structural clarifications only.
  - **MINOR**: Additive changes (e.g. new optional fields or new files). Old site builds safely ignore unknown fields.
  - **MAJOR**: Breaking changes (renamed fields, deleted fields, modified types or semantics). Major versions publish to a new directory prefix (`web/v2/`), allowing old and new builds to run concurrently.

---

## 2. Storage & Publication Requirements

| Setting | Specification |
|---|---|
| **Storage Bucket** | `cardapiofutebol.appspot.com` |
| **Object Prefix** | `web/v1/` |
| **Public Download URL** | `https://firebasestorage.googleapis.com/v0/b/cardapiofutebol.appspot.com/o/web%2Fv1%2F<file with / as %2F>?alt=media` |
| **Authentication** | Public read access or via download token supplied to CI as `HUGO_CFC_DATA_TOKEN` |
| **Headers** | `Content-Type: application/json`, `Cache-Control: no-cache, max-age=0` |
| **Encoding** | UTF-8 without BOM; top-level JSON objects only; no comments; no duplicate keys |
| **Upload Sequence** | **CRITICAL**: Upload all data files first (`leagues.json`, `teams.json`, `matches.json`, `lineups.json`, `channels/*.json`), and upload **`index.json` last**. Once `index.json` upload completes, trigger the deploy webhook. |
| **Integrity** | Every data file listed in `index.files` MUST carry its exact SHA-256 hash (64 lowercase hexadecimal digits) and file size in bytes. |

---

## 3. Common Data Types & Format Rules

### `Slug`
- **Pattern**: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- **Length**: Maximum 120 characters.
- **Rule**: Lowercase alphanumeric characters separated by single hyphens. No leading, trailing, or double hyphens. Identical to mobile app identifiers.
- **Examples**: `flamengo`, `brasileirao-serie-a`, `premier-league`.

### `MatchSlug`
- **Pattern**: `^[a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{4}-[0-9]{2}-[0-9]{2}$`
- **Length**: Maximum 250 characters.
- **Format**: `{homeTeamSlug}-vs-{awayTeamSlug}-{yyyy-mm-dd}` exactly matching the mobile app `DeepLinkHelper`.
- **Examples**: `flamengo-vs-palmeiras-2026-11-08`, `arsenal-vs-chelsea-2026-05-18`.

### `Instant` (UTC Timestamps)
- **Pattern**: `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$`
- **Rule**: RFC 3339 UTC timestamp with explicit `Z` designator and seconds precision. No numeric offsets (`+00:00`), no milliseconds.
- **Examples**: `2026-11-08T19:00:00Z`, `2026-05-18T14:30:00Z`.

### `CountryCode`
- **Pattern**: `^[A-Z]{2}$`
- **Rule**: ISO 3166-1 alpha-2 uppercase code.
- **Supported Channels Countries**: `GB` (United Kingdom), `IE` (Ireland), `BR` (Brazil), `PT` (Portugal), `AR` (Argentina).

### `LocalisedText`
- **Format**: JSON object containing localised strings.
- **Requirements**:
  - `en` property is **REQUIRED** and MUST be a non-empty string.
  - Optional properties MUST follow language tags (`pt`, `es`) or edition codes (`en-gb`, `en-ie`, `pt-br`, `pt-pt`, `es-ar`).
- **Resolution / Fallback Chain**:
  When rendering edition `code` (e.g. `pt-br`):
  1. `names[code]` (exact edition, e.g. `names["pt-br"]`)
  2. `names[languageSubtag]` (language fallback, e.g. `names["pt"]`)
  3. `names["en"]` (guaranteed English base)
- **Example**:
  ```json
  {
    "en": "Brazil Serie A",
    "pt": "Brasileirão Série A",
    "pt-pt": "Campeonato Brasileiro"
  }
  ```

### `ChannelId`
- **Pattern**: `^[a-z0-9][a-z0-9-]{0,63}$`
- **Rule**: Lowercase alphanumeric string with optional hyphens, 1 to 64 characters.

### `Url`
- **Pattern**: `^https://`
- **Rule**: Absolute secure HTTPS URL.

---

## 4. Dataset Files Specification

### 4.1. `index.json` (Dataset Manifest)
Published at the root of `web/v1/`.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (e.g. `"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. Displayed on pages as "Data updated". |
| `window` | `object` | Yes | Published kick-off time window (`{ "from": Instant, "to": Instant }`). |
| `countries` | `CountryCode[]` | Yes | Array of country codes with channel files (unique items). |
| `files` | `Record<string, FileMeta>` | Yes | Map of file paths relative to dataset root. Each entry has `{ "sha256": string, "bytes": integer }`. Required entries: `leagues.json`, `teams.json`, `matches.json`, `lineups.json`, and `channels/<CC>.json` for each country in `countries`. |
| `counts` | `object` | Yes | Exact counts of entities: `{ "leagues": integer, "teams": integer, "matches": integer, "lineups": integer }`. MUST match collection sizes. |

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-11-05T06:00:00Z",
  "window": {
    "from": "2026-10-29T00:00:00Z",
    "to": "2026-12-05T00:00:00Z"
  },
  "countries": ["GB", "IE", "BR", "PT", "AR"],
  "files": {
    "leagues.json": { "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "bytes": 1420 },
    "teams.json": { "sha256": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb", "bytes": 8540 },
    "matches.json": { "sha256": "4e1243bd22c66e76c2ba9eddc1f91394e57f9f835f11181285d30dec3e6b52a1", "bytes": 12450 },
    "lineups.json": { "sha256": "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d", "bytes": 4120 },
    "channels/GB.json": { "sha256": "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae", "bytes": 3100 },
    "channels/BR.json": { "sha256": "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9", "bytes": 3890 }
  },
  "counts": {
    "leagues": 2,
    "teams": 4,
    "matches": 3,
    "lineups": 1
  }
}
```

---

### 4.2. `leagues.json`
Contains competition information keyed by competition slug.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (`"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. |
| `leagues` | `Record<Slug, League>` | Yes | Map where each key equals `league.slug`. |

#### `League` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `uuid` | `string` | Yes | Database UUID. |
| `slug` | `Slug` | Yes | League slug (must equal map key). |
| `names` | `LocalisedText` | Yes | Localised names (`en` required). |
| `shortNames` | `LocalisedText` | No | Short acronyms or aliases. |
| `logo` | `Url \| null` | No | Absolute URL to league logo. |
| `country` | `object \| null` | No | `{ "code": CountryCode, "names": LocalisedText }` or `null` for international competitions. |
| `popular` | `boolean` | Yes | `true` if priority/featured competition. |
| `season` | `string \| null` | No | e.g. `"2026"`. |
| `matchSlugs` | `MatchSlug[]` | Yes | Slugs of all published matches in this league, in ascending kick-off order. |

---

### 4.3. `teams.json`
Contains club information keyed by team slug.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (`"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. |
| `teams` | `Record<Slug, Team>` | Yes | Map where each key equals `team.slug`. |

#### `Team` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `uuid` | `string` | Yes | Database UUID. |
| `slug` | `Slug` | Yes | Team slug (must equal map key). |
| `names` | `LocalisedText` | Yes | Localised team names (`en` required). |
| `shortNames` | `LocalisedText` | No | Short acronyms or aliases. |
| `crest` | `Url \| null` | No | Absolute URL to team crest (e.g. Firebase Storage public webp). |
| `country` | `object \| null` | No | `{ "code": CountryCode }` or `null`. |
| `leagueSlugs` | `Slug[]` | Yes | Slugs of published leagues this team participates in. |
| `matchSlugs` | `MatchSlug[]` | Yes | Slugs of published matches for this team (home or away), in ascending kick-off order. |

---

### 4.4. `matches.json`
Contains match schedule and metadata.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (`"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. |
| `order` | `MatchSlug[]` | Yes | Complete list of all match slugs in non-decreasing `kickoff` order (secondary sort: slug). |
| `matches` | `Record<MatchSlug, Match>` | Yes | Map where each key equals `match.slug`. |

#### `Match` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `uuid` | `string` | Yes | Database UUID. |
| `slug` | `MatchSlug` | Yes | Must equal map key: `{homeSlug}-vs-{awaySlug}-{yyyy-mm-dd}`. |
| `kickoff` | `Instant` | Yes | UTC kick-off timestamp with `Z`. |
| `leagueSlug` | `Slug` | Yes | References `leagues.json`. |
| `homeSlug` | `Slug` | Yes | References `teams.json`. |
| `awaySlug` | `Slug` | Yes | References `teams.json`. |
| `status` | `MatchStatus` | Yes | Allowed values: `scheduled`, `live`, `halftime`, `finished`, `postponed`, `cancelled`, `suspended`. |
| `statusShort` | `string` | Yes | Raw code from sports feed (1-8 chars, e.g. `"NS"`, `"1H"`, `"FT"`). |
| `score` | `object \| null` | No | `{ "home": integer >= 0, "away": integer >= 0 }` or `null` before kick-off. |
| `round` | `string \| null` | No | e.g. `"Regular Season - 33"`. |
| `venue` | `object \| null` | No | `{ "name": string, "city": string }` or `null`. |
| `hasLineup` | `boolean` | Yes | `true` if and only if official lineup exists in `lineups.json`. |

#### Match Status Mapping Table
The Retool export MUST map database `status_short` values to `MatchStatus`:

| Raw Code (`statusShort`) | Contract Status (`status`) | Description |
|---|---|---|
| `TBD`, `NS` | `scheduled` | Not started |
| `1H`, `2H`, `ET`, `BT`, `P`, `LIVE`, `INT` | `live` | Match in play |
| `HT` | `halftime` | Half-time break |
| `FT`, `AET`, `PEN`, `AWD`, `WO` | `finished` | Finished match |
| `PST` | `postponed` | Postponed |
| `CANC`, `ABD` | `cancelled` | Cancelled / Abandoned |
| `SUSP` | `suspended` | Suspended |

---

### 4.5. `channels/<CC>.json`
Country-specific broadcast listings (e.g. `channels/GB.json`, `channels/BR.json`). Matches with no broadcast listings in country `<CC>` MUST be omitted.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (`"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. |
| `country` | `CountryCode` | Yes | Country code matching filename (e.g. `"BR"`). |
| `channels` | `Record<ChannelId, Channel>` | Yes | Catalog of broadcasters operating in this country. |
| `matches` | `Record<MatchSlug, ChannelId[]>` | Yes | Map of match slugs to broadcast channel IDs. Array order defines display order (`minItems: 1`). |

#### `Channel` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `ChannelId` | Yes | Channel identifier matching map key. |
| `name` | `string` | Yes | Broadcaster display name (e.g. `"Globo"`, `"Sky Sports Football"`). |
| `type` | `enum` | Yes | Broadcast type: `"tv"`, `"streaming"`, or `"free_tv"`. |
| `logo` | `Url \| null` | No | Broadcaster logo image URL. |
| `url` | `Url \| null` | No | Broadcaster website or streaming URL. |

---

### 4.6. `lineups.json`
Contains official line-up data for matches where lineups have been announced. Matches without an official lineup MUST be omitted.

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `SemVer` | Yes | Contract version (`"1.0.0"`). |
| `generatedAt` | `Instant` | Yes | Publication UTC timestamp. |
| `lineups` | `Record<MatchSlug, Lineup>` | Yes | Map of match slug to line-up data. |

#### `Lineup` Object
`{ "home": TeamLineup, "away": TeamLineup }`

#### `TeamLineup` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `formation` | `string \| null` | No | Formation string matching regex `^[1-9](-[1-9]){1,4}$` (e.g. `"4-3-3"`, `"4-2-3-1"`). |
| `coach` | `string \| null` | No | Manager / coach name. |
| `startXI` | `Player[]` | Yes | Starting players array (maximum 11 players). |
| `substitutes` | `Player[]` | Yes | Bench players array (may be empty). |

#### `Player` Object
| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Player name. |
| `number` | `integer \| null` | No | Shirt number (0–99). |
| `pos` | `enum \| null` | No | Position code: `"G"` (Goalkeeper), `"D"` (Defender), `"M"` (Midfielder), `"F"` (Forward), or `null`. |
| `grid` | `string \| null` | No | Pitch grid coordinates matching regex `^[0-9]{1,2}:[0-9]{1,2}$` (e.g. `"1:1"`, `"4:2"`). |

---

## 5. Output File Budget Estimation Formula & Compliance

### 5.1. Formula
Cloudflare Pages free hosting enforces a maximum limit of **20,000 files** per deployment. CardápioFC configures a safety File Budget $B = 18{,}000$ files.

The total generated file count $F$ across all editions is estimated using:

$$F = E \times (M + \Lambda + T + L + 1 + c) + S \le B$$

Where:
- $E$: Number of configured site editions (currently **6**: Global, UK, Ireland, Brazil, Portugal, Argentina).
- $M$: Number of matches published in `matches.json`.
- $\Lambda$: Number of lineup pages generated:
  - If `lineupPages = "all"`: $\Lambda = M$.
  - If `lineupPages = "available"`: $\Lambda = \text{count of matches with } \text{hasLineup} = \text{true}$.
- $T$: Number of teams published in `teams.json`.
- $L$: Number of leagues published in `leagues.json`.
- $1$: League directory page (`/league/`) generated in each edition.
- $c$: Fixed pages per edition (home page, 404, alternate output formats $\approx 5$).
- $S$: Static asset files across the site (CSS, JS bundles, images, icons $\approx 200$).
- $B$: File Budget limit (**18,000**).

### 5.2. Maximum Match Count Derivation
To guarantee the export does not exceed the budget, the operator can cap the match count $M_{\text{max}}$:

$$M_{\text{max}} = \left\lfloor \frac{\frac{B - S}{E} - T - L - 1 - c}{1 + \lambda} \right\rfloor$$

Where $\lambda = \frac{\Lambda}{M}$ (ratio of lineup pages to matches; $\lambda = 1.0$ for `all`, or expected fraction e.g. $\lambda \approx 0.30$ for `available`).

### 5.3. Worked Examples

Given $E = 6$, $T = 410$, $L = 24$, $c = 5$, $S = 200$, $B = 18{,}000$:

#### Scenario 1: Lineup pages generated for all matches ($\lambda = 1.0$)
With $M = 1{,}000$ and $\Lambda = 1{,}000$:
- Per edition: $1{,}000 + 1{,}000 + 410 + 24 + 1 + 5 = 2{,}440$ pages.
- Total $F = 6 \times 2{,}440 + 200 = 14{,}840$ files.
- **Result**: $14{,}840 \le 18{,}000$ ✅ **PASS** (compliant with budget).

#### Scenario 2: Maximum capacity with lineup pages for all matches
$$M_{\text{max}} = \left\lfloor \frac{\frac{18{,}000 - 200}{6} - 410 - 24 - 1 - 5}{2} \right\rfloor = \left\lfloor \frac{2{,}966.67 - 440}{2} \right\rfloor = \lfloor 1{,}263.33 \rfloor = 1{,}263$$
- Target: Set export limit $M \le 1{,}260$.
- At $M = 1{,}260$: Total $F = 6 \times (2 \times 1{,}260 + 440) + 200 = 17{,}960 \le 18{,}000$ ✅ **PASS**.

#### Scenario 3: Lineup pages generated only where available ($\lambda \approx 0.30$)
With $M = 1{,}900$ matches and official lineups for $30\%$ ($\Lambda = 570$):
- Per edition: $1{,}900 + 570 + 410 + 24 + 1 + 5 = 2{,}910$ pages.
- Total $F = 6 \times 2{,}910 + 200 = 17{,}660$ files.
- **Result**: $17{,}660 \le 18{,}000$ ✅ **PASS**.

---

## 6. Downstream Contracts & URL Schema (Requirement 12.4)

### 6.1. Web URL Patterns vs Mobile App Deep Links
The web application addresses strictly mirror the mobile app deep link routes:

| Page Kind | Global Edition (unprefixed) | Regional Edition (e.g. `pt-br`) | Mobile App Deep Link | Hugo Template |
|---|---|---|---|---|
| **Match** | `/match/{slug}/` | `/{edition}/match/{slug}/` | `cardapiofc://match/{slug}` | Section (`layouts/match/section.html`) |
| **Lineup** | `/match/{slug}/lineup/` | `/{edition}/match/{slug}/lineup/` | `cardapiofc://match/{slug}/lineup?l=...` | Page (`layouts/match/page.html`) |
| **Team** | `/team/{slug}/` | `/{edition}/team/{slug}/` | `cardapiofc://team/{slug}` | Page (`layouts/team/page.html`) |
| **League** | `/league/{slug}/` | `/{edition}/league/{slug}/` | `cardapiofc://league/{slug}` | Page (`layouts/league/page.html`) |
| **League Directory** | `/league/` | `/{edition}/league/` | — | Section (`layouts/league/section.html`) |

### 6.2. Rules and Constraints
1. **Trailing Slashes**: All web pages generate standard `index.html` directory indexes, resulting in canonical trailing slashes (`/match/{slug}/`).
2. **Custom Formation Parameter**: The `?l=` parameter on lineup pages is handled exclusively client-side via JavaScript. The server renders the same lineup page regardless of `?l=`.
3. **Disallowed Routes**: The build MUST NOT output listing pages at `/match/` or `/team/`, nor legacy paths (`/en/matches/...` or `/pt/jogos/...`).
4. **Cross-Edition Links**: Each entity page maps to its corresponding translation in other editions through Hugo's `.AllTranslations`.
