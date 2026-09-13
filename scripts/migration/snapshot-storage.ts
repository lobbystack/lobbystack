import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { PlannedObject, SourceRow, StorageFile } from "./snapshot-plan.ts";

export async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function checksum(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) return Buffer.from(value, "base64").toString("hex");
  return undefined;
}

export async function inspectStorage(root: string, rows: SourceRow[]): Promise<StorageFile[]> {
  const storage = join(root, "_storage");
  const info = await lstat(storage);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("UNSAFE_STORAGE_DIRECTORY");
  const entries = (await readdir(storage)).filter((name) => name !== "documents.jsonl");
  const result: StorageFile[] = [];
  for (const row of rows) {
    if (!/^[A-Za-z0-9_-]+$/.test(row._id)) throw new Error("INVALID_STORAGE_ID");
    const candidates = entries.filter((name) => name === row._id || name.startsWith(`${row._id}.`));
    if (candidates.length !== 1) throw new Error("MISSING_OR_AMBIGUOUS_STORAGE_FILE");
    const path = join(storage, candidates[0]!);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("UNSAFE_STORAGE_FILE");
    const sha256 = await fileDigest(path);
    if (metadata.size !== row.size || checksum(row.sha256) !== sha256) throw new Error("STORAGE_INTEGRITY_MISMATCH");
    result.push({ id: row._id, path: relative(root, path), size: metadata.size, sha256 });
  }
  if (entries.length !== result.length) throw new Error("UNACCOUNTED_STORAGE_FILE");
  return result;
}

function childPath(root: string, key: string): string {
  const child = resolve(root, key);
  if (!child.startsWith(`${resolve(root)}${sep}`)) throw new Error("UNSAFE_OBJECT_PATH");
  return child;
}

/** Rehearsal-only local object sink. Never overwrites an object with different
 * bytes. Every object, including orphans, is checked again before DB commit. */
export async function transferLocalObjects(sourceRoot: string, targetRoot: string, objects: PlannedObject[]): Promise<void> {
  const root = await realpath(targetRoot);
  const sourceDirectory = await realpath(sourceRoot);
  if (root === sourceDirectory || root.startsWith(`${sourceDirectory}${sep}`) || sourceDirectory.startsWith(`${root}${sep}`)) throw new Error("OBJECT_TARGET_OVERLAPS_SOURCE");
  for (const object of objects) {
    const source = childPath(sourceDirectory, object.path);
    const destination = childPath(root, object.key);
    const sourceInfo = await lstat(source);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || await realpath(source) !== source || sourceInfo.size !== object.size || await fileDigest(source) !== object.sha256) throw new Error("SOURCE_OBJECT_CHANGED");
    const parent = resolve(destination, "..");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    if (await realpath(parent) !== parent) throw new Error("UNSAFE_OBJECT_PARENT");
    let existing = false;
    try { await lstat(destination); existing = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!existing) await pipeline(createReadStream(source), createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    const uploaded = await lstat(destination);
    if (!uploaded.isFile() || uploaded.isSymbolicLink() || uploaded.size !== object.size || await fileDigest(destination) !== object.sha256) throw new Error("TARGET_OBJECT_INTEGRITY_MISMATCH");
  }
}

/** Read-only verification; unlike retrying a transfer this cannot conceal an
 * incomplete restore by copying missing objects from the source snapshot. */
export async function verifyLocalObjects(targetRoot: string, objects: PlannedObject[]): Promise<void> {
  const root = await realpath(targetRoot);
  const expected = new Set(objects.map((object) => object.key));
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("UNSAFE_TARGET_OBJECT");
      if (entry.isDirectory()) await visit(path);
      else if (path === join(root, ".migration-target.json")) continue;
      else if (!entry.isFile() || !expected.delete(relative(root, path))) throw new Error("UNEXPECTED_TARGET_OBJECT");
    }
  }
  await visit(root);
  if (expected.size) throw new Error("MISSING_TARGET_OBJECT");
  for (const object of objects) {
    const path = childPath(root, object.key);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path || info.size !== object.size || await fileDigest(path) !== object.sha256) throw new Error("TARGET_OBJECT_INTEGRITY_MISMATCH");
  }
}
