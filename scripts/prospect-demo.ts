import { execFileSync } from "node:child_process";

type Command = "create" | "status" | "publish" | "revoke" | "set-prompts";

function printUsage(): void {
  console.log(`Usage:
  pnpm prospect-demo:create --name "Acme" --url https://acme.example [--recipient email] [--recipient-name Name] [--locale fr-CA] [--campaign id] [--greeting "..."] [--service "Oil change"] [--prompt "Ask about hours"] [--prompt "Ask for a quote"] [--timezone America/Toronto]
  pnpm prospect-demo:status <demoId>
  pnpm prospect-demo:set-prompts <demoId> --prompt "..." --prompt "..."
  pnpm prospect-demo:publish <demoId> --token <rawTokenFromCreate>
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

  const result = runConvex("internal.demos.createProspectDemo", args);
  console.log(JSON.stringify(result, null, 2));
  console.log("");
  console.log(
    "Save the token from this output. Publish requires --token with the same value.",
  );
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
  const rawToken = parseOptionalFlag(argv, "--token");
  if (!rawToken) {
    throw new Error("--token is required (from create output).");
  }
  const prompts = parseFlagValues(argv, "--prompt");
  const args: Record<string, unknown> = {
    demoId,
    rawToken,
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
