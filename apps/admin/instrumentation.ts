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

export async function onRequestError(error: unknown): Promise<void> {
  console.warn("[admin] request error", error instanceof Error ? error.name : "unknown");
}

export async function shutdownTelemetry(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { shutdownTelemetry: shutdown } = await import("@lobbystack/telemetry/node");
  await shutdown();
}
