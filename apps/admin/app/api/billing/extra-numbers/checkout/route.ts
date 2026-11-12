import { NextResponse } from "next/server";

import { createExtraNumbersCheckoutRequest, loadExtraNumbersCheckoutInTransaction } from "@lobbystack/domain";
import { extraNumbersProductId, isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** The extra numbers checkout, polled until Polar's page is ready and then until the add-on bills. */
export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!isUuid(requestId)) return jsonError("requestId must be a UUID.");
  const checkout = await transaction(async (tx) => await loadExtraNumbersCheckoutInTransaction(tx, { businessId, requestId }), { minimumRole: "business_admin" });
  if (!checkout) return jsonError("Checkout request not found.", 404);
  return NextResponse.json(checkout);
});

/** Starts a Polar checkout for the monthly extra numbers add-on, which comes before the first extra number. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (!extraNumbersProductId(process.env) || !process.env.POLAR_ACCESS_TOKEN) return jsonError("This deployment doesn't sell extra numbers.", 409);
  if (body.agentId !== undefined && !isUuid(body.agentId)) return jsonError("agentId must be a UUID.");
  const requestId = await createExtraNumbersCheckoutRequest(domain, { userId, businessId, agentId: typeof body.agentId === "string" ? body.agentId : null });
  return NextResponse.json({ requestId }, { status: 202 });
});
