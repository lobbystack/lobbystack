import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  callerPrincipalId,
  idempotencyRequestHash,
  isPartnerMemberSubject,
  openPartnerBusiness,
  PARTNER_OPEN_LIFETIME_MS,
  platformKeyReach,
  PublicApiError,
  requirePlatformBusinessAccess,
  runIdempotent,
  type ApiCaller,
  type DomainContext,
  type PartnerSubject,
  type TemplateStorage,
} from "@lobbystack/domain";
import { apiOperations, type ApiErrorCode, type ApiKeyScope } from "@lobbystack/shared";

import { createDomainContext, createWorkerDomainContext } from "../domain-context";
import { reportServerError } from "../error-reporting";
import { requirePartnerActionAllowed, type PartnerLimit } from "../partner-limits";
import { partnerSitePages } from "../partner-site";
import type { RateLimitDecision } from "../public-api/rate-limit";
import { getStorageProvider } from "../storage";
import { withStripeConnect } from "../stripe-connect";
import { limitSubject, partnerMcpOperations, partnerToolsForScopes, type PartnerMcpOperations, type PartnerMcpTool } from "./partner-tools";
import { mcpOperations, toolsForScopes, type McpOperations, type McpTool } from "./tools";

// Builds the MCP server for one request. Only the tools the credential's
// scopes allow are registered, so tools/list shows exactly what it can call.
// Every tool call counts against the credential's v1 rate limit. A business
// connection runs as its business, and is audited with actor "mcp" and the
// API key or grant id. A partner connection gets the partner tools, and the
// per-business tools with a business_id that must be one of the partner's.

/** Who is calling, already verified by the HTTP handler: an API key or an OAuth grant for one business. */
export type McpBusinessPrincipal = {
  kind: "business";
  caller: ApiCaller;
  scopes: readonly ApiKeyScope[];
  /** Ids for the request log. Never a key or token. */
  logFields: Record<string, string>;
};

/**
 * A partner connection: one of a partner's platform keys, or an agency
 * connection (an OAuth grant for one person on the partner's team, ADR 0011).
 * It gets the partner tools, and the per-business tools with a business_id.
 */
export type McpPartnerPrincipal = {
  kind: "partner";
  subject: PartnerSubject;
  scopes: readonly ApiKeyScope[];
  /** Who the rate limit counts: the key, shared with its REST requests, or the grant. */
  principalId: string;
  logFields: Record<string, string>;
};

export type McpPrincipal = McpBusinessPrincipal | McpPartnerPrincipal;

export const MCP_SERVER_NAME = "lobbystack";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_SERVER_INSTRUCTIONS = [
  "LobbyStack runs an AI receptionist for one business. These tools read its calls, messages, contacts and appointments, book and change appointments, and update what the receptionist knows.",
  "Start with get_business: it gives the time zone and booking_mode. Tools return times in UTC; show them to people in the business time zone.",
  "Booking and rescheduling work only when booking_mode is instant. In request mode the team confirms requests themselves; when booking is off there is no booking at all. Do not retry those errors.",
  "Before booking, cancelling, rescheduling or replacing opening hours, confirm the details with the person you are helping.",
  "Errors come back as JSON with error.code and error.message. On rate_limited, wait the number of seconds in the message before trying again.",
].join("\n\n");

/** The instructions for a partner connection: an agency that runs many client businesses under its own brand. */
export const MCP_PARTNER_SERVER_INSTRUCTIONS = [
  "LobbyStack runs AI receptionists for businesses. This connection acts for an agency (a LobbyStack partner) that resells them under its own brand. It does what the agency's console does: demos, client businesses, packages, templates, branding, the team and, for owners, billing.",
  "Start with get_partner, then list_businesses. Every per-business tool, such as get_business, list_calls or book_appointment, needs business_id: one of the agency's businesses from list_businesses or create_business. Never guess one. Another agency's business answers not_found.",
  "To pitch a prospect, call create_demo with their website, poll get_demo until every ready flag is true, then publish_demo with the token create_demo returned, and share the url. To sign up a client, call create_business with the owner's email, and a template_id from list_templates and a package_id from list_packages when the person names them.",
  "Tools marked destructive delete, release, revoke or remove something, or replace settings. Confirm the exact business, demo, package, template or person with the person you are helping before calling one, and never call one on your own initiative. Confirm prices and anything that emails someone too.",
  "Links such as a Stripe onboarding link, a tier checkout_url or a demo url are for the person to open in their browser. Show them; never try to open them yourself.",
  "What each tool may do follows the person's current role on the agency's team, or an admin's for a platform key: members can't manage businesses, packages or the team, and only owners reach Stripe and billing. A forbidden error means the role doesn't allow it; say so instead of retrying.",
  "Per-business tools return times in UTC; show them in the business time zone from get_business. Errors come back as JSON with error.code and error.message. On rate_limited, wait the number of seconds in the message before trying again.",
].join("\n\n");

