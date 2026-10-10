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
  it("stores the active span's traceparent on an enqueued row", async () => {
    // The SDK only starts with an OTLP endpoint, so give it one that accepts everything.
    const receiver = createServer(async (request, response) => {
      for await (const _chunk of request) { /* Drain the request before responding. */ }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    await new Promise<void>((resolve, reject) => {
      receiver.once("error", reject);
      receiver.listen(0, "127.0.0.1", resolve);
    });
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    const rows: Array<Record<string, unknown>> = [];
    const tx = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          rows.push(row);
          return { onConflictDoNothing: () => ({ returning: async () => [{ id: "message-1" }] }) };
        },
      }),
    } as unknown as DatabaseTransaction;

    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      const traceId = await withSpan("api.request", {}, async (span) => {
        await enqueueOutbox(tx, { topic: "sms.send", aggregateType: "message", dedupeKey: "message:1:send", payload: {} });
        return span.spanContext().traceId;
      });

      expect(rows[0]?.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve, reject) => receiver.close((error) => error ? reject(error) : resolve()));
    }
  });
});
