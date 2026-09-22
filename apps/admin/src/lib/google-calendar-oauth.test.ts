import { afterEach, describe, expect, it, vi } from "vitest";

import { createCalendarOAuthState, verifyCalendarOAuthState } from "./google-calendar-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
    expect(verifyCalendarOAuthState(`${state}.extra`)).toBeNull();
  });
  it("rejects legacy, unknown-version and oversized state without compatibility work", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const state = createCalendarOAuthState({ userId: "user", businessId: "business" });
    expect(state).toMatch(/^v1\./);
    expect(verifyCalendarOAuthState(state.slice(3))).toBeNull();
    expect(verifyCalendarOAuthState(state.replace("v1.", "v2."))).toBeNull();
    expect(verifyCalendarOAuthState(`v1.${"a".repeat(2048)}.signature`)).toBeNull();
  });
  it("uses unique nonces and rejects expired or far-future issuance", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const state = createCalendarOAuthState({ userId: "user", businessId: "business" });
    expect(createCalendarOAuthState({ userId: "user", businessId: "business" })).not.toBe(state);
    clock.mockReturnValue(1_800_000_000_000 + 11 * 60_000);
    expect(verifyCalendarOAuthState(state)).toBeNull();
    clock.mockReturnValue(1_800_000_000_000 - 60_000);
    expect(verifyCalendarOAuthState(state)).toBeNull();
  });
});
