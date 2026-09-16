import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSnapshot, type Snapshot } from "./snapshot-plan.ts";
import { inspectStorage } from "./snapshot-storage.ts";

export async function readSnapshot(root: string): Promise<Snapshot> {
  const snapshot: Snapshot = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("SYMLINK_IN_SNAPSHOT");
    if (!entry.isDirectory()) continue;
    if (entry.name === "_components") { snapshot._components = []; continue; }
    const path = join(root, entry.name, "documents.jsonl");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Unsafe snapshot document file");
    try {
      snapshot[entry.name] = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
    } catch { throw new Error("INVALID_SOURCE_DOCUMENTS"); }
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv.find((arg) => arg.startsWith("--export="))?.slice(9);
  if (!root) throw new Error("Pass --export=<private-unpacked-snapshot>");
  const snapshot = await readSnapshot(resolve(root));
  const plan = compileSnapshot(snapshot, await inspectStorage(resolve(root), snapshot._storage ?? []));
  console.log(JSON.stringify({ rows: plan.rows.length, issues: plan.issues }, null, 2));
  if (plan.issues.length) process.exitCode = 1;
}
