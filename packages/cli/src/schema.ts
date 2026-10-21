import { readFile } from "node:fs/promises";

import { CliError } from "./errors";

// Reads the shared zod request schemas just enough to turn command-line flags
// into a request body: which fields there are, what type each takes, and the
// description the API reference shows for it.

type SchemaDef = { type: string; innerType?: unknown; in?: unknown; shape?: Record<string, unknown>; element?: unknown; entries?: Record<string, unknown>; values?: unknown[]; options?: unknown[] };

export type FieldKind = "string" | "number" | "boolean" | "array" | "object";
export type Field = { name: string; kind: FieldKind; element?: FieldKind; optional: boolean; nullable: boolean; description?: string; choices?: string[] };

function defOf(schema: unknown): SchemaDef {
  return (schema as { _zod: { def: SchemaDef } })._zod.def;
}

function descriptionOf(schema: unknown): string | undefined {
  const description = (schema as { description?: unknown }).description;
  return typeof description === "string" ? description : undefined;
}

/** Strips optional, nullable, default and similar wrappers, noting what they said. */
function unwrap(schema: unknown): { schema: unknown; optional: boolean; nullable: boolean; description?: string } {
  let optional = false;
  let nullable = false;
  let description = descriptionOf(schema);
  let current = schema;
  for (;;) {
    const def = defOf(current);
    if (def.type === "optional" || def.type === "default" || def.type === "prefault") optional = true;
    else if (def.type === "nullable") nullable = true;
    else if (def.type !== "readonly" && def.type !== "pipe") break;
    current = def.type === "pipe" ? def.in : def.innerType;
    description ??= descriptionOf(current);
  }
  return { schema: current, optional, nullable, ...(description ? { description } : {}) };
}

function kindOf(schema: unknown): { kind: FieldKind; choices?: string[] } {
  const def = defOf(schema);
  switch (def.type) {
    case "string":
      return { kind: "string" };
    case "number":
    case "int":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "enum":
      return { kind: "string", choices: Object.values(def.entries ?? {}).map(String) };
    case "literal":
      return { kind: "string", choices: (def.values ?? []).map(String) };
    case "array":
      return { kind: "array" };
    default:
      return { kind: "object" };
  }
}

/**
 * The top-level fields of a request schema, or null when it isn't one object.
 * For a union such as a knowledge entry's text or FAQ, `fixed` picks the
 * option whose literal fields match, as { type: "faq" } does.
 */
export function objectFields(schema: unknown, fixed: Record<string, unknown> = {}): Field[] | null {
  let def = defOf(unwrap(schema).schema);
  if (def.type === "union") {
    const option = (def.options ?? []).find((candidate) => {
      const shape = defOf(candidate).shape ?? {};
      return Object.entries(fixed).every(([name, value]) => (defOf(unwrap(shape[name]).schema).values ?? []).includes(value));
    });
    if (!option) return null;
    def = defOf(option);
  }
  if (def.type !== "object" || !def.shape) return null;
  return Object.entries(def.shape).map(([name, field]) => {
    const inner = unwrap(field);
    const { kind, choices } = kindOf(inner.schema);
    const element = kind === "array" ? kindOf(unwrap(defOf(inner.schema).element).schema).kind : undefined;
    return { name, kind, optional: inner.optional, nullable: inner.nullable, ...(element ? { element } : {}), ...(inner.description ? { description: inner.description } : {}), ...(choices?.length ? { choices } : {}) };
  });
}

/** A field's command-line flag: --staff-ids for staff_ids. */
export function flagName(field: string): string {
  return field.replace(/_/g, "-");
}

/** JSON given inline, or read from a file with @path. */
export async function jsonArgument(raw: string, flag: string): Promise<unknown> {
  let text = raw;
  if (raw.startsWith("@")) {
    try {
      text = await readFile(raw.slice(1), "utf8");
    } catch (error) {
      throw new CliError(`--${flag} couldn't read ${raw.slice(1)}: ${(error as Error).message}`);
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError(`--${flag} takes JSON, or @file with JSON in it.`);
  }
}

function numberValue(raw: string, flag: string): number {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) throw new CliError(`--${flag} takes a number.`);
  return value;
}

/**
 * A flag's value as the field takes it. "null" clears a field that can be
 * null, a list takes repeated flags or commas and "none" for an empty list,
 * and an object takes JSON or @file.
 */
export async function fieldValue(field: Field, raw: string | boolean | string[], flag = flagName(field.name)): Promise<unknown> {
  if (typeof raw === "boolean") return raw;
  if (field.kind === "array" && field.element === "object") {
    // Each value is JSON for one item or a list of them, so commas belong to the JSON.
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length === 1 && values[0]!.trim() === "none") return [];
    const items: unknown[] = [];
    for (const value of values) {
      const parsed = await jsonArgument(value, flag);
      if (Array.isArray(parsed)) items.push(...parsed);
      else items.push(parsed);
    }
    return items;
  }
  if (field.kind === "array") {
    const items = (Array.isArray(raw) ? raw : [raw]).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    if (items.length === 1 && items[0] === "none") return [];
    if (field.nullable && items.length === 1 && items[0] === "null") return null;
    return field.element === "number" ? items.map((item) => numberValue(item, flag)) : items;
  }
  const value = Array.isArray(raw) ? raw.at(-1)! : raw;
  if (field.nullable && value === "null") return null;
  if (field.kind === "number") return numberValue(value, flag);
  if (field.kind === "boolean") {
    if (value !== "true" && value !== "false") throw new CliError(`--${flag} takes true or false.`);
    return value === "true";
  }
  if (field.kind === "object") return await jsonArgument(value, flag);
  return value;
}
