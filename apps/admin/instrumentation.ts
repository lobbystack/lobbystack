export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionSecrets } = await import("@lobbystack/config");
  assertProductionSecrets(process.env, [
    "BETTER_AUTH_SECRET",
    "INTERNAL_SERVICE_SECRET",
    "INTERNAL_SERVICE_TOKEN",
    "WIDGET_SESSION_SECRET",
    "ENCRYPTION_KEY",
    "OTP_HASH_SECRET",
    ...(process.env.STORAGE_PROVIDER === "s3" ? [] : ["LOCAL_STORAGE_SIGNING_SECRET"]),
  ]);
  const { initializeTelemetry } = await import("@lobbystack/telemetry/node");
  await initializeTelemetry({ serviceName: "lobbystack-admin" });
}

export const onRequestError: import("next").Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("./src/lib/error-reporting");
  await reportServerError(error, { operation: context.routeType, route: context.routePath, method: request.method, ...(error instanceof Error && "digest" in error ? { digest: String(error.digest) } : {}) });
}

export async function shutdownTelemetry(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { shutdownTelemetry: shutdown } = await import("@lobbystack/telemetry/node");
  await shutdown();
}
