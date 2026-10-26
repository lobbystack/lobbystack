import type { AuthzRole } from "@lobbystack/contracts";
import { withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { readActiveBusinessId, requireBusinessAccess, type BusinessAccess, type DomainContext } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { asApiResponse, jsonError, requireApiSession } from "./api-helpers";
import type { Session } from "./auth";
import { requestPathCapability } from "./business-capabilities";
import { createDomainContext } from "./domain-context";
import { requestBrandScope } from "./request-brand";

// What an operator route handler gets: the verified session, the JSON body,
// the business the request acts on, and the domain context. A thrown error
// becomes a response through asApiResponse. Before any handler runs, the
// person's access to the business is checked on the request's brand: a
// business shows only on its own brand's domains, and the route's capability
// must be one the business gives them. Role rules stay in the domain: the
// operation a route calls checks them, or `transaction` does.

/** A signed-in user's request. */
export type SignedInRequest = {
  request: Request;
  session: NonNullable<Session>;
  userId: string;
  /** The JSON object the request sent. An empty body reads as {}. */
  body: Record<string, unknown>;
  /** The business the request names in ?businessId=, the x-business-id header or the body, if it names one. */
  businessId: string | undefined;
  domain: DomainContext;
};

/** A signed-in user's request that acts on one business. */
export type OperatorRequest = Omit<SignedInRequest, "businessId"> & {
  /** The business the request names, or else the user's active business on the request's brand. */
  businessId: string;
  /** The person's access to the business, checked before the handler ran. */
  access: BusinessAccess;
  /** Runs the callback in the business's transaction once the user's access, and minimum role, check out again. */
  transaction<T>(callback: (tx: DatabaseTransaction, role: AuthzRole) => Promise<T>, options?: { minimumRole?: AuthzRole }): Promise<T>;
};

type Route<Params> = (request: Request, context?: { params: Promise<Params> }) => Promise<Response>;

export type RouteOptions = {
  /** The largest body the route reads, in bytes. A larger one gets a 413 before it fills memory. */
  maxBodyBytes?: number;
};

/** The body's text, read no further than the limit. */
async function readTextWithin(request: Request, maxBytes: number): Promise<string> {
  const tooLarge = () => jsonError("The request body is too large.", 413, "body_too_large");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBody(request: Request, maxBytes?: number): Promise<Record<string, unknown>> {
  const text = maxBytes === undefined ? await request.text() : await readTextWithin(request, maxBytes);
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw jsonError("Invalid JSON body.", 400, "invalid_json");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw jsonError("The request body must be a JSON object.", 400, "invalid_json");
  return body as Record<string, unknown>;
}

// Every name the request gives must be a UUID and the same one, so a body
// can't quietly point at another business than the URL.
function namedBusinessId(request: Request, body: Record<string, unknown>): string | undefined {
  const named = [new URL(request.url).searchParams.get("businessId"), request.headers.get("x-business-id"), body.businessId].filter((value) => value !== null && value !== undefined);
  if (!named.every(isUuid)) throw jsonError("businessId must be a UUID.", 400, "invalid_request");
  if (new Set(named.map((id) => id.toLowerCase())).size > 1) throw jsonError("The request names more than one businessId.", 400, "invalid_request");
  return named[0];
}

async function signIn(request: Request, options: RouteOptions = {}): Promise<SignedInRequest> {
  const session = await requireApiSession(request);
  const body = await readBody(request, options.maxBodyBytes);
  return { request, session, userId: session.user.id, body, businessId: namedBusinessId(request, body), domain: createDomainContext() };
}

async function forBusiness(user: SignedInRequest): Promise<OperatorRequest> {
  const { userId, domain } = user;
  const brand = requestBrandScope(user.request.headers);
  const capability = requestPathCapability(new URL(user.request.url).pathname);
  if (!capability) throw jsonError("The request path is invalid.", 400, "invalid_path");
  const businessId = user.businessId ?? await readActiveBusinessId(domain.db, { userId, brand });
  if (!businessId) throw jsonError("A businessId is required.", 400, "business_required");
  // Many handlers call a domain operation without `transaction`, so the brand and capability are checked here first.
  const access = await withBusinessTransaction(domain.db, { userId, businessId, actorType: "operator" }, async (tx) => await requireBusinessAccess(tx, { userId, businessId, brand, capability }));
  return {
    ...user,
    businessId,
    access,
    transaction: (callback, options = {}) => withBusinessTransaction(domain.db, { userId, businessId, actorType: "operator" }, async (tx) => {
      const { role } = await requireBusinessAccess(tx, { userId, businessId, brand, capability, minimumRole: options.minimumRole });
      return await callback(tx, role);
    }),
  };
}

function route<Input, Params>(resolve: (request: Request) => Promise<Input>, handler: (input: Input, params: Params) => Promise<Response>): Route<Params> {
  return async (request, context) => {
    try {
      return await handler(await resolve(request), (await context?.params) as Params);
    } catch (error) {
      return asApiResponse(error);
    }
  };
}

/** A route any signed-in user can call, such as their account or their list of businesses. */
export function signedInRoute<Params = object>(handler: (user: SignedInRequest, params: Params) => Promise<Response>, options: RouteOptions = {}): Route<Params> {
  return route((request) => signIn(request, options), handler);
}

/** A route that acts on one business. */
export function operatorRoute<Params = object>(handler: (operator: OperatorRequest, params: Params) => Promise<Response>): Route<Params> {
  return route(async (request) => await forBusiness(await signIn(request)), handler);
}

/**
 * The operator behind a request to a route that isn't an operatorRoute, such
 * as the dashboard's test call. It leaves the body unread, so the business
 * comes from the query or the header.
 */
export async function requireOperator(request: Request): Promise<OperatorRequest> {
  const session = await requireApiSession(request);
  return await forBusiness({ request, session, userId: session.user.id, body: {}, businessId: namedBusinessId(request, {}), domain: createDomainContext() });
}
