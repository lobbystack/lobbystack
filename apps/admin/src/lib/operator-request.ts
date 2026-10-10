import { eq } from "drizzle-orm";

import type { AuthzRole } from "@lobbystack/contracts";
import { users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { requireBusinessMembership, type DomainContext } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { asApiResponse, jsonError, requireApiSession } from "./api-helpers";
import type { Session } from "./auth";
import { createDomainContext } from "./domain-context";

// What an operator route handler gets: the verified session, the JSON body,
// the business the request acts on, and the domain context. A thrown error
// becomes a response through asApiResponse. Authorization stays in the
// domain: the operation a route calls checks membership, or `transaction` does.

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
  /** The business the request names, or else the user's active business. */
  businessId: string;
  /** Runs the callback in the business's transaction once the user's membership, and minimum role, check out. */
  transaction<T>(callback: (tx: DatabaseTransaction, role: AuthzRole) => Promise<T>, options?: { minimumRole?: AuthzRole }): Promise<T>;
};

type Route<Params> = (request: Request, context?: { params: Promise<Params> }) => Promise<Response>;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
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

async function signIn(request: Request): Promise<SignedInRequest> {
  const session = await requireApiSession(request);
  const body = await readBody(request);
  return { request, session, userId: session.user.id, body, businessId: namedBusinessId(request, body), domain: createDomainContext() };
}

async function forBusiness(user: SignedInRequest): Promise<OperatorRequest> {
  const { userId, domain } = user;
  const businessId = user.businessId ?? await withBusinessTransaction(domain.db, { userId, actorType: "operator" }, async (tx) =>
    (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1))[0]?.activeBusinessId ?? null);
  if (!businessId) throw jsonError("A businessId is required.", 400, "business_required");
  return {
    ...user,
    businessId,
    transaction: (callback, options = {}) => withBusinessTransaction(domain.db, { userId, businessId, actorType: "operator" }, async (tx) => {
      const { role } = await requireBusinessMembership(tx, { userId, businessId, ...(options.minimumRole ? { minimumRole: options.minimumRole } : {}) });
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
export function signedInRoute<Params = object>(handler: (user: SignedInRequest, params: Params) => Promise<Response>): Route<Params> {
  return route(signIn, handler);
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
