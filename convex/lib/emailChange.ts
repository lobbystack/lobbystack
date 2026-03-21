import type { ActionCtx } from "../_generated/server";

import { sendTransactionalEmail } from "./providers/email";

export const EMAIL_CHANGE_PROVIDER_ID = "email-change";
export const EMAIL_CHANGE_MAX_AGE_SECONDS = 60 * 30;
const EMAIL_CHANGE_TOKEN_LENGTH = 32;

const EMAIL_CHANGE_CONFIRMATION_PATH = "/confirm-email-change";

export async function sendEmailChangeConfirmation(
  ctx: Pick<ActionCtx, "runMutation">,
  input: {
    email: string;
    token: string;
  },
): Promise<void> {
  await sendTransactionalEmail(ctx, {
    template: "verify_email",
    to: input.email,
    subject: "Confirm your new email",
    variables: {
      confirmUrl: buildEmailChangeConfirmationUrl(input.email, input.token),
      expiresMinutes: String(EMAIL_CHANGE_MAX_AGE_SECONDS / 60),
    },
  });
}

export function generateEmailChangeToken(length: number = EMAIL_CHANGE_TOKEN_LENGTH): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function buildEmailChangeConfirmationUrl(
  identifier: string,
  token: string,
): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error("SITE_URL is required to build email confirmation links.");
  }

  const url = new URL(EMAIL_CHANGE_CONFIRMATION_PATH, siteUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("email", identifier);
  return url.toString();
}
