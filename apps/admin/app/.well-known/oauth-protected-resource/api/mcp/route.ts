import { metadataOptions, protectedResourceMetadataResponse } from "@/lib/mcp/oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 path for the resource https://<host>/api/mcp.
export const GET = protectedResourceMetadataResponse;
export const OPTIONS = metadataOptions;
