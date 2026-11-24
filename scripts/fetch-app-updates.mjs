#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

export const DEFAULT_IOS_ID = "6745226833";
export const DEFAULT_ANDROID_PACKAGE = "br.com.cardapiofutebol";
export const DEFAULT_DATA_PATH = path.join(ROOT_DIR, "data", "cfc", "app_updates.json");
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_PACE_MS = 500;

export const IOS_STOREFRONTS = [
  { cc: "us", locale: "en" },
  { cc: "gb", locale: "en" },
  { cc: "ie", locale: "en" },
  { cc: "br", locale: "pt-br" },
  { cc: "pt", locale: "pt-pt" },
  { cc: "ar", locale: "es-ar" },
];

export const ANDROID_STOREFRONTS = [
  { hl: "en", gl: "US", locale: "en" },
  { hl: "pt_BR", gl: "BR", locale: "pt-br" },
  { hl: "pt_PT", gl: "PT", locale: "pt-pt" },
  { hl: "es_AR", gl: "AR", locale: "es-ar" },
];

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HTML_ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function defaultSleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function epochSecondsToIsoDate(epoch) {
  if (typeof epoch === "number" && Number.isFinite(epoch)) {
    return new Date(epoch * 1000).toISOString().slice(0, 10);
  }
  if (typeof epoch === "string" && /^\d+$/.test(epoch.trim())) {
    return new Date(Number(epoch.trim()) * 1000).toISOString().slice(0, 10);
  }
  return null;
}

function compareSemver(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const partsA = String(a)
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  const partsB = String(b)
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i += 1) {
    const numA = Number.isFinite(partsA[i]) ? partsA[i] : 0;
    const numB = Number.isFinite(partsB[i]) ? partsB[i] : 0;
    if (numA !== numB) return numA > numB ? 1 : -1;
  }
  return String(a).localeCompare(String(b));
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return Number.POSITIVE_INFINITY;
  const msA = Date.parse(`${dateA}T00:00:00Z`);
  const msB = Date.parse(`${dateB}T00:00:00Z`);
  if (!Number.isFinite(msA) || !Number.isFinite(msB)) return Number.POSITIVE_INFINITY;
  return Math.round((msA - msB) / 86400000);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp);|&#39;/g, (match) => HTML_ENTITY_MAP[match] ?? match)
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

/**
 * Normalizes raw store release notes into a concise summary and deduplicated bullet items.
 *
 * @param {string} rawText
 * @returns {{ summary: string, items: string[] }}
 */
export function normalizeReleaseNotes(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { summary: "", items: [] };
  }

  let text = rawText
    .replace(/\r\n|\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "");

  text = decodeHtmlEntities(text);

  const rawLines = text.split("\n");
  const segments = [];
  for (const line of rawLines) {
    if (line.includes("•")) {
      for (const part of line.split("•")) {
        segments.push(part);
      }
    } else {
      segments.push(line);
    }
  }

  const seen = new Set();
  const items = [];
  for (const segment of segments) {
    const cleaned = segment
      .trim()
      .replace(/^(?:[•\-*]+|\d+[.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    items.push(cleaned);
  }

  return {
    summary: items[0] ?? "",
    items,
  };
}

/**
 * Parses an Apple iTunes Lookup API JSON response.
 *
 * @param {unknown} json
 * @returns {{ ok: true, version: string, releaseDate: string, releaseNotes: string } | { ok: false, reason: string }}
 */
export function parseIosLookup(json) {
  let payload = json;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { ok: false, reason: "INVALID_JSON" };
    }
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "INVALID_JSON" };
  }

  if (Number(payload.resultCount) === 0 || !Array.isArray(payload.results) || payload.results.length === 0) {
    return { ok: false, reason: "NO_RESULTS" };
  }

  const entry = payload.results[0];
  const version = typeof entry?.version === "string" && entry.version.trim() ? entry.version.trim() : null;
  const releaseDate = toIsoDate(entry?.currentVersionReleaseDate ?? entry?.releaseDate ?? null);
  const releaseNotes = typeof entry?.releaseNotes === "string" ? entry.releaseNotes : "";

  if (!version || !releaseDate) {
    return { ok: false, reason: "MISSING_FIELDS" };
  }

  return {
    ok: true,
    version,
    releaseDate,
    releaseNotes,
  };
}

