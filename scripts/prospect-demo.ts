import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

type Command = "create" | "status" | "publish" | "revoke" | "set-prompts";

function printUsage(): void {
  console.log(`Usage:
  pnpm prospect-demo:create --name "Acme" --url https://acme.example [--recipient email] [--recipient-name Name] [--locale fr-CA] [--campaign id] [--greeting "..."] [--service "Oil change"] [--prompt "Ask about hours"] [--prompt "Ask for a quote"] [--timezone America/Toronto]
  pnpm prospect-demo:status <demoId>
  pnpm prospect-demo:set-prompts <demoId> --prompt "..." --prompt "..."
  pnpm prospect-demo:publish <demoId> [--token-file path]
  pnpm prospect-demo:revoke <demoId>

Required env (via .env.local / Convex):
  PROSPECT_DEMO_OPERATOR_EMAIL
  SITE_URL
`);
}

function runConvex(functionName: string, args: Record<string, unknown>): unknown {
  const output = execFileSync(
    "npx",
    [
      "convex",
      "run",
      "--env-file",
      ".env.local",
      functionName,
      JSON.stringify(args),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    console.log(trimmed);
    return trimmed;
  }
}

function parseFlagValues(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${flag}`);
      }
      values.push(next);
      i += 1;
    }
  }
  return values;
}

function parseOptionalFlag(argv: string[], flag: string): string | undefined {
  const values = parseFlagValues(argv, flag);
  return values[0];
}

function requirePositional(argv: string[], label: string): string {
  const value = argv.find((entry) => !entry.startsWith("--"));
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function handleCreate(argv: string[]): void {
  const name = parseOptionalFlag(argv, "--name");
  const websiteUrl = parseOptionalFlag(argv, "--url");
  if (!name || !websiteUrl) {
    throw new Error("--name and --url are required.");
  }

  const prompts = parseFlagValues(argv, "--prompt");
  const services = parseFlagValues(argv, "--service");
  const args: Record<string, unknown> = {
    name,
    websiteUrl,
  };
  const locale = parseOptionalFlag(argv, "--locale");
  const recipientEmail = parseOptionalFlag(argv, "--recipient");
  const recipientName = parseOptionalFlag(argv, "--recipient-name");
  const campaignId = parseOptionalFlag(argv, "--campaign");
  const greeting = parseOptionalFlag(argv, "--greeting");
  const timezone = parseOptionalFlag(argv, "--timezone");
  if (locale) args.locale = locale;
  if (recipientEmail) args.recipientEmail = recipientEmail;
  if (recipientName) args.recipientName = recipientName;
  if (campaignId) args.campaignId = campaignId;
  if (greeting) args.greeting = greeting;
  if (timezone) args.timezone = timezone;
  if (services.length > 0) args.services = services;
  if (prompts.length > 0) args.suggestedPrompts = prompts;

  const secretDirectory = join(process.cwd(), ".prospect-demos");
  mkdirSync(secretDirectory, { recursive: true, mode: 0o700 });
  chmodSync(secretDirectory, 0o700);
  const writeProbe = join(secretDirectory, `.write-test-${process.pid}`);
  writeFileSync(writeProbe, "", { mode: 0o600 });
  unlinkSync(writeProbe);

  const result = runConvex("internal.demos.createProspectDemo", args);
  if (typeof result !== "object" || result === null || !("demoId" in result)) {
    throw new Error("Prospect demo creation returned an invalid result.");
  }
  const demoId = String(result.demoId);
  const secretFile = join(secretDirectory, `${demoId}.json`);
  writeFileSync(secretFile, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  chmodSync(secretFile, 0o600);

  const {
    token: _token,
    tokenHash: _tokenHash,
    demoUrl: _demoUrl,
    claimSignupUrl: _claimSignupUrl,
    ...safeResult
  } = result as Record<string, unknown>;
  console.log(JSON.stringify({ ...safeResult, secretFile }, null, 2));
}

function handleStatus(argv: string[]): void {
  const demoId = requirePositional(argv, "demoId");
  const result = runConvex("internal.demos.getProspectDemoStatus", { demoId });
  console.log(JSON.stringify(result, null, 2));
}

function handleSetPrompts(argv: string[]): void {
  const demoId = requirePositional(argv, "demoId");
  const suggestedPrompts = parseFlagValues(argv, "--prompt");
  if (suggestedPrompts.length < 2) {
    throw new Error("Provide at least two --prompt values.");
  }
  const result = runConvex("internal.demos.setProspectDemoPrompts", {
    demoId,
    suggestedPrompts,
  });
  console.log(JSON.stringify(result, null, 2));
}

function handlePublish(argv: string[]): void {
  const demoId = requirePositional(argv, "demoId");
  const tokenFile =
    parseOptionalFlag(argv, "--token-file") ??
    join(process.cwd(), ".prospect-demos", `${demoId}.json`);
  let rawToken = process.env.PROSPECT_DEMO_TOKEN?.trim();
  let tokenHash: string | undefined;
  if (!rawToken) {
    try {
      const stored = readFileSync(tokenFile, "utf8").trim();
      try {
        const parsed = JSON.parse(stored) as {
          token?: unknown;
          tokenHash?: unknown;
        };
        rawToken = typeof parsed.token === "string" ? parsed.token.trim() : undefined;
        tokenHash =
          typeof parsed.tokenHash === "string" ? parsed.tokenHash.trim() : undefined;
      } catch {
        rawToken = stored;
      }
    } catch {}
  }
  if (!tokenHash && rawToken) {
    tokenHash = createHash("sha256").update(rawToken).digest("hex");
  }
  if (!tokenHash) {
    throw new Error(
      `Prospect demo token not found. Set PROSPECT_DEMO_TOKEN or provide --token-file (expected ${tokenFile}).`,
    );
  }
  const prompts = parseFlagValues(argv, "--prompt");
  const args: Record<string, unknown> = {
    demoId,
    tokenHash,
  };
  if (prompts.length > 0) {
    args.suggestedPrompts = prompts;
  }
  const result = runConvex("internal.demos.publishProspectDemo", args);
  console.log(JSON.stringify(result, null, 2));
}

function handleRevoke(argv: string[]): void {
  const demoId = requirePositional(argv, "demoId");
  const result = runConvex("internal.demos.revokeProspectDemo", { demoId });
  console.log(JSON.stringify(result, null, 2));
}

const [command, ...rest] = process.argv.slice(2) as [Command | undefined, ...string[]];

if (!command || command === ("--help" as Command) || command === ("-h" as Command)) {
  printUsage();
  process.exit(command ? 0 : 1);
}

try {
  switch (command) {
    case "create":
      handleCreate(rest);
      break;
    case "status":
      handleStatus(rest);
      break;
    case "set-prompts":
      handleSetPrompts(rest);
      break;
    case "publish":
      handlePublish(rest);
      break;
    case "revoke":
      handleRevoke(rest);
      break;
    default:
      printUsage();
      process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
