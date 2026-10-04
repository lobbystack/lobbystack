import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
// Inherited variables win, and .env.local beats .env: loadEnvFile never replaces a key that is already set.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(`${root}/${file}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

process.env.PORT = process.env.ADMIN_PORT ?? process.env.PORT ?? "3000";
process.argv.splice(2, 0, "dev");

const require = createRequire(import.meta.url);
require("../node_modules/next/dist/bin/next");
