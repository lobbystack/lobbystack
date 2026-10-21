import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { apiComponentSchemas, apiOperations, type ApiOperation, type ApiOperationId } from "@lobbystack/shared";

import type { Client } from "./client";
import { globalOptions, type Command, type CommandContext, type Options } from "./command";
import { CliError, exitCodes } from "./errors";
import { formatFields, formatTable, print } from "./output";
import { fieldValue, flagName, jsonArgument, objectFields, type Field } from "./schema";

// One command per v1 operation. A spec names the operation and what the
// command adds on top; the path's values, the body's fields, the query
// parameters, pagination and the Idempotency-Key all come from the registry.

export type Column = { key: string; label: string };
export type Row = Record<string, unknown>;

/** Polls an operation for the same id until the work is done; failed says why it didn't work out, if it didn't. */
export type WaitSpec = { operation: ApiOperationId; param: string; done(data: Row): boolean; failed(data: Row): string | undefined };

export type OperationSpec = {
  operation: ApiOperationId;
  /** Defaults to the operation's summary in the API reference. */
  summary?: string;
  /** Body fields taken from positionals, after the path's values. "...name" takes the rest as a list. */
  args?: string[];
  /** Body values the command always sends, such as { type: "website" }. */
  fixed?: Record<string, unknown>;
  /** Text fields that can also come from a file, as --content-file for content. */
  files?: string[];
  columns?: Column[];
  /** How people see one answer. Defaults to one line per field. */
  show?(data: Row): string;
  /** With --wait, follows the work the call started until it's done. */
  wait?: WaitSpec;
};

const PAGE_LIMIT = 1_000;
const WAIT_LIMIT_MS = 10 * 60_000;
const WAIT_INTERVAL_MS = 3_000;

/** "phone_number" as "Phone number". */
export function label(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isScalar(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** The columns a list shows when its command names none: the first few plain fields, the telling ones first. */
export function defaultColumns(rows: readonly Row[]): Column[] {
  const preferred = ["id", "name", "title", "label", "email", "phone_number", "url", "role", "status", "type", "active", "created_at"];
  const first = rows[0] ?? {};
  const keys = Object.keys(first).filter((key) => isScalar(first[key]) || (Array.isArray(first[key]) && (first[key] as unknown[]).every(isScalar)));
  return [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key))].slice(0, 6).map((key) => ({ key, label: label(key) }));
}

export function showRecord(data: Row): string {
  if (data.deleted === true && typeof data.id === "string" && Object.keys(data).length === 2) return `Deleted ${data.id}.`;
  return formatFields(Object.entries(data).map(([key, value]) => [label(key), value] as const));
}

function pathNames(operation: ApiOperation): string[] {
  return [...operation.path.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]!);
}

function describeFlag(field: Field): string {
  const required = field.optional ? "" : "Required. ";
  const choices = field.choices?.length && field.choices.length <= 8 ? ` One of: ${field.choices.join(", ")}.` : "";
  const list = field.kind !== "array" ? "" : field.element === "object" ? " JSON for one item or a JSON list; repeat the flag for more." : " Repeat the flag or separate with commas; none sends an empty list.";
  const json = field.kind === "object" ? " JSON, or @file with JSON in it." : "";
  const clear = field.nullable ? " null clears it." : "";
  return `${required}${field.description ?? ""}${choices}${list}${json}${clear}`.trim();
}

