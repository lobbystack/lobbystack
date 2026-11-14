import { NextResponse } from "next/server";

import { loadSetupGuideInTransaction, setupGuideSkippableStepIds, updateSetupGuideSkippedStepsInTransaction } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// Getting started. A business that has, or had, a number gets the number
// list; any other keeps the classic one. The dashboard orders and words them.
// Reading the rest of the site follows a site onboarding read; without one,
// adding a website takes its place, after forwarding in the number list.
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const { steps, numberSteps, variant, forwarding, numberLost, fullScanDocumentId, siteStep, skippedSteps } = await loadSetupGuideInTransaction(tx, businessId);
  const fullScan = siteStep === "fullScan" ? [{ id: "fullScan", name: "Read the rest of your site", description: "Onboarding read a sample", documentId: fullScanDocumentId, status: steps.fullScan }] : [];
  const website = siteStep === "website" ? [{ id: "website", name: "Add your website", description: "Import it into knowledge", status: steps.website }] : [];
  const sources = { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: steps.sources };
  return {
    variant,
    skippedSteps,
    forwarding,
    numberLost,
    steps: variant === "number"
      ? [
        ...fullScan,
        { id: "callNumber", name: "Call your number", description: "Ask what your callers ask most", status: numberSteps.callNumber },
        { id: "forwardCalls", name: "Keep your existing number", description: "Calls you miss, or all of them", status: numberSteps.forwardCalls },
        ...website,
        sources,
      ]
      : [
        ...fullScan,
        ...website,
        sources,
        { id: "testCall", name: "Hear your agent", description: "Call it from your browser", status: steps.testCall },
        { id: "phoneNumber", name: "Connect a phone number", description: "Let it answer real callers", status: steps.phoneNumber },
      ],
  };
}, { minimumRole: "business_admin" })));

export const PATCH = operatorRoute(async ({ businessId, body: input, transaction }) => {
  const body = input as { stepId?: string; skipped?: boolean };
  if (!setupGuideSkippableStepIds.includes(body.stepId as (typeof setupGuideSkippableStepIds)[number]) || typeof body.skipped !== "boolean") return jsonError("A valid stepId and skipped flag are required.");
  return NextResponse.json(await transaction(async (tx) => {
    const changed = await updateSetupGuideSkippedStepsInTransaction(tx, businessId, (current) => body.skipped ? Array.from(new Set([...current, body.stepId!])) : current.filter((id) => id !== body.stepId));
    if (!changed) throw jsonError("Business not found.", 404);
    return { skippedSteps: changed.after };
  }, { minimumRole: "business_admin" }));
});
