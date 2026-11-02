import { googleSignInAllowed } from "@/lib/auth";
import { passkeyAllowed } from "@/lib/passkey";

export const dynamic = "force-dynamic";

/**
 * Tells the sign-in page which sign-in methods to offer besides a password,
 * read at runtime rather than baked into the build. A partner's host never
 * offers Google or passkeys.
 */
export function GET(request: Request) {
  return Response.json({ google: googleSignInAllowed(request.headers), passkey: passkeyAllowed(request.headers) });
}
