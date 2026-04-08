import { z } from "zod";

import type { DeploymentMode } from "@ai-receptionist/shared";

const deploymentModeSchema = z.enum([
  "cloud",
  "self_hosted_standard",
  "development",
]);

const serverEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DEPLOYMENT_MODE: deploymentModeSchema.default("development"),
  APP_BASE_URL: z.string().url(),
  VOICE_GATEWAY_BASE_URL: z.string().url(),
  CONVEX_URL: z.string().url(),
  CONVEX_SITE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().default("gemini-3.1-flash-lite-preview"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_API_KEY: z.string().optional(),
  TWILIO_API_SECRET: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
});

const clientEnvSchema = z.object({
  VITE_CONVEX_URL: z.string().url(),
  VITE_CONVEX_SITE_URL: z.string().url(),
  VITE_APP_NAME: z.string().default("AI Receptionist"),
  VITE_DEPLOYMENT_MODE: deploymentModeSchema.default("development"),
  VITE_POSTHOG_KEY: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().min(1).optional(),
  VITE_POSTHOG_UI_HOST: z.string().url().optional(),
});

const voiceGatewayEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DEPLOYMENT_MODE: deploymentModeSchema.default("development"),
  PORT: z.coerce.number().default(3001),
  VOICE_GATEWAY_BASE_URL: z.string().url(),
  CONVEX_SITE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type VoiceGatewayEnv = z.infer<typeof voiceGatewayEnvSchema>;

export function loadServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function loadClientEnv(source: Record<string, string | undefined>): ClientEnv {
  return clientEnvSchema.parse(source);
}

export function loadVoiceGatewayEnv(
  source: Record<string, string | undefined>,
): VoiceGatewayEnv {
  return voiceGatewayEnvSchema.parse(source);
}

export function isTelemetryExportEnabled(mode: DeploymentMode): boolean {
  return mode === "cloud";
}
