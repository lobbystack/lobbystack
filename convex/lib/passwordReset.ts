import { Email } from "@convex-dev/auth/providers/Email";
import type { ActionCtx } from "../_generated/server";

import { sendTransactionalEmail } from "./providers/email";

export const PASSWORD_RESET_CODE_LENGTH = 8;
export const PASSWORD_RESET_MAX_AGE_SECONDS = 60 * 15;

export const passwordResetProvider = Email({
  maxAge: PASSWORD_RESET_MAX_AGE_SECONDS,
  async generateVerificationToken() {
    return generateNumericCode(PASSWORD_RESET_CODE_LENGTH);
  },
  sendVerificationRequest: (async (
    { identifier, token }: { identifier: string; token: string },
    ctx: Pick<ActionCtx, "runMutation">,
  ) => {
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

function generateNumericCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}
