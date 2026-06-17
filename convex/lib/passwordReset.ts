import { Email } from "@convex-dev/auth/providers/Email";
import type { ActionCtx } from "../_generated/server";

import { sendTransactionalEmail } from "./providers/email";

export const PASSWORD_RESET_CODE_LENGTH = 8;
export const PASSWORD_RESET_MAX_AGE_SECONDS = 60 * 15;

const RESEND_TEST_EMAIL_PREFIXES = new Set(["delivered", "bounced", "complained"]);

export const passwordResetProvider = Email({
  maxAge: PASSWORD_RESET_MAX_AGE_SECONDS,
  async generateVerificationToken() {
    return generateNumericCode(PASSWORD_RESET_CODE_LENGTH);
  },
  sendVerificationRequest: (async (
    { identifier, token }: { identifier: string; token: string },
    ctx: Pick<ActionCtx, "runMutation">,
  ) => {
    if (shouldLogPasswordResetCodeInDevelopment(identifier)) {
      console.info(
        [
          "[auth] Development password reset code",
          `email=${identifier}`,
          `code=${token}`,
          `expiresInMinutes=${PASSWORD_RESET_MAX_AGE_SECONDS / 60}`,
        ].join(" "),
      );
      return;
    }

    await sendTransactionalEmail(ctx, {
      template: "password_reset",
      to: identifier,
      subject: "Reset your password",
      variables: {
        code: token,
        expiresMinutes: String(PASSWORD_RESET_MAX_AGE_SECONDS / 60),
      },
    });
  }) as any,
});

export function shouldLogPasswordResetCodeInDevelopment(
  identifier: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const deploymentMode = env.DEPLOYMENT_MODE ?? "development";
  return deploymentMode === "development" && !isResendTestEmail(identifier);
}

function isResendTestEmail(email: string): boolean {
  const [prefix, domain] = email.toLowerCase().split("@");
  if (domain !== "resend.dev" || !prefix) {
    return false;
  }

  const testPrefix = prefix.split("+")[0];
  if (!testPrefix) {
    return false;
  }

  return RESEND_TEST_EMAIL_PREFIXES.has(testPrefix);
}

function generateNumericCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}
