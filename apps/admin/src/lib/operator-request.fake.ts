import type { AuthzRole } from "@lobbystack/contracts";
import type { DatabaseTransaction } from "@lobbystack/db";
import type { BusinessAccess, Capability, DomainContext } from "@lobbystack/domain";

import { asApiResponse, jsonError } from "./api-helpers";
import type { OperatorRequest, RouteOptions, SignedInRequest } from "./operator-request";

// Stands in for ./operator-request in route tests, so a test drives a route's
// own logic without a session or a database:
//   vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
// operator-request.test.ts covers what this skips: sessions, business
// resolution, body parsing and membership.

const defaults = () => ({
  userId: "user",
  /** The session's email and whether it's verified. */
  email: "user@example.com" as string | null,
  emailVerified: true,
  businessId: "business",
  domain: { db: "app" } as unknown as DomainContext,
  /** What transaction() hands its callback. */
  tx: {} as unknown,
  role: "business_owner" as AuthzRole,
  /** The capabilities the business gives the operator: all of them, as a direct business does. */
  capabilities: ["activity", "setup", "team", "billing", "api_keys", "mcp"] as Capability[],
  /** Thrown by transaction(), the way a failed membership check is. */
  denied: undefined as unknown,
  /** The options of each transaction() call. */
  transactions: [] as Array<{ minimumRole?: AuthzRole } | undefined>,
});

export const fakeOperator = defaults();

export function resetFakeOperator(): void {
  Object.assign(fakeOperator, defaults());
}

async function operator(request: Request, options: RouteOptions = {}): Promise<OperatorRequest> {
  const text = await request.text();
  if (options.maxBodyBytes !== undefined && Buffer.byteLength(text) > options.maxBodyBytes) throw jsonError("The request body is too large.", 413, "body_too_large");
  const { userId, businessId, domain, email, emailVerified, role, capabilities } = fakeOperator;
  const access: BusinessAccess = { businessId, via: "membership", role, partnerRole: null, partnerId: null, accessLevel: null, can: (capability) => capabilities.includes(capability) };
  return {
    request,
    session: { user: { id: userId, email, emailVerified }, session: { id: "session", userId, expiresAt: new Date(0) } },
    userId,
    businessId,
    body: text ? JSON.parse(text) as Record<string, unknown> : {},
    domain,
    access,
    transaction: async (callback, options) => {
      fakeOperator.transactions.push(options);
      if (fakeOperator.denied) throw fakeOperator.denied;
      return await callback(fakeOperator.tx as DatabaseTransaction, fakeOperator.role);
    },
  };
}

function route<Input, Params>(resolve: (request: Request) => Promise<Input>, handler: (input: Input, params: Params) => Promise<Response>) {
  return async (request: Request, context?: { params: Promise<Params> }) => {
    try {
      return await handler(await resolve(request), (await context?.params) as Params);
    } catch (error) {
      return asApiResponse(error);
    }
  };
}

export function signedInRoute<Params = object>(handler: (user: SignedInRequest, params: Params) => Promise<Response>, options: RouteOptions = {}) {
  return route((request) => operator(request, options), handler);
}

export function operatorRoute<Params = object>(handler: (operator: OperatorRequest, params: Params) => Promise<Response>) {
  return route(operator, handler);
}
