export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionSecrets, brandLinkEnvironment, invalidBrandLinkVariables } = await import("@lobbystack/shared");
  assertProductionSecrets(process.env, [
    "BETTER_AUTH_SECRET",
    "INTERNAL_SERVICE_SECRET",
    "INTERNAL_SERVICE_TOKEN",
    "WIDGET_SESSION_SECRET",
    "ENCRYPTION_KEY",
    "OTP_HASH_SECRET",
    ...(process.env.STORAGE_PROVIDER === "s3" ? [] : ["LOCAL_STORAGE_SIGNING_SECRET"]),
  ]);
  const invalidLinks = invalidBrandLinkVariables(brandLinkEnvironment());
  if (invalidLinks.length) {
    console.warn(`[branding] Ignoring ${invalidLinks.join(", ")}: a site or page must be an http or https URL and the contact address a plain email address, so the app links to LobbyStack's instead.`);
  }
  const { initializeTelemetry } = await import("@lobbystack/telemetry/node");
  await initializeTelemetry({ serviceName: "lobbystack-admin" });
  const { assertAdminDatabaseRoles } = await import("./src/lib/startup-role-assertion");
  await assertAdminDatabaseRoles();
  const { disableRemovedPlatformKeyWebhooksAtStartup } = await import("./src/lib/platform-key-webhooks");
  try {
    await disableRemovedPlatformKeyWebhooksAtStartup();
  } catch (error) {
    // The admin still serves requests; the next start tries again.
    const { reportServerError } = await import("./src/lib/error-reporting");
    await reportServerError(error, { operation: "startup.disable_removed_platform_key_webhooks" });
  }
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
