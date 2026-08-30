import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalStorageProvider, resolveStoragePath } from "./local";
import { createStorageProvider } from "./provider";
import { S3StorageProvider } from "./s3";

const directories: string[] = [];

async function provider(): Promise<LocalStorageProvider> {
  const rootPath = await mkdtemp(join(tmpdir(), "lobbystack-storage-"));
  directories.push(rootPath);
  return new LocalStorageProvider({ rootPath, publicBaseUrl: "https://app.example.com", signingSecret: "test-storage-secret" });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("LocalStorageProvider", () => {
  it("stores, reads, ranges, copies, and deletes objects", async () => {
    const storage = await provider();
    const body = new TextEncoder().encode("stored bytes");
    await storage.putObject({ key: "business/knowledge/object/file.txt", body, contentType: "text/plain" });

    await expect(storage.headObject({ key: "business/knowledge/object/file.txt" })).resolves.toMatchObject({ length: body.byteLength, contentType: "text/plain" });
    expect(Array.from(await storage.getObject({ key: "business/knowledge/object/file.txt", range: "bytes=0-5" }))).toEqual(Array.from(new TextEncoder().encode("stored")));
    await storage.copyObject({ sourceKey: "business/knowledge/object/file.txt", destinationKey: "business/knowledge/copy/file.txt" });
    expect(Array.from(await storage.getObject({ key: "business/knowledge/copy/file.txt" }))).toEqual(Array.from(body));
    await storage.deleteObject({ key: "business/knowledge/object/file.txt" });
    await expect(storage.headObject({ key: "business/knowledge/object/file.txt" })).resolves.toBeNull();
  });

  it("creates signed local upload and download URLs", async () => {
    const storage = await provider();
    const upload = await storage.createUpload({ key: "business/attachment/object/file.pdf", contentType: "application/pdf", length: 12, checksum: "checksum" });
    const uploadToken = new URL(upload.url).searchParams.get("token");
    expect(uploadToken).toBeTruthy();
    expect(storage.verifyToken(uploadToken!, "upload")).toMatchObject({ key: "business/attachment/object/file.pdf", length: 12, checksum: "checksum" });

    const downloadUrl = await storage.createDownloadUrl({ key: "business/attachment/object/file.pdf", expiresInSeconds: 300, range: "bytes=1-3" });
    const downloadToken = new URL(downloadUrl).searchParams.get("token");
    expect(storage.verifyToken(downloadToken!, "download")).toMatchObject({ key: "business/attachment/object/file.pdf", range: "bytes=1-3" });
    expect(() => storage.verifyToken(`${downloadToken}tampered`, "download")).toThrow("Invalid storage token");
  });

  it("stops streamed uploads at the signed length without publishing a partial object", async () => {
    const storage = await provider();
    async function* body(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode("too");
      yield new TextEncoder().encode(" large");
    }

    await expect(storage.putObjectStream({
      key: "business/knowledge/object/file.txt",
      body: body(),
      contentType: "text/plain",
      expectedLength: 4,
    })).rejects.toThrow("larger than the signed length");
    await expect(storage.headObject({ key: "business/knowledge/object/file.txt" })).resolves.toBeNull();
  });

  it.each([
    "../secret",
    "business/../../secret",
    "/absolute/path",
    "business//file",
    "business/./file",
    "business\\..\\secret",
    "business/\0/file",
  ])("rejects traversal or malformed key %j", async (key) => {
    const storage = await provider();
    expect(() => resolveStoragePath("/tmp/storage", "objects", key)).toThrow("Invalid storage key");
    await expect(storage.putObject({ key, body: new Uint8Array([1]), contentType: "application/octet-stream" })).rejects.toThrow("Invalid storage key");
    await expect(storage.createUpload({ key, contentType: "application/octet-stream", length: 1 })).rejects.toThrow("Invalid storage key");
  });
});

describe("createStorageProvider", () => {
  it("uses local storage by default", () => {
    expect(createStorageProvider({ APP_BASE_URL: "http://localhost:3000", LOCAL_STORAGE_PATH: "/tmp/lobbystack", INTERNAL_SERVICE_SECRET: "secret" })).toBeInstanceOf(LocalStorageProvider);
  });

  it("preserves S3 for legacy environments without STORAGE_PROVIDER", () => {
    expect(createStorageProvider({
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_BUCKET: "lobbystack",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    })).toBeInstanceOf(S3StorageProvider);
  });

  it("honors an explicit local provider when S3 defaults are also present", () => {
    expect(createStorageProvider({
      STORAGE_PROVIDER: "local",
      APP_BASE_URL: "http://localhost:3000",
      LOCAL_STORAGE_PATH: "/tmp/lobbystack",
      INTERNAL_SERVICE_SECRET: "secret",
      S3_BUCKET: "lobbystack",
      S3_REGION: "us-east-1",
    })).toBeInstanceOf(LocalStorageProvider);
  });

  it("rejects unknown providers and partial S3 credentials", () => {
    expect(() => createStorageProvider({ STORAGE_PROVIDER: "unknown" })).toThrow("Unsupported STORAGE_PROVIDER");
    expect(() => createStorageProvider({ STORAGE_PROVIDER: "s3", S3_ACCESS_KEY_ID: "key" })).toThrow("configured together");
  });
});
