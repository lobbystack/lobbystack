import { NextResponse } from "next/server";

import { advanceOnboardingStage, isOnboardingStage } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request);
    const target = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { to?: unknown }).to : undefined;
    if (!isOnboardingStage(target) || target === "create_business" || target === "complete") {
      return NextResponse.json({ error: "A valid next onboarding stage is required." }, { status: 400 });
    }
    await advanceOnboardingStage(createDomainContext(), { userId: session.user.id, businessId, to: target });
    return NextResponse.json({ ok: true, stage: target });
  } catch (error) {
    return asApiResponse(error);
  }
}
