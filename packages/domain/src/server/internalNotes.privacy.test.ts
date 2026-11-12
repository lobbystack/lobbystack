import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "dist" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// Internal notes are written by the team for the team. Only the dashboard's booking path and its reads may touch
// them: never the agent, its snapshot, calls, texts and emails, webhooks, the public API, MCP or telemetry.
const ALLOWED = new Set([
  "packages/db/src/schema/index.ts",
  "packages/domain/src/server/booking.ts",
  "packages/domain/src/server/agentActions.ts",
  "packages/domain/src/server/operatorBookings.ts",
  "packages/domain/src/server/operatorActivity.ts",
]);

describe("internal appointment notes", () => {
  it("are read only by the dashboard's booking and listing code", () => {
    const readers = ["packages/domain/src", "packages/agent-core/src", "packages/providers/src", "packages/shared/src", "packages/telemetry/src", "packages/db/src", "apps/worker/src"]
      .flatMap((directory) => sources(join(repo, directory)))
      .filter((path) => /internalNotes|internal_notes/.test(readFileSync(path, "utf8")))
      .map((path) => relative(repo, path));
    expect(readers.filter((path) => !ALLOWED.has(path))).toEqual([]);
  });

  it("reach bookForCaller only from the operator's dashboard booking", () => {
    const callers = sources(join(repo, "packages/domain/src")).filter((path) => /internalNotes:\s*input\.internalNotes|\binternalNotes\b.*bookForCaller/.test(readFileSync(path, "utf8"))).map((path) => relative(repo, path));
    expect(callers.every((path) => ALLOWED.has(path))).toBe(true);
    // The agent's tools never pass internal notes.
    expect(readFileSync(join(repo, "packages/agent-core/src/tools.ts"), "utf8")).not.toMatch(/internalNotes/);
  });
});
