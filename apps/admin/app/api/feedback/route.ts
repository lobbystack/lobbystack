import { NextResponse } from "next/server";

import { requireFeedbackAccess, submitFeedback } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { assertFeedbackSubmissionAllowed } from "@/lib/feedback-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || typeof (body as { message?: unknown }).message !== "string") return NextResponse.json({ error: "A feedback message is required." }, { status: 400 });
    const businessId = businessIdFromRequest(request) ?? (typeof (body as { businessId?: unknown }).businessId === "string" ? (body as { businessId: string }).businessId : undefined);
    if (businessId) await requireFeedbackAccess(createDomainContext(), { userId: session.user.id, businessId });
    await assertFeedbackSubmissionAllowed({ userId: session.user.id, ...(businessId ? { businessId } : {}) });
    const input = body as { message: string; pagePath?: unknown; userAgent?: unknown };
    const id = await submitFeedback(createDomainContext(), { userId: session.user.id, ...(businessId ? { businessId } : {}), message: input.message, ...(typeof input.pagePath === "string" ? { pagePath: input.pagePath } : {}), ...(typeof input.userAgent === "string" ? { userAgent: input.userAgent } : {}) });
    return NextResponse.json({ feedbackSubmissionId: id });
  } catch (error) {
    return asApiResponse(error);
  }
}
