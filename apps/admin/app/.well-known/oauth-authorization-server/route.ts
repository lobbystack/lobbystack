import { authorizationServerMetadataResponse, metadataOptions } from "@/lib/mcp/oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The root location, for clients that don't build the RFC 8414 path from the issuer.
export const GET = authorizationServerMetadataResponse;
export const OPTIONS = metadataOptions;
