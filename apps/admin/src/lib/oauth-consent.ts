import { listGrantableBusinesses, recordOAuthGrantApproved } from "@lobbystack/domain";

import { getAppDatabase } from "./api-helpers";
import { getAuth } from "./auth";
import { createDomainContext } from "./domain-context";
import { oauthIssuer } from "./mcp/oauth-config";
import { withSelectedBusiness } from "./oauth-provider";

// The consent screen's decision: approve for one business with a subset of
// the requested scopes, or deny. Better Auth verifies the signed
// authorization request and issues the code; this module checks that the
// person may grant access to the business they picked.

export type ConsentDecision = { oauthQuery: string; accept: boolean; businessId?: string | undefined; scopes?: string[] | undefined };

export class ConsentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** The scopes the client asked for, from the signed query. */
export function requestedScopes(oauthQuery: string): string[] {
  return (new URLSearchParams(oauthQuery).get("scope") ?? "").split(" ").filter(Boolean);
}

export function clientIdFromQuery(oauthQuery: string): string | null {
  return new URLSearchParams(oauthQuery).get("client_id");
}

type ConsentDependencies = {
  grantableBusinesses?: (userId: string) => Promise<Array<{ businessId: string }>>;
  consent?: (input: { body: { accept: boolean; scope?: string; oauth_query: string }; headers: Headers }) => Promise<unknown>;
  recordApproval?: (input: { userId: string; businessId: string; clientId: string; scopes: string[] }) => Promise<void>;
};

/** Returns the URL to send the browser to: the client's redirect_uri with a code, or with access_denied. */
export async function decideConsent(input: { userId: string; headers: Headers; decision: ConsentDecision }, dependencies: ConsentDependencies = {}): Promise<string> {
  const consent = dependencies.consent ?? ((request) => callConsentEndpoint(request));
  const { decision } = input;
  const requested = requestedScopes(decision.oauthQuery);
  const clientId = clientIdFromQuery(decision.oauthQuery);
  if (!clientId) throw new ConsentError(400, "invalid_request", "The authorization request is missing its client.");

  if (!decision.accept) return redirectUrl(await consent({ body: { accept: false, oauth_query: decision.oauthQuery }, headers: input.headers }));

  if (!decision.businessId) throw new ConsentError(400, "business_required", "Choose a business.");
  const grantable = await (dependencies.grantableBusinesses ?? ((userId) => listGrantableBusinesses(getAppDatabase().db, userId)))(input.userId);
  if (!grantable.some((business) => business.businessId === decision.businessId)) throw new ConsentError(403, "forbidden", "Only owners and admins of a business can connect apps to it.");

  const chosen = [...new Set(decision.scopes ?? [])];
  if (chosen.some((scope) => !requested.includes(scope))) throw new ConsentError(400, "invalid_scope", "A chosen permission wasn't requested by the app.");
  // Refresh tokens keep the connection working; they add no access of their own.
  const granted = requested.includes("offline_access") && !chosen.includes("offline_access") ? [...chosen, "offline_access"] : chosen;
  if (!granted.some((scope) => scope !== "offline_access")) throw new ConsentError(400, "invalid_scope", "Choose at least one permission.");

  const businessId = decision.businessId;
  const result = await withSelectedBusiness(businessId, async () => await consent({ body: { accept: true, scope: granted.join(" "), oauth_query: decision.oauthQuery }, headers: input.headers }));
  await (dependencies.recordApproval ?? ((approval) => recordOAuthGrantApproved(createDomainContext(), approval)))({ userId: input.userId, businessId, clientId, scopes: granted });
  return redirectUrl(result);
}

/**
 * Calls Better Auth's /oauth2/consent through its HTTP handler, in process.
 * The endpoint needs a real Request (it re-runs authorization), which a direct
 * auth.api call doesn't provide. The person's cookies come along, so the
 * session is theirs.
 */
async function callConsentEndpoint(input: { body: { accept: boolean; scope?: string; oauth_query: string }; headers: Headers }): Promise<unknown> {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  for (const name of ["cookie", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = input.headers.get(name);
    if (value) headers.set(name, value);
  }
  const origin = oauthIssuer().replace(/\/api\/auth$/, "");
  headers.set("origin", origin);
  const response = await getAuth().handler(new Request(`${oauthIssuer()}/oauth2/consent`, { method: "POST", headers, body: JSON.stringify(input.body) }));
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw Object.assign(new Error("The consent endpoint rejected the request."), { statusCode: response.status, body });
  return body;
}

function redirectUrl(result: unknown): string {
  const url = typeof result === "object" && result !== null && "url" in result ? (result as { url: unknown }).url : undefined;
  if (typeof url !== "string" || !url) throw new ConsentError(500, "internal_error", "The authorization server did not return a redirect.");
  return url;
}
