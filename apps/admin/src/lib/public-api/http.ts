import { NextResponse } from "next/server";

import {
  bearerToken,
  idempotencyRequestHash,
  isPlatformKeyToken,
  PublicApiError,
  requirePlatformBusinessAccess,
  resolveApiKey,
  resolvePlatformKey,
  resolvePlatformKeyOwner,
  runIdempotent,
  touchApiKeyLastUsed,
  validateIdempotencyKey,
  type ApiKeyCaller,
  type DomainContext,
  type PlatformKeyAccess,
  type PlatformKeyCaller,
  type ResolvedApiKey,
  type ResolvedPlatformKey,
} from "@lobbystack/domain";
import { BUSINESS_HEADER, apiOperations, isUuid, parseApiInput, type ApiErrorCode, type ApiOperation, type ApiOperationId } from "@lobbystack/shared";

import { runAfterResponse } from "../after-response";
import { createWorkerDomainContext } from "../domain-context";
import { reportServerError } from "../error-reporting";
import { enforceApiRateLimit, type RateLimitDecision } from "./rate-limit";

// Request pipeline for /api/v1: bearer key -> scope -> business -> rate limit
// -> idempotency -> handler -> `{ data }` or `{ error: { code, message } }`.
// A per-business key (lsk_) acts on its own business. A platform key (lsp_)
// acts on the business in the LobbyStack-Business header, as its owner, and
// alone may call the few operations that act on no one business, such as
// POST /businesses. Keys are never logged: logs and audit rows carry the key
// id, plus a platform key's partner.

/** The key a request presented. Both kinds carry scopes. */
export type ApiCredential = ({ kind: "api_key" } & ResolvedApiKey) | ({ kind: "platform_key" } & ResolvedPlatformKey);

/** Who a REST request acts as. OAuth grant callers come only from the MCP server. */
export type RestApiCaller = ApiKeyCaller | PlatformKeyCaller;

export type ApiHandlerInput = {
  request: Request;
  caller: RestApiCaller;
  context: DomainContext;
  credential: ApiCredential;
};

/** For operations whose business is optional (GET /me): a platform key sent without the header has no caller. */
export type OptionalBusinessHandlerInput = Omit<ApiHandlerInput, "caller"> & { caller: RestApiCaller | null };

/**
 * For operations that act on no one business, which only platform keys may
 * call. The handler gets the key, the account it acts as and, when the
 * operation takes one, the Idempotency-Key to apply itself.
 */
export type PlatformHandlerInput = {
  request: Request;
  context: DomainContext;
  credential: { kind: "platform_key" } & ResolvedPlatformKey;
  actingUserId: string;
  idempotencyKey: string | null;
};

type HandlerInputFor<Id extends ApiOperationId> = (typeof apiOperations)[Id] extends { business: "none" }
  ? PlatformHandlerInput
  : (typeof apiOperations)[Id] extends { business: "optional" } ? OptionalBusinessHandlerInput : ApiHandlerInput;

export type ApiResult = { status?: number; body: unknown; headers?: Record<string, string> };

type Dependencies = {
  resolveKey?: (key: string) => Promise<ResolvedApiKey | null>;
  resolvePlatformKey?: (key: string) => ResolvedPlatformKey | null;
  resolvePlatformOwner?: (ownerEmail: string) => Promise<string | null>;
  requirePlatformBusiness?: (input: { businessId: string; partnerId: string; access: PlatformKeyAccess }) => Promise<void>;
  rateLimit?: (principalId: string) => Promise<RateLimitDecision>;
  context?: () => DomainContext;
  runIdempotent?: typeof runIdempotent;
};

export function apiError(status: number, code: ApiErrorCode, message: string, init: { headers?: Record<string, string>; details?: Array<{ path: string; message: string }> } = {}): NextResponse {
  return NextResponse.json({ error: { code, message, ...(init.details?.length ? { details: init.details } : {}) } }, { status, headers: init.headers ?? {} });
}


