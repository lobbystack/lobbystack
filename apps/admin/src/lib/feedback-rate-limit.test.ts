import { beforeEach, describe, expect, it, vi } from "vitest";

const enforce = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./fixed-window-limit", async (importOriginal) => ({ ...await importOriginal<typeof import("./fixed-window-limit")>(), enforceFixedWindow: enforce }));

import { assertFeedbackSubmissionAllowed } from "./feedback-rate-limit";

describe("feedback rate limiting", () => {
  beforeEach(() => enforce.mockReset());

  it("limits each user and the aggregate business separately", async () => {
    enforce.mockResolvedValue({ allowed: true });
    await assertFeedbackSubmissionAllowed({ userId: "user-a", businessId: "business-a" });
    const [limits] = enforce.mock.calls[0]!;
    expect(limits.map((entry: { name: string; limit: number; windowSeconds: number }) => [entry.name, entry.limit, entry.windowSeconds])).toEqual([
      ["user-hour", 10, 3600],
      ["business-hour", 50, 3600],
    ]);
  });

  it("rejects a submission over the limit", async () => {
    enforce.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
    await expect(assertFeedbackSubmissionAllowed({ userId: "user-a" })).rejects.toThrow("Too many feedback submissions");
  });
});
