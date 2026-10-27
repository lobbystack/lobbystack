// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { rememberInvitedEmail, takeInvitedEmail } from "./invited-email";

afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); });

it("hands the invited address to the next form once", () => {
  rememberInvitedEmail("owner@example.test");
  expect(takeInvitedEmail()).toBe("owner@example.test");
  expect(takeInvitedEmail()).toBeNull();
});

it("forgets an address after ten minutes", () => {
  vi.useFakeTimers();
  rememberInvitedEmail("owner@example.test");
  vi.advanceTimersByTime(10 * 60_000 + 1);
  expect(takeInvitedEmail()).toBeNull();
});
