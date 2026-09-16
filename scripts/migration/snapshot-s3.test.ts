import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import { transferRemoteObjects, verifyRemoteObject, type MigrationObjectStore } from "./snapshot-s3.ts";

const bytes = Buffer.from("verified fixture");
const object = { id: "file", path: "file.txt", key: "tenant/file", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "text/plain" };
function fakeStore() {
  const data = new Map<string, Buffer>();
  const store: MigrationObjectStore = {
    headObject: async ({ key }) => data.has(key) ? { length: data.get(key)!.length } : null,
    createUpload: vi.fn(async ({ key, ifNoneMatch }) => ({ url: `https://fixture.invalid/${key}`, headers: { "if-none-match": ifNoneMatch ? "*" : "" } })),
    createDownloadUrl: async ({ key }) => `https://fixture.invalid/${key}`,
    listObjectKeys: async () => [...data.keys()],
  };
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const key = new URL(String(input)).pathname.slice(1);
    if (init?.method === "PUT") {
      if (data.has(key)) return new Response(null, { status: 412 });
      const chunks: Buffer[] = [];
      for await (const chunk of init.body as unknown as Readable) chunks.push(Buffer.from(chunk));
      data.set(key, Buffer.concat(chunks));
      return new Response(null, { status: 200 });
    }
    return data.has(key) ? new Response(new Uint8Array(data.get(key)!)) : new Response(null, { status: 404 });
  }) as typeof fetch;
  return { data, store, request };
}

it("uploads exclusively, hashes downloads, and verifies repeats without writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "migration-s3-test-"));
  try {
    await writeFile(join(root, "file.txt"), bytes);
    const { data, store, request } = fakeStore();
    await transferRemoteObjects(root, store, [object], { request });
    expect(data.get(object.key)).toEqual(bytes);
    expect(store.createUpload).toHaveBeenCalledWith(expect.objectContaining({ ifNoneMatch: true, checksum: Buffer.from(object.sha256, "hex").toString("base64") }));
    await transferRemoteObjects(root, store, [object], { request, verifyOnly: true });
    expect(store.createUpload).toHaveBeenCalledTimes(1);
    data.set(object.key, Buffer.alloc(bytes.length));
    await expect(verifyRemoteObject(store, object, request)).rejects.toThrow("REMOTE_OBJECT_HASH_MISMATCH");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("does not repair missing objects in verify-only mode and rejects extras", async () => {
  const root = await mkdtemp(join(tmpdir(), "migration-s3-test-"));
  try {
    await writeFile(join(root, "file.txt"), bytes);
    const { data, store, request } = fakeStore();
    await expect(transferRemoteObjects(root, store, [object], { request, verifyOnly: true })).rejects.toThrow("REMOTE_OBJECT_MISSING");
    expect(store.createUpload).not.toHaveBeenCalled();
    data.set(object.key, bytes); data.set("unexpected", bytes);
    await expect(transferRemoteObjects(root, store, [object], { request, verifyOnly: true })).rejects.toThrow("UNEXPECTED_REMOTE_OBJECT");
  } finally { await rm(root, { recursive: true, force: true }); }
});
