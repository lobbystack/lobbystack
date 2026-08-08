import nodemailer, { type Transporter } from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  from: string;
  replyTo?: string;
};

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function smtpConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = (env.EMAIL_FROM ?? env.EMAIL_FROM_ADDRESS)?.trim();
  if (!host || !from) {
    return null;
  }

  return {
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: (env.SMTP_SECURE ?? "false") === "true",
    ...(env.SMTP_USERNAME ? { username: env.SMTP_USERNAME } : {}),
    ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
    from,
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
  };
}

export class SmtpEmailProvider {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.username && config.password
        ? { auth: { user: config.username, pass: config.password } }
        : {}),
    });
  }

  async send(email: TransactionalEmail): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
    });
  }
}
