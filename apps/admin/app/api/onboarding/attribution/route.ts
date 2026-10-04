import { NextResponse } from "next/server";

import { submitOnboardingAttribution } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request);
    const source = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { source?: unknown }).source === "string" ? (body as { source: string }).source : null;
    const referralCode = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { referralCode?: unknown }).referralCode === "string" ? (body as { referralCode: string }).referralCode : null;
    await submitOnboardingAttribution(createDomainContext(), { userId: session.user.id, businessId, source, referralCode });
    return NextResponse.json({ ok: true, stage: "complete" });
  } catch (error) {
    return asApiResponse(error);
  }
}
