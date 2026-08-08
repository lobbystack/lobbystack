import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "msg-1" });
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import { SmtpEmailProvider, smtpConfigFromEnvironment } from "./smtp";

describe("smtp", () => {
  beforeEach(() => {
    sendMail.mockClear();
    createTransport.mockClear();
  });

  it("builds config from environment variables", () => {
    expect(
      smtpConfigFromEnvironment({
        SMTP_HOST: "mailpit",
        SMTP_PORT: "1025",
        EMAIL_FROM: "noreply@example.test",
      }),
    ).toEqual({
      host: "mailpit",
      port: 1025,
      secure: false,
      from: "noreply@example.test",
    });
  });

  it("returns null when required SMTP settings are missing", () => {
    expect(smtpConfigFromEnvironment({ SMTP_HOST: "mailpit" })).toBeNull();
  });

  it("sends transactional email through nodemailer", async () => {
    const provider = new SmtpEmailProvider({
      host: "mailpit",
      port: 1025,
      secure: false,
      from: "noreply@example.test",
    });

    await provider.send({
      to: "operator@example.test",
      subject: "Test",
      text: "Hello",
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "mailpit",
      port: 1025,
      secure: false,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "noreply@example.test",
      to: "operator@example.test",
      subject: "Test",
      text: "Hello",
    });
  });
});