/** A handler for methods a v1 route doesn't support: 405 in the v1 error shape, with Allow. */
export function methodNotAllowed(allowed: readonly string[]): () => Response {
  const allow = [...allowed, ...(allowed.includes("GET") ? ["HEAD"] : []), "OPTIONS"].join(", ");
  return () => apiError(405, "method_not_allowed", `This endpoint supports ${allowed.join(", ")}.`, { headers: { Allow: allow } });
}

function missingIdempotencyKey(): NextResponse {
  return apiError(400, "invalid_request", "Send an Idempotency-Key header with this request, so a retry can't do it twice.", { details: [{ path: "Idempotency-Key", message: "Required." }] });
}

function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  if (!("limit" in decision)) return {};
  return { "X-RateLimit-Limit": String(decision.limit), "X-RateLimit-Remaining": String(decision.remaining), "X-RateLimit-Reset": String(decision.resetAt) };
}

function errorResponse(error: unknown, operationId: string): NextResponse {
  if (error instanceof PublicApiError) return apiError(error.status, error.code, error.message, { ...(error.details ? { details: error.details } : {}), ...(error.headers ? { headers: error.headers } : {}) });
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  if (status === 403) return apiError(403, "forbidden", "This API key cannot do that.");
  if (status === 404) return apiError(404, "not_found", error instanceof Error ? error.message : "Not found.");
  if (status >= 400 && status < 500) return apiError(status, "invalid_request", error instanceof Error ? error.message : "The request is invalid.");
  const errorId = crypto.randomUUID();
  const report = () => reportServerError(error, { operation: `public_api.${operationId}`, errorId });
  runAfterResponse(report);
  return apiError(500, "internal_error", `Something went wrong on our side. Reference: ${errorId}.`, { headers: { "x-error-id": errorId } });
}

/** Reads a JSON body and validates it against a v1 request schema. */
export async function readApiBody<T>(request: Request, schema: Parameters<typeof parseApiInput<T>>[0]): Promise<T> {
  let body: unknown;
  try {
    const text = await request.text();
    body = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    throw new PublicApiError(400, "invalid_request", "The request body is not valid JSON.");
  }
  if (body === undefined) throw new PublicApiError(400, "invalid_request", "A JSON request body is required.");
  const parsed = parseApiInput(schema, body);
  if (!parsed.ok) throw new PublicApiError(400, "invalid_request", "The request body is invalid.", parsed.details);
  return parsed.data;
}

export function queryParam(request: Request, name: string): string | undefined {
  const value = new URL(request.url).searchParams.get(name);
  return value === null || value === "" ? undefined : value;
}

export function pageQuery(request: Request): { limit?: number; cursor?: string } {
  const limit = queryParam(request, "limit");
  const cursor = queryParam(request, "cursor");
  if (limit !== undefined && !/^\d+$/.test(limit)) throw new PublicApiError(400, "invalid_request", "limit must be a whole number.");
  return { ...(limit !== undefined ? { limit: Number(limit) } : {}), ...(cursor !== undefined ? { cursor } : {}) };
}

/** Path and query ids must be UUIDs; anything else is a 400 with the parameter name. */
export function uuidParam(value: string | undefined, name: string): string {
  if (!isUuid(value)) throw new PublicApiError(400, "invalid_request", `${name} must be a UUID.`, [{ path: name, message: value === undefined ? "Required." : "Must be a UUID." }]);
  return value;
}

