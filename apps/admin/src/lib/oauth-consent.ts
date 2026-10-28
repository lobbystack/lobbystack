import { listGrantableBusinesses, listGrantablePartners, partnerOAuthReference, recordOAuthGrantApproved, recordPartnerOAuthGrantApproved } from "@lobbystack/domain";
import { oauthGrantableScopes, oauthPartnerGrantableScopes, partnerOwnerScopes, type PartnerRole } from "@lobbystack/shared";

import { getAppDatabase } from "./api-helpers";
import { getAuth } from "./auth";
import { createDomainContext } from "./domain-context";
import { oauthIssuer } from "./mcp/oauth-config";
import { withSelectedReference } from "./oauth-provider";
import { setBrandHeaders } from "./request-brand";

// The consent screen's decision: approve for one business, or for one
// partner as an agency connection (ADR 0011), with a subset of the requested
// scopes, or deny. Better Auth verifies the signed authorization request and
// issues the code; this module checks that the person may grant access to
// what they picked, and with which scopes.

export type ConsentDecision = { oauthQuery: string; accept: boolean; businessId?: string | undefined; partnerId?: string | undefined; scopes?: string[] | undefined };

/** The scopes the consent page offers for a business connection. */
export function businessConsentScopes(requested: readonly string[]): string[] {
  return oauthGrantableScopes.filter((scope) => requested.includes(scope));
}

/** The scopes the consent page offers for an agency connection: the per-business ones and the partner's, with billing for owners only. */
export function agencyConsentScopes(requested: readonly string[], role: PartnerRole): string[] {
  const partner = oauthPartnerGrantableScopes.filter((scope) => requested.includes(scope) && (role === "owner" || !(partnerOwnerScopes as readonly string[]).includes(scope)));
  return [...partner, ...businessConsentScopes(requested)];
}

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
  grantablePartners?: (userId: string) => Promise<Array<{ partnerId: string; role: PartnerRole }>>;
  consent?: (input: { body: { accept: boolean; scope?: string; oauth_query: string }; headers: Headers }) => Promise<unknown>;
  recordApproval?: (input: { userId: string; businessId: string; clientId: string; scopes: string[] }) => Promise<void>;
  recordPartnerApproval?: (input: { userId: string; partnerId: string; clientId: string; scopes: string[] }) => Promise<void>;
};

/** Returns the URL to send the browser to: the client's redirect_uri with a code, or with access_denied. */
export async function decideConsent(input: { userId: string; headers: Headers; decision: ConsentDecision }, dependencies: ConsentDependencies = {}): Promise<string> {
  const consent = dependencies.consent ?? ((request) => callConsentEndpoint(request));
  const { decision } = input;
  const requested = requestedScopes(decision.oauthQuery);
  const clientId = clientIdFromQuery(decision.oauthQuery);
  if (!clientId) throw new ConsentError(400, "invalid_request", "The authorization request is missing its client.");

  if (!decision.accept) return redirectUrl(await consent({ body: { accept: false, oauth_query: decision.oauthQuery }, headers: input.headers }));

  if (decision.businessId && decision.partnerId) throw new ConsentError(400, "invalid_request", "Choose a business or an agency, not both.");
  if (!decision.businessId && !decision.partnerId) throw new ConsentError(400, "business_required", "Choose a business.");

  // What the person picked, and the scopes they may grant for it.
  let offered: string[];
  let referenceId: string;
  if (decision.partnerId) {
    const partnerId = decision.partnerId.toLowerCase();
    const partners = await (dependencies.grantablePartners ?? ((userId) => listGrantablePartners(createDomainContext(), userId)))(input.userId);
    const membership = partners.find((partner) => partner.partnerId.toLowerCase() === partnerId);
    if (!membership) throw new ConsentError(403, "forbidden", "Only people on an agency's team can connect apps to it.");
    if ((decision.scopes ?? []).some((scope) => (partnerOwnerScopes as readonly string[]).includes(scope)) && membership.role !== "owner") throw new ConsentError(403, "owner_only", "Only the agency's owners can let an app reach its billing.");
    offered = agencyConsentScopes(requested, membership.role);
    referenceId = partnerOAuthReference(partnerId);
  } else {
    const grantable = await (dependencies.grantableBusinesses ?? ((userId) => listGrantableBusinesses(getAppDatabase().db, userId)))(input.userId);
    if (!grantable.some((business) => business.businessId === decision.businessId)) throw new ConsentError(403, "forbidden", "Only owners and admins of a business can connect apps to it.");
    offered = businessConsentScopes(requested);
    referenceId = decision.businessId!;
  }

  const chosen = [...new Set(decision.scopes ?? [])];
  if (chosen.some((scope) => !requested.includes(scope))) throw new ConsentError(400, "invalid_scope", "A chosen permission wasn't requested by the app.");
  if (chosen.some((scope) => scope !== "offline_access" && !offered.includes(scope))) throw new ConsentError(400, "invalid_scope", decision.partnerId ? "A chosen permission isn't one an agency connection can have." : "A chosen permission is only for agency connections.");
  // Refresh tokens keep the connection working; they add no access of their own.
  const granted = requested.includes("offline_access") && !chosen.includes("offline_access") ? [...chosen, "offline_access"] : chosen;
  if (!granted.some((scope) => scope !== "offline_access")) throw new ConsentError(400, "invalid_scope", "Choose at least one permission.");

  const result = await withSelectedReference(referenceId, async () => await consent({ body: { accept: true, scope: granted.join(" "), oauth_query: decision.oauthQuery }, headers: input.headers }));
  if (decision.partnerId) {
    await (dependencies.recordPartnerApproval ?? ((approval) => recordPartnerOAuthGrantApproved(createDomainContext(), approval)))({ userId: input.userId, partnerId: decision.partnerId.toLowerCase(), clientId, scopes: granted });
  } else {
    await (dependencies.recordApproval ?? ((approval) => recordOAuthGrantApproved(createDomainContext(), approval)))({ userId: input.userId, businessId: decision.businessId!, clientId, scopes: granted });
  }
  return redirectUrl(result);
}

/**
 * Calls Better Auth's /oauth2/consent through its HTTP handler, in process.
 * The endpoint needs a real Request (it re-runs authorization), which a direct
 * auth.api call doesn't provide. The person's cookies come along, so the
 * session is theirs. The consent page answers only on the host's domain, so
 * the call carries the host brand, as the proxy would have set it.
 */
async function callConsentEndpoint(input: { body: { accept: boolean; scope?: string; oauth_query: string }; headers: Headers }): Promise<unknown> {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  for (const name of ["cookie", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = input.headers.get(name);
    if (value) headers.set(name, value);
  }
  const origin = oauthIssuer().replace(/\/api\/auth$/, "");
  headers.set("origin", origin);
  setBrandHeaders(headers, { kind: "host" });
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
