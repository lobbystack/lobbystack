import { describe, expect, it, vi } from "vitest";

// The script needs no database, and the workspace packages may not be built yet.
vi.mock("@lobbystack/db", async () => ({ ...(await import("../packages/db/src/schema/index")), withBusinessTransaction: vi.fn() }));
vi.mock("@lobbystack/shared", async () => await import("../packages/shared/src/index"));

import { generatePlatformKey, parsePlatformKeys, resolveConfiguredPlatformKey } from "../packages/domain/src/server/publicApi/platformKeys";
import { createPlatformKey } from "./platform-key";

const required = ["--name", "Acme CLI", "--group", "acme", "--owner-email", "ops@acme.example"];

describe("pnpm platform-key:create", () => {
  it("names the key's group in group, with group access unless told otherwise", () => {
    const command = createPlatformKey(required, "");
    if (command.kind !== "key") throw new Error("expected a key");
    expect(command.entry).toMatchObject({ name: "Acme CLI", group: "acme", owner_email: "ops@acme.example", access: "group" });
    expect(command.entry).not.toHaveProperty("partner");
    expect(command.existing).toEqual([]);
    expect(resolveConfiguredPlatformKey(command.key, { PLATFORM_API_KEYS: JSON.stringify([command.entry]) })).toMatchObject({ group: "acme", access: "group" });

    const all = createPlatformKey([...required, "--access", "all"], "");
    expect(all.kind === "key" && all.entry.access).toBe("all");
  });

  it("refuses the old partner flag and access value", () => {
    expect(() => createPlatformKey(["--name", "Acme CLI", "--partner", "acme", "--owner-email", "ops@acme.example"], "")).toThrow(/--partner/);
    expect(() => createPlatformKey([...required, "--access", "partner"], "")).toThrow("--access must be group or all.");
  });

  it("prints the current entries unchanged next to the new one, including one that still says partner", () => {
    const { group: _group, ...rest } = generatePlatformKey({ name: "Old", group: "acme", ownerEmail: "ops@acme.example" }).entry;
    const legacy = { ...rest, partner: "acme", access: "partner" };
    const existingRaw = JSON.stringify([legacy]);
    const command = createPlatformKey(required, existingRaw);
    if (command.kind !== "key") throw new Error("expected a key");
    expect(command.existing).toEqual([legacy]);
    const printed = JSON.stringify([...command.existing, command.entry]);
    expect(parsePlatformKeys(printed).map((key) => [key.name, key.group, key.access])).toEqual([["Old", "acme", "group"], ["Acme CLI", "acme", "group"]]);
  });

  it("never extends a PLATFORM_API_KEYS it can't read", () => {
    expect(() => createPlatformKey(required, "[{\"id\": \"nope\"}]")).toThrow(/PLATFORM_API_KEYS entry 0 is invalid/);
  });

  it("asks for usage when a required option is missing", () => {
    expect(createPlatformKey(["--name", "Acme CLI", "--owner-email", "ops@acme.example"], "")).toEqual({ kind: "usage", exitCode: 1 });
    expect(createPlatformKey(["--help"], "")).toEqual({ kind: "usage", exitCode: 0 });
  });
});
