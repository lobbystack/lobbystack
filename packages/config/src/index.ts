import { z } from "zod";

import type { DeploymentMode } from "@lobbystack/shared";

const DEFAULT_WEB_CALL_MAX_DURATION_MS = 5 * 60 * 1000;
const MAX_WEB_CALL_MAX_DURATION_MS = 30 * 60 * 1000;
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const knownInsecureSecretValues = new Set([
  "change-me-before-production",
  "development-only-change-me",
  "local-internal-token",
]);

function isInsecureProductionSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    value.trim().length < MIN_PRODUCTION_SECRET_LENGTH ||
    knownInsecureSecretValues.has(normalized) ||
    normalized.startsWith("replace-with-")
  );
}

export function assertProductionSecrets(
  source: Record<string, unknown>,
  requiredNames: readonly string[],
): void {
  if (source.NODE_ENV !== "production") return;

  for (const name of requiredNames) {
    const value = source[name];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${name} is required in production.`);
    }
    if (isInsecureProductionSecret(value)) {
      throw new Error(`${name} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and must not use a placeholder value in production.`);
    }
  }
}

const deploymentModeSchema = z.enum([
  "cloud",
  "self_hosted_standard",
  "development",
]);

const booleanEnvSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const trustProxyEnvSchema = z
  .string()
  .default("false")
  .transform((value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "false" || normalized === "") {
      return false;
    }

    if (normalized === "true") {
      return ["loopback", "linklocal", "uniquelocal"];
    }

    return value
      .split(",")
      .map((proxy) => proxy.trim())
      .filter(Boolean);
  });

const voiceGatewayEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DEPLOYMENT_MODE: deploymentModeSchema.default("development"),
  PORT: z.coerce.number().default(3001),
  VOICE_GATEWAY_TRUST_PROXY: trustProxyEnvSchema,
  VOICE_GATEWAY_BASE_URL: z.string().url(),
  BACKEND_INTERNAL_URL: z.string().url(),
  APP_BASE_URL: z.string().url().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().min(1),
  INTERNAL_SERVICE_SECRET: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD: z.coerce.number().optional(),
  WEB_CALL_ALLOWED_ORIGINS: z
    .string()
    .default(
      "https://app.lobbystack.com,https://lobbystack.com,https://www.lobbystack.com",
    ),
  WEB_CALL_PUBLIC_BUSINESS_SLUG: z.string().min(1).max(120).optional(),
  WEB_CALL_MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_WEB_CALL_MAX_DURATION_MS)
    .default(DEFAULT_WEB_CALL_MAX_DURATION_MS),
  DASHBOARD_TEST_CALL_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  POSTHOG_PRIVACY_MODE: booleanEnvSchema,
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.DEPLOYMENT_MODE === "development") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DEPLOYMENT_MODE=development is not allowed when NODE_ENV=production.",
      path: ["DEPLOYMENT_MODE"],
    });
  }
  if (env.NODE_ENV === "production") {
    try {
      assertProductionSecrets(env, [
        "INTERNAL_SERVICE_SECRET",
        "INTERNAL_SERVICE_TOKEN",
      ]);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid production service secret.",
        path: ["INTERNAL_SERVICE_SECRET"],
      });
    }
  }
});

export type VoiceGatewayEnv = z.infer<typeof voiceGatewayEnvSchema>;

function normalizeEnvSource(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    normalized[key] = value?.trim() === "" ? undefined : value;
  }
  return normalized;
}

export function loadVoiceGatewayEnv(
  source: Record<string, string | undefined>,
): VoiceGatewayEnv {
  return voiceGatewayEnvSchema.parse(normalizeEnvSource(source));
}

export function isTelemetryExportEnabled(mode: DeploymentMode): boolean {
  return mode === "cloud";
}
