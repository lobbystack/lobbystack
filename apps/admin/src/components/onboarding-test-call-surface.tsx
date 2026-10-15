"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { DASHBOARD_TEST_CALL_WIDGET_ID } from "@lobbystack/shared";
import type { TelemetryEventName, TelemetryProperties } from "@lobbystack/telemetry";
import { LIVE_WEB_CALL_ENDPOINT } from "@lobbystack/web-voice";

/** The owner hears their receptionist before anything else is asked of them. */
export function OnboardingTestCallSurface() {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const { resolvedTheme } = useTheme();
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { prefetch("/onboarding/verify-phone"); }, [prefetch]);
  const businessId = business?.businessId;
  const trackVoice = useCallback((eventName: TelemetryEventName, properties?: Record<string, unknown>) => {
    if (businessId) telemetry.track(eventName, { businessId, ...properties } as TelemetryProperties);
  }, [businessId, telemetry]);
  const markHeard = useCallback(() => setHeard(true), []);
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
      {/* The same call as the dashboard's test call: the owner's login authorizes it, and it counts as heard. */}
      {business ? (
        <AuraVoiceDemo
          auraTone={resolvedTheme}
          businessSlug={business.slug}
          className="w-full max-w-[22rem]"
          endpoint={`${LIVE_WEB_CALL_ENDPOINT}?businessId=${encodeURIComponent(business.businessId)}`}
          onCallEnded={markHeard}
          onEvent={trackVoice}
          widgetId={DASHBOARD_TEST_CALL_WIDGET_ID}
        />
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <Button className="h-11 w-full" disabled={!business || advance.isPending || navigating} onClick={() => advance.mutate()} type="button" variant={heard ? "default" : "ghost"}>
        {heard ? t("testCall.continue") : t("testCall.skip")}
      </Button>
    </div>
  );
}
