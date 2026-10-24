import { afterEach, describe, expect, it, vi } from "vitest";

import { createCalendarOAuthState } from "./google-calendar-oauth";
import { createInstagramOAuthState, verifyInstagramOAuthState } from "./instagram-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Instagram OAuth state", () => {
  it("round-trips the signed user and business", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const state = createInstagramOAuthState({ userId: "user-1", businessId: "business-1" });
    expect(verifyInstagramOAuthState(state)).toMatchObject({ userId: "user-1", businessId: "business-1" });
  });

  it("rejects a tampered state, or one signed with another secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const state = createInstagramOAuthState({ userId: "user-1", businessId: "business-1" });
    expect(verifyInstagramOAuthState(`${state}x`)).toBeNull();
    expect(verifyInstagramOAuthState(`${state}.extra`)).toBeNull();
    vi.stubEnv("BETTER_AUTH_SECRET", "other-secret");
    expect(verifyInstagramOAuthState(state)).toBeNull();
  });

  it("rejects a Google Calendar state", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    expect(verifyInstagramOAuthState(createCalendarOAuthState({ userId: "user-1", businessId: "business-1" }))).toBeNull();
  });

  it("rejects a state older than ten minutes", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    vi.useFakeTimers({ now: new Date("2026-10-24T12:00:00Z") });
    const state = createInstagramOAuthState({ userId: "user-1", businessId: "business-1" });
    vi.setSystemTime(new Date("2026-10-24T12:10:01Z"));
    expect(verifyInstagramOAuthState(state)).toBeNull();
  });
});
