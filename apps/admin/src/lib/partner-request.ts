import { resolvePartnerActor, type PartnerMemberActor } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { jsonError } from "./api-helpers";
import { signedInRoute, type RouteOptions, type SignedInRequest } from "./operator-request";
import { opensPartnerConsole, readResolvedBrand } from "./request-brand";

// What a partner console route handler gets: the signed-in request and the
// person as an actor on the partner the request names. The partner operation
// a route calls checks the actor's role itself. On a partner's host, a route
// acts only on that partner.

export type PartnerRequest = SignedInRequest & { partnerId: string; actor: PartnerMemberActor };

// Every name the request gives must be a UUID and the same one, so a body
// can't quietly point at another partner than the URL.
function namedPartnerId(request: Request, body: Record<string, unknown>): string {
  const named = [new URL(request.url).searchParams.get("partnerId"), request.headers.get("x-partner-id"), body.partnerId].filter((value) => value !== null && value !== undefined);
  if (!named.length) throw jsonError("A partnerId is required.", 400, "partner_required");
  if (!named.every(isUuid)) throw jsonError("partnerId must be a UUID.", 400, "invalid_request");
  if (new Set(named.map((id) => id.toLowerCase())).size > 1) throw jsonError("The request names more than one partnerId.", 400, "invalid_request");
  return named[0]!;
}

/** A route that acts on one partner the signed-in person is on the team of, and on a partner's host only that host's partner. Anything else gets a 404. */
export function partnerRoute<Params = object>(handler: (partner: PartnerRequest, params: Params) => Promise<Response>, options: RouteOptions = {}) {
  return signedInRoute<Params>(async (user, params) => {
    const partnerId = namedPartnerId(user.request, user.body);
    if (!opensPartnerConsole(readResolvedBrand(user.request.headers), partnerId)) throw jsonError("Partner not found.", 404, "partner_not_found");
    const actor = await resolvePartnerActor(user.domain, { userId: user.userId, partnerId });
    return await handler({ ...user, partnerId, actor }, params);
  }, options);
}
