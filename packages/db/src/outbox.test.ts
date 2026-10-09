import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { initializeTelemetry, shutdownTelemetry, withSpan } from "@lobbystack/telemetry/node";

import type { DatabaseTransaction } from "./client";
import { enqueueOutbox, OUTBOX_MAX_ATTEMPTS, shouldDeadLetterOutbox } from "./outbox";

describe("outbox retry policy", () => {
  it("retries below the terminal attempt threshold", () => {
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS - 1)).toBe(false);
  });

  it("dead-letters at and above the terminal attempt threshold", () => {
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS)).toBe(true);
    expect(shouldDeadLetterOutbox(OUTBOX_MAX_ATTEMPTS + 1)).toBe(true);
  });
});

describe("outbox trace context", () => {
  function recordingTransaction() {
    const rows: Array<Record<string, unknown>> = [];
    const tx = { insert: () => ({ values: (row: Record<string, unknown>) => {
      rows.push(row);
      return { onConflictDoNothing: () => ({ returning: async () => [{ id: "outbox_1" }] }) };
    } }) };
    return { tx: tx as unknown as DatabaseTransaction, rows };
  }
  const message = { topic: "call.saveRecording", aggregateType: "call", dedupeKey: "call-recording:call_1", payload: { callId: "call_1" } };

  it("stores no trace when tracing is off", async () => {
    const { tx, rows } = recordingTransaction();
    await enqueueOutbox(tx, message);
    expect(rows[0]).toMatchObject({ traceparent: undefined, tracestate: undefined });
  });

  it("stores the active trace, so the job continues it", async () => {
    const receiver = createServer((request, response) => {
      request.resume();
      request.on("end", () => response.end("{}"));
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      const { tx, rows } = recordingTransaction();
      const traceId = await withSpan("live.call", {}, async (span) => {
        await enqueueOutbox(tx, message);
        return span.spanContext().traceId;
      });
      expect(rows[0]?.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
      // A caller's own trace still wins.
      await enqueueOutbox(tx, { ...message, trace: { traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" } });
      expect(rows[1]?.traceparent).toBe("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });
});
