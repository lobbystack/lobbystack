import { PostHog } from "posthog-node";
import { recordException, redactOtelExceptionText } from "@lobbystack/telemetry/node";

let client: PostHog | undefined;
const reported = new WeakSet<object>();

export async function reportServerError(error: unknown, context: { operation: string; route?: string; method?: string; digest?: string; errorId?: string }): Promise<void> {
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const original = error instanceof Error ? error : new Error("Non-Error exception");
  const safe = new Error(redactOtelExceptionText(original.message));
  safe.name = original.name;
  if (original.stack) safe.stack = original.stack.split("\n").slice(0, 30).map(redactOtelExceptionText).join("\n");
  const properties = { ...context, service: "lobbystack-admin", environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV, release: process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.SERVICE_VERSION, alertable: true };
  console.error("[admin] exception", { ...properties, name: safe.name, message: safe.message, stack: safe.stack });
  recordException(safe);
  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    client ??= new PostHog(key, { host: process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 });
    await client.captureExceptionImmediate(safe, "system:lobbystack-admin", properties);
  } catch {
    console.warn("[admin] exception delivery failed");
  }
}
