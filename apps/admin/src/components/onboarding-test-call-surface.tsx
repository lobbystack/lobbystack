"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ImportWaitSlides, useImportWait } from "@/components/onboarding-import-wait";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { TestPanel } from "@/components/test-window";
import { currentWebsiteImport, isWebsiteImportRunning, WebsiteImportProgress, type WebsiteImportSummary } from "@/components/website-import-progress";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

type KnowledgeDocument = { id: string; createdAt?: string; websiteImport?: WebsiteImportSummary | null };

/** The owner hears their receptionist before anything else is asked of them. */
export function OnboardingTestCallSurface() {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { prefetch("/onboarding/verify-phone"); }, [prefetch]);
  const businessId = business?.businessId;
  const markHeard = useCallback(() => setHeard(true), []);
  // A failed check must not hold anyone here, so it doesn't retry.
  const documents = useQuery({
    queryKey: ["onboarding-knowledge", businessId],
    queryFn: () => requestJson<{ documents: KnowledgeDocument[] }>(`/api/knowledge?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
    retry: false,
    refetchInterval: query => query.state.data?.documents?.some(document => isWebsiteImportRunning(document.websiteImport)) ? 2000 : false,
  });
  const websiteImport = currentWebsiteImport(documents.data?.documents, business?.websiteUrl);
  const { phase, stopWaiting } = useImportWait(websiteImport, documents.isSuccess || documents.isError);
  const advance = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "verify_phone" }) }),
    onSuccess: async () => {
      if (business) telemetry.track("web.onboarding.test_call_continued", { businessId: business.businessId, heard });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/verify-phone");
    },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "testCall.continueFailed")),
    meta: { inlineError: true },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* The card stays after the wait, to say how the import ended. */}
      {websiteImport && (phase === "waiting" || phase === "waited") ? <div aria-live="polite"><WebsiteImportProgress job={websiteImport} /></div> : null}
      {phase === "waited" && isWebsiteImportRunning(websiteImport) ? <p className="text-xs text-muted-foreground">{t("testCall.wait.stillReading")}</p> : null}
      {phase === "waiting" ? <ImportWaitSlides /> : null}
      {/* The same panel as the test window: the owner's login authorizes the call, and it counts as heard. */}
      {business && (phase === "ready" || phase === "waited") ? <TestPanel businessId={business.businessId} businessSlug={business.slug} onCallEnded={markHeard} /> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {phase === "waiting" ? (
        <Button className="h-11 w-full" onClick={stopWaiting} type="button" variant="ghost">{t("testCall.wait.skip")}</Button>
      ) : (
        <Button className="h-11 w-full" disabled={!business || advance.isPending || navigating} onClick={() => advance.mutate()} type="button" variant={heard ? "default" : "ghost"}>
          {heard ? t("testCall.continue") : t("testCall.skip")}
        </Button>
      )}
    </div>
  );
}
