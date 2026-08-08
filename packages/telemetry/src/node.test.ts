import { SpanStatusCode } from "@opentelemetry/api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  getTracer,
  initializeTelemetry,
  shutdownTelemetry,
  withSpan,
} from "./node";
import { createTestTelemetry } from "./testing";

describe("node telemetry", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const telemetry = createTestTelemetry();
    await telemetry.shutdown();
  });

  it("creates spans through createTestTelemetry", async () => {
    const telemetry = createTestTelemetry();
    const tracer = telemetry.getTracer("test");

    await tracer.startActiveSpan("test.operation", async (span) => {
      span.setAttribute("operation", "create");
      span.end();
    });

    await telemetry.forceFlush();

    const spans = telemetry.spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("test.operation");
    expect(spans[0]?.attributes.operation).toBe("create");
  });

  it("redacts sensitive attributes in withSpan", async () => {
    const telemetry = createTestTelemetry();

    await withSpan(
      "test.redaction",
      async () => "ok",
      {
        body: "secret transcript",
        customerPhone: "+14165550000",
        harmless: "visible",
      },
    );

    await telemetry.forceFlush();

    const spans = telemetry.spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes.body).toBe("[redacted]");
    expect(spans[0]?.attributes.customerPhone).toBe("***0000");
    expect(spans[0]?.attributes.harmless).toBe("visible");
  });

  it("records exceptions on span failures", async () => {
    const telemetry = createTestTelemetry();

    await expect(
      withSpan("test.failure", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await telemetry.forceFlush();

    const spans = telemetry.spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("does not fail service startup when exporter initialization fails", async () => {
    const exporterSpy = vi
      .spyOn(
        await import("@opentelemetry/exporter-trace-otlp-http"),
        "OTLPTraceExporter",
      )
      .mockImplementation(() => {
        throw new Error("exporter unavailable");
      });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      initializeTelemetry({ endpoint: "http://localhost:4318" }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[telemetry] OpenTelemetry initialization failed; continuing without exporter",
      expect.any(Error),
    );

    const tracer = getTracer("startup-test");
    expect(tracer).toBeDefined();

    exporterSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
