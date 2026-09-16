import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { createDatabaseClient, users } from "@lobbystack/db";
import { createProspectDemo, getProspectDemoStatus, publishProspectDemo, revokeProspectDemo, setProspectDemoPrompts } from "@lobbystack/domain";

type Command = "create" | "status" | "publish" | "revoke" | "set-prompts";

function printUsage(): void {
  console.log(`Usage:
  pnpm prospect-demo:create --name "Acme" --url https://acme.example [--recipient email] [--recipient-name Name] [--locale fr] [--campaign id] [--greeting "..."] [--service "Oil change"] [--prompt "Ask about hours"] [--prompt "Ask for a quote"] [--timezone America/Toronto]
  pnpm prospect-demo:status <demoId>
  pnpm prospect-demo:set-prompts <demoId> --prompt "..." --prompt "..."
  pnpm prospect-demo:publish <demoId> [--token-file path]
  pnpm prospect-demo:revoke <demoId>

Required env:
  DATABASE_URL or LOBBYSTACK_APP_DATABASE_URL
  DATABASE_URL or LOBBYSTACK_AUTH_DATABASE_URL
  PROSPECT_DEMO_OPERATOR_EMAIL
`);
}

function flagValues(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}.`);
    values.push(value);
    index += 1;
  }
  return values;
}

function optionalFlag(argv: string[], flag: string): string | undefined {
  return flagValues(argv, flag)[0];
}

function positional(argv: string[], label: string): string {
  const value = argv.find((entry, index) => !entry.startsWith("--") && (index === 0 || !argv[index - 1]?.startsWith("--")));
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

async function tokenFromFile(path: string): Promise<string | undefined> {
  try {
    const stored = (await readFile(path, "utf8")).trim();
    try {
      const parsed = JSON.parse(stored) as { token?: unknown };
      return typeof parsed.token === "string" ? parsed.token.trim() : undefined;
    } catch {
      return stored || undefined;
    }
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2) as [Command | undefined, ...string[]];
  if (!command || command === ("--help" as Command) || command === ("-h" as Command)) {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  const operatorEmail = process.env.PROSPECT_DEMO_OPERATOR_EMAIL?.trim().toLowerCase();
  if (!operatorEmail) throw new Error("PROSPECT_DEMO_OPERATOR_EMAIL is required.");
  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  try {
    const operator = (await auth.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, operatorEmail)).limit(1))[0];
    if (!operator) throw new Error(`Operator user not found for ${operatorEmail}.`);
    const context = { db: app.db };

    if (command === "create") {
      const name = optionalFlag(argv, "--name");
      const websiteUrl = optionalFlag(argv, "--url");
      if (!name || !websiteUrl) throw new Error("--name and --url are required.");
      const optional = {
        locale: optionalFlag(argv, "--locale"),
        recipientEmail: optionalFlag(argv, "--recipient"),
        recipientName: optionalFlag(argv, "--recipient-name"),
        campaignId: optionalFlag(argv, "--campaign"),
        greeting: optionalFlag(argv, "--greeting"),
        timezone: optionalFlag(argv, "--timezone"),
      };
      const result = await createProspectDemo(context, {
        operatorUserId: operator.id,
        name,
        websiteUrl,
        ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
        services: flagValues(argv, "--service"),
        suggestedPrompts: flagValues(argv, "--prompt"),
      });
      const directory = join(process.cwd(), ".prospect-demos");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      const probe = join(directory, `.write-test-${process.pid}`);
      await writeFile(probe, "", { mode: 0o600 });
      await unlink(probe);
      const secretFile = join(directory, `${result.demoId}.json`);
      await writeFile(secretFile, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
      await chmod(secretFile, 0o600);
      const { token: _token, ...safeResult } = result;
      console.log(JSON.stringify({ ...safeResult, secretFile }, null, 2));
      return;
    }

    const demoId = positional(argv, "demoId");
    if (command === "status") {
      console.log(JSON.stringify(await getProspectDemoStatus(context, { operatorUserId: operator.id, demoId }), null, 2));
      return;
    }
    if (command === "set-prompts") {
      const suggestedPrompts = await setProspectDemoPrompts(context, { operatorUserId: operator.id, demoId, suggestedPrompts: flagValues(argv, "--prompt") });
      console.log(JSON.stringify({ demoId, suggestedPrompts }, null, 2));
      return;
    }
    if (command === "revoke") {
      await revokeProspectDemo(context, { operatorUserId: operator.id, demoId });
      console.log(JSON.stringify({ demoId, status: "revoked" }, null, 2));
      return;
    }
    if (command === "publish") {
      const tokenFile = optionalFlag(argv, "--token-file") ?? join(process.cwd(), ".prospect-demos", `${demoId}.json`);
      const token = process.env.PROSPECT_DEMO_TOKEN?.trim() || await tokenFromFile(tokenFile);
      if (!token) throw new Error(`Prospect demo token not found. Set PROSPECT_DEMO_TOKEN or provide --token-file (expected ${tokenFile}).`);
      const prompts = flagValues(argv, "--prompt");
      const result = await publishProspectDemo(context, { operatorUserId: operator.id, demoId, token, ...(prompts.length ? { suggestedPrompts: prompts } : {}) });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    throw new Error(`Unsupported command: ${command}.`);
  } finally {
    await Promise.all([auth.pool.end(), app.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
