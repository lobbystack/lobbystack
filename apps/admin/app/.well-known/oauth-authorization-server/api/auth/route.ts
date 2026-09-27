import { authorizationServerMetadataResponse, metadataOptions } from "@/lib/mcp/oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8414 path for the issuer https://<host>/api/auth.
export const GET = authorizationServerMetadataResponse;
export const OPTIONS = metadataOptions;
