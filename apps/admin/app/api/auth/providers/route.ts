import { googleSignInEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Tells the sign-in page whether to offer Google, read at runtime rather than baked into the build. */
export function GET() {
  return Response.json({ google: googleSignInEnabled() });
}
