import { NextResponse } from "next/server";

import { revokePartnerPlatformKey, updatePartnerPlatformKey } from "@lobbystack/domain";
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

/** Changes a platform key's name and scopes; the key itself stays the same. Only owners change a key with billing scopes, or give it them. */
export const PATCH = partnerRoute<{ platformKeyId: string }>(async ({ actor, body, domain }, { platformKeyId }) => {
  if (!isUuid(platformKeyId)) return jsonError("platformKeyId must be a UUID.", 400, "invalid_request");
  const { platformKey } = await updatePartnerPlatformKey(domain, actor, { platformKeyId, name: typeof body.name === "string" ? body.name : "", scopes: body.scopes });
  return NextResponse.json({ platformKey });
});
