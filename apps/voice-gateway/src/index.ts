import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

import { createServer } from "./http/server";
import {
  shutdownObservability,
  startObservability,
} from "./observability/otel";
import { shutdownPostHog } from "./observability/posthog";

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
  await startObservability();

  const server = createServer();
  const port = Number(process.env.PORT ?? 3001);

  const shutdown = async () => {
    await Promise.allSettled([
      server.close(),
      shutdownPostHog(),
      shutdownObservability(),
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
    await shutdown();
    process.exitCode = 1;
  }
}

void main();
