import { mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "packages", "embed", "dist", "embed.js");
const target = resolve(root, "apps", "admin", "public", "embed", "embed.js");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`[widget] Copied embed loader to ${target}`);