export async function handleApiRequest<Id extends ApiOperationId>(request: Request, operationId: Id, handler: (input: HandlerInputFor<Id>) => Promise<ApiResult>, dependencies: Dependencies = {}): Promise<NextResponse> {
  const operation: ApiOperation = apiOperations[operationId];
  const started = Date.now();
  let status = 500;
  // Ids only, for the request log: never the key.
  let logFields: Record<string, string> = {};
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) return (status = 401, apiError(401, "unauthorized", "Send an API key as Authorization: Bearer <key>.", { headers: { "WWW-Authenticate": "Bearer" } }));
    const context = (dependencies.context ?? createWorkerDomainContext)();

    let credential: ApiCredential;
    if (isPlatformKeyToken(token)) {
      // A malformed PLATFORM_API_KEYS throws here, which answers 500 and reports it.
      const platformKey = (dependencies.resolvePlatformKey ?? resolvePlatformKey)(token);
      if (!platformKey) return (status = 401, apiError(401, "unauthorized", "The API key is invalid or has been revoked.", { headers: { "WWW-Authenticate": "Bearer" } }));
      credential = { kind: "platform_key", ...platformKey };
      logFields = { platform_key_id: platformKey.platformKeyId, partner_id: platformKey.partnerId };
    } else {
      const key = await (dependencies.resolveKey ?? ((value) => resolveApiKey(context, value)))(token);
      if (!key) return (status = 401, apiError(401, "unauthorized", "The API key is invalid or has been revoked.", { headers: { "WWW-Authenticate": "Bearer" } }));
      credential = { kind: "api_key", ...key };
      logFields = { api_key_id: key.apiKeyId, business_id: key.businessId };
    }
    if (operation.scope && !credential.scopes.includes(operation.scope)) return (status = 403, apiError(403, "insufficient_scope", `This API key needs the ${operation.scope} scope.`));
    const businessless = operation.business === "none";
    if (businessless && credential.kind !== "platform_key") return (status = 403, apiError(403, "forbidden", "Only platform keys can call this endpoint."));

    // An operation that acts on no one business ignores the header.
    const header = businessless ? undefined : request.headers.get(BUSINESS_HEADER)?.trim() || undefined;
    if (header !== undefined && !isUuid(header)) return (status = 400, apiError(400, "invalid_request", `${BUSINESS_HEADER} must be a business id.`, { details: [{ path: BUSINESS_HEADER, message: "Must be a UUID." }] }));
    const requestedBusinessId = header?.toLowerCase();
    if (credential.kind === "api_key" && requestedBusinessId !== undefined && requestedBusinessId !== credential.businessId.toLowerCase()) {
      return (status = 403, apiError(403, "forbidden", `This API key belongs to another business. Leave out the ${BUSINESS_HEADER} header, or send this key's own business id.`));
    }
    if (credential.kind === "platform_key") {
      if (requestedBusinessId !== undefined) logFields.business_id = requestedBusinessId;
      else if (!operation.business) return (status = 400, apiError(400, "business_required", `A platform key must name the business to act on in the ${BUSINESS_HEADER} header.`));
    }
    const principalId = credential.kind === "platform_key" ? `platform:${credential.platformKeyId}` : credential.apiKeyId;
    const limit = await (dependencies.rateLimit ?? enforceApiRateLimit)(principalId);
    if (!limit.allowed) {
      if (limit.reason === "unavailable") return (status = 503, apiError(503, "rate_limit_unavailable", "The API is temporarily unavailable. Retry shortly.", { headers: { "Retry-After": "5" } }));
      return (status = 429, apiError(429, "rate_limited", `Too many requests. Retry in ${limit.retryAfterSeconds} seconds.`, { headers: { ...rateLimitHeaders(limit), "Retry-After": String(limit.retryAfterSeconds) } }));
    }
    const headers = rateLimitHeaders(limit);

    let caller: RestApiCaller | null;
    if (credential.kind === "platform_key") {
      const actingUserId = await (dependencies.resolvePlatformOwner ?? ((email) => resolvePlatformKeyOwner(context, email)))(credential.ownerEmail);
      if (!actingUserId) return (status = 403, apiError(403, "key_owner_inactive", "This platform key's owner_email has no verified LobbyStack account. Sign up with that email and verify it, or change owner_email in PLATFORM_API_KEYS."));
      if (businessless) {
        // The operation applies the Idempotency-Key itself: there is no business to keep the record under.
        const idempotencyKey = operation.idempotent ? validateIdempotencyKey(request.headers.get("idempotency-key")) : null;
        if (operation.idempotent === "required" && !idempotencyKey) return (status = 400, missingIdempotencyKey());
        const result = await handler({ request, context, credential, actingUserId, idempotencyKey } as HandlerInputFor<Id>);
        status = result.status ?? operation.status;
        return NextResponse.json(result.body, { status, headers: { ...headers, ...result.headers } });
      }
      if (requestedBusinessId === undefined) {
        caller = null;
      } else {
        await (dependencies.requirePlatformBusiness ?? ((input) => requirePlatformBusinessAccess(context, input)))({ businessId: requestedBusinessId, partnerId: credential.partnerId, access: credential.access });
        caller = { businessId: requestedBusinessId, platformKeyId: credential.platformKeyId, partnerId: credential.partnerId, actingUserId, actor: "platform_key" };
      }
    } else {
      const keyCaller: ApiKeyCaller = { businessId: credential.businessId, apiKeyId: credential.apiKeyId };
      caller = keyCaller;
      runAfterResponse(async () => { await touchApiKeyLastUsed(context, keyCaller).catch(() => undefined); });
    }
    // Every operation but GET /me needs a business, and the checks above refuse a request without one.
    const run = (input: Omit<ApiHandlerInput, "caller"> & { caller: RestApiCaller | null }) => handler(input as HandlerInputFor<Id>);

    const idempotencyKey = operation.idempotent ? validateIdempotencyKey(request.headers.get("idempotency-key")) : null;
    if (operation.idempotent === "required" && !idempotencyKey) return (status = 400, missingIdempotencyKey());
    if (!idempotencyKey || !caller) {
      const result = await run({ request, caller, context, credential });
      status = result.status ?? operation.status;
      return NextResponse.json(result.body, { status, headers: { ...headers, ...result.headers } });
    }

    // Hash the body so a reused key with a different request is rejected. An
    // operation on one resource, such as POST /phone-numbers/{phone_number_id}/replace,
    // hashes its path too, so the same key sent to another resource is rejected.
    const raw = await request.clone().text();
    const requestPath = operation.path.includes("{") ? new URL(request.url).pathname.toLowerCase() : undefined;
    // Records are unique per scope and key. A platform key acts on many
    // businesses, so its scope names the business too; otherwise one key's
    // Idempotency-Key on business A would block the same value on business B.
    const idempotencyPrincipal = credential.kind === "platform_key" ? `${principalId}:${caller.businessId}` : principalId;
    const scope = { businessId: caller.businessId, apiKeyId: idempotencyPrincipal, operation: operationId, key: idempotencyKey };
    const idempotentCaller = caller;
    // The handler runs on the same transaction that stores the key, so the
    // mutation and its stored response commit together or not at all.
    const outcome = await (dependencies.runIdempotent ?? runIdempotent)(context, scope, idempotencyRequestHash(raw, requestPath), async (transactional) => {
      const result = await run({ request, caller: idempotentCaller, context: transactional, credential });
      // Stored as JSON text so a replay matches the first response byte for byte.
      return { status: result.status ?? operation.status, body: JSON.stringify(result.body) };
    });
    status = outcome.response.status;
    const body = typeof outcome.response.body === "string" ? outcome.response.body : JSON.stringify(outcome.response.body);
    return new NextResponse(body, { status, headers: { ...headers, "content-type": "application/json", ...(outcome.replayed ? { "Idempotent-Replayed": "true" } : {}) } });
  } catch (error) {
    const response = errorResponse(error, operationId);
    status = response.status;
    return response;
  } finally {
    console.info(JSON.stringify({ event: "public_api.request", operation: operationId, status, duration_ms: Date.now() - started, ...logFields }));
  }
}

export function data(body: unknown): { data: unknown } {
  return { data: body };
}
