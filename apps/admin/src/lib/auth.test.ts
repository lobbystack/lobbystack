import { describe, expect, it } from "vitest";

import { isDisabledAuthEmailEndpoint } from "./auth";

describe("auth email endpoint policy", () => {
  it("blocks public OTP send and passwordless endpoints", () => {
    expect(isDisabledAuthEmailEndpoint("/send-verification-email")).toBe(true);
    expect(isDisabledAuthEmailEndpoint("/email-otp/send-verification-otp")).toBe(true);
    expect(isDisabledAuthEmailEndpoint("/sign-in/email-otp")).toBe(true);
  });

  it("allows only the required public OTP endpoints", () => {
    expect(isDisabledAuthEmailEndpoint("/email-otp/verify-email")).toBe(false);
    expect(isDisabledAuthEmailEndpoint("/email-otp/request-password-reset")).toBe(false);
    expect(isDisabledAuthEmailEndpoint("/email-otp/reset-password")).toBe(false);
  });

  it("allows server-only OTP methods that have no route path", () => {
    expect(isDisabledAuthEmailEndpoint(undefined)).toBe(false);
  });
});
