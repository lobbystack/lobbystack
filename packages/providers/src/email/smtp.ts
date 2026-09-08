import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  replyTo?: string;
};

export class SmtpEmailProvider {
  private readonly transporter: Transporter;
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig, transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  })) {
    this.config = config;
    this.transporter = transporter;
  }

  async sendTemplate(input: { template: "verify_email" | "password_reset" | "invitation" | "operator_alert" | "feedback_submission"; to: string; subject: string; variables: Record<string, string>; idempotencyKey?: string }): Promise<{ messageId: string }> {
    const body = templateBody(input.template, input.variables);
    const result = await this.transporter.sendMail({
      from: this.config.from,
      ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      to: input.to,
      subject: input.subject,
      text: body,
      ...(input.idempotencyKey ? { messageId: `<${createHash("sha256").update(input.idempotencyKey).digest("hex")}@mail.lobbystack.internal>` } : {}),
    });
    return { messageId: result.messageId };
  }
}

function templateBody(template: "verify_email" | "password_reset" | "invitation" | "operator_alert" | "feedback_submission", variables: Record<string, string>): string {
  switch (template) {
    case "verify_email":
      return `Verify your LobbyStack email address using this link: ${variables.url ?? ""}`;
    case "password_reset":
      return variables.code
        ? `Your LobbyStack password reset code is: ${variables.code}. It expires in 10 minutes.`
        : `Reset your LobbyStack password using this link: ${variables.url ?? ""}`;
    case "invitation":
      return `You have been invited to join LobbyStack. Accept the invitation here: ${variables.url ?? ""}`;
    case "operator_alert":
      return variables.message ?? "LobbyStack operator notification";
    case "feedback_submission":
      return variables.body ?? "LobbyStack dashboard feedback";
  }
}