function extractBalancedJsonValue(source, startIndex) {
  let idx = startIndex;
  while (idx < source.length && /\s/.test(source[idx])) {
    idx += 1;
  }
  const opener = source[idx];
  if (opener !== "[" && opener !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = idx; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          jsonText: source.slice(idx, i + 1),
          endIndex: i + 1,
        };
      }
    }
  }

  return null;
}

/**
 * Parses a Google Play public app HTML listing (`AF_initDataCallback` `ds:5` payload).
 *
 * @param {string} html
 * @returns {{ ok: true, version: string | null, releaseDate: string | null, whatsNew: string | null } | { ok: false, reason: string }}
 */
export function parsePlayHtml(html) {
  if (typeof html !== "string" || !html.trim()) {
    return { ok: false, reason: "EMPTY_HTML" };
  }

  const headerMatch = /AF_initDataCallback\(\{\s*key:\s*['"]ds:5['"][\s\S]*?data\s*:\s*/.exec(html);
  if (!headerMatch) {
    if (/consent\.google\.com|Before you continue to Google/i.test(html)) {
      return { ok: false, reason: "CONSENT_WALL" };
    }
    return { ok: false, reason: "NO_DS5" };
  }

  const dataStart = headerMatch.index + headerMatch[0].length;
  const extracted = extractBalancedJsonValue(html, dataStart);
  if (!extracted) {
    // Fallback regex match if callback structure has non-standard JSON wrapper
    const fallbackMatch = html
      .slice(headerMatch.index)
      .match(/AF_initDataCallback\(\{key:\s*['"]ds:5['"][\s\S]*?data:([\s\S]*?),\s*sideChannel:/);
    if (!fallbackMatch) {
      return { ok: false, reason: "MALFORMED_DS5" };
    }
    try {
      const parsedFallback = JSON.parse(fallbackMatch[1]);
      return extractPlayFields(parsedFallback);
    } catch {
      return { ok: false, reason: "INVALID_DS5_JSON" };
    }
  }

  const trailing = html.slice(extracted.endIndex, extracted.endIndex + 120);
  if (!/^\s*,\s*sideChannel\s*:/.test(trailing)) {
    return { ok: false, reason: "MALFORMED_DS5" };
  }

  let data;
  try {
    data = JSON.parse(extracted.jsonText);
  } catch {
    return { ok: false, reason: "INVALID_DS5_JSON" };
  }

  return extractPlayFields(data);
}

function extractPlayFields(data) {
  const app = data?.[1]?.[2];
  if (!Array.isArray(app)) {
    return { ok: false, reason: "MISSING_APP_DATA" };
  }

  const rawVersion = app?.[140]?.[0]?.[0]?.[0] ?? null;
  const version = typeof rawVersion === "string" && rawVersion.trim() ? rawVersion.trim() : null;

  const rawWhatsNew = app?.[144]?.[1]?.[1] ?? null;
  const whatsNew = typeof rawWhatsNew === "string" && rawWhatsNew.trim() ? rawWhatsNew : null;

  const updatedEpoch = app?.[145]?.[0]?.[1]?.[0] ?? null;
  let releaseDate = epochSecondsToIsoDate(updatedEpoch);
  if (!releaseDate && typeof app?.[145]?.[0]?.[0] === "string") {
    releaseDate = toIsoDate(`${app[145][0][0]} UTC`);
  }

  if (!whatsNew && updatedEpoch == null) {
    return { ok: false, reason: "MISSING_RELEASE_FIELDS" };
  }

  return {
    ok: true,
    version,
    releaseDate,
    whatsNew,
  };
}

function buildTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal?.timeout === "function" && timeoutMs > 0) {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

/**
 * Fetches latest app release info across active Apple App Store and Google Play storefronts.
 *
 * @param {object} [options]
 * @returns {Promise<{ ios: object | null, android: object | null, warnings: string[] }>}
 */
export async function fetchStoreUpdates(options = {}) {
  const {
    iosId = DEFAULT_IOS_ID,
    androidPackage = DEFAULT_ANDROID_PACKAGE,
    iosStorefronts = IOS_STOREFRONTS,
    androidStorefronts = ANDROID_STOREFRONTS,
    fetchFn = globalThis.fetch,
    sleepFn = defaultSleep,
    paceMs = DEFAULT_PACE_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logger = console,
  } = options;

  const warnings = [];
  let requestCount = 0;

  const warn = (message) => {
    warnings.push(message);
    if (logger && typeof logger.warn === "function") {
      logger.warn(`[app-updates] ${message}`);
    }
  };

  const paceNextRequest = async () => {
    if (requestCount > 0 && paceMs > 0) {
      await sleepFn(paceMs);
    }
    requestCount += 1;
  };

  // --- Fetch iOS storefronts ---
  const iosHits = [];
  for (const sf of iosStorefronts) {
    await paceNextRequest();
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(iosId)}&country=${encodeURIComponent(sf.cc)}`;
    try {
      const response = await fetchFn(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "CardapioFC-UpdatesMonitor/1.0",
        },
        signal: buildTimeoutSignal(timeoutMs),
      });

      if (!response?.ok) {
        warn(`iOS storefront ${sf.cc} returned HTTP ${response?.status ?? "unknown"}`);
        continue;
      }

      const json = await response.json();
      const parsed = parseIosLookup(json);
      if (!parsed.ok) {
        warn(`iOS storefront ${sf.cc} skipped (${parsed.reason})`);
        continue;
      }

      iosHits.push({
        locale: sf.locale,
        cc: sf.cc,
        version: parsed.version,
        releaseDate: parsed.releaseDate,
        note: normalizeReleaseNotes(parsed.releaseNotes),
      });
    } catch (error) {
      warn(`iOS storefront ${sf.cc} fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let ios = null;
  if (iosHits.length > 0) {
    const sortedIos = [...iosHits].sort((a, b) => {
      const verCmp = compareSemver(b.version, a.version);
      if (verCmp !== 0) return verCmp;
      return b.releaseDate.localeCompare(a.releaseDate);
    });
    const best = sortedIos[0];
    const notes = {};
    for (const hit of iosHits) {
      if (hit.version === best.version && !notes[hit.locale] && hit.note.items.length > 0) {
        notes[hit.locale] = hit.note;
      }
    }
    for (const hit of iosHits) {
      if (!notes[hit.locale] && hit.note.items.length > 0) {
        notes[hit.locale] = hit.note;
      }
    }
    ios = {
      version: best.version,
      releaseDate: best.releaseDate,
      notes,
    };
  }

  // --- Fetch Google Play storefronts ---
  const androidHits = [];
  for (const sf of androidStorefronts) {
    await paceNextRequest();
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackage)}&hl=${encodeURIComponent(sf.hl)}&gl=${encodeURIComponent(sf.gl)}`;
    try {
      const response = await fetchFn(url, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": `${sf.hl.replace("_", "-")},${sf.locale};q=0.9,en;q=0.8`,
        },
        signal: buildTimeoutSignal(timeoutMs),
      });

      if (!response?.ok) {
        warn(`Android storefront ${sf.hl}/${sf.gl} returned HTTP ${response?.status ?? "unknown"}`);
        continue;
      }

      const html = await response.text();
      const parsed = parsePlayHtml(html);
      if (!parsed.ok) {
        warn(`Android storefront ${sf.hl}/${sf.gl} skipped (${parsed.reason})`);
        continue;
      }

      androidHits.push({
        locale: sf.locale,
        hl: sf.hl,
        gl: sf.gl,
        version: parsed.version,
        releaseDate: parsed.releaseDate,
        note: normalizeReleaseNotes(parsed.whatsNew ?? ""),
      });
    } catch (error) {
      warn(`Android storefront ${sf.hl}/${sf.gl} fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let android = null;
  if (androidHits.length > 0) {
    const sortedAndroid = [...androidHits].sort((a, b) => {
      const dateA = a.releaseDate ?? "";
      const dateB = b.releaseDate ?? "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return compareSemver(b.version, a.version);
    });
    const best = sortedAndroid[0];
    const notes = {};
    for (const hit of androidHits) {
      if (!notes[hit.locale] && hit.note.items.length > 0) {
        notes[hit.locale] = hit.note;
      }
    }
    android = {
      version: best.version ?? null,
      releaseDate: best.releaseDate ?? null,
      notes,
    };
  }

  return {
    ios,
    android,
    warnings,
  };
}

function noteEntriesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if ((a.summary ?? "") !== (b.summary ?? "")) return false;
  const itemsA = Array.isArray(a.items) ? a.items : [];
  const itemsB = Array.isArray(b.items) ? b.items : [];
  if (itemsA.length !== itemsB.length) return false;
  return itemsA.every((item, idx) => item === itemsB[idx]);
}

function isPlayPortugueseFallback(androidNotes, locale) {
  if (!androidNotes || locale === "pt-br" || !androidNotes["pt-br"]) return false;
  return noteEntriesEqual(androidNotes[locale], androidNotes["pt-br"]);
}

function androidNotesMatchExisting(fetchedAndroidNotes, existingRelease) {
  const existingNotes = existingRelease?.notes ?? {};
  const isGroupedWithIos = Boolean(existingRelease?.platforms?.ios);
  const fetchedLocales = Object.keys(fetchedAndroidNotes ?? {}).filter(
    (k) => (fetchedAndroidNotes[k]?.items?.length ?? 0) > 0,
  );

  if (fetchedLocales.length === 0) return true;

  for (const locale of fetchedLocales) {
    const incoming = fetchedAndroidNotes[locale];
    const current = existingNotes[locale];
    if (noteEntriesEqual(incoming, current)) continue;

    // On a grouped iOS+Android release, Play often serves Portuguese fallback for hl=en
    // (or slightly different PT phrasing while iOS notes are preferred).
    if (isGroupedWithIos) {
      if (isPlayPortugueseFallback(fetchedAndroidNotes, locale) && current) {
        continue;
      }
      if (locale !== "en" && current) {
        continue;
      }
      if (locale === "en" && current && existingNotes["pt-br"] && noteEntriesEqual(incoming, existingNotes["pt-br"])) {
        continue;
      }
    }
    return false;
  }
  return true;
}

function mergeLocalizedNotes(iosNotes, androidNotes) {
  const merged = {};
  const locales = new Set([...Object.keys(iosNotes ?? {}), ...Object.keys(androidNotes ?? {})]);

  for (const locale of locales) {
    const iosEntry = iosNotes?.[locale];
    const androidEntry = androidNotes?.[locale];
    const hasIos = Boolean(iosEntry && iosEntry.items?.length > 0);
    const hasAndroid = Boolean(androidEntry && androidEntry.items?.length > 0);

    if (hasIos && !hasAndroid) {
      merged[locale] = structuredClone(iosEntry);
    } else if (!hasIos && hasAndroid) {
      merged[locale] = structuredClone(androidEntry);
    } else if (hasIos && hasAndroid) {
      if (noteEntriesEqual(iosEntry, androidEntry) || isPlayPortugueseFallback(androidNotes, locale)) {
        merged[locale] = structuredClone(iosEntry);
      } else {
        // Prefer iOS localized notes for canonical storefronts, preserving unique Android-only lines if any
        const iosSet = new Set(iosEntry.items);
        const extraAndroid = androidEntry.items.filter((item) => !iosSet.has(item));
        if (locale === "en" && extraAndroid.length > 0 && !noteEntriesEqual(androidEntry, androidNotes?.["pt-br"])) {
          merged[locale] = {
            summary: iosEntry.summary,
            items: [...iosEntry.items, ...extraAndroid],
          };
        } else {
          merged[locale] = structuredClone(iosEntry);
        }
      }
    }
  }
  return merged;
}

function findLatestReleaseForPlatform(releases, platform) {
  return releases.find((r) => Boolean(r?.platforms?.[platform])) ?? null;
}

function sortReleases(releases) {
  return [...releases].sort((a, b) => {
    const dateA = a?.releaseDate ?? "";
    const dateB = b?.releaseDate ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const verCmp = compareSemver(b?.version ?? null, a?.version ?? null);
    if (verCmp !== 0) return verCmp;

    return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
  });
}

function buildUniqueReleaseId(releases, releaseDate, version, platformTag = "") {
  const baseDate = releaseDate ?? "unknown-date";
  const baseSuffix = version ? version : platformTag || "release";
  const candidate = `${baseDate}-${baseSuffix}`;
  const existingIds = new Set(releases.map((r) => r.id));
  if (!existingIds.has(candidate)) return candidate;

  let counter = 2;
  while (existingIds.has(`${candidate}-${counter}`)) {
    counter += 1;
  }
  return `${candidate}-${counter}`;
}

function hasIosNotesDiff(fetchedIosNotes, existingRelease) {
  if (!existingRelease || existingRelease.manual === true) return false;
  const existingNotes = existingRelease.notes ?? {};
  for (const [locale, entry] of Object.entries(fetchedIosNotes ?? {})) {
    if (!entry || entry.items?.length === 0) continue;
    if (!noteEntriesEqual(entry, existingNotes[locale])) {
      return true;
    }
  }
  return false;
}

/**
 * Merges fetched store snapshots into existing release history with deduplication,
 * ±3 day cross-platform grouping, manual entry preservation, and zero-diff no-op safety.
 *
 * @param {object} existing
 * @param {{ ios?: object | null, android?: object | null, warnings?: string[] }} fetched
 * @returns {{ changed: boolean, data: object, summary: { iosChanged: boolean, androidChanged: boolean, warnings: string[] } }}
 */
export function mergeAppUpdates(existing, fetched) {
  const warnings = Array.isArray(fetched?.warnings) ? [...fetched.warnings] : [];
  const base = {
    schemaVersion: existing?.schemaVersion ?? 1,
    app: {
      iosId: existing?.app?.iosId ?? DEFAULT_IOS_ID,
      androidPackage: existing?.app?.androidPackage ?? DEFAULT_ANDROID_PACKAGE,
    },
    latest: {
      ios: existing?.latest?.ios ? structuredClone(existing.latest.ios) : null,
      android: existing?.latest?.android ? structuredClone(existing.latest.android) : null,
    },
    releases: Array.isArray(existing?.releases) ? structuredClone(existing.releases) : [],
  };

  const fetchedIos = fetched?.ios ?? null;
  const fetchedAndroid = fetched?.android ?? null;

  if (!fetchedIos && !fetchedAndroid) {
    return {
      changed: false,
      data: existing,
      summary: { iosChanged: false, androidChanged: false, warnings },
    };
  }

  let iosChanged = false;
  let androidChanged = false;
  let iosReleaseRef = null;

  // --- Process iOS ---
  if (fetchedIos) {
    const existingByVersion = base.releases.find(
      (r) => r?.platforms?.ios && r.platforms.ios.version === fetchedIos.version,
    );
    const latestIosRelease = findLatestReleaseForPlatform(base.releases, "ios");

    if (existingByVersion) {
      iosReleaseRef = existingByVersion;
      if (existingByVersion.manual !== true) {
        if (existingByVersion.platforms.ios.releaseDate !== fetchedIos.releaseDate) {
          existingByVersion.platforms.ios.releaseDate = fetchedIos.releaseDate;
          if (!existingByVersion.platforms.android) {
            existingByVersion.releaseDate = fetchedIos.releaseDate;
          }
          iosChanged = true;
        }
        if (hasIosNotesDiff(fetchedIos.notes, existingByVersion)) {
          existingByVersion.notes = mergeLocalizedNotes(fetchedIos.notes, existingByVersion.notes);
          iosChanged = true;
        }
      }
    } else {
      // Check if an existing Android-only release within ±3 days or matching version can group with iOS
      const groupTarget = base.releases.find((r) => {
        if (r?.platforms?.ios != null || !r?.platforms?.android) return false;
        if (r.platforms.android.version && r.platforms.android.version === fetchedIos.version) return true;
        return Math.abs(daysBetween(fetchedIos.releaseDate, r.platforms.android.releaseDate)) <= 3;
      });

      if (groupTarget) {
        groupTarget.platforms.ios = {
          version: fetchedIos.version,
          releaseDate: fetchedIos.releaseDate,
        };
        if (!groupTarget.version) {
          groupTarget.version = fetchedIos.version;
        }
        if (groupTarget.manual !== true) {
          groupTarget.notes = mergeLocalizedNotes(fetchedIos.notes, groupTarget.notes);
        }
        iosReleaseRef = groupTarget;
        iosChanged = true;
      } else {
        const isFirstOrNewer =
          !base.latest.ios ||
          !latestIosRelease ||
          fetchedIos.version !== base.latest.ios.version ||
          fetchedIos.releaseDate !== base.latest.ios.releaseDate;

        if (isFirstOrNewer) {
          const newEntry = {
            id: buildUniqueReleaseId(base.releases, fetchedIos.releaseDate, fetchedIos.version, "ios"),
            version: fetchedIos.version,
            releaseDate: fetchedIos.releaseDate,
            manual: false,
            platforms: {
              ios: {
                version: fetchedIos.version,
                releaseDate: fetchedIos.releaseDate,
              },
              android: null,
            },
            notes: structuredClone(fetchedIos.notes ?? {}),
          };
          base.releases.push(newEntry);
          iosReleaseRef = newEntry;
          iosChanged = true;
        }
      }
    }
  }

  // --- Process Android ---
  if (fetchedAndroid) {
    const androidVersion = fetchedAndroid.version ?? null;
    const androidDate = fetchedAndroid.releaseDate ?? null;

    // Deduplicate against existing releases containing an Android platform record
    const existingAndroidDuplicate = base.releases.find((r) => {
      const plat = r?.platforms?.android;
      if (!plat) return false;
      if (androidVersion != null && plat.version != null) {
        return plat.version === androidVersion;
      }
      if (androidVersion == null && plat.version == null) {
        return plat.releaseDate === androidDate && (r.manual === true || androidNotesMatchExisting(fetchedAndroid.notes, r));
      }
      return false;
    });

    if (existingAndroidDuplicate) {
      if (
        existingAndroidDuplicate.manual !== true &&
        androidVersion != null &&
        existingAndroidDuplicate.platforms.android.version === androidVersion &&
        !existingAndroidDuplicate.platforms.ios &&
        !androidNotesMatchExisting(fetchedAndroid.notes, existingAndroidDuplicate)
      ) {
        existingAndroidDuplicate.notes = structuredClone(fetchedAndroid.notes ?? {});
        androidChanged = true;
      }
    } else {
      // Check if an existing or just-created iOS release without Android can group with this Android update
      const candidates = iosReleaseRef ? [iosReleaseRef, ...base.releases] : base.releases;
      const groupTarget = candidates.find((r) => {
        if (!r?.platforms?.ios || r.platforms.android != null) return false;
        if (androidVersion != null && r.platforms.ios.version != null && androidVersion === r.platforms.ios.version) {
          return true;
        }
        return (
          androidDate != null &&
          r.platforms.ios.releaseDate != null &&
          Math.abs(daysBetween(r.platforms.ios.releaseDate, androidDate)) <= 3
        );
      });

      if (groupTarget) {
        groupTarget.platforms.android = {
          version: androidVersion,
          releaseDate: androidDate,
        };
        if (groupTarget.manual !== true) {
          groupTarget.notes = mergeLocalizedNotes(groupTarget.notes, fetchedAndroid.notes);
        }
        androidChanged = true;
      } else {
        // Also check if latest Android release had the same date & notes under a grouped entry where version transitioned or differed
        const latestAndroidRelease = findLatestReleaseForPlatform(base.releases, "android");
        const isSameAsLatest =
          latestAndroidRelease &&
          latestAndroidRelease.platforms.android.version === androidVersion &&
          latestAndroidRelease.platforms.android.releaseDate === androidDate &&
          (latestAndroidRelease.manual === true || androidNotesMatchExisting(fetchedAndroid.notes, latestAndroidRelease));

        if (!isSameAsLatest) {
          const newEntry = {
            id: buildUniqueReleaseId(base.releases, androidDate, androidVersion, "android"),
            version: androidVersion,
            releaseDate: androidDate,
            manual: false,
            platforms: {
              ios: null,
              android: {
                version: androidVersion,
                releaseDate: androidDate,
              },
            },
            notes: structuredClone(fetchedAndroid.notes ?? {}),
          };
          base.releases.push(newEntry);
          androidChanged = true;
        }
      }
    }
  }

  if (!iosChanged && !androidChanged) {
    return {
      changed: false,
      data: existing,
      summary: { iosChanged: false, androidChanged: false, warnings },
    };
  }

  base.releases = sortReleases(base.releases);
  const newestIos = findLatestReleaseForPlatform(base.releases, "ios");
  const newestAndroid = findLatestReleaseForPlatform(base.releases, "android");

  base.latest = {
    ios: newestIos
      ? {
          version: newestIos.platforms.ios.version ?? null,
          releaseDate: newestIos.platforms.ios.releaseDate ?? null,
        }
      : base.latest.ios,
    android: newestAndroid
      ? {
          version: newestAndroid.platforms.android.version ?? null,
          releaseDate: newestAndroid.platforms.android.releaseDate ?? null,
        }
      : base.latest.android,
  };

  return {
    changed: true,
    data: base,
    summary: { iosChanged, androidChanged, warnings },
  };
}

export function loadAppUpdates(filePath = DEFAULT_DATA_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function writeAppUpdatesIfChanged(filePath, mergeResult) {
  if (!mergeResult?.changed) return false;
  const serialized = `${JSON.stringify(mergeResult.data, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf8");
  return true;
}

function parseCliArgs(argv) {
  let write = false;
  let json = false;
  let filePath = DEFAULT_DATA_PATH;

  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg === "--dry-run") {
      write = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--file=")) {
      filePath = path.resolve(arg.slice("--file=".length));
    }
  }

  return { write, json, filePath };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { write, json, filePath } = parseCliArgs(argv);
  const existing = loadAppUpdates(filePath);

  const fetched = await fetchStoreUpdates({
    iosId: existing?.app?.iosId ?? DEFAULT_IOS_ID,
    androidPackage: existing?.app?.androidPackage ?? DEFAULT_ANDROID_PACKAGE,
    logger: {
      warn: (msg) => console.error(msg),
    },
  });

  const merged = mergeAppUpdates(existing, fetched);
  const wrote = write ? writeAppUpdatesIfChanged(filePath, merged) : false;

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          changed: merged.changed,
          wrote,
          summary: merged.summary,
          data: merged.data,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const mode = write ? (wrote ? "write:updated" : "write:unchanged") : "dry-run";
    console.log(
      `[app-updates] mode=${mode} changed=${merged.changed} iosChanged=${merged.summary.iosChanged} androidChanged=${merged.summary.androidChanged} warnings=${merged.summary.warnings.length}`,
    );
  }

  return { merged, wrote };
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runCli().catch((error) => {
    console.error(`[app-updates] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
