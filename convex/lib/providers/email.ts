import { Resend, type ResendOptions } from "@convex-dev/resend";

import { components } from "../../_generated/api";
import type { ActionCtx, MutationCtx } from "../../_generated/server";

type SendEmailCtx = Pick<ActionCtx, "runMutation"> | Pick<MutationCtx, "runMutation">;

type TransactionalTemplateName = "verify_email" | "password_reset" | "operator_alert";

type TransactionalTemplateInput = {
  template: TransactionalTemplateName;
  to: string;
  subject: string;
  variables: Record<string, string>;
};

const DEFAULT_PASSWORD_RESET_SUBJECT = "Reset your password";

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
    case "password_reset":
      return renderPasswordResetEmail(input);
    case "verify_email":
    case "operator_alert":
      throw new Error(`Email template "${input.template}" is not implemented yet.`);
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

  const messageId = await resend.sendEmail(ctx, {
    from: fromAddress,
    to: input.to,
    subject: input.subject || email.subject,
    html: email.html,
    text: email.text,
  });

  return { messageId: String(messageId) };
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
      "<p>You requested a password reset for your AI Receptionist account.</p>",
      `<p>Your reset code is <strong>${escapedCode}</strong>.</p>`,
      `<p>This code expires in ${escapedExpiresMinutes} minutes.</p>`,
      "<p>If you did not request this, you can safely ignore this email.</p>",
    ].join(""),
    text: [
      "You requested a password reset for your AI Receptionist account.",
      `Your reset code is ${code}.`,
      `This code expires in ${expiresMinutes} minutes.`,
      "If you did not request this, you can safely ignore this email.",
    ].join("\n\n"),
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
