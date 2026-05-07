import { convexAuth } from "@convex-dev/auth/server";
import { PasswordWithTurnstile } from "./lib/passwordWithTurnstile";
import { validatePasswordRequirements } from "./lib/passwordPolicy";
import { passwordResetProvider } from "./lib/passwordReset";

/**
 * The hosted and self-hosted products use the same auth implementation.
 * Deployment mode changes secret ownership and email delivery, not the auth API.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    PasswordWithTurnstile({
      reset: passwordResetProvider,
      validatePasswordRequirements,
    }),
  ],
});
