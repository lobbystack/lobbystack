import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations/generated",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lobbystack_app:lobbystack@127.0.0.1:5432/lobbystack",
  },
  strict: true,
  verbose: true,
});
