"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getStoredAffiliateReferralCode } from "@/lib/affiliate-referral";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTelemetry } from "@/components/product-analytics";
import { recordPendingOnboardingBusiness } from "@/lib/onboarding-analytics";


export function OnboardingBusinessSurface({ createNew = false }: { createNew?: boolean }) {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { businesses, business: existing } = useActiveBusiness();
  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        businessType: "service_company",
        referralCode: getStoredAffiliateReferralCode(),
      }),
    }),
    onSuccess: async (created: { businessId: string }) => {
      recordPendingOnboardingBusiness(created.businessId);
      // The next step looks this workspace up before it can save, so it has to
      // be in the cache before we move.
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/website");
    },
    meta: { inlineError: true },
  });
  useEffect(() => { prefetch("/onboarding/website"); }, [prefetch]);
  useEffect(() => {
    if (existing && !createNew) setName(existing.name);
  }, [createNew, existing]);
  const update = useMutation({
    mutationFn: async () => {
      const businessId = encodeURIComponent(existing!.businessId);
      await requestJson(`/api/businesses?businessId=${businessId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      // A claimed prospect demo starts on this step, unlike a new signup. The
      // website step redirects back here until the stage moves on, and the
      // server ignores this for a business that is already further along.
      await requestJson(`/api/onboarding/stage?businessId=${businessId}`, {
        method: "POST",
        body: JSON.stringify({ to: "website" }),
      });
    },
    onSuccess: async () => {
      if (existing) telemetry.track("web.onboarding.business_name_submitted", { businessId: existing.businessId });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/website");
    },
    meta: { inlineError: true },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (businesses.data?.businesses.length && !createNew) {
        await update.mutateAsync();
        return;
      }
      await create.mutateAsync();
    } catch (cause) {
      setError(getSafeOnboardingErrorMessage(cause, t, "businessName.submitFailed"));
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-business-name">{t("businessName.label")}</FieldLabel>
          <div className="relative">
            <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoComplete="organization" autoFocus className="h-11 pl-9" id="onboarding-business-name" onChange={(event) => setName(event.target.value)} placeholder={t("businessName.placeholder")} required type="text" value={name} />
          </div>
        </Field>
        {error || businesses.isError ? <FieldError>{error ?? t("businessName.unavailable")}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={businesses.isLoading || create.isPending || update.isPending || navigating || name.trim().length === 0} type="submit">{create.isPending || update.isPending || navigating ? <><LoaderCircle className="size-4 animate-spin" />{t("businessName.submitting")}</> : t("businessName.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
