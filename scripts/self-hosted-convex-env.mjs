import { spawnSync } from "node:child_process";

import {
  getPnpmInvocation,
  parseArgs,
  readEnvFile,
  redactValue,
  requireEnv,
  resolveEnvFile,
  isolateSelfHostedConvexCli,
} from "./lib/self-hosted-env.mjs";

const REQUIRED_ENV_KEYS = [
  "APP_BASE_URL",
  "SITE_URL",
  "VOICE_GATEWAY_BASE_URL",
  "CONVEX_URL",
  "CONVEX_SITE_URL",
  "INTERNAL_SERVICE_TOKEN",
  "SESSION_ENCRYPTION_KEY",
  "JWT_PRIVATE_KEY",
  "JWKS",
];

const CONVEX_ENV_KEYS = [
  "DEPLOYMENT_MODE",
  "APP_BASE_URL",
  "SITE_URL",
  "VOICE_GATEWAY_BASE_URL",
  "CONVEX_URL",
  "INTERNAL_SERVICE_TOKEN",
  "SESSION_ENCRYPTION_KEY",
  "JWT_PRIVATE_KEY",
  "JWKS",
  "TURNSTILE_SECRET_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_ALERT_SMS_FROM",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_PRIMARY_CUSTOMER_PROFILE_SID",
  "TWILIO_A2P_STATUS_EMAIL",
  "NUMBER_CLAIM_TOKEN_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_REALTIME_MODEL",
  "OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD",
  "OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD",
  "OPENAI_TRANSCRIPTION_MODEL",
  "OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD",
  "OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_TEXT_MODEL",
  "GEMINI_EMBEDDING_MODEL",
  "FIRECRAWL_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_REDIRECT_URI",
  "RESEND_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "FEEDBACK_TO_EMAIL",
  "POLAR_SERVER",
  "POLAR_ORGANIZATION_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_PRO_PRODUCT_ID",
  "POLAR_PRO_AI_SMS_PRODUCT_ID",
  "POLAR_AI_SMS_SETUP_PRODUCT_ID",
  "POLAR_AI_SMS_ADDON_PRODUCT_ID",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "POSTHOG_PRIVACY_MODE",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_HOST",
  "UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD",
  "UNIT_ECONOMICS_MONTHLY_FLY_COST_USD",
];

function runConvexEnvSet({ key, value, env, dryRun }) {
  console.log(`convex env set ${key} ${redactValue(key, value)}`);

  if (dryRun) {
    return;
  }

  const pnpm = getPnpmInvocation();
  const result = isolateSelfHostedConvexCli(env, (cliEnv) =>
    spawnSync(
      pnpm.command,
      [...pnpm.args, "exec", "convex", "env", "set", key, "--", value],
      {
        env: cliEnv,
        stdio: "inherit",
      },
    ),
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`convex env set failed for ${key}.`);
  }
}

const args = parseArgs(process.argv.slice(2));
const envFile = resolveEnvFile(args.envFile);
const env = readEnvFile(envFile);

requireEnv(env, [
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ...REQUIRED_ENV_KEYS,
]);

let synced = 0;
let skipped = 0;

for (const key of CONVEX_ENV_KEYS) {
  const value = env[key];
  if ((value === undefined || value === "") && !args.includeEmpty) {
    skipped += 1;
    continue;
  }

  runConvexEnvSet({
    key,
    value: value ?? "",
    env,
    dryRun: args.dryRun,
  });
  synced += 1;
}

console.log(
  `${args.dryRun ? "Prepared" : "Synced"} ${synced} Convex env values from ${envFile}; skipped ${skipped} empty values.`,
);
