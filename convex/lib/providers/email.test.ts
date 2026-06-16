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

  it("renders the team invitation template with a branded layout", async () => {
    const { renderTransactionalEmail } = await import("./email");

    const email = renderTransactionalEmail({
      template: "team_invitation",
      to: "new-member@example.com",
      subject: "Join Maple Clinic on LobbyStack",
      variables: {
        acceptUrl: "https://app.example.com/accept-invite?token=abc123",
        businessName: "Maple Clinic",
        inviterName: "Raphaël Morency",
        roleLabel: "Viewer",
        expiresDays: "7",
      },
    });

    expect(email.subject).toBe("Join Maple Clinic on LobbyStack");
    expect(email.html).toContain("Join the Maple Clinic team on LobbyStack");
    expect(email.html).toContain("Raphaël Morency");
    expect(email.html).toContain("Maple Clinic");
    expect(email.html).toContain("Viewer");
    expect(email.html).toContain('href="https://app.example.com/accept-invite?token=abc123"');
    expect(email.html).toContain("Accept invitation");
    expect(email.html).toContain("border-radius:9999px");
    expect(email.html).toContain("This invitation expires in 7 days");
    expect(email.text).toContain("Raphaël Morency invited you to join Maple Clinic on LobbyStack as a Viewer.");
    expect(email.text).toContain("Accept invitation: https://app.example.com/accept-invite?token=abc123");
  });

  it("renders the password reset template with the requested variables", async () => {
    const { renderTransactionalEmail } = await import("./email");

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

  it("renders the email confirmation template with the requested link", async () => {
    const { renderTransactionalEmail } = await import("./email");

    const email = renderTransactionalEmail({
      template: "verify_email",
      to: "updated@example.com",
      subject: "Confirm your new email",
      variables: {
        confirmUrl: "https://example.com/confirm-email-change?token=test&email=updated%40example.com",
        expiresMinutes: "30",
      },
    });

    expect(email.subject).toBe("Confirm your new email");
    expect(email.text).toContain("confirm-email-change");
    expect(email.text).toContain("30 minutes");
    expect(email.html).toContain("Confirm your new email");
    expect(email.html).toContain("href=\"https://example.com/confirm-email-change?token=test&amp;email=updated%40example.com\"");
  });

  it("renders dashboard feedback submissions with escaped content", async () => {
    const { renderTransactionalEmail } = await import("./email");

    const email = renderTransactionalEmail({
      template: "feedback_submission",
      to: "feedback@example.com",
      subject: "LobbyStack feedback from Maple Clinic",
      variables: {
        body: "A helpful idea\n\n<script>alert('x')</script>",
      },
    });

    expect(email.subject).toBe("LobbyStack feedback from Maple Clinic");
    expect(email.text).toContain("A helpful idea");
    expect(email.html).toContain("A helpful idea<br /><br />");
    expect(email.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("uses Resend test mode in development", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "development");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");

    const { getTransactionalEmailConfig } = await import("./email");

    expect(getTransactionalEmailConfig()).toEqual({
      fromAddress: "noreply@example.com",
      resendOptions: {
        apiKey: "re_test_123",
        testMode: true,
      },
    });
  });

  it("defaults to development test mode when deployment mode is unset", async () => {
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");

    const { getTransactionalEmailConfig } = await import("./email");

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

    const { getTransactionalEmailConfig } = await import("./email");

    expect(() => getTransactionalEmailConfig()).toThrow(
      "RESEND_API_KEY is required to send email outside development.",
    );
  });
});
