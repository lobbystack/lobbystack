import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";

import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  idempotencyRequestHash,
  PublicApiError,
  releaseIdempotentRequest,
  type ApiCaller,
  type DomainContext,
  type ResolvedApiKey,
} from "@lobbystack/domain";
import type { ApiErrorCode } from "@lobbystack/shared";

import { reportServerError } from "../error-reporting";
import type { RateLimitDecision } from "../public-api/rate-limit";
import { mcpOperations, toolsForScopes, type McpOperations, type McpTool } from "./tools";

// Builds the MCP server for one request. Only the tools the API key's scopes
// allow are registered, so tools/list shows exactly what the key can call.
// Every tool call counts against the key's v1 rate limit, runs as the key's
// business, and is audited with actor "mcp".

export const MCP_SERVER_NAME = "lobbystack";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_SERVER_INSTRUCTIONS = [
  "LobbyStack runs an AI receptionist for one business. These tools read its calls, messages, contacts and appointments, book and change appointments, and update what the receptionist knows.",
  "Start with get_business: it gives the time zone and booking_mode. Tools return times in UTC; show them to people in the business time zone.",
  "Booking and rescheduling work only when booking_mode is instant. In request mode the team confirms requests themselves; when booking is off there is no booking at all. Do not retry those errors.",
  "Before booking, cancelling, rescheduling or replacing opening hours, confirm the details with the person you are helping.",
  "Errors come back as JSON with error.code and error.message. On rate_limited, wait the number of seconds in the message before trying again.",
].join("\n\n");

export type McpServerDependencies = {
  context: () => DomainContext;
  rateLimit: (apiKeyId: string) => Promise<RateLimitDecision>;
  operations?: McpOperations;
  /** Receives one structured line per tool call. Defaults to console.info. */
  log?: (line: Record<string, unknown>) => void;
};

type ToolError = { code: ApiErrorCode; message: string; details?: Array<{ path: string; message: string }> };

function errorResult(error: ToolError): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: error.details?.length ? error : { code: error.code, message: error.message } }) }] };
}

function successResult(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

/** Maps a thrown error to the same code and message the REST API would return. */
export function toolError(error: unknown, toolName: string): ToolError {
  if (error instanceof PublicApiError) return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  if (status === 403) return { code: "forbidden", message: "This API key cannot do that." };
  if (status === 404) return { code: "not_found", message: error instanceof Error ? error.message : "Not found." };
  if (status >= 400 && status < 500) return { code: "invalid_request", message: error instanceof Error ? error.message : "The request is invalid." };
  const errorId = crypto.randomUUID();
  void reportServerError(error, { operation: `mcp.${toolName}`, errorId }).catch(() => undefined);
  return { code: "internal_error", message: `Something went wrong on our side. Reference: ${errorId}.` };
}

function rateLimitError(decision: Exclude<RateLimitDecision, { allowed: true }>): ToolError {
  if (decision.reason === "unavailable") return { code: "rate_limit_unavailable", message: "LobbyStack is temporarily unavailable. Retry in 5 seconds." };
  return { code: "rate_limited", message: `This API key made too many requests. Retry in ${decision.retryAfterSeconds} seconds.` };
}

type StoredToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: ToolError };

async function runIdempotent(context: DomainContext, caller: ApiCaller, entry: McpTool, key: string, args: Record<string, unknown>, run: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  // MCP keys are kept apart from REST keys: the same value sent to both surfaces creates two things.
  const scope = { businessId: caller.businessId, apiKeyId: caller.apiKeyId, operation: `mcp.${entry.name}`, key };
  const { idempotency_key: _key, ...request } = args;
  const requestHash = idempotencyRequestHash(request);
  const begun = await beginIdempotentRequest(context, scope, requestHash);
  if (begun.kind === "replay") {
    const stored = JSON.parse(String(begun.response.body)) as StoredToolResult;
    return stored.ok ? successResult(stored.data) : errorResult(stored.error);
  }
  try {
    const data = await run();
    await completeIdempotentRequest(context, scope, requestHash, { status: 200, body: JSON.stringify({ ok: true, data } satisfies StoredToolResult) });
    return successResult(data);
  } catch (error) {
    const mapped = toolError(error, entry.name);
    // Client errors are final for this key; server errors free it for a retry.
    if (mapped.code === "internal_error" || mapped.code === "idempotency_request_in_progress") await releaseIdempotentRequest(context, scope).catch(() => undefined);
    else await completeIdempotentRequest(context, scope, requestHash, { status: 400, body: JSON.stringify({ ok: false, error: mapped } satisfies StoredToolResult) }).catch(() => undefined);
    return errorResult(mapped);
  }
}

export function createLobbyStackMcpServer(key: ResolvedApiKey, dependencies: McpServerDependencies): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, title: "LobbyStack", version: MCP_SERVER_VERSION }, { instructions: MCP_SERVER_INSTRUCTIONS });
  const operations = dependencies.operations ?? mcpOperations;
  const log = dependencies.log ?? ((line) => console.info(JSON.stringify(line)));
  const caller: ApiCaller = { businessId: key.businessId, apiKeyId: key.apiKeyId, actor: "mcp" };

  for (const entry of toolsForScopes(key.scopes)) {
    server.registerTool(entry.name, {
      title: entry.title,
      description: entry.description,
      inputSchema: entry.inputSchema,
      outputSchema: entry.outputSchema,
      annotations: { title: entry.title, ...entry.annotations },
    }, async (args: Record<string, unknown>) => {
      const started = Date.now();
      let outcome = "ok";
      try {
        const limit = await dependencies.rateLimit(key.apiKeyId);
        if (!limit.allowed) {
          const error = rateLimitError(limit);
          outcome = error.code;
          return errorResult(error);
        }
        const context = dependencies.context();
        const run = async () => await entry.run({ context, caller, operations }, args as never);
        const idempotencyKey = entry.idempotent && typeof args.idempotency_key === "string" ? args.idempotency_key : null;
        const result = idempotencyKey ? await runIdempotent(context, caller, entry, idempotencyKey, args, run) : successResult(await run());
        if (result.isError) outcome = (JSON.parse((result.content[0] as { text: string }).text) as { error: ToolError }).error.code;
        return result;
      } catch (error) {
        const mapped = toolError(error, entry.name);
        outcome = mapped.code;
        return errorResult(mapped);
      } finally {
        log({ event: "mcp.tool_call", tool: entry.name, outcome, duration_ms: Date.now() - started, api_key_id: key.apiKeyId, business_id: key.businessId });
      }
    });
  }
  return server;
}
