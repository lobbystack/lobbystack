import { spawnSync } from "node:child_process";

import {
  getPnpmInvocation,
  parseArgs,
  readEnvFile,
  requireEnv,
  resolveEnvFile,
  isolateSelfHostedConvexCli,
} from "./lib/self-hosted-env.mjs";

const args = parseArgs(process.argv.slice(2));
const envFile = resolveEnvFile(args.envFile);
const env = readEnvFile(envFile);

requireEnv(env, ["CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]);

const command = ["exec", "convex", "deploy", ...args.passthrough];
console.log(`pnpm ${command.join(" ")}`);

if (args.dryRun) {
  process.exit(0);
}

const pnpm = getPnpmInvocation();
const result = isolateSelfHostedConvexCli(env, (cliEnv) =>
  spawnSync(pnpm.command, [...pnpm.args, ...command], {
    env: cliEnv,
    stdio: "inherit",
  }),
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