/** Every page of a list, following next_cursor. A cursor seen twice, or more than PAGE_LIMIT pages, is an error rather than a partial list. */
export async function listAll(fetchPage: (cursor: string | undefined) => Promise<{ data: unknown; next_cursor?: string | null; has_more?: boolean }>): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pages = 0; ; pages += 1) {
    if (pages >= PAGE_LIMIT) throw new CliError(`Stopped after ${PAGE_LIMIT} pages. Narrow the list, or page through it with --cursor.`, exitCodes.failed);
    const page = await fetchPage(cursor);
    rows.push(...(page.data as Row[]));
    if (!page.has_more || !page.next_cursor) return rows;
    if (seen.has(page.next_cursor)) throw new CliError("The API sent the same next_cursor twice, so the list would never end. Page through it with --cursor instead.", exitCodes.failed);
    seen.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

/** Polls until the work is done, every few seconds for up to ten minutes. */
export async function waitUntilDone(client: Client, wait: WaitSpec, first: Row, sleep: (milliseconds: number) => Promise<void>): Promise<Row> {
  const started = Date.now();
  let current = first;
  while (!wait.done(current)) {
    if (Date.now() - started > WAIT_LIMIT_MS) throw new CliError(`It still isn't done after ${WAIT_LIMIT_MS / 60_000} minutes. Check again later; its id is ${String(current.id)}.`, exitCodes.failed);
    await sleep(WAIT_INTERVAL_MS);
    current = (await client.call(wait.operation as never, { params: { [wait.param]: String(current.id) } } as never) as unknown as { data: Row }).data;
  }
  return current;
}

export function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The command for one operation. */
export function operationCommand(path: string, spec: OperationSpec): Command {
  const operation: ApiOperation = apiOperations[spec.operation];
  const names = pathNames(operation);
  const schema = operation.request ? (apiComponentSchemas as Record<string, unknown>)[operation.request] : undefined;
  const fields = schema ? objectFields(schema, spec.fixed) : [];
  if (!fields) throw new Error(`${path}: ${operation.request} isn't one object; name its kind in fixed.`);
  const byName = new Map(fields.map((field) => [field.name, field]));
  const args = (spec.args ?? []).map((name) => ({ name: name.replace(/^\.\.\./, ""), rest: name.startsWith("...") }));
  for (const arg of args) if (!byName.has(arg.name)) throw new Error(`${path}: ${operation.request ?? "the operation"} has no ${arg.name} field.`);
  const flagFields = fields.filter((field) => !args.some((arg) => arg.name === field.name) && !(spec.fixed && field.name in spec.fixed));
  const paginated = (operation.params ?? []).some((param) => param.name === "cursor");
  const queryParams = (operation.params ?? []).filter((param) => param.in === "query" && !(paginated && (param.name === "limit" || param.name === "cursor")));
  const takesBody = Boolean(operation.request);

  // The flags the engine adds to this command, which no field may shadow, any more than the global ones.
  const engineFlags = new Set([...(paginated ? ["limit", "cursor", "all"] : []), ...(takesBody ? ["data"] : []), ...(operation.idempotent ? ["idempotency-key"] : []), ...(spec.wait ? ["wait"] : [])]);
  const options: Options = {};
  const define = (flag: string, option: Options[string]) => {
    if (flag in options || flag in globalOptions || engineFlags.has(flag)) throw new Error(`${path}: --${flag} is defined twice.`);
    options[flag] = option;
  };
  for (const field of flagFields) {
    const flag = flagName(field.name);
    define(flag, field.kind === "boolean"
      ? { type: "boolean", description: `${describeFlag(field)} --no-${flag} sends false.`.trim() }
      : { type: "string", ...(field.kind === "array" ? { multiple: true } : {}), placeholder: field.kind === "object" || field.element === "object" ? "<json>" : field.kind === "number" || field.element === "number" ? "<number>" : "<value>", description: describeFlag(field) });
    if (spec.files?.includes(field.name)) define(`${flag}-file`, { type: "string", placeholder: "<path>", description: `Read ${flag} from this file.` });
  }
  for (const param of queryParams) {
    define(flagName(param.name), param.schema.type === "boolean" ? { type: "boolean", description: param.description } : { type: "string", placeholder: `<${String(param.schema.format ?? param.schema.type ?? "value")}>`, description: param.description });
  }
  if (paginated) {
    options.limit = { type: "string", placeholder: "<number>", description: "Items per page." };
    options.cursor = { type: "string", placeholder: "<cursor>", description: "The next_cursor from the page before." };
    options.all = { type: "boolean", description: "Follow next_cursor and show every page." };
  }
  if (takesBody) options.data = { type: "string", placeholder: "<json>", description: "The whole request body as JSON, or @file with JSON in it. Flags change the fields they name." };
  if (operation.idempotent) options["idempotency-key"] = { type: "string", placeholder: "<key>", description: "Makes a retry safe: the same key returns the first answer instead of doing it again. One is made up when left out." };
  if (spec.wait) options.wait = { type: "boolean", description: "Wait until the work finishes, checking every few seconds. A failure exits with 1." };

  const positional = [...names.map((name) => `<${name}>`), ...args.map((arg) => (arg.rest ? `<${arg.name}...>` : `<${arg.name}>`))].join(" ");
  const usage = `lobbystack ${path}${positional ? ` ${positional}` : ""}${Object.keys(options).length ? " [options]" : ""}`;
  const argumentHelp = [
    ...names.map((name) => ({ name, description: (operation.params ?? []).find((param) => param.name === name)?.description ?? "" })),
    ...args.map((arg) => ({ name: arg.rest ? `${arg.name}...` : arg.name, description: `${describeFlag(byName.get(arg.name)!)}`.replace(/^Required\. /, "") })),
  ];

  return {
    summary: spec.summary ?? operation.summary,
    usage,
    arguments: argumentHelp,
    options,
    operations: [spec.operation, ...(spec.wait ? [spec.wait.operation] : [])],
    async run(context) {
      const { values, positionals } = context;
      const fixedCount = names.length + args.filter((arg) => !arg.rest).length;
      if (positionals.length < fixedCount || (args.some((arg) => arg.rest) && positionals.length === fixedCount)) {
        const missing = [...names, ...args.map((arg) => arg.name)][positionals.length] ?? args.at(-1)?.name;
        throw new CliError(`Missing <${missing}>.\nUsage: ${usage}`);
      }
      if (!args.some((arg) => arg.rest) && positionals.length > fixedCount) throw new CliError(`Too many arguments: ${positionals.slice(fixedCount).join(" ")}\nUsage: ${usage}`);

      const params = Object.fromEntries(names.map((name, index) => [name, positionals[index]!]));
      const body: Row = {};
      if (takesBody) {
        if (typeof values.data === "string") {
          const data = await jsonArgument(values.data, "data");
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new CliError("--data takes a JSON object.");
          Object.assign(body, data);
        }
        Object.assign(body, spec.fixed);
        let index = names.length;
        for (const arg of args) {
          const field = byName.get(arg.name)!;
          body[arg.name] = await fieldValue(field, arg.rest ? positionals.slice(index) : positionals[index]!, arg.name);
          index += 1;
        }
        for (const field of flagFields) {
          const flag = flagName(field.name);
          const file = spec.files?.includes(field.name) ? values[`${flag}-file`] : undefined;
          if (typeof file === "string") body[field.name] = await readFile(file, "utf8").catch((error: Error) => { throw new CliError(`--${flag}-file couldn't read ${file}: ${error.message}`); });
          const raw = values[flag];
          if (raw !== undefined) body[field.name] = await fieldValue(field, raw, flag);
        }
      }
      const query: Record<string, string> = {};
      for (const param of queryParams) {
        const raw = values[flagName(param.name)];
        if (raw !== undefined) query[param.name] = String(raw);
      }
      if (paginated && typeof values.limit === "string") query.limit = values.limit;
      if (paginated && typeof values.cursor === "string") query.cursor = values.cursor;
      // Any operation that takes a key gets one, so a retry after a timeout can't do the work twice.
      const typedKey = typeof values["idempotency-key"] === "string" ? values["idempotency-key"] : undefined;
      const madeUpKey = !typedKey && operation.idempotent ? randomUUID() : undefined;
      const idempotencyKey = typedKey ?? madeUpKey;

      const { client } = await context.connect();
      const call = async (callQuery: Record<string, string>) => await client.call(spec.operation as never, {
        ...(names.length ? { params } : {}),
        ...(takesBody ? { body } : {}),
        ...(Object.keys(callQuery).length ? { query: callQuery } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      } as never) as { data: unknown; next_cursor?: string | null; has_more?: boolean };

      let data: Row;
      try {
        if (operation.list) {
          if (values.all === true) {
            const rows = await listAll(async (cursor) => await call(cursor ? { ...query, cursor } : query));
            print(context.output, { data: rows, next_cursor: null, has_more: false }, () => formatTable(rows, spec.columns ?? defaultColumns(rows)));
            return;
          }
          const page = await call(query);
          const rows = page.data as Row[];
          print(context.output, page, () => `${formatTable(rows, spec.columns ?? defaultColumns(rows))}${page.has_more && page.next_cursor ? `\n\nMore with --cursor ${page.next_cursor}, or --all.` : ""}`);
          return;
        }
        data = (await call(query)).data as Row;
        if (spec.wait && values.wait === true) data = await waitUntilDone(client, spec.wait, data, context.io.sleep ?? defaultSleep);
      } catch (error) {
        // The call may have worked before the failure: the same key makes the retry return it instead of doing it again.
        if (madeUpKey && error instanceof CliError && error.exitCode === exitCodes.failed) {
          error.idempotencyKey = madeUpKey;
          error.message = `${error.message}\nTo retry without doing it twice, run the same command with --idempotency-key ${madeUpKey}.`;
        }
        throw error;
      }
      print(context.output, data, () => (spec.show ?? showRecord)(data));
      // The work itself failed, such as a claim the carrier refused: the record above says why, and scripts see exit code 1.
      const failure = spec.wait && values.wait === true ? spec.wait.failed(data) : undefined;
      if (failure) throw new CliError(failure, exitCodes.failed);
    },
  };
}
