import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { validatePasswordRequirements } from "./lib/passwordPolicy";
import { passwordResetProvider } from "./lib/passwordReset";

/**
 * The hosted and self-hosted products use the same auth implementation.
 * Deployment mode changes secret ownership and email delivery, not the auth API.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: passwordResetProvider,
      validatePasswordRequirements,
    }),
  ],
});
