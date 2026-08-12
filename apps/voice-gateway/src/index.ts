import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

for (const envPath of [
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

async function main(): Promise<void> {
  const { initializeTelemetry, shutdownTelemetry } = await import("@lobbystack/telemetry/node");
  await initializeTelemetry({ serviceName: "lobbystack-voice-gateway" });
  const [
    { createServer },
    {
      capturePostHogException,
      installPostHogFatalHandlers,
      recordVoiceHeartbeat,
      shutdownPostHog,
      startPostHogObservability,
    },
  ] = await Promise.all([import("./http/server"), import("./observability/posthog")]);

  await startPostHogObservability();
  installPostHogFatalHandlers();

  const server = createServer();
  const port = Number(process.env.PORT ?? 3001);
  const startedAtMs = Date.now();
  const heartbeatInterval = setInterval(() => {
    recordVoiceHeartbeat({
      uptimeMs: Date.now() - startedAtMs,
    });
  }, 60_000);
  heartbeatInterval.unref();

  const shutdown = async () => {
    clearInterval(heartbeatInterval);
    await Promise.allSettled([
      server.close(),
      shutdownPostHog(),
      shutdownTelemetry(),
    ]);
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  try {
    await server.listen({ port, host: "0.0.0.0" });
  } catch (error: unknown) {
    const unknownError = error instanceof Error ? error : new Error(String(error));
    server.log.error(unknownError);
    capturePostHogException(unknownError, {
      properties: {
        operation: "voice_gateway_startup",
      },
    });
    await shutdown();
    process.exitCode = 1;
  }
}

void main().catch(async (error: unknown) => {
  const unknownError = error instanceof Error ? error : new Error(String(error));
  console.error(unknownError);
  const { capturePostHogException, shutdownPostHog } = await import("./observability/posthog");
  const { shutdownTelemetry } = await import("@lobbystack/telemetry/node");
  capturePostHogException(unknownError, {
    properties: {
      operation: "voice_gateway_main",
      $exception_level: "fatal",
      alertable: true,
      expected: false,
    },
  });
  await Promise.allSettled([shutdownPostHog(), shutdownTelemetry()]);
  process.exitCode = 1;
});
