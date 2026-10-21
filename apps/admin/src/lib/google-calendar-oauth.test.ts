import { afterEach, describe, expect, it, vi } from "vitest";

import { CALENDAR_CONNECT_LINK_LIFETIME_MS, createCalendarConnectLink, createCalendarOAuthState, verifyCalendarConnectLinkToken, verifyCalendarOAuthState } from "./google-calendar-oauth";

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

describe("Google Calendar connect links", () => {
  const linkToken = (businessId = "business-1") => new URL(createCalendarConnectLink({ origin: "https://app.example.test", businessId }).url).searchParams.get("token")!;

  it("opens the dashboard's connect page for one business, for a week", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const link = createCalendarConnectLink({ origin: "https://app.example.test", businessId: "business-1" });
    const url = new URL(link.url);
    expect(`${url.origin}${url.pathname}`).toBe("https://app.example.test/api/calendar/google/connect");
    expect(url.searchParams.get("businessId")).toBe("business-1");
    expect(link.expiresAt.getTime()).toBe(1_800_000_000_000 + 7 * 24 * 60 * 60_000);
    expect(verifyCalendarConnectLinkToken(url.searchParams.get("token")!)).toMatchObject({ businessId: "business-1" });
  });

  it("never takes a link for an OAuth state, or a state for a link", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const token = linkToken();
    expect(verifyCalendarOAuthState(token)).toBeNull();
    expect(verifyCalendarConnectLinkToken(createCalendarOAuthState({ userId: "user-1", businessId: "business-1" }))).toBeNull();
    expect(verifyCalendarConnectLinkToken(`${token}tampered`)).toBeNull();
    vi.stubEnv("BETTER_AUTH_SECRET", "another-secret");
    expect(verifyCalendarConnectLinkToken(token)).toBeNull();
  });

  it("stops working once its week is over", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "oauth-test-secret");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const token = linkToken();
    clock.mockReturnValue(1_800_000_000_000 + CALENDAR_CONNECT_LINK_LIFETIME_MS);
    expect(verifyCalendarConnectLinkToken(token)).toMatchObject({ businessId: "business-1" });
    clock.mockReturnValue(1_800_000_000_000 + CALENDAR_CONNECT_LINK_LIFETIME_MS + 1);
    expect(verifyCalendarConnectLinkToken(token)).toBeNull();
  });
});
