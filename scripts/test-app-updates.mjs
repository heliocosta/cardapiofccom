import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ANDROID_STOREFRONTS,
  DEFAULT_ANDROID_PACKAGE,
  DEFAULT_IOS_ID,
  IOS_STOREFRONTS,
  fetchStoreUpdates,
  loadAppUpdates,
  mergeAppUpdates,
  normalizeReleaseNotes,
  parseIosLookup,
  parsePlayHtml,
  writeAppUpdatesIfChanged,
} from "./fetch-app-updates.mjs";

function makeEmptyStoreData() {
  return {
    schemaVersion: 1,
    app: {
      iosId: DEFAULT_IOS_ID,
      androidPackage: DEFAULT_ANDROID_PACKAGE,
    },
    latest: {
      ios: null,
      android: null,
    },
    releases: [],
  };
}

function makeIosLookupPayload({
  version = "1.60.0",
  currentVersionReleaseDate = "2026-11-17T14:30:00Z",
  releaseNotes = "• Live match alerts\n• Bug fixes &amp; improvements",
  resultCount = 1,
} = {}) {
  if (resultCount === 0) {
    return { resultCount: 0, results: [] };
  }
  return {
    resultCount,
    results: [
      {
        trackId: Number(DEFAULT_IOS_ID),
        version,
        currentVersionReleaseDate,
        releaseDate: "2025-05-01T00:00:00Z",
        releaseNotes,
      },
    ],
  };
}

function makePlayDs5Html({
  version = null,
  whatsNew = "Bug fixes &amp; performance improvements<br>• Faster match schedule",
  updatedEpoch = Math.floor(Date.UTC(2026, 10, 17, 15, 0, 0) / 1000),
  updatedText = null,
  includeAppData = true,
} = {}) {
  const app = [];
  app[140] = [[[version]]];
  app[144] = [null, [null, whatsNew]];
  app[145] = [[updatedText, [updatedEpoch]]];

  const payload = includeAppData ? [null, [null, null, app]] : [null, [null, null, null]];
  return [
    "<!doctype html><html><head><title>CardapioFC - Google Play</title></head><body>",
    `<script>AF_initDataCallback({key: 'ds:5', hash: '5', data:${JSON.stringify(payload)}, sideChannel: {}});</script>`,
    "</body></html>",
  ].join("\n");
}

function makeFakeResponse({ ok = true, status = 200, jsonData, textData } = {}) {
  return {
    ok,
    status,
    async json() {
      if (typeof jsonData === "string") {
        return JSON.parse(jsonData);
      }
      return jsonData;
    },
    async text() {
      return textData ?? "";
    },
  };
}

test("parseIosLookup parses active storefronts and handles empty or invalid payloads", () => {
  const usResult = parseIosLookup(
    makeIosLookupPayload({
      version: "1.60.0",
      currentVersionReleaseDate: "2026-11-17T10:15:00Z",
      releaseNotes: "Lineup notifications and bug fixes",
    }),
  );
  assert.deepEqual(usResult, {
    ok: true,
    version: "1.60.0",
    releaseDate: "2026-11-17",
    releaseNotes: "Lineup notifications and bug fixes",
  });

  const brResult = parseIosLookup(
    JSON.stringify(
      makeIosLookupPayload({
        version: "1.60.0",
        currentVersionReleaseDate: "2026-11-17T12:00:00Z",
        releaseNotes: "Alertas de escalação e correções",
      }),
    ),
  );
  assert.equal(brResult.ok, true);
  assert.equal(brResult.releaseNotes, "Alertas de escalação e correções");

  const arResult = parseIosLookup({
    resultCount: 1,
    results: [
      {
        version: "1.60.0",
        releaseDate: "2026-11-17",
        releaseNotes: "Corrección de errores y mejoras",
      },
    ],
  });
  assert.deepEqual(arResult, {
    ok: true,
    version: "1.60.0",
    releaseDate: "2026-11-17",
    releaseNotes: "Corrección de errores y mejoras",
  });

  assert.deepEqual(parseIosLookup(makeIosLookupPayload({ resultCount: 0 })), {
    ok: false,
    reason: "NO_RESULTS",
  });
  assert.deepEqual(parseIosLookup("{not-json"), { ok: false, reason: "INVALID_JSON" });
  assert.deepEqual(parseIosLookup(null), { ok: false, reason: "INVALID_JSON" });
  assert.deepEqual(parseIosLookup({ resultCount: 1, results: [{}] }), {
    ok: false,
    reason: "MISSING_FIELDS",
  });
});

