import { spawnSync } from "node:child_process";

import {
  CONVEX_ENV_KEYS,
  REQUIRED_CONVEX_DEPLOYMENT_ENV_KEYS,
} from "./lib/self-hosted-convex-env-keys.mjs";
import {
  getPnpmInvocation,
  isolateSelfHostedConvexCli,
  parseArgs,
  readEnvFile,
  redactValue,
  requireEnv,
  requireSelfHostedOriginAlignment,
  resolveEnvFile,
  selfHostedCliEnv,
} from "./lib/self-hosted-env.mjs";

function runConvexEnvSet({ key, value, cliEnv, dryRun }) {
  console.log(`convex env set ${key} ${redactValue(key, value)}`);

  if (dryRun) {
    return;
  }

  const pnpm = getPnpmInvocation();
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, "exec", "convex", "env", "set", key, "--", value],
    {
      env: cliEnv,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`convex env set failed for ${key}.`);
  }
}

function syncConvexEnvFromFile({ env, cliEnv, dryRun, includeEmpty }) {
  let synced = 0;
  let skipped = 0;
  const failures = [];

  for (const key of CONVEX_ENV_KEYS) {
    const value = env[key];
    if ((value === undefined || value === "") && !includeEmpty) {
      skipped += 1;
      continue;
    }

    try {
      runConvexEnvSet({
        key,
        value: value ?? "",
        cliEnv,
        dryRun,
      });
      synced += 1;
    } catch (error) {
      failures.push({
        key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to sync ${failures.length} Convex env value${failures.length === 1 ? "" : "s"}: ` +
        `${failures.map((failure) => `${failure.key} (${failure.message})`).join("; ")}`,
    );
  }

  return { synced, skipped };
}

const args = parseArgs(process.argv.slice(2));
const envFile = resolveEnvFile(args.envFile);
const env = readEnvFile(envFile);

requireEnv(env, [
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ...REQUIRED_CONVEX_DEPLOYMENT_ENV_KEYS,
  "CONVEX_CLOUD_ORIGIN",
  "CONVEX_SITE_ORIGIN",
]);
requireSelfHostedOriginAlignment(env);

const { synced, skipped } = args.dryRun
  ? syncConvexEnvFromFile({
      env,
      cliEnv: selfHostedCliEnv(env),
      dryRun: true,
      includeEmpty: args.includeEmpty,
    })
  : await isolateSelfHostedConvexCli(env, (cliEnv) =>
      syncConvexEnvFromFile({
        env,
        cliEnv,
        dryRun: false,
        includeEmpty: args.includeEmpty,
      }),
    );

console.log(
  `${args.dryRun ? "Prepared" : "Synced"} ${synced} Convex env values from ${envFile}; skipped ${skipped} empty values.`,
);
