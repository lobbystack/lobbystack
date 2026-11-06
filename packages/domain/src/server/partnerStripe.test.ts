import { describe, expect, it } from "vitest";

import { partnerOnboardingIdempotencyKey } from "./partnerStripe";

describe("partnerOnboardingIdempotencyKey", () => {
  const at = (iso: string) => new Date(iso);

  it("keeps the key for clicks within the same ten minutes", () => {
    expect(partnerOnboardingIdempotencyKey("p1", null, "CA", at("2026-11-05T22:00:01Z")))
      .toBe(partnerOnboardingIdempotencyKey("p1", null, "CA", at("2026-11-05T22:09:59Z")));
  });

  it("changes the key for a retry after a refused attempt, so Stripe does not replay the old error", () => {
    expect(partnerOnboardingIdempotencyKey("p1", null, "CA", at("2026-11-05T17:21:16Z")))
      .not.toBe(partnerOnboardingIdempotencyKey("p1", null, "CA", at("2026-11-05T23:01:53Z")));
  });

  it("changes the key after a disconnection and for another country", () => {
    const now = at("2026-11-05T22:00:00Z");
    const first = partnerOnboardingIdempotencyKey("p1", null, "CA", now);
    expect(partnerOnboardingIdempotencyKey("p1", "acct_old", "CA", now)).not.toBe(first);
    expect(partnerOnboardingIdempotencyKey("p1", null, "US", now)).not.toBe(first);
  });
});
