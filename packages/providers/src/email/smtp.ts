import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";
import { assertCertificationRecipient } from "@lobbystack/shared";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  replyTo?: string;
};

type TemplateName = "existing_account" | "verify_email" | "password_reset" | "invitation" | "operator_alert" | "feedback_submission";

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

  async sendTemplate(input: { template: TemplateName; to: string; subject: string; variables: Record<string, string>; idempotencyKey?: string }): Promise<{ messageId: string }> {
    assertCertificationRecipient("email", input.to);
    const email = renderTemplate(input.template, input.subject, input.variables);
    const result = await this.transporter.sendMail({
      from: this.config.from,
      ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      to: input.to,
      subject: input.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(input.idempotencyKey ? { messageId: `<${createHash("sha256").update(input.idempotencyKey).digest("hex")}@mail.lobbystack.internal>` } : {}),
    });
    return { messageId: result.messageId };
  }
}

function renderTemplate(template: TemplateName, subject: string, variables: Record<string, string>): { text: string; html?: string } {
  const text = templateBody(template, variables);

  if (template !== "verify_email" || !variables.code) {
    return { text };
  }

  const code = escapeHtml(variables.code);
  return {
    text,
    html: renderEmailLayout({
      previewText: subject,
      content: [
        '<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">Verify your email address</h1>',
        '<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">Enter this verification code to finish setting up your LobbyStack account.</p>',
        `<p style="margin:0 0 24px;padding:16px 24px;background-color:#F3F4F6;border-radius:16px;font-size:32px;font-weight:600;line-height:1.25;letter-spacing:8px;color:#0B0B0D;text-align:center;">${code}</p>`,
        '<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">This code expires in 10 minutes.</p>',
        '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">If you did not request this code, you can safely ignore this email.</p>',
      ].join(""),
    }),
  };
}

function templateBody(template: TemplateName, variables: Record<string, string>): string {
  switch (template) {
    case "existing_account":
      return variables.locale === "fr"
        ? `Vous avez déjà un compte LobbyStack. Connectez-vous pour continuer : ${variables.signInUrl}. Mot de passe oublié ? ${variables.resetUrl}. Si vous n’avez pas demandé la création d’un compte, ignorez cet e-mail.`
        : `You already have a LobbyStack account. Sign in to continue: ${variables.signInUrl}. Forgot your password? ${variables.resetUrl}. If you did not request an account, ignore this email.`;
    case "verify_email":
      return variables.code
        ? `Your LobbyStack email verification code is: ${variables.code}. It expires in 10 minutes.`
        : `Verify your LobbyStack email address using this link: ${variables.url ?? ""}`;
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

function renderEmailLayout({ previewText, content }: { previewText: string; content: string }): string {
  const escapedPreviewText = escapeHtml(previewText);
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-30 -30 278 291" role="img" aria-label="LobbyStack"><g transform="translate(0.000000,231.000000) scale(0.100000,-0.100000)" fill="#0B0B0D" stroke="none"><path d="M968 2280 c-42 -16 -195 -79 -340 -141 -144 -62 -317 -133 -383 -159 -90 -36 -130 -58 -162 -88 -85 -82 -78 2 -81 -976 -3 -968 -6 -916 63 -916 19 0 54 9 77 20 24 10 147 62 273 114 338 138 342 140 365 178 20 32 20 48 20 763 0 702 1 731 19 761 12 19 34 37 54 43 33 11 54 4 398 -133 267 -107 370 -152 387 -171 26 -31 23 42 25 -725 l2 -673 c0 -50 8 -86 19 -86 11 -12 31 -21 47 -21 24 0 296 106 358 140 11 5 30 27 43 47 l23 38 l0 654 0 836 -27 46 c-48 81 -77 98 -404 233 -170 71 -371 155 -447 187 -165 71 -208 75 -329 29z"/></g></svg>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapedPreviewText}</title>
    <style>
      :root { color-scheme: light; }
      @media only screen and (max-width: 620px) {
        .email-container { width: 100% !important; padding: 24px 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" class="email-container" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:24px;padding:48px;">
            <tr>
              <td align="center" style="padding-bottom:32px;">
                ${logoSvg}
              </td>
            </tr>
            <tr>
              <td>
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
