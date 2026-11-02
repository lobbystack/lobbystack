import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";

/**
 * Better Auth's browser client, for the passkey ceremonies that need the
 * browser's WebAuthn API. Everything else in the app calls /api/auth directly.
 */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
