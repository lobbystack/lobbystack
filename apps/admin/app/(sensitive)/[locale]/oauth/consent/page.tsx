import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { listGrantableBusinesses } from "@lobbystack/domain";
import { oauthGrantableScopes } from "@lobbystack/shared";

import { OAuthConsentSurface, type OAuthConsentProps } from "@/components/oauth-consent-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getAuth, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toQueryString(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) query.append(name, item);
    else if (value !== undefined) query.append(name, value);
  }
  return query.toString();
}

/** A client_id that is an HTTPS URL came from a metadata document the client's domain serves, so its host is verified. */
function verifiedClientHost(clientId: string): string | null {
  try {
    const url = new URL(clientId);
    return url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}

/** Where the browser goes after approval. The plugin already checked it against the client's registration. */
function redirectHost(redirectUri: string | null): string | null {
  if (!redirectUri) return null;
  try {
    return new URL(redirectUri).host || null;
  } catch {
    return null;
  }
}

async function loadConsent(params: Record<string, string | string[] | undefined>, requestHeaders: Headers): Promise<OAuthConsentProps | { kind: "sign-in"; query: string }> {
  const oauthQuery = toQueryString(params);
  const query = new URLSearchParams(oauthQuery);
  const clientId = query.get("client_id");
  if (!clientId || !query.get("sig")) return { kind: "invalid" };
  const session = await getSession(requestHeaders);
  if (!session) return { kind: "sign-in", query: oauthQuery };
  let clientName: string | null = null;
  try {
    const client = await getAuth().api.getOAuthClientPublic({ query: { client_id: clientId }, headers: requestHeaders }) as { client_name?: string | null };
    clientName = client.client_name?.trim() || null;
  } catch {
    return { kind: "invalid" };
  }
  const requested = (query.get("scope") ?? "").split(" ");
  const businesses = await listGrantableBusinesses(getAppDatabase().db, session.user.id);
  return {
    kind: "consent",
    oauthQuery,
    client: { name: clientName, host: verifiedClientHost(clientId), redirectHost: redirectHost(query.get("redirect_uri")) },
    email: session.user.email ?? "",
    businesses: businesses.map(({ businessId, name, active }) => ({ businessId, name, active })),
    scopes: oauthGrantableScopes.filter((scope) => requested.includes(scope)),
  };
}

export default async function OAuthConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const props = await loadConsent(await searchParams, new Headers(await headers()));
  if (props.kind === "sign-in") redirect(`/oauth/sign-in?${props.query}`);
  return <OAuthConsentSurface {...props} />;
}
