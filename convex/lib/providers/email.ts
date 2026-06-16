import { Resend, type ResendOptions } from "@convex-dev/resend";

import { components } from "../../_generated/api";
import type { ActionCtx, MutationCtx } from "../../_generated/server";

type SendEmailCtx = Pick<ActionCtx, "runMutation"> | Pick<MutationCtx, "runMutation">;

type TransactionalTemplateName =
  | "verify_email"
  | "password_reset"
  | "operator_alert"
  | "feedback_submission"
  | "team_invitation";

type TransactionalTemplateInput = {
  template: TransactionalTemplateName;
  to: string;
  subject: string;
  variables: Record<string, string>;
};

const DEFAULT_PASSWORD_RESET_SUBJECT = "Reset your password";
const DEFAULT_VERIFY_EMAIL_SUBJECT = "Confirm your new email";
const DEFAULT_OPERATOR_ALERT_SUBJECT = "LobbyStack notification";
const DEFAULT_FEEDBACK_SUBMISSION_SUBJECT = "LobbyStack feedback";
const DEFAULT_TEAM_INVITATION_SUBJECT = "Join your team on LobbyStack";

export type TransactionalEmailConfig = {
  fromAddress: string;
  resendOptions: ResendOptions;
};

export function getTransactionalEmailConfig(
  env: Record<string, string | undefined> = process.env,
): TransactionalEmailConfig {
  const fromAddress = env.EMAIL_FROM_ADDRESS;
  if (!fromAddress) {
    throw new Error("EMAIL_FROM_ADDRESS is required to send transactional email.");
  }

  const deploymentMode = env.DEPLOYMENT_MODE ?? "development";
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      deploymentMode === "development"
        ? "RESEND_API_KEY is required to send email in development test mode."
        : "RESEND_API_KEY is required to send email outside development.",
    );
  }

  return {
    fromAddress,
    resendOptions: {
      apiKey,
      testMode: deploymentMode === "development",
    },
  };
}

export function renderTransactionalEmail(
  input: TransactionalTemplateInput,
): {
  subject: string;
  html: string;
  text: string;
} {
  switch (input.template) {
    case "verify_email":
      return renderVerifyEmailTemplate(input);
    case "password_reset":
      return renderPasswordResetEmail(input);
    case "feedback_submission":
      return renderFeedbackSubmissionEmail(input);
    case "team_invitation":
      return renderTeamInvitationEmail(input);
    case "operator_alert":
      return renderOperatorAlertEmail(input);
    default: {
      const exhaustiveTemplate: never = input.template;
      throw new Error(`Unsupported email template "${exhaustiveTemplate}".`);
    }
  }
}

export async function sendTransactionalEmail(
  ctx: SendEmailCtx,
  input: TransactionalTemplateInput,
): Promise<{ messageId: string }> {
  const { fromAddress, resendOptions } = getTransactionalEmailConfig();
  const email = renderTransactionalEmail(input);
  const resend = new Resend((components as any).resend, resendOptions);

  const messageId = await resend.sendEmail(
    ctx as Parameters<typeof resend.sendEmail>[0],
    {
      from: fromAddress,
      to: input.to,
      subject: input.subject || email.subject,
      html: email.html,
      text: email.text,
    },
  );

  return { messageId: String(messageId) };
}

function renderVerifyEmailTemplate(input: TransactionalTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const confirmUrl = requireTemplateVariable(input.template, input.variables, "confirmUrl");
  const expiresMinutes = requireTemplateVariable(
    input.template,
    input.variables,
    "expiresMinutes",
  );

  const subject = input.subject || DEFAULT_VERIFY_EMAIL_SUBJECT;
  const escapedConfirmUrl = escapeHtml(confirmUrl);
  const escapedExpiresMinutes = escapeHtml(expiresMinutes);

  return {
    subject,
    html: [
      "<p>You requested to change the sign-in email for your LobbyStack account.</p>",
      `<p><a href="${escapedConfirmUrl}">Confirm your new email</a></p>`,
      `<p>This confirmation link expires in ${escapedExpiresMinutes} minutes.</p>`,
      "<p>If you did not request this change, you can safely ignore this email.</p>",
    ].join(""),
    text: [
      "You requested to change the sign-in email for your LobbyStack account.",
      `Confirm your new email: ${confirmUrl}`,
      `This confirmation link expires in ${expiresMinutes} minutes.`,
      "If you did not request this change, you can safely ignore this email.",
    ].join("\n\n"),
  };
}

function renderPasswordResetEmail(input: TransactionalTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const code = requireTemplateVariable(input.template, input.variables, "code");
  const expiresMinutes = requireTemplateVariable(
    input.template,
    input.variables,
    "expiresMinutes",
  );

  const subject = input.subject || DEFAULT_PASSWORD_RESET_SUBJECT;
  const escapedCode = escapeHtml(code);
  const escapedExpiresMinutes = escapeHtml(expiresMinutes);

  return {
    subject,
    html: [
      "<p>You requested a password reset for your LobbyStack account.</p>",
      `<p>Your reset code is <strong>${escapedCode}</strong>.</p>`,
      `<p>This code expires in ${escapedExpiresMinutes} minutes.</p>`,
      "<p>If you did not request this, you can safely ignore this email.</p>",
    ].join(""),
    text: [
      "You requested a password reset for your LobbyStack account.",
      `Your reset code is ${code}.`,
      `This code expires in ${expiresMinutes} minutes.`,
      "If you did not request this, you can safely ignore this email.",
    ].join("\n\n"),
  };
}

