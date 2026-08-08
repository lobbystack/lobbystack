import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredCheckoutSessionToken,
  getStoredCheckoutSessionToken,
  scrubCheckoutSessionTokenFromLocation,
} from "./checkout-session-token";

describe("checkout session token storage", () => {
  beforeEach(() => {
    clearStoredCheckoutSessionToken();
    window.sessionStorage.clear();
    window.history.replaceState(
      null,
      "",
      "/settings/plan?checkout=success&customer_session_token=polar_cst_secret#top",
    );
  });

  it("scrubs Polar customer session tokens from the URL before analytics can read it", () => {
    scrubCheckoutSessionTokenFromLocation();

    expect(window.location.pathname).toBe("/settings/plan");
    expect(window.location.search).toBe("?checkout=success");
    expect(window.location.hash).toBe("#top");
    expect(getStoredCheckoutSessionToken()).toBe("polar_cst_secret");
  });
});
