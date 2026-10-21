import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  concurrentIndexName,
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

  it("clears expired call summaries only for calls without transcripts, and a conversation's only while it holds that text", () => {
    const backfill = readFileSync(`${migrationsDirectory}/0099_clear_expired_call_summaries.sql`, "utf8");
    expect(backfill).toContain("NOT EXISTS (SELECT 1 FROM public.transcripts t WHERE t.call_id = s.call_id)");
    expect(backfill).toContain("AND conv.summary = e.summary_text");
  });

  it("adds the message sender's foreign key without reading every message under a lock, then indexes and validates it", () => {
    const column = readFileSync(`${migrationsDirectory}/0110_widget_live_chat.sql`, "utf8");
    expect(column).toContain("ADD COLUMN IF NOT EXISTS sent_by_user_id uuid;");
    expect(column).toContain("FOREIGN KEY (sent_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL NOT VALID");
    expect(concurrentIndexName(readFileSync(`${migrationsDirectory}/0119_messages_sent_by_user_index.sql`, "utf8"))).toBe("messages_sent_by_user_idx");
    expect(readFileSync(`${migrationsDirectory}/0120_validate_messages_sent_by_user.sql`, "utf8")).toContain("VALIDATE CONSTRAINT messages_sent_by_user_id_fkey");
    expect(SCHEMA_MIGRATIONS.indexOf("0119_messages_sent_by_user_index.sql")).toBeLessThan(SCHEMA_MIGRATIONS.indexOf("0120_validate_messages_sent_by_user.sql"));
  });

  it("recognizes only validated concurrent-index migration directives", () => {
    expect(concurrentIndexName("-- lobbystack:concurrent-index product_events_business_sent_idx\nCREATE INDEX CONCURRENTLY ..."))
      .toBe("product_events_business_sent_idx");
    expect(concurrentIndexName("-- lobbystack:concurrent-index product-events;drop table users"))
      .toBeUndefined();
  });
});
