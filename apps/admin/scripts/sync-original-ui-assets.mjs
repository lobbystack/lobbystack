import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webPublic = resolve(adminRoot, "../web/public");

await mkdir(resolve(adminRoot, "public"), { recursive: true });
await Promise.all([
  cp(resolve(webPublic, "brand"), resolve(adminRoot, "public/brand"), {
    recursive: true,
    force: true,
  }),
  cp(resolve(webPublic, "locales"), resolve(adminRoot, "public/locales"), {
    recursive: true,
    force: true,
  }),
]);
