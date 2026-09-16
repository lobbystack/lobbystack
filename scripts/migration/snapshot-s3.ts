import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { PlannedObject } from "./snapshot-plan.ts";
import { fileDigest } from "./snapshot-storage.ts";

export interface MigrationObjectStore {
  headObject(input: { key: string }): Promise<{ length: number } | null>;
  createUpload(input: { key: string; contentType: string; length: number; checksum?: string; ifNoneMatch?: boolean }): Promise<{ url: string; headers: Record<string, string> }>;
  createDownloadUrl(input: { key: string; expiresInSeconds: number }): Promise<string>;
  listObjectKeys(prefix?: string): Promise<string[]>;
}

export async function verifyRemoteObject(store: MigrationObjectStore, object: PlannedObject, request: typeof fetch = fetch): Promise<void> {
  const url = await store.createDownloadUrl({ key: object.key, expiresInSeconds: 120 });
  const response = await request(url, { signal: AbortSignal.timeout(120_000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error("REMOTE_OBJECT_DOWNLOAD_FAILED");
  const hash = createHash("sha256");
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > object.size) { await reader.cancel(); throw new Error("REMOTE_OBJECT_TOO_LARGE"); }
      hash.update(value);
    }
  } finally { reader.releaseLock(); }
  if (length !== object.size || hash.digest("hex") !== object.sha256) throw new Error("REMOTE_OBJECT_HASH_MISMATCH");
}

export async function transferRemoteObjects(sourceRoot: string, store: MigrationObjectStore, objects: PlannedObject[], options: { verifyOnly?: boolean; progress?: (count: number) => void; request?: typeof fetch } = {}): Promise<void> {
  const root = await realpath(sourceRoot);
  const request = options.request ?? fetch;
  let index = 0;
  let verified = 0;
  let failed = false;
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, objects.length) }, async () => {
    try {
    while (!failed && index < objects.length) {
      const object = objects[index++]!;
      const path = resolve(root, object.path);
      if (!path.startsWith(`${root}${sep}`) || await realpath(path) !== path) throw new Error("UNSAFE_SOURCE_OBJECT");
      const info = await lstat(path);
      if (!info.isFile() || info.size !== object.size || await fileDigest(path) !== object.sha256) throw new Error("SOURCE_OBJECT_CHANGED");
      const existing = await store.headObject({ key: object.key });
      if (!existing) {
        if (options.verifyOnly) throw new Error("REMOTE_OBJECT_MISSING");
        const upload = await store.createUpload({ key: object.key, contentType: object.contentType, length: object.size, checksum: Buffer.from(object.sha256, "hex").toString("base64"), ifNoneMatch: true });
        const stream = createReadStream(path);
        try {
          const response = await request(upload.url, { method: "PUT", headers: upload.headers, body: stream as unknown as BodyInit, duplex: "half", signal: AbortSignal.timeout(120_000), redirect: "error" } as RequestInit & { duplex: "half" });
          // An exclusive concurrent writer is acceptable only if readback
          // proves it wrote the exact approved bytes.
          if (!response.ok && response.status !== 412) throw new Error("REMOTE_OBJECT_UPLOAD_FAILED");
          await response.body?.cancel();
        } finally { stream.destroy(); }
      } else if (existing.length !== object.size) throw new Error("REMOTE_OBJECT_LENGTH_MISMATCH");
      await verifyRemoteObject(store, object, request);
      options.progress?.(++verified);
    }
    } catch (error) { failed = true; throw error; }
  }));
  const rejection = results.find((result) => result.status === "rejected");
  if (rejection?.status === "rejected") throw rejection.reason;
  const expected = new Set(objects.map((object) => object.key));
  const keys = await store.listObjectKeys();
  for (const key of keys) {
    if (key === ".migration-target.json") continue;
    if (!expected.delete(key)) throw new Error("UNEXPECTED_REMOTE_OBJECT");
  }
  if (expected.size) throw new Error("REMOTE_OBJECT_MISSING");
}
