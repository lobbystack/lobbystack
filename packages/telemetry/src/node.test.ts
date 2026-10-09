import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

import { forceFlushTelemetryLogs, getLogger, initializeTelemetry, isStorageHttpRequest, redactExportAttributes, redactExportLogValue, redactOtelExceptionText, registerStorageHttpEndpoint, shutdownTelemetry } from "./node";

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

  it("drops the bound parameters Drizzle appends to query errors", () => {
    const value = redactOtelExceptionText("Failed query: insert into \"calendar_connections\" values ($1, $2)\nparams: biz-1,encrypted-access-token\n    at queryWithCache (chunk.js:8:1)");
    expect(value).toBe("Failed query: insert into \"calendar_connections\" values ($1, $2)\nparams: [omitted]\n    at queryWithCache (chunk.js:8:1)");
    expect(redactOtelExceptionText("params: biz-1,encrypted-access-token")).toBe("params: [omitted]");
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

  it("keeps call IDs whole on export but still redacts a phone number under an ID key", () => {
    expect(redactExportAttributes({
      "lobbystack.call_id": "12345678-1234-4234-8234-123456789012",
      "lobbystack.session_id": "rtc_u1_20261009123456789",
      "lobbystack.twilio_call_sid": "CA1234567890abcdef1234567890abcdef",
      "lobbystack.business_id": "+14165551234",
    })).toEqual({
      "lobbystack.call_id": "12345678-1234-4234-8234-123456789012",
      "lobbystack.session_id": "rtc_u1_20261009123456789",
      "lobbystack.twilio_call_sid": "CA1234567890abcdef1234567890abcdef",
      "lobbystack.business_id": "[redacted-phone]",
    });
    expect(redactExportLogValue({ callId: "12345678-1234-4234-8234-123456789012", jobId: "4165551234", detail: "rtc_u1_20261009123456789" })).toEqual({
      callId: "12345678-1234-4234-8234-123456789012",
      jobId: "[redacted-phone]",
      detail: "rtc_u1_[redacted-phone]",
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

  it("explicitly flushes logs owned by NodeSDK", async () => {
    const paths: string[] = [];
    const receiver = createServer(async (request, response) => {
      for await (const _chunk of request) { /* Drain the request before responding. */ }
      paths.push(request.url ?? "");
      response.writeHead(200, { "content-type": "application/x-protobuf" });
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      receiver.once("error", reject);
      receiver.listen(0, "127.0.0.1", resolve);
    });
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");

    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      getLogger("telemetry-test").emit({ body: "flush before exit" });

      await forceFlushTelemetryLogs();

      expect(paths).toContain("/v1/logs");
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve, reject) => receiver.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("exports console warnings and errors as redacted logs", async () => {
    const logBodies: string[] = [];
    const receiver = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      if (request.url === "/v1/logs") logBodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });

    await new Promise<void>((resolve, reject) => {
      receiver.once("error", reject);
      receiver.listen(0, "127.0.0.1", resolve);
    });
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      console.error("[worker] job failed for %s", "person@example.com");
      console.warn("[admin] slow query");

      await forceFlushTelemetryLogs();

      const exported = logBodies.join("\n");
      expect(exported).toContain("[worker] job failed for [redacted-email]");
      expect(exported).toContain("[admin] slow query");
      expect(exported).not.toContain("person@example.com");
      expect(consoleError).toHaveBeenCalledWith("[worker] job failed for %s", "person@example.com");
    } finally {
      await shutdownTelemetry();
      consoleError.mockRestore();
      consoleWarn.mockRestore();
      await new Promise<void>((resolve, reject) => receiver.close((error) => error ? reject(error) : resolve()));
    }
  });
});
