import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../../../scripts/load-local-env.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
loadLocalEnv([`${root}/.env`, `${root}/.env.local`]);

process.env.PORT = process.env.ADMIN_PORT ?? process.env.PORT ?? "3000";
process.argv.splice(2, 0, "dev");

const require = createRequire(import.meta.url);
require("../node_modules/next/dist/bin/next");
