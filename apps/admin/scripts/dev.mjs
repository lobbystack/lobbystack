import { createRequire } from "node:module";

process.env.PORT = process.env.ADMIN_PORT ?? process.env.PORT ?? "3000";
process.argv.splice(2, 0, "dev");

const require = createRequire(import.meta.url);
require("../node_modules/next/dist/bin/next");
