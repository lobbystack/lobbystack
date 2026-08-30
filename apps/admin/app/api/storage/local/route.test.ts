import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/providers", async () => await import("../../../../../../packages/providers/src/index"));

import { createStorageProvider } from "@lobbystack/providers";
import { GET, PUT } from "./route";

let storagePath = "";
const previousEnvironment = {
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH,
  LOCAL_STORAGE_SIGNING_SECRET: process.env.LOCAL_STORAGE_SIGNING_SECRET,
  APP_BASE_URL: process.env.APP_BASE_URL,
};

beforeEach(async () => {
  storagePath = await mkdtemp(join(tmpdir(), "lobbystack-admin-storage-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_STORAGE_PATH = storagePath;
  process.env.LOCAL_STORAGE_SIGNING_SECRET = "route-test-signing-secret";
  process.env.APP_BASE_URL = "http://localhost:3000";
});

afterEach(async () => {
  await rm(storagePath, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe.sequential("local storage HTTP route", () => {
  it("accepts a signed upload and serves a requested byte range", async () => {
    const storage = createStorageProvider();
    const body = new TextEncoder().encode("route storage bytes");
    const checksum = createHash("sha256").update(body).digest("base64");
    const upload = await storage.createUpload({ key: "business/knowledge/object/file.txt", contentType: "text/plain", length: body.byteLength, checksum });
    const uploadResponse = await PUT(new Request(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/plain", "x-lobbystack-checksum-sha256": checksum },
      body,
    }));
    expect(uploadResponse.status).toBe(204);

    const downloadUrl = await storage.createDownloadUrl({ key: "business/knowledge/object/file.txt", expiresInSeconds: 60 });
    const downloadResponse = await GET(new Request(downloadUrl, { headers: { range: "bytes=6-12" } }));
    expect(downloadResponse.status).toBe(206);
    expect(downloadResponse.headers.get("content-range")).toBe(`bytes 6-12/${body.byteLength}`);
    expect(await downloadResponse.text()).toBe("storage");

    const pinnedUrl = await storage.createDownloadUrl({ key: "business/knowledge/object/file.txt", expiresInSeconds: 60, range: "bytes=0-4" });
    const pinnedResponse = await GET(new Request(pinnedUrl, { headers: { range: "bytes=6-12" } }));
    expect(pinnedResponse.status).toBe(206);
    expect(await pinnedResponse.text()).toBe("route");
  });

  it("rejects tampered tokens and checksum mismatches", async () => {
    const storage = createStorageProvider();
    const upload = await storage.createUpload({ key: "business/knowledge/object/file.txt", contentType: "text/plain", length: 4, checksum: "invalid" });
    const checksumResponse = await PUT(new Request(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/plain", "x-lobbystack-checksum-sha256": "invalid" },
      body: "test",
    }));
    expect(checksumResponse.status).toBe(400);

    const tampered = new URL(upload.url);
    tampered.searchParams.set("token", `${tampered.searchParams.get("token")}x`);
    const tokenResponse = await PUT(new Request(tampered, { method: "PUT", headers: { "content-type": "text/plain" }, body: "test" }));
    expect(tokenResponse.status).toBe(403);
  });

  it("rejects an upload as soon as it exceeds the signed length", async () => {
    const storage = createStorageProvider();
    const upload = await storage.createUpload({ key: "business/attachment/object/file.txt", contentType: "text/plain", length: 4 });
    const response = await PUT(new Request(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "oversized",
    }));

    expect(response.status).toBe(400);
    await expect(storage.headObject({ key: "business/attachment/object/file.txt" })).resolves.toBeNull();
  });
});
