#!/usr/bin/env node

/**
 * scripts/test-data-pages.mjs
 *
 * Automated Data Failure Test Suite for CardápioFC Data-Backed Pages.
 *
 * Requirements verified:
 * - Scenario 1 (Req 2.5/2.6): Major version mismatch fails build early.
 * - Scenario 2 (Req 2.6/2.7): SHA-256 hash mismatch / corrupted file fails build.
 * - Scenario 3 (Req 2.7/2.8): Unzoned kickoff timestamp fails build with match & timestamp details.
 * - Scenario 4 (Req 2.8): Invalid match status fails build with status & match details.
 * - Scenario 5 (Req 2.9): Missing foreign keys (team, league) fail build with entity details.
 * - Scenario 6 (Req 2.10): Missing country channel file generates warning without failing build.
 * - Scenario 7 (Req 11.4): File budget overflow fails build before writing pages with estimate, budget, and contributors.
 * - Scenario 8 (Req 3.6): Address collision / duplicate entity count mismatch fails build.
 *
 * USER DIRECTIVE: Lineups are completely OUT OF SCOPE. No lineup failure modes tested.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SAMPLE_DIR = path.join(ROOT_DIR, "assets", "cfc-data", "sample");
const CFC_DATA_DIR = path.join(ROOT_DIR, "assets", "cfc-data");
const TEMP_BUILD_DIR = path.join(ROOT_DIR, ".tmp", "cfc-failure-build");

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

const activeTempDirs = new Set();

function pass(msg) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg, details = "") {
  totalChecks++;
  failedChecks++;
  const fullMsg = details ? `${msg} -> ${details}` : msg;
  failures.push(fullMsg);
  console.error(`  ❌ FAIL: ${fullMsg}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function cleanupAllTempDirs() {
  for (const dir of activeTempDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      // ignore during process teardown
    }
  }
  activeTempDirs.clear();

  try {
    if (fs.existsSync(TEMP_BUILD_DIR)) {
      fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    // ignore
  }

  // Also clean up any lingering tmp-test-* folders in assets/cfc-data
  try {
    if (fs.existsSync(CFC_DATA_DIR)) {
      const entries = fs.readdirSync(CFC_DATA_DIR);
      for (const entry of entries) {
        if (entry.startsWith("tmp-test-") || entry.startsWith("tmp-fail-")) {
          const p = path.join(CFC_DATA_DIR, entry);
          fs.rmSync(p, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

// Ensure cleanup on sudden exit / termination signals
process.on("exit", cleanupAllTempDirs);
process.on("SIGINT", () => {
  cleanupAllTempDirs();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanupAllTempDirs();
  process.exit(1);
});

/**
 * Creates an isolated copy of assets/cfc-data/sample/ in assets/cfc-data/tmp-fail-...
 * Calls mutator(tempDir, helpers) to apply test mutations.
 */
