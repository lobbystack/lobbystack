import { isHostDomainHost, resolveHostBrand } from "@lobbystack/domain";
import { normalizeHostname } from "@lobbystack/shared";

import { listenForBrandChangesOnce } from "@/lib/brand-changes";
import { getDatabase } from "@/lib/databases";
import { reportServerError } from "@/lib/error-reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A self-hosted deployment's Caddy asks here, as GET /api/tls/ask?domain=<hostname>,
// before it issues a certificate on demand, and issues one only for a 200.
// It approves the host's own domain and the domains a brand answers on: a
// partner's subdomain of the partner base domain, and a partner's own domain
// once the worker verified it. Every other hostname gets a 404, so nobody can
// point a domain at the deployment and have Caddy issue it a certificate.
// Caddy calls on its own network address, so the proxy lets the route answer
// on any hostname, without resolving the caller's, and during maintenance.

const REPORT_INTERVAL_MS = 60_000;
let lastReportAt = 0;

/** Reports that the database couldn't say whether a hostname is a partner's, at most once a minute, since Caddy asks on every new handshake. */
function reportLookupFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastReportAt < REPORT_INTERVAL_MS) return;
  lastReportAt = now;
  void reportServerError(error, { operation: "tls_ask" }).catch(() => undefined);
}

function answer(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const domain = new URL(request.url).searchParams.get("domain");
  const hostname = normalizeHostname(domain);
  // A port or a bracketed address is never a name Caddy issues a certificate for.
  if (!hostname || hostname.startsWith("[") || /:\d+$/.test(domain?.trim() ?? "")) return answer(400, "Name a domain.");
  // The host's own domain never waits on the database.
  if (isHostDomainHost(hostname)) return answer(200, "Approved.");
  listenForBrandChangesOnce();
  try {
    // Nobody is signed in, so the app role reads partners' domains through a definer function.
    const brand = await resolveHostBrand({ db: getDatabase("lobbystack_app").db }, hostname);
    return brand ? answer(200, "Approved.") : answer(404, "Not found.");
  } catch (error) {
    reportLookupFailure(error);
    // Caddy asks again on the next handshake.
    return answer(503, "Try again later.");
  }
}
