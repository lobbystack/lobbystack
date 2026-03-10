import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

import { createServer } from "./http/server";

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

const server = createServer();

const port = Number(process.env.PORT ?? 3001);

server.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  const unknownError = error instanceof Error ? error : new Error(String(error));
  server.log.error(unknownError);
  process.exitCode = 1;
});
