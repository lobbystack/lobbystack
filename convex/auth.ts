import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * The hosted and self-hosted products use the same auth implementation.
 * Deployment mode changes secret ownership and email delivery, not the auth API.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
