import { createLobbyStackMcpHttpHandler } from "@/lib/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The LobbyStack MCP server (Streamable HTTP, stateless). See mintlify/ai/mcp.mdx.
const handler = createLobbyStackMcpHttpHandler();

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
