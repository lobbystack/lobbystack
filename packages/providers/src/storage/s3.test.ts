import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, getSignedUrl } = vi.hoisted(() => {
  const send = vi.fn();
  const getSignedUrl = vi.fn().mockResolvedValue("https://minio.example/upload");
  return { send, getSignedUrl };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function MockS3Client(this: { send: typeof send }) {
    this.send = send;
  }),
  PutObjectCommand: vi.fn(function PutObjectCommand(this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
  GetObjectCommand: vi.fn(function GetObjectCommand(this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
  HeadObjectCommand: vi.fn(function HeadObjectCommand(this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
  DeleteObjectCommand: vi.fn(function DeleteObjectCommand(this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
  CopyObjectCommand: vi.fn(function CopyObjectCommand(this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl,
}));

import { S3StorageProvider, s3StorageConfigFromEnvironment } from "./s3";

describe("s3", () => {
  beforeEach(() => {
    send.mockReset();
    getSignedUrl.mockClear();
  });

  it("builds MinIO-compatible config from environment variables", () => {
    expect(
      s3StorageConfigFromEnvironment({
        S3_ENDPOINT: "http://minio:9000",
        S3_ACCESS_KEY_ID: "lobbystack",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_FORCE_PATH_STYLE: "true",
        S3_BUCKET: "lobbystack-files",
      }),
    ).toEqual({
      endpoint: "http://minio:9000",
      region: "us-east-1",
      accessKeyId: "lobbystack",
      secretAccessKey: "secret",
      forcePathStyle: true,
      bucket: "lobbystack-files",
      signedUrlExpiresIn: 900,
    });
  });

  it("returns null when required storage settings are missing", () => {
    expect(s3StorageConfigFromEnvironment({ S3_BUCKET: "lobbystack-files" })).toBeNull();
  });

  it("creates presigned upload URLs", async () => {
    const provider = new S3StorageProvider({
      endpoint: "http://minio:9000",
      region: "us-east-1",
      accessKeyId: "lobbystack",
      secretAccessKey: "secret",
      forcePathStyle: true,
      bucket: "lobbystack-files",
      signedUrlExpiresIn: 900,
    });

    const upload = await provider.createUpload({
      key: "businesses/1/file.pdf",
      contentType: "application/pdf",
      length: 1024,
      checksumSha256: "a".repeat(64),
    });

    expect(getSignedUrl).toHaveBeenCalledOnce();
    expect(upload.url).toBe("https://minio.example/upload");
    expect(upload.headers).toEqual({
      "content-type": "application/pdf",
      "x-amz-meta-checksum-sha256": "a".repeat(64),
    });
  });

  it("puts objects through the S3 client", async () => {
    const provider = new S3StorageProvider({
      region: "us-east-1",
      accessKeyId: "lobbystack",
      secretAccessKey: "secret",
      forcePathStyle: false,
      bucket: "lobbystack-files",
      signedUrlExpiresIn: 900,
    });

    await provider.putObject({
      key: "businesses/1/file.pdf",
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      checksumSha256: "a".repeat(64),
    });

    expect(send).toHaveBeenCalledOnce();
  });
});