function withMutatedDataset(testId, mutator, runTest) {
  const uniqueName = `tmp-fail-${testId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const tempDir = path.join(CFC_DATA_DIR, uniqueName);
  activeTempDirs.add(tempDir);

  try {
    // Copy sample dataset recursively
    fs.cpSync(SAMPLE_DIR, tempDir, { recursive: true });

    const helpers = {
      readJson: (relPath) =>
        JSON.parse(fs.readFileSync(path.join(tempDir, relPath), "utf8")),
      writeJson: (relPath, obj) => {
        const fullPath = path.join(tempDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, JSON.stringify(obj, null, 2), "utf8");
      },
      updateHashInIndex: (relFile) => {
        const fileContent = fs.readFileSync(path.join(tempDir, relFile));
        const sha256 = crypto
          .createHash("sha256")
          .update(fileContent)
          .digest("hex");
        const indexPath = path.join(tempDir, "index.json");
        const indexObj = JSON.parse(fs.readFileSync(indexPath, "utf8"));
        if (indexObj.files && indexObj.files[relFile]) {
          indexObj.files[relFile].sha256 = sha256;
          indexObj.files[relFile].bytes = fileContent.length;
          fs.writeFileSync(
            indexPath,
            JSON.stringify(indexObj, null, 2),
            "utf8",
          );
        }
      },
      deleteFile: (relPath) => {
        const p = path.join(tempDir, relPath);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      },
    };

    mutator(tempDir, helpers);

    const relSampleDir = `cfc-data/${uniqueName}/`;
    return runTest({ tempDir, relSampleDir });
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // ignore
    }
    activeTempDirs.delete(tempDir);
  }
}

/**
 * Executes a Hugo build against a given sample dir.
 */
function runHugo({ relSampleDir, envVars = {} }) {
  if (fs.existsSync(TEMP_BUILD_DIR)) {
    fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
  }

  const customEnv = {
    ...process.env,
    HUGO_CFC_DATA_SOURCE: "sample",
    ...(relSampleDir ? { HUGO_CFC_DATA_SAMPLE: relSampleDir } : {}),
    ...envVars,
  };

  const cmd = `hugo --destination "${TEMP_BUILD_DIR}" --gc --cleanDestinationDir 2>&1`;
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT_DIR,
      env: customEnv,
      stdio: "pipe",
    });
    return {
      success: true,
      code: 0,
      output: stdout.toString(),
    };
  } catch (err) {
    return {
      success: false,
      code: err.status || 1,
      output: err.stdout ? err.stdout.toString() : err.message,
    };
  } finally {
    if (fs.existsSync(TEMP_BUILD_DIR)) {
      try {
        fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    }
  }
}

console.log("🧪 Starting CardápioFC Automated Data Failure Test Suite...\n");

// Ensure clean starting slate
cleanupAllTempDirs();

try {
  // =========================================================================
  // Scenario 1 (Major version mismatch, Req 2.5)
  // =========================================================================
  section("Scenario 1: Major Version Mismatch (Req 2.5)");
  withMutatedDataset(
    "s1-version-mismatch",
    (tempDir, { readJson, writeJson }) => {
      const indexData = readJson("index.json");
      indexData.schemaVersion = "2.0.0";
      writeJson("index.json", indexData);
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass(
          "Build correctly failed on major schemaVersion mismatch (exit code != 0)",
        );
      } else {
        fail('Build should have failed for schemaVersion "2.0.0"');
      }

      const output = res.output;
      const hasUnsupported =
        output.includes("2.0.0") || output.includes("major 2");
      const hasSupported =
        output.includes("supported 1") ||
        output.includes("supported major is 1");
      const hasMismatchMsg =
        output.includes("contract major version mismatch") ||
        output.includes("unsupported");

      if (hasUnsupported && hasSupported && hasMismatchMsg) {
        pass(
          `Error output identifies unsupported version and supported major: "${output.split("\n").find((l) => l.includes("version")) || output.trim()}"`,
        );
      } else {
        fail(
          "Error output did not name unsupported version and supported major",
          output,
        );
      }
    },
  );

  // =========================================================================
  // Scenario 2 (SHA-256 hash mismatch / corrupted file, Req 2.6)
  // =========================================================================
  section("Scenario 2: SHA-256 Hash Mismatch / Corrupted File (Req 2.6)");
  withMutatedDataset(
    "s2-sha-mismatch",
    (tempDir, { readJson, writeJson }) => {
      // Mutate teams.json content without updating index.json SHA-256 hash
      const teams = readJson("teams.json");
      teams.teams.arsenal.crestUrl = "https://example.com/corrupted.png";
      writeJson("teams.json", teams);
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass("Build correctly failed on SHA-256 integrity mismatch");
      } else {
        fail("Build should have failed for corrupted teams.json");
      }

      const output = res.output;
      const mentionsFile = output.includes("teams.json");
      const mentionsIntegrity =
        output.includes("integrity check failed") ||
        output.includes("SHA-256 mismatch");

      if (mentionsFile && mentionsIntegrity) {
        pass(
          `Error output identifies corrupted file and integrity mismatch: "${output.split("\n").find((l) => l.includes("teams.json")) || output.trim()}"`,
        );
      } else {
        fail(
          'Error output did not identify corrupted file "teams.json" or integrity check failure',
          output,
        );
      }
    },
  );

  // =========================================================================
  // Scenario 3 (Unzoned kickoff timestamp, Req 2.7)
  // =========================================================================
  section("Scenario 3: Unzoned Kickoff Timestamp (Req 2.7)");
  withMutatedDataset(
    "s3-unzoned-kickoff",
    (tempDir, { readJson, writeJson, updateHashInIndex }) => {
      const matchesData = readJson("matches.json");
      const matchSlug = "arsenal-vs-chelsea-2026-11-06";
      matchesData.matches[matchSlug].kickoff = "2026-11-06 20:00:00"; // Missing 'Z' or offset
      writeJson("matches.json", matchesData);
      updateHashInIndex("matches.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass("Build correctly failed on unzoned kickoff timestamp");
      } else {
        fail(
          'Build should have failed for unzoned kickoff "2026-11-06 20:00:00"',
        );
      }

      const output = res.output;
      const mentionsMatch = output.includes("arsenal-vs-chelsea-2026-11-06");
      const mentionsTimestamp = output.includes("2026-11-06 20:00:00");
      const mentionsKickoff = output.includes("kickoff");

      if (mentionsMatch && mentionsTimestamp && mentionsKickoff) {
        pass(
          `Error output identifies affected match and invalid timestamp: "${output.split("\n").find((l) => l.includes("kickoff")) || output.trim()}"`,
        );
      } else {
        fail(
          "Error output did not identify match or invalid unzoned timestamp",
          output,
        );
      }
    },
  );

  // =========================================================================
  // Scenario 4 (Invalid match status, Req 2.8)
  // =========================================================================
  section("Scenario 4: Invalid Match Status (Req 2.8)");
  withMutatedDataset(
    "s4-invalid-status",
    (tempDir, { readJson, writeJson, updateHashInIndex }) => {
      const matchesData = readJson("matches.json");
      const matchSlug = "arsenal-vs-chelsea-2026-11-06";
      matchesData.matches[matchSlug].status = "in_progress"; // not in allowedStatuses
      writeJson("matches.json", matchesData);
      updateHashInIndex("matches.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass('Build correctly failed on unknown match status "in_progress"');
      } else {
        fail("Build should have failed for unknown match status");
      }

      const output = res.output;
      const mentionsMatch = output.includes("arsenal-vs-chelsea-2026-11-06");
      const mentionsStatus =
        output.includes("in_progress") && output.includes("status");

      if (mentionsMatch && mentionsStatus) {
        pass(
          `Error output names invalid status and affected match: "${output.split("\n").find((l) => l.includes("in_progress")) || output.trim()}"`,
        );
      } else {
        fail(
          'Error output did not identify affected match or invalid status "in_progress"',
          output,
        );
      }
    },
  );

  // =========================================================================
  // Scenario 5 (Missing foreign key, Req 2.9)
  // =========================================================================
  section("Scenario 5: Missing Foreign Key (Req 2.9)");
  withMutatedDataset(
    "s5-missing-foreign-key",
    (tempDir, { readJson, writeJson, updateHashInIndex }) => {
      const matchesData = readJson("matches.json");
      const matchSlug = "arsenal-vs-chelsea-2026-11-06";
      matchesData.matches[matchSlug].homeSlug = "non-existent-team";
      writeJson("matches.json", matchesData);
      updateHashInIndex("matches.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass("Build correctly failed on missing foreign key reference");
      } else {
        fail(
          'Build should have failed for unknown homeSlug "non-existent-team"',
        );
      }

      const output = res.output;
      const mentionsMatch = output.includes("arsenal-vs-chelsea-2026-11-06");
      const mentionsEntity = output.includes("non-existent-team");
      const mentionsUnknown =
        output.includes("unknown team") || output.includes("refers to unknown");

      if (mentionsMatch && mentionsEntity && mentionsUnknown) {
        pass(
          `Error output identifies missing entity and affected match: "${output.split("\n").find((l) => l.includes("non-existent-team")) || output.trim()}"`,
        );
      } else {
        fail(
          'Error output did not name missing team "non-existent-team" and match',
          output,
        );
      }
    },
  );

  // Also verify missing leagueSlug foreign key
  withMutatedDataset(
    "s5-missing-league-key",
    (tempDir, { readJson, writeJson, updateHashInIndex }) => {
      const matchesData = readJson("matches.json");
      const matchSlug = "arsenal-vs-chelsea-2026-11-06";
      matchesData.matches[matchSlug].leagueSlug = "non-existent-league";
      writeJson("matches.json", matchesData);
      updateHashInIndex("matches.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass("Build correctly failed on unknown leagueSlug");
      } else {
        fail("Build should have failed for unknown leagueSlug");
      }

      const output = res.output;
      if (
        output.includes("non-existent-league") &&
        output.includes("arsenal-vs-chelsea-2026-11-06")
      ) {
        pass("Error output identifies missing league and affected match");
      } else {
        fail("Error output did not identify missing league", output);
      }
    },
  );

  // =========================================================================
  // Scenario 6 (Missing country channel file generates warning, Req 2.10)
  // =========================================================================
  section(
    "Scenario 6: Missing Channel Country Emits Warning & Build Succeeds (Req 2.10)",
  );
  withMutatedDataset(
    "s6-missing-channel-file",
    (tempDir, { readJson, writeJson, deleteFile }) => {
      const indexData = readJson("index.json");
      // Remove IE from files map and delete file so IE channel file is missing
      delete indexData.files["channels/IE.json"];
      writeJson("index.json", indexData);
      deleteFile("channels/IE.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (res.success && res.code === 0) {
        pass(
          "Build SUCCEEDS with exit code 0 when country channel file is missing",
        );
      } else {
        fail(
          `Build should have succeeded with exit code 0, but failed with code ${res.code}`,
          res.output,
        );
      }

      const output = res.output;
      const hasWarning = output.includes(
        'channel file missing for edition country "IE"',
      );
      if (hasWarning) {
        pass(
          'Build output emitted expected warning: "data-pages: channel file missing for edition country \\"IE\\""',
        );
      } else {
        fail(
          'Build output did not contain warning for missing edition country "IE"',
          output,
        );
      }

      // Verify zero build errors were logged
      const hasError =
        output.includes("ERROR") || output.includes("error building site");
      if (!hasError) {
        pass(
          "Zero build ERROR logs were generated during missing channel file build",
        );
      } else {
        fail(
          "Unexpected ERROR logged during missing channel file build",
          output,
        );
      }
    },
  );

  // =========================================================================
  // Scenario 7 (File budget overflow, Req 11.4)
  // =========================================================================
  section("Scenario 7: File Budget Overflow Halts Build (Req 11.4)");
  {
    // Use sample baseline dataset with an artificially tiny file budget (e.g. 10)
    const res = runHugo({
      relSampleDir: "cfc-data/sample/",
      envVars: {
        HUGO_CFC_FILE_BUDGET: "10",
      },
    });

    if (!res.success) {
      pass(
        "Build correctly failed when estimated output files exceeded budget",
      );
    } else {
      fail("Build should have failed with HUGO_CFC_FILE_BUDGET=10");
    }

    const output = res.output;
    const mentionsBudgetExceeded = output.includes("file budget exceeded");
    const mentionsEstimate = output.includes("350");
    const mentionsLimit = output.includes("budget 10") || output.includes("10");
    const mentionsContributors =
      output.includes("matches") &&
      output.includes("teams") &&
      output.includes("leagues") &&
      output.includes("editions");

    if (
      mentionsBudgetExceeded &&
      mentionsEstimate &&
      mentionsLimit &&
      mentionsContributors
    ) {
      pass(
        `Error output contains estimate, budget, and contributors: "${output.split("\n").find((l) => l.includes("file budget exceeded")) || output.trim()}"`,
      );
    } else {
      fail(
        "Error output missing budget overflow details (estimate, budget, or contributors)",
        output,
      );
    }
  }

  // =========================================================================
  // Scenario 8 (Address collision & count mismatch, Req 3.6)
  // =========================================================================
  section(
    "Scenario 8: Address Collision / Duplicate Entity Count Mismatch (Req 3.6)",
  );
  withMutatedDataset(
    "s8-count-mismatch",
    (tempDir, { readJson, writeJson }) => {
      // Simulate duplicate entity key collapsing collision:
      // When two entities share a slug, the JSON map unmarshals fewer keys than index.counts declares.
      const indexData = readJson("index.json");
      indexData.counts.matches = 9; // Declared 9, but actual unique keys is 8
      writeJson("index.json", indexData);
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass(
          "Build correctly failed on entity count mismatch (duplicate key collapsing collision)",
        );
      } else {
        fail("Build should have failed for matches count mismatch");
      }

      const output = res.output;
      const mentionsMismatch = output.includes(
        "matches.json: count mismatch (expected 9, got 8)",
      );
      if (mentionsMismatch) {
        pass(
          `Error output identifies duplicate entity count mismatch: "${output.split("\n").find((l) => l.includes("count mismatch")) || output.trim()}"`,
        );
      } else {
        fail("Error output did not identify matches count mismatch", output);
      }
    },
  );

  // Also verify teams count mismatch
  withMutatedDataset(
    "s8-teams-count-mismatch",
    (tempDir, { readJson, writeJson }) => {
      const indexData = readJson("index.json");
      indexData.counts.teams = 9; // Declared 9, actual unique keys is 8
      writeJson("index.json", indexData);
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass("Build correctly failed on teams count mismatch");
      } else {
        fail("Build should have failed for teams count mismatch");
      }

      const output = res.output;
      if (output.includes("teams.json: count mismatch (expected 9, got 8)")) {
        pass("Error output identifies teams count mismatch");
      } else {
        fail("Error output did not identify teams count mismatch", output);
      }
    },
  );

  // Verify slug format collision / mismatch detection
  withMutatedDataset(
    "s8-slug-key-mismatch",
    (tempDir, { readJson, writeJson, updateHashInIndex }) => {
      const matchesData = readJson("matches.json");
      // Change match slug key to not match expected slug
      const matchSlug = "arsenal-vs-chelsea-2026-11-06";
      matchesData.matches[matchSlug].slug =
        "duplicate-slug-vs-chelsea-2026-11-06";
      writeJson("matches.json", matchesData);
      updateHashInIndex("matches.json");
    },
    ({ relSampleDir }) => {
      const res = runHugo({ relSampleDir });
      if (!res.success) {
        pass(
          "Build correctly failed when entity slug diverged from expected map key / deep link",
        );
      } else {
        fail("Build should have failed for diverged slug");
      }

      const output = res.output;
      if (
        output.includes("slug mismatch") ||
        output.includes("slug does not match map key")
      ) {
        pass("Error output identifies slug map collision/mismatch");
      } else {
        fail("Error output did not identify slug collision/mismatch", output);
      }
    },
  );

  // =========================================================================
  // Temporary Directories Cleanup Verification
  // =========================================================================
  section("Cleanup Verification");
  cleanupAllTempDirs();

  const remainingTmpDirs = fs.existsSync(CFC_DATA_DIR)
    ? fs
        .readdirSync(CFC_DATA_DIR)
        .filter((f) => f.startsWith("tmp-test-") || f.startsWith("tmp-fail-"))
    : [];

  if (remainingTmpDirs.length === 0) {
    pass(
      "All temporary test directories cleanly removed from assets/cfc-data/",
    );
  } else {
    fail(
      `Lingering temporary directories found in assets/cfc-data/: ${remainingTmpDirs.join(", ")}`,
    );
  }

  if (!fs.existsSync(TEMP_BUILD_DIR)) {
    pass("Temporary build destination directory cleanly removed");
  } else {
    fail(`Temporary build directory ${TEMP_BUILD_DIR} was not removed`);
  }
} finally {
  cleanupAllTempDirs();
}

// =========================================================================
// Summary & Exit Code
// =========================================================================
console.log("\n=============================================================");
console.log(
  `Results: ${passedChecks} passed, ${failedChecks} failed (Total: ${totalChecks})`,
);
console.log("=============================================================");

if (failedChecks > 0) {
  console.error("\n❌ FAILURE SUMMARY:");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log("\n🎉 ALL DATA FAILURE TEST SCENARIOS PASSED SUCCESSFULLY!\n");
  process.exit(0);
}
