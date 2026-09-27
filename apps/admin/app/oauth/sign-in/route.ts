import { oauthSignInRedirect } from "@/lib/oauth-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Better Auth's loginPage for MCP client authorization.
export const GET = oauthSignInRedirect;
