import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LEGACY_BASELINE_MIGRATIONS,
  RAW_MIGRATIONS,
  ROLE_MIGRATION,
  SCHEMA_MIGRATIONS,
} from "./raw-migrations";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));

describe("raw migration manifest", () => {
  const filesOnDisk = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  it("lists every hand-written migration file exactly once", () => {
    expect([...RAW_MIGRATIONS].sort()).toEqual(filesOnDisk);
  });

  it("keeps the role migration first and schema migrations ordered without duplicates", () => {
    expect(RAW_MIGRATIONS[0]).toBe(ROLE_MIGRATION);
    expect([...SCHEMA_MIGRATIONS]).toEqual([...SCHEMA_MIGRATIONS].sort());
    expect(new Set(RAW_MIGRATIONS).size).toBe(RAW_MIGRATIONS.length);
  });

  it("keeps the pre-journal baseline fixed at migration 0052", () => {
    expect(LEGACY_BASELINE_MIGRATIONS.at(-1)).toBe(
      "0052_calendar_sync_freshness.sql",
    );
    expect(LEGACY_BASELINE_MIGRATIONS).not.toContain(
      "0053_legacy_email_verified_backfill.sql",
    );
  });
});
