import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enforceFeedbackRateLimit } from "./feedback-rate-limit";

function store() {
  const counts = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe("feedback rate limiting", () => {
  it("limits each user independently", async () => {
    const redis = store();
    for (let index = 0; index < 10; index += 1) await enforceFeedbackRateLimit(redis as never, { userId: "user-a", businessId: "business-a" }, 1);
    await expect(enforceFeedbackRateLimit(redis as never, { userId: "user-a", businessId: "business-a" }, 1)).rejects.toThrow("Too many feedback submissions");
    await expect(enforceFeedbackRateLimit(redis as never, { userId: "user-b", businessId: "business-a" }, 1)).resolves.toBeUndefined();
  });

  it("limits aggregate business submissions", async () => {
    const redis = store();
    for (let index = 0; index < 50; index += 1) await enforceFeedbackRateLimit(redis as never, { userId: `user-${index}`, businessId: "business-a" }, 2);
    await expect(enforceFeedbackRateLimit(redis as never, { userId: "user-final", businessId: "business-a" }, 2)).rejects.toThrow("Too many feedback submissions");
    expect(redis.expire).toHaveBeenCalled();
  });
});
