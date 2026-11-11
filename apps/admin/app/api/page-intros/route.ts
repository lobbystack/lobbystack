import { NextResponse } from "next/server";

import { markPageIntroSeen } from "@lobbystack/domain";
import { isPageIntroKey, PAGE_INTRO_KEYS } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** Records that the person closed a page's intro card, or made their first dashboard visit. The layout reads the list. */
export const POST = signedInRoute(async ({ body, domain, userId }) => {
  const { intro } = body;
  if (!isPageIntroKey(intro)) return jsonError(`intro must be one of ${PAGE_INTRO_KEYS.join(", ")}.`, 400);
  await markPageIntroSeen(domain, { userId, intro });
  return NextResponse.json({ intro });
}, { maxBodyBytes: 1024 });
