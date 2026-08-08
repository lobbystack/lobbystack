import { describe, expect, it } from "vitest";

import {
  DLQ_QUEUE_NAME,
  DLQ_QUEUE_UID,
  JOB_NAMES,
  OUTBOX_TOPICS,
  deadLetterJobId,
  queueForJob,
  queueKey,
  repeatableJobId,
} from "./index";

describe("job routing", () => {
  it("keeps every declared job routable", () => {
    for (const jobName of JOB_NAMES) {
      expect(["critical", "default", "bulk", "maintenance"]).toContain(queueForJob(jobName));
    }
  });

  it("uses stable scheduler identifiers", () => {
    expect(repeatableJobId("telemetry.flush")).toBe("schedule:telemetry.flush");
    expect(repeatableJobId("privacy.cleanupPendingUpload", "daily-cleanup")).toBe("daily-cleanup");
  });
});

describe("queue identifiers", () => {
  it("exports stable queue identifiers", () => {
    expect(DLQ_QUEUE_NAME).toBe("dlq");
    expect(DLQ_QUEUE_UID).toBe("lobbystack-dlq");
    expect(queueKey("critical")).toBe("lobbystack-critical");
    expect(queueKey(DLQ_QUEUE_NAME)).toBe("lobbystack-dlq");
  });

  it("derives deterministic dead letter job ids", () => {
    expect(deadLetterJobId("critical", "job-1")).toBe("dlq:critical:job-1");
    expect(deadLetterJobId("default", "job-1")).toBe("dlq:default:job-1");
  });
});

describe("outbox topics", () => {
  it("aligns outbox topics with realtime event names", () => {
    expect(OUTBOX_TOPICS).toContain("call.started");
    expect(OUTBOX_TOPICS).toContain("document.progressed");
    expect(OUTBOX_TOPICS).toHaveLength(12);
  });
});