export type McpServerDependencies = {
  context: () => DomainContext;
  /** Counts one request for a credential: an API key id or a prefixed grant id (see callerPrincipalId). */
  rateLimit: (principalId: string) => Promise<RateLimitDecision>;
  operations?: McpOperations;
  runIdempotent?: typeof runIdempotent;
  /** Receives one structured line per tool call. Defaults to console.info. */
  log?: (line: Record<string, unknown>) => void;
  /** The app role's context with Stripe Connect, which partner operations run on, as the console's routes do. */
  partnerContext?: () => DomainContext;
  partnerOperations?: PartnerMcpOperations;
  storage?: () => TemplateStorage;
  /** Refuses partner work past its hourly limit. */
  partnerLimit?: (subject: { partnerId: string; userId?: string | undefined }, input: PartnerLimit) => Promise<void>;
  /** Checks a partner connection may act on a business, and returns the caller the v1 operations run as. */
  partnerBusinessCaller?: (principal: McpPartnerPrincipal, businessId: string) => Promise<ApiCaller>;
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
  if (status === 403) return { code: "forbidden", message: "This connection cannot do that." };
  if (status === 404) return { code: "not_found", message: error instanceof Error ? error.message : "Not found." };
  if (status >= 400 && status < 500) return { code: "invalid_request", message: error instanceof Error ? error.message : "The request is invalid." };
  const errorId = crypto.randomUUID();
  void reportServerError(error, { operation: `mcp.${toolName}`, errorId }).catch(() => undefined);
  return { code: "internal_error", message: `Something went wrong on our side. Reference: ${errorId}.` };
}

function rateLimitError(decision: Exclude<RateLimitDecision, { allowed: true }>): ToolError {
  if (decision.reason === "unavailable") return { code: "rate_limit_unavailable", message: "LobbyStack is temporarily unavailable. Retry in 5 seconds." };
  return { code: "rate_limited", message: `This connection made too many requests. Retry in ${decision.retryAfterSeconds} seconds.` };
}

/**
 * Runs a creating tool under its idempotency_key, sharing the record with the
 * REST route for the same operation: same scope (API key, operation id, key)
 * and the same body hash. A retry on either transport replays the first
 * response; the domain work and the record commit in one transaction.
 */
async function runIdempotentTool(dependencies: { runIdempotent: typeof runIdempotent }, context: DomainContext, caller: ApiCaller, entry: McpTool, key: string, args: Record<string, unknown>, run: (transactional: DomainContext) => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  // A partner's caller acts on many businesses, so its records name the business too, as REST's do for a platform key.
  const principal = caller.platformKeyId !== undefined || caller.actor === "partner_member" ? `${callerPrincipalId(caller)}:${caller.businessId}` : callerPrincipalId(caller);
  const scope = { businessId: caller.businessId, apiKeyId: principal, operation: entry.operation, key };
  const status = apiOperations[entry.operation].status;
  const outcome = await dependencies.runIdempotent(context, scope, idempotencyRequestHash(entry.restBody!(args)), async (transactional) => ({ status, body: JSON.stringify({ data: await run(transactional) }) }));
  // REST stores the response body as JSON text of the v1 envelope; the tool result is its data.
  const body = typeof outcome.response.body === "string" ? JSON.parse(outcome.response.body) as { data?: unknown } : outcome.response.body as { data?: unknown };
  if (!body || typeof body.data !== "object" || body.data === null) throw new Error("The stored idempotent response has no data.");
  return body.data as Record<string, unknown>;
}

/** An open older than this is opened again, so the business's audit log records the agency's access at least every few hours. */
const PARTNER_OPEN_REFRESH_MS = PARTNER_OPEN_LIFETIME_MS / 2;

/**
 * The caller a partner connection's per-business tools run as. A platform key
 * reaches a business as REST does with the LobbyStack-Business header. A
 * person reaches it as the console does: through an audited open of the
 * business. Every call checks the business is the grant's partner's and
 * active and the person is on that partner's team, and refuses anything else
 * as not found, so an open the person made for another partner reaches
 * nothing here. The open lasts 8 hours, so a call reuses one of the grant's
 * partner made in the last half of that, and opens it again after.
 */
async function defaultPartnerBusinessCaller(dependencies: McpServerDependencies, principal: McpPartnerPrincipal, businessId: string): Promise<ApiCaller> {
  const { subject } = principal;
  if (isPartnerMemberSubject(subject)) {
    const appContext = (dependencies.partnerContext ?? createDomainContext)();
    await openPartnerBusiness(appContext, { userId: subject.userId, businessId, partnerId: subject.partnerId, reuseOpenedSince: new Date(Date.now() - PARTNER_OPEN_REFRESH_MS) });
    return { businessId, partnerId: subject.partnerId, userId: subject.userId, actor: "partner_member", mcpGrantId: subject.grantId };
  }
  await requirePlatformBusinessAccess(dependencies.context(), { businessId, ...platformKeyReach(subject) });
  return { businessId, platformKeyId: subject.platformKeyId, groupId: subject.group, partnerId: subject.partnerId, actor: "platform_key" };
}

