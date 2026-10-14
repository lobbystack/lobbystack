"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DashboardTestCallWidget } from "@/components/dashboard-test-call-widget";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { startTestCall, subscribeTestCallEnded } from "@/lib/test-call-launcher";
import { useStepNavigation } from "@/lib/use-step-navigation";

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
  useEffect(() => subscribeTestCallEnded(() => setHeard(true)), []);
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
      {/* The widget owns the call and its screen; the button below starts it. */}
      {business ? <DashboardTestCallWidget businessId={business.businessId} businessSlug={business.slug} className="hidden md:hidden" /> : null}
      <Button className="h-12 w-full" disabled={!business} onClick={() => { setError(null); startTestCall(); }} type="button">
        <Phone />
        {heard ? t("testCall.callAgain") : t("testCall.call")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t("testCall.hint")}</p>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button className="h-11 w-full" disabled={!business || advance.isPending || navigating} onClick={() => advance.mutate()} type="button" variant={heard ? "default" : "ghost"}>
        {heard ? t("testCall.continue") : t("testCall.skip")}
      </Button>
    </div>
  );
}
