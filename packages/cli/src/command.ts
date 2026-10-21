import { isUuid, type ApiOperationId } from "@lobbystack/shared";

import type { Client } from "./client";
import type { Connection } from "./config";
import { CliError, type ExitCode } from "./errors";
import type { Output } from "./output";

/** What the command runs with. bin.ts passes the real process; tests pass fakes. */
export type Io = {
  argv: string[];
  env: NodeJS.ProcessEnv;
  out(text: string): void;
  err(text: string): void;
  readStdin?(): Promise<string>;
  /** Asks a yes or no question in a terminal. Left out, or false, when nobody can answer. */
  confirm?(question: string): Promise<boolean>;
  fetch?: typeof fetch;
  sleep?(milliseconds: number): Promise<void>;
};

export type Values = Record<string, string | boolean | string[] | undefined>;
/** A flag: its parseArgs type, plus what help shows for it. */
export type Option = { type: "string" | "boolean"; multiple?: boolean; short?: string; placeholder?: string; description?: string };
export type Options = Record<string, Option>;

export type CommandContext = {
  io: Io;
  output: Output;
  values: Values;
  positionals: string[];
  configPath: string;
  /** The saved or overridden connection, and a client for it. */
  connect(): Promise<{ client: Client; connection: Connection }>;
};

export type Command = {
  summary: string;
  usage: string;
  /** The positionals' help, in order. */
  arguments?: ReadonlyArray<{ name: string; description: string }>;
  options?: Options;
  /** More about the command, which help shows after its flags. */
  notes?: string;
  /** The API operations it calls, so a test can check every endpoint has a command. */
  operations?: readonly ApiOperationId[];
  /** Returns an exit code only when it isn't 0. */
  run(context: CommandContext): Promise<ExitCode | void>;
};

export type Group = { summary: string; commands: Record<string, Command> };

export function stringValue(values: Values, name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

export function businessId(value: string | undefined): string | undefined {
  if (value !== undefined && !isUuid(value)) throw new CliError("--business must be a business id, a UUID such as 5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f.");
  return value;
}

/** The flags every command takes. */
export const globalOptions: Options = {
  profile: { type: "string", placeholder: "<name>", description: "Use this saved profile instead of the one in use." },
  business: { type: "string", placeholder: "<id>", description: "Act on this business. A platform key needs one for most commands." },
  json: { type: "boolean", description: "Print JSON, for scripts." },
  help: { type: "boolean", short: "h", description: "Show this help." },
};

function rows(entries: ReadonlyArray<readonly [string, string]>): string {
  const width = Math.min(Math.max(...entries.map(([label]) => label.length)), 34);
  return entries.map(([label, description]) => `  ${label.padEnd(width)}  ${description}`.trimEnd()).join("\n");
}

function optionRows(options: Options): string {
  return rows(Object.entries(options).map(([name, option]) => [option.type === "boolean" ? `--${name}` : `--${name} ${option.placeholder ?? "<value>"}`, option.description ?? ""] as const));
}

/** A command's help: what it does, how to call it, its arguments and its flags, then the flags every command takes. */
export function commandHelp(command: Command): string {
  const sections = [command.summary, `Usage: ${command.usage}`];
  if (command.arguments?.length) sections.push(`Arguments:\n${rows(command.arguments.map((argument) => [`<${argument.name}>`, argument.description] as const))}`);
  if (Object.keys(command.options ?? {}).length) sections.push(`Options:\n${optionRows(command.options!)}`);
  if (command.notes) sections.push(command.notes);
  sections.push(`Options for every command:\n${optionRows(globalOptions)}`);
  return sections.join("\n\n");
}
