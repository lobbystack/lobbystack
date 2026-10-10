import { NextResponse } from "next/server";

import { requireFeedbackAccess, submitFeedback } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { assertFeedbackSubmissionAllowed } from "@/lib/feedback-rate-limit";
import { signedInRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Feedback can name a business or none.
export const POST = signedInRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.message !== "string") return jsonError("A feedback message is required.", 400);
  if (businessId) await requireFeedbackAccess(domain, { userId, businessId });
  await assertFeedbackSubmissionAllowed({ userId, ...(businessId ? { businessId } : {}) });
  const id = await submitFeedback(domain, { userId, ...(businessId ? { businessId } : {}), message: body.message, ...(typeof body.pagePath === "string" ? { pagePath: body.pagePath } : {}), ...(typeof body.userAgent === "string" ? { userAgent: body.userAgent } : {}) });
  return NextResponse.json({ feedbackSubmissionId: id });
});
