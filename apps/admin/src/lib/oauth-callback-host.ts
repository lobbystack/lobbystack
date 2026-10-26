import { resolveRequestHost } from "./host-resolution";
import { partnerRequestOrigin } from "./request-brand";

// Google and Meta send every OAuth callback to the one redirect URI the host
// registered with them, on the host's domain, since neither takes a redirect
// URI per partner domain. A Google Calendar or Instagram connection started
// on a partner's host signs that host's origin into its state, and the host's
// domain hands the callback on to it unchanged. The callback then finishes
// there, where the person's session cookie lives, and lands them back on the
// partner's integrations page.

/** What an OAuth callback does next. */
export type OAuthCallbackRoute =
  /** The connection started on this request's host: finish it here. */
  | { kind: "here" }
  /** It started on a partner's host: send the callback there, with its code and state. */
  | { kind: "handoff"; url: URL }
  /** It started on another host, or on one no brand answers for any more. */
  | { kind: "refused" };

/**
 * Where an OAuth callback goes, from the origin its verified state names. Only
 * the host's domain hands a callback on, and only to the partner's host its
 * state was signed on, while that host still resolves to a partner, so an
 * authorization code never goes to a domain its partner removed. A partner's
 * host finishes only the connections started on it. Rejects when the database
 * can't say whether the partner's host still answers.
 */
export async function routeOAuthCallback(request: Request, startOrigin: string | null): Promise<OAuthCallbackRoute> {
  const current = partnerRequestOrigin(request.headers);
  if (startOrigin === current) return { kind: "here" };
  if (current || !startOrigin) return { kind: "refused" };
  const resolved = await resolveRequestHost(new URL(startOrigin).host);
  if (resolved?.kind !== "partner" || resolved.origin !== startOrigin) return { kind: "refused" };
  const { pathname, search } = new URL(request.url);
  return { kind: "handoff", url: new URL(`${pathname}${search}`, startOrigin) };
}
