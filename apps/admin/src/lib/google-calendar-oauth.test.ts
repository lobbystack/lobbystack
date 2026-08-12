import { afterEach, describe, expect, it, vi } from "vitest";

import { createCalendarOAuthState, verifyCalendarOAuthState } from "./google-calendar-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google Calendar OAuth state", () => {
  it("round-trips signed tenant and user context", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const state = createCalendarOAuthState({ userId: "user-1", businessId: "business-1" });
    expect(verifyCalendarOAuthState(state)).toMatchObject({ userId: "user-1", businessId: "business-1" });
  });

  it("rejects tampered state", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const state = createCalendarOAuthState({ userId: "user-1", businessId: "business-1" });
    expect(verifyCalendarOAuthState(`${state}tampered`)).toBeNull();
  });
});
