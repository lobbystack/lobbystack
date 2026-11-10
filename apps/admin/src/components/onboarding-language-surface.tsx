"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeRuntimeLocale, runtimeLocales, type RuntimeLocale } from "@lobbystack/shared";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag } from "@/components/flag";
import { runtimeLocaleRegion } from "@/lib/country-flag";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

const NEXT_STEP = "/onboarding/verify-phone";

/** Without a website there's nothing to read the language from, so the owner picks it. */
export function OnboardingLanguageSurface() {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [picked, setPicked] = useState<RuntimeLocale | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { prefetch(NEXT_STEP); }, [prefetch]);
  const locale = picked ?? normalizeRuntimeLocale(business?.defaultLocale);
  const save = useMutation({
    mutationFn: async () => {
      await requestJson("/api/agent", { method: "PATCH", body: JSON.stringify({ locale }) });
      await requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "verify_phone" }) });
    },
    onSuccess: async () => {
      if (business) telemetry.track("web.onboarding.language_submitted", { businessId: business.businessId, locale });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate(NEXT_STEP);
    },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "language.submitFailed")),
    meta: { inlineError: true },
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setError(null); save.mutate(); }}>
      <FieldGroup className="gap-4">
        <Field aria-busy={!business || undefined}>
          <FieldLabel htmlFor="onboarding-language">{t("language.label")}</FieldLabel>
          {!business ? <Skeleton aria-hidden="true" className="h-11 w-full" /> : (
            <Select items={runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))} onValueChange={(value) => { if (value) setPicked(value as RuntimeLocale); }} value={locale}>
              <SelectTrigger className="data-[size=default]:h-11 w-full *:data-[slot=select-value]:gap-2" id="onboarding-language"><SelectValue>{(value: RuntimeLocale | null) => value ? <><Flag region={runtimeLocaleRegion(value)} /><span className="truncate">{t(`common:callerLanguage.${value}`)}</span></> : null}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup>{runtimeLocales.map((code) => <SelectItem key={code} value={code}><Flag region={runtimeLocaleRegion(code)} />{t(`common:callerLanguage.${code}`)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          )}
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 w-full" disabled={!business || save.isPending || navigating} type="submit">{save.isPending || navigating ? <><LoaderCircle className="size-4 animate-spin" />{t("language.saving")}</> : t("language.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
