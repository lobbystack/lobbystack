import { describe, expect, it, vi } from "vitest";

import { SmtpEmailProvider } from "./smtp";

describe("SMTP delivery", () => {
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
