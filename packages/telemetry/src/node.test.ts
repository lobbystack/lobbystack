import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeTelemetry, isStorageHttpRequest, parseOtlpHeaders, redactExportAttributes, redactExportLogValue, redactOtelExceptionText, registerStorageHttpEndpoint, shutdownTelemetry } from "./node";

afterEach(async () => {
  vi.unstubAllEnvs();
  await shutdownTelemetry();
});

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

  it("redacts Collector-era attributes before direct export", () => {
    expect(redactExportAttributes({
      "db.statement": "select * from contacts where email = 'person@example.com'",
      "http.request.body": "private body",
      "url.full": "https://example.test/private?token=secret",
      "customer.email": "person@example.com",
      "storage.object_key": "business/private.pdf",
      "http.response.status_code": 200,
    })).toEqual({
      "db.statement": "[redacted]",
      "http.request.body": "[redacted]",
      "url.full": "[redacted]",
      "customer.email": "[redacted]",
      "storage.object_key": "[redacted]",
      "http.response.status_code": 200,
    });
  });

  it("parses direct OTLP headers without truncating padding", () => {
    expect(parseOtlpHeaders("Authorization=Bearer phc_test,api-key=abc==")).toEqual({
      Authorization: "Bearer phc_test",
      "api-key": "abc==",
    });
  });

  it("redacts nested structured log bodies before direct export", () => {
    expect(redactExportLogValue({
      event: "upload_failed",
      request: {
        body: "private body",
        customerEmail: "person@example.com",
      },
      errors: ["Bearer secret-token", "safe diagnostic"],
    })).toEqual({
      event: "upload_failed",
      request: {
        body: "[redacted]",
        customerEmail: "[redacted]",
      },
      errors: ["Bearer [redacted]", "safe diagnostic"],
    });
  });

  it("suppresses automatic HTTP spans for AWS and configured storage endpoints", () => {
    registerStorageHttpEndpoint("http://minio.internal:9000");
    expect(isStorageHttpRequest({ origin: "http://minio.internal:9000" })).toBe(true);
    expect(isStorageHttpRequest({ origin: "https://bucket.s3.us-east-1.amazonaws.com" })).toBe(true);
    expect(isStorageHttpRequest({ getHeader: () => "s3.amazonaws.com" })).toBe(true);
    expect(isStorageHttpRequest({ origin: "https://api.example.test" })).toBe(false);
  });

  it("initializes as a no-op when no OTLP endpoint is configured", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    await expect(initializeTelemetry({ serviceName: "lobbystack-test" })).resolves.toBeUndefined();
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });
});
