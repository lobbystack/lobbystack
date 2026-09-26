"use client";

import { useEffect, useState } from "react";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTelemetry } from "@/components/product-analytics";
import { recordPendingOnboardingBusiness } from "@/lib/onboarding-analytics";

type Business = { businessId: string; name: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingBusinessSurface({ createNew = false }: { createNew?: boolean }) {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        businessType: "service_company",
      }),
    }),
    onSuccess: async (created: { businessId: string }) => {
      recordPendingOnboardingBusiness(created.businessId);
      // The next step looks this workspace up before it can save, so it has to
      // be in the cache before we move.
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/website");
    },
  });
  useEffect(() => { prefetch("/onboarding/website"); }, [prefetch]);
  const existing = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  useEffect(() => {
    if (existing && !createNew) setName(existing.name);
  }, [createNew, existing]);
  const update = useMutation({
    mutationFn: () => requestJson(`/api/businesses?businessId=${encodeURIComponent(existing!.businessId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    }),
    onSuccess: async () => {
      if (existing) telemetry.track("web.onboarding.business_name_submitted", { businessId: existing.businessId });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/website");
    },
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