function renderOperatorAlertEmail(input: TransactionalTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const body = requireTemplateVariable(input.template, input.variables, "body");
  const subject = input.subject || input.variables.subject || DEFAULT_OPERATOR_ALERT_SUBJECT;
  return renderBodyEmail(subject, body);
}

function renderFeedbackSubmissionEmail(input: TransactionalTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const body = requireTemplateVariable(input.template, input.variables, "body");
  const subject = input.subject || DEFAULT_FEEDBACK_SUBMISSION_SUBJECT;
  return renderBodyEmail(subject, body);
}

function renderTeamInvitationEmail(input: TransactionalTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const acceptUrl = requireTemplateVariable(input.template, input.variables, "acceptUrl");
  const businessName = requireTemplateVariable(input.template, input.variables, "businessName");
  const inviterName = requireTemplateVariable(input.template, input.variables, "inviterName");
  const roleLabel = requireTemplateVariable(input.template, input.variables, "roleLabel");
  const expiresDays = requireTemplateVariable(input.template, input.variables, "expiresDays");

  const subject = input.subject || DEFAULT_TEAM_INVITATION_SUBJECT;
  const escapedAcceptUrl = escapeHtml(acceptUrl);
  const escapedBusinessName = escapeHtml(businessName);
  const escapedInviterName = escapeHtml(inviterName);
  const escapedRoleLabel = escapeHtml(roleLabel);
  const escapedExpiresDays = escapeHtml(expiresDays);

  const headline = `Join the ${escapedBusinessName} team on LobbyStack`;
  const bodyHtml = [
    "You have been invited by ",
    `<strong>${escapedInviterName}</strong>`,
    " to join the ",
    `<strong>${escapedBusinessName}</strong>`,
    " team on LobbyStack as a ",
    `<strong>${escapedRoleLabel}</strong>`,
    ". To accept the invite, please click the button below.",
  ].join("");
  const footerHtml = `This invitation expires in ${escapedExpiresDays} days. If you were not expecting this invitation, you can safely ignore this email.`;

  const html = renderEmailLayout({
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${headline}</h1>`,
      `<p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${bodyHtml}</p>`,
      `<p style="margin:0 0 48px;text-align:center;">`,
      `<a href="${escapedAcceptUrl}" style="display:inline-block;padding:14px 28px;background-color:#0B0B0D;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:9999px;">Accept invitation</a>`,
      `</p>`,
      `<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">${footerHtml}</p>`,
    ].join(""),
  });

  return {
    subject,
    html,
    text: [
      `${inviterName} invited you to join ${businessName} on LobbyStack as a ${roleLabel}.`,
      `Accept invitation: ${acceptUrl}`,
      `This invitation expires in ${expiresDays} days.`,
      "If you were not expecting this invitation, you can safely ignore this email.",
    ].join("\n\n"),
  };
}

function renderEmailLayout({
  previewText,
  content,
}: {
  previewText: string;
  content: string;
}): string {
  const escapedPreviewText = escapeHtml(previewText);
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 218 231" fill="none"><path fill="#0B0B0D" d="M968 2280 c-42 -16 -195 -79 -340 -141 -144 -62 -317 -133 -383 -159 -90 -36 -130 -58 -162 -88 -85 -82 -78 2 -81 -976 -3 -968 -6 -916 63 -916 19 0 54 9 77 20 24 10 147 62 273 114 338 138 342 140 365 178 20 32 20 48 20 763 0 702 1 731 19 761 12 19 34 37 54 43 33 11 54 4 398 -133 267 -107 370 -152 387 -171 26 -31 23 42 25 -725 l2 -673 c0 -50 8 -86 19 -86 11 -12 31 -21 47 -21 24 0 296 106 358 140 11 5 30 27 43 47 l23 38 l0 654 l0 836 -27 46 c-48 81 -77 98 -404 233 -170 71 -371 155 -447 187 -165 71 -208 75 -329 29z"/></svg>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedPreviewText}</title>
    <style>
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

function renderBodyEmail(subject: string, body: string): {
  subject: string;
  html: string;
  text: string;
} {
  const escapedSubject = escapeHtml(subject);
  const escapedBody = escapeHtml(body).replaceAll("\n", "<br />");

  return {
    subject,
    html: [
      `<p><strong>${escapedSubject}</strong></p>`,
      `<p>${escapedBody}</p>`,
    ].join(""),
    text: [subject, body].join("\n\n"),
  };
}

function requireTemplateVariable(
  template: TransactionalTemplateName,
  variables: Record<string, string>,
  key: string,
): string {
  const value = variables[key];
  if (!value) {
    throw new Error(`Email template "${template}" requires variable "${key}".`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
