import { captureExceptionToPostHog, recordException, redactOtelExceptionText } from "@lobbystack/telemetry/node";

import { releaseVersion } from "@/lib/release-version";

const reported = new WeakSet<object>();

// Keep the database diagnosis (SQLSTATE, constraint, table) that Drizzle wraps
// in `cause`; skip `detail`, which echoes row values, and mask quoted literals
// in `message` (e.g. `invalid input syntax for type uuid: "<value>"`).
function databaseCause(error: Error): Record<string, string> | undefined {
  const cause: unknown = error.cause;
  if (!cause || typeof cause !== "object") return undefined;
  const fields: Record<string, string> = {};
  for (const key of ["name", "message", "code", "severity", "constraint", "table", "column", "routine"] as const) {
    const value = (cause as Record<string, unknown>)[key];
    if (typeof value === "string" && value) fields[key] = redactOtelExceptionText(key === "message" ? value.replace(/"[^"]*"/g, '"[value]"') : value);
  }
  return Object.keys(fields).length ? fields : undefined;
}

export async function reportServerError(error: unknown, context: { operation: string; route?: string; method?: string; digest?: string; errorId?: string }): Promise<void> {
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const original = error instanceof Error ? error : new Error("Non-Error exception");
  const safe = new Error(redactOtelExceptionText(original.message));
  safe.name = original.name;
  // V8 copies the message (Drizzle params, possibly multi-line customer text)
  // into the stack header, so keep only the frames below it.
  if (original.stack) safe.stack = [`${safe.name}: ${safe.message}`, ...original.stack.split("\n").slice(original.message.split("\n").length).filter((line) => /^\s+at /.test(line)).slice(0, 29).map(redactOtelExceptionText)].join("\n");
  const cause = databaseCause(original);
  const properties = { ...context, service: "lobbystack-admin", environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV, release: releaseVersion(), alertable: true, ...(cause ? { cause } : {}) };
  console.error("[admin] exception", { ...properties, name: safe.name, message: safe.message, stack: safe.stack });
  recordException(safe);
  await captureExceptionToPostHog(safe, "system:lobbystack-admin", properties);
}
