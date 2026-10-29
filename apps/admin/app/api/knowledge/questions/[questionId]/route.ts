import { NextResponse } from "next/server";

import { answerUnansweredQuestion, dismissUnansweredQuestion } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** Answers an open question, saving the answer as a text entry, or dismisses it. */
export const PATCH = operatorRoute<{ questionId: string }>(async ({ userId, businessId, body: input, domain }, { questionId }) => {
  const body = input as { action?: string; answer?: unknown };
  if (body.action === "answer") {
    if (typeof body.answer !== "string" || !body.answer.trim()) return jsonError("answer is required.", 400);
    return NextResponse.json(await answerUnansweredQuestion(domain, { userId, businessId, questionId, answer: body.answer }));
  }
  if (body.action === "dismiss") {
    await dismissUnansweredQuestion(domain, { userId, businessId, questionId });
    return NextResponse.json({ ok: true });
  }
  return jsonError('action must be "answer" or "dismiss".', 400);
});
