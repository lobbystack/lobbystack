import { NextResponse } from "next/server";

import { checkOperatorPhoneVerificationCode } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

// Checks a code. A correct code verifies the phone on the signed-in
// operator's account; the response never includes the code or the phone.
export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { attemptId?: unknown; code?: unknown };
    if (typeof body.attemptId !== "string" || !body.attemptId || typeof body.code !== "string") return jsonError("An attemptId and code are required.", 400, "verification_code_required");
    const result = await checkOperatorPhoneVerificationCode(createDomainContext(), { userId: session.user.id, businessId, attemptId: body.attemptId, code: body.code });
    return NextResponse.json(result);
  } catch (error) {
    return asApiResponse(error);
  }
}
