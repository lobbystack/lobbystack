import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createHandlerRegistry,
  parseQueueJob,
  runHandler,
} from "./handlers.js";
import { JOB_NAMES } from "@lobbystack/jobs";

describe("handler registry", () => {
  it("registers every declared job type", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = createHandlerRegistry({
      db: {} as never,
      logger,
      storage: null,
    });

    for (const jobType of JOB_NAMES) {
      expect(registry[jobType]).toBeTypeOf("function");
    }
  });

  it("runs stub handlers without throwing", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = createHandlerRegistry({
      db: {} as never,
      logger,
      storage: null,
    });

    await runHandler(
      registry,
      {
        jobId: randomUUID(),
        jobType: "email.send",
        payload: {
          businessId: "550e8400-e29b-41d4-a716-446655440000",
          messageId: "660e8400-e29b-41d4-a716-446655440001",
        },
      },
      {
        db: {} as never,
        logger,
        storage: null,
      },
    );

    expect(logger.info).toHaveBeenCalledWith(
      "Stub job handler completed",
      expect.objectContaining({ jobType: "email.send" }),
    );
  });

  it("parses queue jobs from bullmq payloads", () => {
    const jobId = randomUUID();
    const parsed = parseQueueJob({
      jobId,
      jobType: "snapshot.refresh",
      payload: {
        businessId: "550e8400-e29b-41d4-a716-446655440000",
      },
      traceContext: {
        traceparent: "00-4bf92f3577b34da5953db2ef843c5aa1-00ff0abc0def1234-01",
      },
    });

    expect(parsed.jobId).toBe(jobId);
    expect(parsed.jobType).toBe("snapshot.refresh");
    expect(parsed.traceContext?.traceparent).toContain("00-");
  });
});
