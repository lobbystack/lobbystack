import { after, NextResponse } from "next/server";

import {
  bearerToken,
  idempotencyRequestHash,
  PublicApiError,
  resolveApiKey,
  runIdempotent,
  touchApiKeyLastUsed,
  validateIdempotencyKey,
  type ApiCaller,
  type DomainContext,
  type ResolvedApiKey,
} from "@lobbystack/domain";
import { apiOperations, isUuid, parseApiInput, type ApiErrorCode, type ApiOperationId } from "@lobbystack/shared";

import { createWorkerDomainContext } from "../domain-context";
import { reportServerError } from "../error-reporting";
import { enforceApiRateLimit, type RateLimitDecision } from "./rate-limit";

// Request pipeline for /api/v1: bearer key -> scope -> rate limit ->
// idempotency -> handler -> `{ data }` or `{ error: { code, message } }`.
// The key itself is never logged; logs and audit rows carry the key id.

export type ApiHandlerInput = {
  request: Request;
  caller: ApiCaller;
  context: DomainContext;
  key: ResolvedApiKey;
};

export type ApiResult = { status?: number; body: unknown };

type Dependencies = {
  resolveKey?: (key: string) => Promise<ResolvedApiKey | null>;
  rateLimit?: (apiKeyId: string) => Promise<RateLimitDecision>;
  context?: () => DomainContext;
  runIdempotent?: typeof runIdempotent;
};

export function apiError(status: number, code: ApiErrorCode, message: string, init: { headers?: Record<string, string>; details?: Array<{ path: string; message: string }> } = {}): NextResponse {
  return NextResponse.json({ error: { code, message, ...(init.details?.length ? { details: init.details } : {}) } }, { status, headers: init.headers ?? {} });
}

/** Runs work after the response is sent, or right away outside a Next request (tests, scripts). */
function runAfterResponse(task: () => Promise<unknown> | unknown): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch(() => undefined);
  }
}

export const V1_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/** A handler for methods a v1 route doesn't support: 405 in the v1 error shape, with Allow. */
export function methodNotAllowed(allowed: readonly string[]): () => Response {
  const allow = [...allowed, ...(allowed.includes("GET") ? ["HEAD"] : []), "OPTIONS"].join(", ");
  return () => apiError(405, "method_not_allowed", `This endpoint supports ${allowed.join(", ")}.`, { headers: { Allow: allow } });
}

function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  if (!("limit" in decision)) return {};
  return { "X-RateLimit-Limit": String(decision.limit), "X-RateLimit-Remaining": String(decision.remaining), "X-RateLimit-Reset": String(decision.resetAt) };
}

function errorResponse(error: unknown, operationId: string): NextResponse {
  if (error instanceof PublicApiError) return apiError(error.status, error.code, error.message, error.details ? { details: error.details } : {});
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

export async function handleApiRequest(request: Request, operationId: ApiOperationId, handler: (input: ApiHandlerInput) => Promise<ApiResult>, dependencies: Dependencies = {}): Promise<NextResponse> {
  const operation = apiOperations[operationId];
  const started = Date.now();
  let status = 500;
  let key: ResolvedApiKey | null = null;
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) return (status = 401, apiError(401, "unauthorized", "Send an API key as Authorization: Bearer <key>.", { headers: { "WWW-Authenticate": "Bearer" } }));
    const context = (dependencies.context ?? createWorkerDomainContext)();
    key = await (dependencies.resolveKey ?? ((value) => resolveApiKey(context, value)))(token);
    if (!key) return (status = 401, apiError(401, "unauthorized", "The API key is invalid or has been revoked.", { headers: { "WWW-Authenticate": "Bearer" } }));
    if (operation.scope && !key.scopes.includes(operation.scope)) return (status = 403, apiError(403, "insufficient_scope", `This API key needs the ${operation.scope} scope.`));

    const limit = await (dependencies.rateLimit ?? enforceApiRateLimit)(key.apiKeyId);
    if (!limit.allowed) {
      if (limit.reason === "unavailable") return (status = 503, apiError(503, "rate_limit_unavailable", "The API is temporarily unavailable. Retry shortly.", { headers: { "Retry-After": "5" } }));
      return (status = 429, apiError(429, "rate_limited", `Too many requests. Retry in ${limit.retryAfterSeconds} seconds.`, { headers: { ...rateLimitHeaders(limit), "Retry-After": String(limit.retryAfterSeconds) } }));
    }
    const headers = rateLimitHeaders(limit);
    const caller: ApiCaller = { businessId: key.businessId, apiKeyId: key.apiKeyId };
    const resolvedKey = key;
    runAfterResponse(async () => { await touchApiKeyLastUsed(context, caller).catch(() => undefined); });

    const idempotencyKey = "idempotent" in operation && operation.idempotent ? validateIdempotencyKey(request.headers.get("idempotency-key")) : null;
    if (!idempotencyKey) {
      const result = await handler({ request, caller, context, key: resolvedKey });
      status = result.status ?? operation.status;
      return NextResponse.json(result.body, { status, headers });
    }

    // Hash the body so a reused key with a different request is rejected.
    const raw = await request.clone().text();
    const scope = { businessId: key.businessId, apiKeyId: key.apiKeyId, operation: operationId, key: idempotencyKey };
    // The handler runs on the same transaction that stores the key, so the
    // mutation and its stored response commit together or not at all.
    const outcome = await (dependencies.runIdempotent ?? runIdempotent)(context, scope, idempotencyRequestHash(raw), async (transactional) => {
      const result = await handler({ request, caller, context: transactional, key: resolvedKey });
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
    console.info(JSON.stringify({ event: "public_api.request", operation: operationId, status, duration_ms: Date.now() - started, ...(key ? { api_key_id: key.apiKeyId, business_id: key.businessId } : {}) }));
  }
}

export function data(body: unknown): { data: unknown } {
  return { data: body };
}
