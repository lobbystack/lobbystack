import { NextResponse } from "next/server";

import { submitOnboardingAttribution } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request);
    const source = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { source?: unknown }).source === "string" ? (body as { source: string }).source : null;
    const referralCode = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { referralCode?: unknown }).referralCode === "string" ? (body as { referralCode: string }).referralCode : null;
    await submitOnboardingAttribution(createDomainContext(), { userId: session.user.id, businessId, source, referralCode });
    return NextResponse.json({ ok: true, stage: "complete" });
  } catch (error) {
    return asApiResponse(error);
  }
}
