import { NextResponse } from "next/server";

import { revokePartnerPlatformKey } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

/** Revokes one of the partner's platform keys, turns off its webhooks and revokes its unaccepted team invitations, at once. Revoking it again changes nothing. */
export const DELETE = partnerRoute<{ platformKeyId: string }>(async ({ actor, domain }, { platformKeyId }) => {
  if (!isUuid(platformKeyId)) return jsonError("platformKeyId must be a UUID.", 400, "invalid_request");
  const { platformKey } = await revokePartnerPlatformKey(domain, actor, { platformKeyId });
  return NextResponse.json({ platformKey });
});
