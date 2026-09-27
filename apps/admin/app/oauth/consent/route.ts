import { oauthConsentRedirect } from "@/lib/oauth-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Better Auth's consentPage for MCP client authorization.
export const GET = oauthConsentRedirect;
