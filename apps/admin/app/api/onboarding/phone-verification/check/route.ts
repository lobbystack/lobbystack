import { NextResponse } from "next/server";

import { checkOnboardingPhoneVerificationCode } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getOnboardingPhoneVerifyProvider } from "@/lib/twilio-provider";

export const dynamic = "force-dynamic";

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.attemptId !== "string" || typeof body.code !== "string") return jsonError("attemptId and code are required.", 400);
  return NextResponse.json(await checkOnboardingPhoneVerificationCode(domain, { userId, businessId, attemptId: body.attemptId, code: body.code }, getOnboardingPhoneVerifyProvider()));
});
