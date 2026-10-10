import { NextResponse } from "next/server";

import { checkOperatorPhoneVerificationCode } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

// Checks a code. A correct code verifies the phone on the signed-in
// operator's account; the response never includes the code or the phone.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.attemptId !== "string" || !body.attemptId || typeof body.code !== "string") return jsonError("An attemptId and code are required.", 400, "verification_code_required");
  const result = await checkOperatorPhoneVerificationCode(domain, { userId, businessId, attemptId: body.attemptId, code: body.code });
  return NextResponse.json(result);
});
