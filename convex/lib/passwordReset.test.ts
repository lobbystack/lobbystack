import { describe, expect, it } from "vitest";

import { shouldLogPasswordResetCodeInDevelopment } from "./passwordReset";

describe("password reset development delivery", () => {
  it("logs codes for normal email addresses in development", () => {
    expect(
      shouldLogPasswordResetCodeInDevelopment("owner@example.com", {
        DEPLOYMENT_MODE: "development",
      }),
    ).toBe(true);
  });

  it("keeps Resend test inboxes on the email path in development", () => {
    expect(
      shouldLogPasswordResetCodeInDevelopment("delivered+reset-test@resend.dev", {
        DEPLOYMENT_MODE: "development",
      }),
    ).toBe(false);
  });

  it("does not log reset codes outside development", () => {
    expect(
      shouldLogPasswordResetCodeInDevelopment("owner@example.com", {
        DEPLOYMENT_MODE: "cloud",
      }),
    ).toBe(false);
  });
});
