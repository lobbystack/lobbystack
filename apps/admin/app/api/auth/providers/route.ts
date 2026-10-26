import { googleSignInAllowed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Tells the sign-in page whether to offer Google, read at runtime rather than
 * baked into the build. A partner's host never offers it.
 */
export function GET(request: Request) {
  return Response.json({ google: googleSignInAllowed(request.headers) });
}