test("parsePlayHtml extracts ds:5 fields with null or present version and rejects malformed/consent HTML", () => {
  const nullVersionHtml = makePlayDs5Html({
    version: null,
    whatsNew: "What&#39;s new:<br>• Faster match cards<br>• Faster match cards",
    updatedEpoch: Math.floor(Date.UTC(2026, 10, 17, 8, 30, 0) / 1000),
  });
  assert.deepEqual(parsePlayHtml(nullVersionHtml), {
    ok: true,
    version: null,
    releaseDate: "2026-11-17",
    whatsNew: "What&#39;s new:<br>• Faster match cards<br>• Faster match cards",
  });

  const explicitVersionHtml = makePlayDs5Html({
    version: "1.61.0",
    whatsNew: "Dark mode contrast fixes",
    updatedEpoch: null,
    updatedText: "Nov 20, 2026",
  });
  assert.deepEqual(parsePlayHtml(explicitVersionHtml), {
    ok: true,
    version: "1.61.0",
    releaseDate: "2026-11-20",
    whatsNew: "Dark mode contrast fixes",
  });

  assert.deepEqual(parsePlayHtml(""), { ok: false, reason: "EMPTY_HTML" });
  assert.deepEqual(parsePlayHtml("<html><body>No store data here</body></html>"), {
    ok: false,
    reason: "NO_DS5",
  });
  assert.deepEqual(
    parsePlayHtml(
      '<html><head><title>Before you continue to Google</title></head><body><form action="https://consent.google.com/save"></form></body></html>',
    ),
    { ok: false, reason: "CONSENT_WALL" },
  );
  assert.deepEqual(
    parsePlayHtml("<script>AF_initDataCallback({key: 'ds:5', data: [1, 2], otherKey: {}});</script>"),
    { ok: false, reason: "MALFORMED_DS5" },
  );
  assert.deepEqual(
    parsePlayHtml("<script>AF_initDataCallback({key: 'ds:5', data: {broken}, sideChannel: {}});</script>"),
    { ok: false, reason: "INVALID_DS5_JSON" },
  );
  assert.deepEqual(parsePlayHtml(makePlayDs5Html({ includeAppData: false })), {
    ok: false,
    reason: "MISSING_APP_DATA",
  });
  assert.deepEqual(parsePlayHtml(makePlayDs5Html({ whatsNew: null, updatedEpoch: null })), {
    ok: false,
    reason: "MISSING_RELEASE_FIELDS",
  });
});

test("normalizeReleaseNotes decodes HTML entities, splits bullets, and deduplicates lines", () => {
  const normalized = normalizeReleaseNotes(
    "<ul><li>Live scores &amp; standings</li><li>Lineup alerts &#39;beta&#39;</li><li>Live scores &amp; standings</li></ul>\n- Bug fixes &nbsp; &lt;fast&gt;\n* Performance boost\n• Multi • inline • bullets",
  );

  assert.deepEqual(normalized, {
    summary: "Live scores & standings",
    items: [
      "Live scores & standings",
      "Lineup alerts 'beta'",
      "Bug fixes <fast>",
      "Performance boost",
      "Multi",
      "inline",
      "bullets",
    ],
  });

  assert.deepEqual(normalizeReleaseNotes("   "), { summary: "", items: [] });
});