const businessIdInput = z.uuid().describe("The business to act on: one of the agency's businesses, from list_businesses.");

function serverInstructions(principal: McpPrincipal): string {
  return principal.kind === "partner" ? MCP_PARTNER_SERVER_INSTRUCTIONS : MCP_SERVER_INSTRUCTIONS;
}

export function createLobbyStackMcpServer(principal: McpPrincipal, dependencies: McpServerDependencies): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, title: "LobbyStack", version: MCP_SERVER_VERSION }, { instructions: serverInstructions(principal) });
  const operations = dependencies.operations ?? mcpOperations;
  const log = dependencies.log ?? ((line) => console.info(JSON.stringify(line)));
  const principalId = principal.kind === "partner" ? principal.principalId : callerPrincipalId(principal.caller);

  /** Runs one tool call: the rate limit, the call, the error mapping, and one log line. */
  const handle = async (name: string, logFields: () => Record<string, unknown>, run: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => {
    const started = Date.now();
    let outcome = "ok";
    try {
      const limit = await dependencies.rateLimit(principalId);
      if (!limit.allowed) {
        const error = rateLimitError(limit);
        outcome = error.code;
        return errorResult(error);
      }
      return successResult(await run());
    } catch (error) {
      const mapped = toolError(error, name);
      outcome = mapped.code;
      return errorResult(mapped);
    } finally {
      log({ event: "mcp.tool_call", tool: name, outcome, duration_ms: Date.now() - started, ...logFields(), ...principal.logFields });
    }
  };

  const runBusinessTool = async (entry: McpTool, caller: ApiCaller, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const context = dependencies.context();
    const run = async (runContext: DomainContext) => await entry.run({ context: runContext, caller, operations }, args as never);
    const idempotencyKey = entry.idempotent && typeof args.idempotency_key === "string" ? args.idempotency_key : null;
    return idempotencyKey ? await runIdempotentTool({ runIdempotent: dependencies.runIdempotent ?? runIdempotent }, context, caller, entry, idempotencyKey, args, run) : await run(context);
  };

  const register = (entry: McpTool | PartnerMcpTool, inputSchema: z.ZodObject, handler: (args: Record<string, unknown>) => Promise<CallToolResult>) => {
    server.registerTool(entry.name, {
      title: entry.title,
      description: entry.description,
      inputSchema,
      outputSchema: entry.outputSchema,
      annotations: { title: entry.title, ...entry.annotations },
    }, handler);
  };

  if (principal.kind === "business") {
    const { caller } = principal;
    for (const entry of toolsForScopes(principal.scopes)) {
      register(entry, entry.inputSchema, async (args) => await handle(entry.name, () => ({ business_id: caller.businessId }), async () => await runBusinessTool(entry, caller, args)));
    }
    return server;
  }

  // A partner connection: the per-business tools take the business to act on.
  const businessCaller = dependencies.partnerBusinessCaller ?? ((target: McpPartnerPrincipal, businessId: string) => defaultPartnerBusinessCaller(dependencies, target, businessId));
  for (const entry of toolsForScopes(principal.scopes)) {
    register(entry, entry.inputSchema.extend({ business_id: businessIdInput }), async (args) => {
      const { business_id: businessId, ...rest } = args as Record<string, unknown> & { business_id: string };
      return await handle(entry.name, () => ({ business_id: businessId }), async () => await runBusinessTool(entry, await businessCaller(principal, businessId), rest));
    });
  }
  const partnerOperations = dependencies.partnerOperations ?? partnerMcpOperations;
  const partnerLimit = dependencies.partnerLimit ?? requirePartnerActionAllowed;
  const subject = principal.subject;
  for (const entry of partnerToolsForScopes(principal.scopes)) {
    register(entry, entry.inputSchema, async (args) => await handle(entry.name, () => (typeof args.business_id === "string" ? { business_id: args.business_id } : {}), async () => await entry.run({
      context: (dependencies.partnerContext ?? (() => withStripeConnect(createDomainContext())))(),
      worker: createWorkerDomainContext(),
      storage: dependencies.storage ?? getStorageProvider,
      subject,
      operations: partnerOperations,
      limit: async (input) => await partnerLimit(limitSubject(subject), input),
      // This process renders the partner's public pages again on their next visit, as a save in the console does.
      brandChanged: (partnerId) => { for (const page of partnerSitePages(partnerId)) revalidatePath(page); },
    }, args as never)));
  }
  return server;
}
