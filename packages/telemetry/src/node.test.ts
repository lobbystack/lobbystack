import { describe, expect, it } from "vitest";

import { isStorageHttpRequest, redactOtelExceptionText, registerStorageHttpEndpoint } from "./node";

describe("OTel exception redaction", () => {
  it("removes credentials and customer identifiers from exception text", () => {
    const value = redactOtelExceptionText("caller +14165551234 email person@example.com Bearer secret-token sk-live_123 eyJabc.def.ghi");
    expect(value).not.toContain("+14165551234");
    expect(value).not.toContain("person@example.com");
    expect(value).not.toContain("secret-token");
    expect(value).not.toContain("sk-live_123");
    expect(value).not.toContain("eyJabc.def.ghi");
  });

  it("removes signed storage URLs from exception text", () => {
    const value = redactOtelExceptionText("Upload failed at https://storage.example.test/business/private.pdf?X-Amz-Credential=credential-marker&X-Amz-Signature=signature-marker");
    expect(value).toBe("Upload failed at [redacted-signed-url]");
  });

  it("suppresses automatic HTTP spans for AWS and configured storage endpoints", () => {
    registerStorageHttpEndpoint("http://minio.internal:9000");
    expect(isStorageHttpRequest({ origin: "http://minio.internal:9000" })).toBe(true);
    expect(isStorageHttpRequest({ origin: "https://bucket.s3.us-east-1.amazonaws.com" })).toBe(true);
    expect(isStorageHttpRequest({ getHeader: () => "s3.amazonaws.com" })).toBe(true);
    expect(isStorageHttpRequest({ origin: "https://api.example.test" })).toBe(false);
  });
});
