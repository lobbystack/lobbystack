import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { apiComponentSchemas, runtimeLocales } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { fieldValue, flagName, objectFields, type Field } from "./schema";
import { tempDir } from "./testing";

describe("request schemas as flags", () => {
  it("reads each field's type, whether it can be left out or null, and its description", () => {
    const fields = objectFields(apiComponentSchemas.BusinessUpdate)!;
    expect(fields.map((field) => field.name)).toEqual(["name", "timezone", "locale", "website_url", "business_type", "hours"]);
    expect(fields.find((field) => field.name === "locale")).toMatchObject({ kind: "string", optional: true, choices: [...runtimeLocales] });
    expect(fields.find((field) => field.name === "website_url")).toMatchObject({ kind: "string", optional: true, nullable: true });
    expect(fields.find((field) => field.name === "hours")).toMatchObject({ kind: "array", element: "object", description: expect.stringContaining("Replaces the whole week") });
    expect(objectFields(apiComponentSchemas.ServiceCreate)!.find((field) => field.name === "duration_minutes")).toMatchObject({ kind: "number", optional: false });
    expect(objectFields(apiComponentSchemas.BillingUpdate)).toEqual([expect.objectContaining({ name: "spending_cap_cents", kind: "number", nullable: true })]);
  });

  it("picks the option of a union that the fixed values name", () => {
    expect(objectFields(apiComponentSchemas.KnowledgeEntryCreate, { type: "faq" })!.map((field) => field.name)).toEqual(["type", "question", "answer"]);
    expect(objectFields(apiComponentSchemas.KnowledgeEntryCreate, { type: "text" })!.map((field) => field.name)).toEqual(["type", "title", "content"]);
    expect(objectFields(apiComponentSchemas.KnowledgeEntryCreate, { type: "video" })).toBeNull();
    expect(flagName("staff_ids")).toBe("staff-ids");
  });

  it("turns flag values into what each field takes", async () => {
    const field = (kind: Field["kind"], extra: Partial<Field> = {}): Field => ({ name: "value", kind, optional: true, nullable: false, ...extra });
    expect(await fieldValue(field("number"), "30")).toBe(30);
    await expect(fieldValue(field("number"), "thirty")).rejects.toThrow("--value takes a number.");
    expect(await fieldValue(field("boolean"), false)).toBe(false);
    expect(await fieldValue(field("boolean"), "true")).toBe(true);
    expect(await fieldValue(field("array", { element: "string" }), ["a,b", "c"])).toEqual(["a", "b", "c"]);
    expect(await fieldValue(field("array", { element: "string" }), ["none"])).toEqual([]);
    expect(await fieldValue(field("array", { element: "number" }), "1,2")).toEqual([1, 2]);
    expect(await fieldValue(field("number", { nullable: true }), "null")).toBeNull();
    expect(await fieldValue(field("string"), "null")).toBe("null");
    expect(await fieldValue(field("object"), "{\"color\":\"#112233\"}")).toEqual({ color: "#112233" });
    const dir = await tempDir();
    try {
      await writeFile(join(dir.path, "config.json"), "{\"position\":\"bottom-left\"}");
      expect(await fieldValue(field("object"), `@${join(dir.path, "config.json")}`)).toEqual({ position: "bottom-left" });
      await expect(fieldValue(field("object"), `@${join(dir.path, "missing.json")}`)).rejects.toThrow("--value couldn't read");
      await expect(fieldValue(field("object"), "{oops")).rejects.toThrow("--value takes JSON");
    } finally {
      await dir.remove();
    }
  });
});
