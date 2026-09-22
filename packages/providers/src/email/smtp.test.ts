import { afterEach, describe, expect, it, vi } from "vitest";

import { SmtpEmailProvider } from "./smtp";

afterEach(() => vi.unstubAllEnvs());

describe("SMTP delivery", () => {
  it("blocks unapproved certification recipients before SMTP delivery", async () => {
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_EMAILS", "approved@example.invalid");
    const sendMail = vi.fn().mockResolvedValue({ messageId: "fixture" });
    const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "no-reply@example.test" }, { sendMail } as never);
    await expect(provider.sendTemplate({ template: "operator_alert", to: "other@example.invalid", subject: "Test", variables: {} })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
    expect(sendMail).not.toHaveBeenCalled();
    await provider.sendTemplate({ template: "operator_alert", to: "approved@example.invalid", subject: "Test", variables: {} });
    expect(sendMail).toHaveBeenCalledOnce();
  });
  it("sends reset codes as codes while preserving previously issued reset links", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "no-reply@example.test" }, { sendMail } as never);
    await provider.sendTemplate({ template: "password_reset", to: "recipient@example.test", subject: "Reset", variables: { code: "123456" } });
    expect(sendMail.mock.calls[0]?.[0].text).toBe("Your LobbyStack password reset code is: 123456. It expires in 10 minutes.");
    await provider.sendTemplate({ template: "password_reset", to: "recipient@example.test", subject: "Reset", variables: { url: "https://example.test/reset" } });
    expect(sendMail.mock.calls[1]?.[0].text).toContain("using this link: https://example.test/reset");
  });
  it("sends email verification codes while preserving email-change links", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "no-reply@example.test" }, { sendMail } as never);
    await provider.sendTemplate({ template: "verify_email", to: "recipient@example.test", subject: "Verify", variables: { code: "123456" } });
    expect(sendMail.mock.calls[0]?.[0].text).toBe("Your LobbyStack email verification code is: 123456. It expires in 10 minutes.");
    expect(sendMail.mock.calls[0]?.[0].html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(sendMail.mock.calls[0]?.[0].html).toContain("Verify your email address");
    expect(sendMail.mock.calls[0]?.[0].html).toContain(">123456</p>");
    await provider.sendTemplate({ template: "verify_email", to: "recipient@example.test", subject: "Verify", variables: { url: "https://example.test/verify" } });
    expect(sendMail.mock.calls[1]?.[0].text).toContain("using this link: https://example.test/verify");
    expect(sendMail.mock.calls[1]?.[0].html).toBeUndefined();
  });
  it("escapes verification email content before rendering branded HTML", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "no-reply@example.test" }, { sendMail } as never);
    await provider.sendTemplate({ template: "verify_email", to: "recipient@example.test", subject: "Verify <email>", variables: { code: "12<345" } });
    const html = sendMail.mock.calls[0]?.[0].html;
    expect(html).toContain("<title>Verify &lt;email&gt;</title>");
    expect(html).toContain(">12&lt;345</p>");
    expect(html).not.toContain(">12<345</p>");
  });
  it("uses a stable privacy-safe Message-ID for retries", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "no-reply@example.test" }, { sendMail } as never);
    const input = { template: "verify_email" as const, to: "recipient@example.test", subject: "Verify", variables: { url: "https://example.test/verify" }, idempotencyKey: "auth-email:stable" };
    await provider.sendTemplate(input);
    await provider.sendTemplate(input);
    const first = sendMail.mock.calls[0]?.[0].messageId;
    expect(first).toBe(sendMail.mock.calls[1]?.[0].messageId);
    expect(first).not.toContain("recipient");
  });
});
