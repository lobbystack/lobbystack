import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("transactional email provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("renders the password reset template with the requested variables", async () => {
    const { renderTransactionalEmail } = await import("../../../convex/lib/providers/email");

    const email = renderTransactionalEmail({
      template: "password_reset",
      to: "owner@example.com",
      subject: "Reset your password",
      variables: {
        code: "12345678",
        expiresMinutes: "15",
      },
    });

    expect(email.subject).toBe("Reset your password");
    expect(email.text).toContain("12345678");
    expect(email.text).toContain("15 minutes");
    expect(email.html).toContain("<strong>12345678</strong>");
  });

  it("uses Resend test mode in development", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "development");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");

    const { getTransactionalEmailConfig } = await import("../../../convex/lib/providers/email");

    expect(getTransactionalEmailConfig()).toEqual({
      fromAddress: "noreply@example.com",
      resendOptions: {
        apiKey: "re_test_123",
        testMode: true,
      },
    });
  });

  it("fails clearly when Resend credentials are missing outside development", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@example.com");

    const { getTransactionalEmailConfig } = await import("../../../convex/lib/providers/email");

    expect(() => getTransactionalEmailConfig()).toThrow(
      "RESEND_API_KEY is required to send email outside development.",
    );
  });
});
