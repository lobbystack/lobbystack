import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client, type CORSRule } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStorageProvider } from "./provider";
import { S3StorageProvider } from "./s3";

afterEach(() => { vi.restoreAllMocks(); });

const origin = "https://app.example.com";

function storage(): S3StorageProvider {
  return new S3StorageProvider({ bucket: "uploads", region: "us-east-1", accessKeyId: "test", secretAccessKey: "test", corsOrigins: [origin] });
}

/** Answers GetBucketCors with `rules`, fails PutBucketCors with `putError`, and records every command. */
function stubSend(rules?: CORSRule[], putError?: Error) {
  return vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
    if (command instanceof GetBucketCorsCommand) return (rules ? { CORSRules: rules } : {}) as never;
    if (command instanceof PutBucketCorsCommand && putError) throw putError;
    return {} as never;
  });
}

function putRules(send: ReturnType<typeof stubSend>): CORSRule[][] {
  return send.mock.calls.map(([command]) => command).filter((command) => command instanceof PutBucketCorsCommand).map((command) => (command as PutBucketCorsCommand).input.CORSConfiguration?.CORSRules ?? []);
}

const upload = { key: "business/knowledge/object/file.pdf", contentType: "application/pdf", length: 4 };

describe("S3StorageProvider browser uploads", () => {
  it("allows the app origin before handing out an upload URL", async () => {
    const send = stubSend();

    await storage().createUpload(upload);

    expect(putRules(send)).toEqual([[expect.objectContaining({ AllowedOrigins: [origin], AllowedMethods: ["PUT"], AllowedHeaders: ["*"] })]]);
  });

  it("keeps the bucket's other CORS rules", async () => {
    const existing = { AllowedOrigins: ["https://other.example.com"], AllowedMethods: ["GET"] };
    const send = stubSend([{ ...existing, ID: "" }]);

    await storage().createUpload(upload);

    expect(putRules(send)).toEqual([[existing, expect.objectContaining({ AllowedOrigins: [origin] })]]);
  });

  it("leaves the configuration alone when the origin can already upload", async () => {
    const send = stubSend([{ AllowedOrigins: [origin], AllowedMethods: ["GET", "PUT"] }]);

    await storage().createUpload(upload);

    expect(putRules(send)).toEqual([]);
  });

  it("retries after a transient failure", async () => {
    const send = stubSend(undefined, Object.assign(new Error("Slow down"), { name: "SlowDown" }));
    const provider = storage();

    await provider.createUpload(upload);
    await provider.createUpload(upload);

    expect(putRules(send)).toHaveLength(2);
  });

  it("stops trying when the bucket has no CORS API", async () => {
    const send = stubSend(undefined, Object.assign(new Error("Not implemented"), { name: "NotImplemented" }));
    const provider = storage();

    await expect(provider.createUpload(upload)).resolves.toMatchObject({ url: expect.any(String) });
    await provider.createUpload(upload);

    expect(putRules(send)).toHaveLength(1);
  });

  it("leaves CORS alone for services that do not upload from the browser", async () => {
    const send = stubSend();

    await (createStorageProvider({ STORAGE_PROVIDER: "s3", S3_BUCKET: "uploads", APP_BASE_URL: origin, S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test" }) as S3StorageProvider).createUpload(upload);

    expect(send.mock.calls.some(([command]) => command instanceof GetBucketCorsCommand || command instanceof PutBucketCorsCommand)).toBe(false);
  });
});
