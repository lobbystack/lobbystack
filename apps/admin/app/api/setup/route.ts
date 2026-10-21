import { NextResponse } from "next/server";

import { loadSetupGuideInTransaction, setupGuideStepIds, updateSetupGuideSkippedStepsInTransaction } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const { steps, fullScanDocumentId } = await loadSetupGuideInTransaction(tx, businessId);
  return {
    steps: [
      { id: "fullScan", name: "Read the rest of your site", description: "Onboarding read a sample", documentId: fullScanDocumentId, status: steps.fullScan },
      { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: steps.sources },
      { id: "testCall", name: "Hear your agent", description: "Call it from your browser", status: steps.testCall },
      { id: "phoneNumber", name: "Connect a phone number", description: "Let it answer real callers", status: steps.phoneNumber },
    ],
  };
}, { minimumRole: "business_admin" })));

export const PATCH = operatorRoute(async ({ businessId, body: input, transaction }) => {
  const body = input as { stepId?: string; skipped?: boolean };
  if (!setupGuideStepIds.includes(body.stepId as (typeof setupGuideStepIds)[number]) || typeof body.skipped !== "boolean") return jsonError("A valid stepId and skipped flag are required.");
  return NextResponse.json(await transaction(async (tx) => {
    const changed = await updateSetupGuideSkippedStepsInTransaction(tx, businessId, (current) => body.skipped ? Array.from(new Set([...current, body.stepId!])) : current.filter((id) => id !== body.stepId));
    if (!changed) throw jsonError("Business not found.", 404);
    return { skippedSteps: changed.after };
  }, { minimumRole: "business_admin" }));
});
