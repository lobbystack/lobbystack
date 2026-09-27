import { metadataOptions, protectedResourceMetadataResponse } from "@/lib/mcp/oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The root location, for clients that look here before the path-specific one.
export const GET = protectedResourceMetadataResponse;
export const OPTIONS = metadataOptions;
