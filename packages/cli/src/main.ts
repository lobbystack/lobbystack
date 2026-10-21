import { parseArgs } from "node:util";

import { login, logout, profiles, whoami } from "./account";
import { createClient } from "./client";
import { businessId, commandHelp, globalOptions, stringValue, type Command, type Group, type Io, type Options, type Values } from "./command";
import { groups } from "./commands";
import { configPath, readConfig, resolveConnection } from "./config";
import { onboard } from "./onboard";
import { ApiError, CliError, exitCodes, type ExitCode } from "./errors";
import type { Output } from "./output";
import { userAgent, version } from "./version";

export type { Io } from "./command";

const accountCommands: Record<string, Command> = { login, logout, whoami, profiles, onboard };

function list(entries: ReadonlyArray<readonly [string, string]>): string[] {
  const width = Math.max(...entries.map(([name]) => name.length));
  return entries.map(([name, summary]) => `  ${name.padEnd(width)}  ${summary}`);
}

function helpText(): string {
  return [
    "Usage: lobbystack <command> [options]",
    "       lobbystack <group> <command> [options]",
    "",
    "Getting started:",
    ...list(Object.entries(accountCommands).map(([name, command]) => [name, command.summary] as const)),
    "",
    "Groups (run lobbystack <group> to see its commands):",
    ...list(Object.entries(groups).map(([name, group]) => [name, group.summary] as const)),
    "",
    "Options for every command:",
    "  --profile <name>  Use this saved profile instead of the one in use.",
    "  --business <id>   Act on this business. A platform key needs one for most commands.",
    "  --json            Print JSON, for scripts.",
    "  -h, --help        Show help for a command.",
    "",
    "LOBBYSTACK_URL with LOBBYSTACK_API_KEY take the place of a profile, and LOBBYSTACK_BUSINESS picks the business.",
    "",
    "Exit codes: 0 done. 1 LobbyStack or the network failed, or a rate limit: try again later.",
    "2 the command or its input is wrong. 3 the API key is missing or invalid, or isn't allowed to do this.",
    "4 not finished: the rest waits on someone else, such as a payment. Run it again once they're done.",
  ].join("\n");
}

function groupHelp(name: string, group: Group): string {
  return [`${group.summary}`, "", `Usage: lobbystack ${name} <command> [options]`, "", "Commands:", ...list(Object.entries(group.commands).map(([command, entry]) => [command, entry.summary] as const)), "", `Run lobbystack ${name} <command> --help for a command's options.`].join("\n");
}

function reportError(io: Io, json: boolean, error: CliError): void {
  const details = error instanceof ApiError ? error.details : [];
  if (json) {
    io.err(JSON.stringify({ error: { message: error.message, exit_code: error.exitCode, ...(error instanceof ApiError ? { status: error.status, code: error.code, details } : {}), ...(error.idempotencyKey ? { idempotency_key: error.idempotencyKey } : {}) } }, null, 2));
    return;
  }
  io.err([error.message, ...details.map((detail) => `  ${detail.path}: ${detail.message}`)].join("\n"));
}

/** The command the arguments name, and what follows its name, or text to print instead. */
function findCommand(argv: readonly string[]): { command: Command; rest: string[] } | { text: string } {
  const [first, ...afterFirst] = argv;
  if (first === undefined || first === "help" || first === "--help" || first === "-h") return { text: helpText() };
  if (first === "--version") return { text: version };
  const account = accountCommands[first];
  if (account) return { command: account, rest: afterFirst };
  const group = groups[first];
  if (!group) throw new CliError(`There's no ${first} command. Run lobbystack help to see them.`);
  const [name, ...afterName] = afterFirst;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") return { text: groupHelp(first, group) };
  const command = group.commands[name];
  if (!command) throw new CliError(`There's no ${first} ${name} command.\n\n${groupHelp(first, group)}`);
  return { command, rest: afterName };
}

function parseOptions(options: Options): Record<string, { type: "string" | "boolean"; multiple?: boolean; short?: string }> {
  return Object.fromEntries(Object.entries(options).map(([name, option]) => [name, { type: option.type, ...(option.multiple ? { multiple: true } : {}), ...(option.short ? { short: option.short } : {}) }]));
}

export async function main(io: Io): Promise<ExitCode> {
  const json = io.argv.includes("--json");
  try {
    const found = findCommand(io.argv);
    if ("text" in found) {
      io.out(found.text);
      return exitCodes.ok;
    }
    const { command, rest } = found;
    let parsed: { values: Values; positionals: string[] };
    try {
      parsed = parseArgs({ args: rest, options: parseOptions({ ...globalOptions, ...command.options }), allowPositionals: true, allowNegative: true, strict: true }) as { values: Values; positionals: string[] };
    } catch (error) {
      throw new CliError(`${error instanceof Error ? error.message : String(error)}\nUsage: ${command.usage}`);
    }
    if (parsed.values.help) {
      io.out(commandHelp(command));
      return exitCodes.ok;
    }
    const path = configPath(io.env);
    const output: Output = { json, out: io.out, err: io.err };
    const code = await command.run({
      io,
      output,
      values: parsed.values,
      positionals: parsed.positionals,
      configPath: path,
      async connect() {
        const connection = resolveConnection(await readConfig(path), io.env, { profile: stringValue(parsed.values, "profile"), business: businessId(stringValue(parsed.values, "business")) });
        return { connection, client: createClient({ url: connection.url, key: connection.key, business: connection.business, userAgent, ...(io.fetch ? { fetch: io.fetch } : {}) }) };
      },
    });
    return code ?? exitCodes.ok;
  } catch (error) {
    if (error instanceof CliError) {
      reportError(io, json, error);
      return error.exitCode;
    }
    io.err(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
    return exitCodes.failed;
  }
}
