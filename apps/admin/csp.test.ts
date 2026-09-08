import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "./next.config";
import { proxy } from "./proxy";

import { recordingStorageSource, webCallConnectSource } from "./csp";

afterEach(() => vi.unstubAllEnvs());

it("allows recording fetch and playback in both emitted policies", async () => {
  vi.stubEnv("STORAGE_PROVIDER", "s3");
  vi.stubEnv("S3_BUCKET", "recordings");
  vi.stubEnv("S3_ENDPOINT", "https://t3.storageapi.dev");
  vi.stubEnv("S3_FORCE_PATH_STYLE", "false");
  const headers = await nextConfig.headers!();
  const policies = [
    headers[0]?.headers.find(header => header.key === "Content-Security-Policy")?.value,
    proxy(new NextRequest("https://dashboard.example/calls")).headers.get("Content-Security-Policy"),
  ];
  for (const policy of policies) {
    expect(policy).toBeTruthy();
    for (const directive of ["connect-src", "media-src"]) {
      expect(policy?.split(";").find(value => value.trim().startsWith(directive))?.split(" ")).toContain("https://recordings.t3.storageapi.dev");
    }
  }
});

describe("recordingStorageSource", () => {
  const storage = { STORAGE_PROVIDER: "s3", S3_BUCKET: "recordings", S3_ENDPOINT: "https://t3.storageapi.dev", S3_REGION: "auto" };
  it("allows the exact virtual-hosted bucket origin", () => {
    expect(recordingStorageSource(storage)).toBe("https://recordings.t3.storageapi.dev");
  });
  it("supports path-style storage", () => {
    expect(recordingStorageSource({ ...storage, S3_FORCE_PATH_STYLE: "true" })).toBe("https://t3.storageapi.dev");
    expect(recordingStorageSource({ ...storage, S3_ENDPOINT: "http://127.0.0.1:9000" })).toBe("http://127.0.0.1:9000");
  });
  it("supports AWS without a custom endpoint", () => {
    expect(recordingStorageSource({ ...storage, S3_ENDPOINT: "", S3_REGION: "ca-central-1" })).toBe("https://recordings.s3.ca-central-1.amazonaws.com");
  });
  it("keeps dotted HTTPS buckets on the path-style endpoint", () => {
    expect(recordingStorageSource({ ...storage, S3_BUCKET: "my.recordings" })).toBe("https://t3.storageapi.dev");
  });
  it("does not broaden the policy for local or invalid configurations", () => {
    expect(recordingStorageSource({})).toBeUndefined();
    expect(recordingStorageSource({ ...storage, S3_ENDPOINT: "data:text/plain,hello" })).toBeUndefined();
    expect(recordingStorageSource({ ...storage, S3_ENDPOINT: "https://user:secret@example.com" })).toBeUndefined();
    expect(recordingStorageSource({ ...storage, S3_BUCKET: "*" })).toBeUndefined();
  });
});

describe("webCallConnectSource", () => {
  it("allows only the configured web-call origin", () => {
    expect(
      webCallConnectSource({
        NEXT_PUBLIC_WEB_CALL_ENDPOINT:
          "http://localhost:3001/web-call/sessions",
      }),
    ).toBe("http://localhost:3001");
  });

  it("does not add malformed or same-origin relative values", () => {
    expect(
      webCallConnectSource({
        NEXT_PUBLIC_WEB_CALL_ENDPOINT: "/api/voice",
      }),
    ).toBeUndefined();
  });
});