test("fetchStoreUpdates paces requests, skips cn/jp, and isolates per-storefront failures", async () => {
  const requestedUrls = [];
  const sleepCalls = [];
  const warningsLogged = [];

  const mockFetch = async (url) => {
    requestedUrls.push(url);

    if (url.includes("itunes.apple.com")) {
      const cc = new URL(url).searchParams.get("country");
      if (cc === "us") {
        return makeFakeResponse({
          jsonData: makeIosLookupPayload({
            version: "1.60.0",
            currentVersionReleaseDate: "2026-11-17T10:00:00Z",
            releaseNotes: "• Live match alerts\n• Bug fixes",
          }),
        });
      }
      if (cc === "gb") {
        return makeFakeResponse({ ok: false, status: 403 });
      }
      if (cc === "ie") {
        throw new Error("Simulated ECONNRESET");
      }
      if (cc === "br") {
        return makeFakeResponse({
          jsonData: makeIosLookupPayload({
            version: "1.60.0",
            currentVersionReleaseDate: "2026-11-17T10:00:00Z",
            releaseNotes: "• Alertas de jogos ao vivo\n• Correções",
          }),
        });
      }
      if (cc === "pt") {
        return makeFakeResponse({ jsonData: makeIosLookupPayload({ resultCount: 0 }) });
      }
      if (cc === "ar") {
        return makeFakeResponse({
          jsonData: makeIosLookupPayload({
            version: "1.60.0",
            currentVersionReleaseDate: "2026-11-17T10:00:00Z",
            releaseNotes: "• Alertas en vivo\n• Correcciones",
          }),
        });
      }
    }

    if (url.includes("play.google.com")) {
      const hl = new URL(url).searchParams.get("hl");
      if (hl === "en") {
        return makeFakeResponse({
          textData: makePlayDs5Html({
            version: null,
            whatsNew: "Bug fixes and stability",
            updatedEpoch: Math.floor(Date.UTC(2026, 10, 17, 12, 0, 0) / 1000),
          }),
        });
      }
      if (hl === "pt_BR") {
        return makeFakeResponse({ ok: false, status: 500 });
      }
      if (hl === "pt_PT") {
        return makeFakeResponse({
          textData: "<html><body>Before you continue to Google (consent.google.com)</body></html>",
        });
      }
      if (hl === "es_AR") {
        return makeFakeResponse({
          textData: makePlayDs5Html({
            version: null,
            whatsNew: "Correcciones generales",
            updatedEpoch: Math.floor(Date.UTC(2026, 10, 17, 12, 0, 0) / 1000),
          }),
        });
      }
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchStoreUpdates({
    fetchFn: mockFetch,
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    paceMs: 500,
    logger: { warn: (msg) => warningsLogged.push(msg) },
  });

  const expectedTotalRequests = IOS_STOREFRONTS.length + ANDROID_STOREFRONTS.length;
  assert.equal(requestedUrls.length, expectedTotalRequests);
  assert.equal(sleepCalls.length, expectedTotalRequests - 1);
  assert.ok(sleepCalls.every((ms) => ms === 500));

  for (const url of requestedUrls) {
    assert.equal(/[?&](?:country|hl|gl)=(?:cn|jp|zh-cn|ja)\b/i.test(url), false);
  }

  assert.equal(result.ios?.version, "1.60.0");
  assert.equal(result.ios?.releaseDate, "2026-11-17");
  assert.deepEqual(Object.keys(result.ios?.notes ?? {}).sort(), ["en", "es-ar", "pt-br"]);

  assert.equal(result.android?.version, null);
  assert.equal(result.android?.releaseDate, "2026-11-17");
  assert.deepEqual(Object.keys(result.android?.notes ?? {}).sort(), ["en", "es-ar"]);

  assert.equal(result.warnings.length, 5);
  assert.equal(warningsLogged.length, 5);
});

test("mergeAppUpdates seeds grouped iOS + Android releases, omits fetchedAt, and supports unchanged no-op + temp file writes", () => {
  const existing = makeEmptyStoreData();
  const fetched = {
    ios: {
      version: "1.60.0",
      releaseDate: "2026-11-17",
      notes: {
        en: { summary: "Bug fixes and improvements", items: ["Bug fixes and improvements"] },
        "pt-br": { summary: "Correções e melhorias", items: ["Correções e melhorias"] },
      },
    },
    android: {
      version: null,
      releaseDate: "2026-11-19",
      notes: {
        // Simulates Play returning Portuguese fallback for hl=en
        en: { summary: "Correções e melhorias", items: ["Correções e melhorias"] },
        "pt-br": { summary: "Correções e melhorias", items: ["Correções e melhorias"] },
      },
    },
    warnings: [],
  };

  const seeded = mergeAppUpdates(existing, fetched);
  assert.equal(seeded.changed, true);
  assert.deepEqual(seeded.summary, { iosChanged: true, androidChanged: true, warnings: [] });
  assert.equal("fetchedAt" in seeded.data, false);
  assert.equal(seeded.data.releases.length, 1);

  const release = seeded.data.releases[0];
  assert.equal("fetchedAt" in release, false);
  assert.equal(release.version, "1.60.0");
  assert.deepEqual(release.platforms, {
    ios: { version: "1.60.0", releaseDate: "2026-11-17" },
    android: { version: null, releaseDate: "2026-11-19" },
  });
  assert.deepEqual(seeded.data.latest, {
    ios: { version: "1.60.0", releaseDate: "2026-11-17" },
    android: { version: null, releaseDate: "2026-11-19" },
  });
  // iOS English notes should be preferred over Play's Portuguese fallback on hl=en
  assert.deepEqual(release.notes.en, {
    summary: "Bug fixes and improvements",
    items: ["Bug fixes and improvements"],
  });
  // Unsupported locales (zh-cn / ja) are not required when English notes exist
  assert.equal(release.notes["zh-cn"], undefined);
  assert.equal(release.notes.ja, undefined);

  // Immediate unchanged re-run must be a zero-diff no-op
  const rerun = mergeAppUpdates(seeded.data, fetched);
  assert.equal(rerun.changed, false);
  assert.deepEqual(rerun.data, seeded.data);

  // Verify writeAppUpdatesIfChanged writes on change and preserves mtime/bytes on no-op
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfc-updates-test-"));
  try {
    const tmpFile = path.join(tmpDir, "app_updates.json");
    assert.equal(writeAppUpdatesIfChanged(tmpFile, seeded), true);

    const writtenBytes = fs.readFileSync(tmpFile);
    const statBefore = fs.statSync(tmpFile);
    assert.deepEqual(loadAppUpdates(tmpFile), seeded.data);

    const futureTime = new Date(statBefore.mtimeMs - 5000);
    fs.utimesSync(tmpFile, futureTime, futureTime);
    const pinnedMtime = fs.statSync(tmpFile).mtimeMs;

    assert.equal(writeAppUpdatesIfChanged(tmpFile, rerun), false);
    assert.equal(fs.statSync(tmpFile).mtimeMs, pinnedMtime);
    assert.deepEqual(fs.readFileSync(tmpFile), writtenBytes);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("mergeAppUpdates deduplicates null-version Android updates by (releaseDate, normalizedNotes) and appends distinct updates newest-first", () => {
  const initialAndroid = {
    ios: null,
    android: {
      version: null,
      releaseDate: "2026-11-10",
      notes: {
        en: { summary: "Android stability fix", items: ["Android stability fix"] },
      },
    },
    warnings: [],
  };

  const first = mergeAppUpdates(makeEmptyStoreData(), initialAndroid);
  assert.equal(first.changed, true);
  assert.equal(first.data.releases.length, 1);

  // Same date & normalized notes -> deduplicated (no-op)
  const duplicateRun = mergeAppUpdates(first.data, initialAndroid);
  assert.equal(duplicateRun.changed, false);
  assert.equal(duplicateRun.data.releases.length, 1);

  // Same date, different normalized notes -> distinct Android-only release appended
  const updatedSameDateNotes = mergeAppUpdates(first.data, {
    ios: null,
    android: {
      version: null,
      releaseDate: "2026-11-10",
      notes: {
        en: { summary: "Android hotfix patch 2", items: ["Android hotfix patch 2"] },
      },
    },
    warnings: [],
  });
  assert.equal(updatedSameDateNotes.changed, true);
  assert.equal(updatedSameDateNotes.data.releases.length, 2);

  // Newer Android-only release on a new date -> sorted newest-first
  const newerDateUpdate = mergeAppUpdates(updatedSameDateNotes.data, {
    ios: null,
    android: {
      version: null,
      releaseDate: "2026-11-15",
      notes: {
        en: { summary: "Push notification reliability", items: ["Push notification reliability"] },
      },
    },
    warnings: [],
  });
  assert.equal(newerDateUpdate.changed, true);
  assert.equal(newerDateUpdate.data.releases.length, 3);
  assert.equal(newerDateUpdate.data.releases[0].releaseDate, "2026-11-15");
  assert.equal(newerDateUpdate.data.releases[0].platforms.ios, null);
  assert.equal(newerDateUpdate.data.latest.android.releaseDate, "2026-11-15");
});

test("mergeAppUpdates preserves manual: true entries for both Android-only and iOS-grouped null-version records while appending newer releases", () => {
  const curatedAndroidOnly = {
    schemaVersion: 1,
    app: { iosId: DEFAULT_IOS_ID, androidPackage: DEFAULT_ANDROID_PACKAGE },
    latest: {
      ios: null,
      android: { version: null, releaseDate: "2026-11-05" },
    },
    releases: [
      {
        id: "2026-11-05-android",
        version: null,
        releaseDate: "2026-11-05",
        manual: true,
        platforms: {
          ios: null,
          android: { version: null, releaseDate: "2026-11-05" },
        },
        notes: {
          en: { summary: "Curated Android release notes", items: ["Curated Android release notes"] },
        },
      },
    ],
  };

  // Matching releaseDate with different automated Play notes must NOT overwrite or duplicate manual: true
  const androidOnlyRescan = mergeAppUpdates(curatedAndroidOnly, {
    ios: null,
    android: {
      version: null,
      releaseDate: "2026-11-05",
      notes: {
        en: { summary: "Generic automated Play text", items: ["Generic automated Play text"] },
      },
    },
    warnings: [],
  });
  assert.equal(androidOnlyRescan.changed, false);
  assert.deepEqual(androidOnlyRescan.data, curatedAndroidOnly);

  // iOS-grouped manual: true entry with null Android version must also be preserved
  const curatedGrouped = {
    schemaVersion: 1,
    app: { iosId: DEFAULT_IOS_ID, androidPackage: DEFAULT_ANDROID_PACKAGE },
    latest: {
      ios: { version: "1.59.0", releaseDate: "2026-11-10" },
      android: { version: null, releaseDate: "2026-11-10" },
    },
    releases: [
      {
        id: "2026-11-10-1.59.0",
        version: "1.59.0",
        releaseDate: "2026-11-10",
        manual: true,
        platforms: {
          ios: { version: "1.59.0", releaseDate: "2026-11-10" },
          android: { version: null, releaseDate: "2026-11-10" },
        },
        notes: {
          en: { summary: "Curated cross-platform release", items: ["Curated cross-platform release"] },
        },
      },
    ],
  };

  const groupedRescan = mergeAppUpdates(curatedGrouped, {
    ios: {
      version: "1.59.0",
      releaseDate: "2026-11-11",
      notes: {
        en: { summary: "Overwritten iOS notes", items: ["Overwritten iOS notes"] },
      },
    },
    android: {
      version: null,
      releaseDate: "2026-11-10",
      notes: {
        en: { summary: "Overwritten Android notes", items: ["Overwritten Android notes"] },
      },
    },
    warnings: [],
  });
  assert.equal(groupedRescan.changed, false);
  assert.deepEqual(groupedRescan.data, curatedGrouped);

  // A newer release must still append newest-first without disturbing the manual entry
  const withNewerRelease = mergeAppUpdates(curatedGrouped, {
    ios: {
      version: "1.60.0",
      releaseDate: "2026-11-20",
      notes: {
        en: { summary: "Match stats widget", items: ["Match stats widget"] },
      },
    },
    android: {
      version: null,
      releaseDate: "2026-11-20",
      notes: {
        en: { summary: "Match stats widget", items: ["Match stats widget"] },
      },
    },
    warnings: [],
  });
  assert.equal(withNewerRelease.changed, true);
  assert.equal(withNewerRelease.data.releases.length, 2);
  assert.equal(withNewerRelease.data.releases[0].version, "1.60.0");
  assert.equal(withNewerRelease.data.releases[1].id, "2026-11-10-1.59.0");
  assert.equal(withNewerRelease.data.releases[1].manual, true);
  assert.deepEqual(withNewerRelease.data.releases[1].notes, curatedGrouped.releases[0].notes);
});

test("mergeAppUpdates preserves existing history on total or partial store failure", () => {
  const existing = {
    schemaVersion: 1,
    app: { iosId: DEFAULT_IOS_ID, androidPackage: DEFAULT_ANDROID_PACKAGE },
    latest: {
      ios: { version: "1.60.0", releaseDate: "2026-11-17" },
      android: { version: null, releaseDate: "2026-11-17" },
    },
    releases: [
      {
        id: "2026-11-17-1.60.0",
        version: "1.60.0",
        releaseDate: "2026-11-17",
        manual: false,
        platforms: {
          ios: { version: "1.60.0", releaseDate: "2026-11-17" },
          android: { version: null, releaseDate: "2026-11-17" },
        },
        notes: {
          en: { summary: "Bug fixes", items: ["Bug fixes"] },
        },
      },
    ],
  };

  const totalFailure = mergeAppUpdates(existing, {
    ios: null,
    android: null,
    warnings: ["iOS unavailable", "Play consent wall"],
  });
  assert.equal(totalFailure.changed, false);
  assert.deepEqual(totalFailure.data, existing);
  assert.deepEqual(totalFailure.summary, {
    iosChanged: false,
    androidChanged: false,
    warnings: ["iOS unavailable", "Play consent wall"],
  });

  // Partial failure: Android fails (null) while iOS reports a new release -> Android latest preserved
  const androidFailure = mergeAppUpdates(existing, {
    ios: {
      version: "1.61.0",
      releaseDate: "2026-11-24",
      notes: {
        en: { summary: "World Cup hub", items: ["World Cup hub"] },
      },
    },
    android: null,
    warnings: ["Play consent wall"],
  });
  assert.equal(androidFailure.changed, true);
  assert.equal(androidFailure.data.latest.ios.version, "1.61.0");
  assert.deepEqual(androidFailure.data.latest.android, {
    version: null,
    releaseDate: "2026-11-17",
  });
  assert.equal(androidFailure.data.releases.length, 2);
});
