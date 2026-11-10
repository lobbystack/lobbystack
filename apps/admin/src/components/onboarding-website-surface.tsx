"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ONBOARDING_READING_ROUTE } from "@lobbystack/shared";
import { Globe, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useTelemetry } from "@/components/product-analytics";


export function OnboardingWebsiteSurface() {
  const { t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const edited = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Which button started the work, so the Continue button names it.
  const [action, setAction] = useState<"add" | "skip">("add");
  const { business } = useActiveBusiness();
  // The next step is fetched while the form is still being filled in, so
  // Continue waits only on the save.
  useEffect(() => { prefetch(ONBOARDING_READING_ROUTE); }, [prefetch]);
  useEffect(() => { if (!edited.current && business?.websiteUrl) setWebsiteUrl(business.websiteUrl); }, [business?.websiteUrl]);
  const add = useMutation({
    mutationFn: () => requestJson<{ documentId: string }>("/api/knowledge", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, title: websiteUrl.trim(), sourceType: "website", sourceUrl: websiteUrl.trim(), onboarding: true }) }),
    onSuccess: async ({ documentId }) => {
      if (business) telemetry.track("web.onboarding.website_submitted", { businessId: business.businessId });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate(`${ONBOARDING_READING_ROUTE}?documentId=${encodeURIComponent(documentId)}`);
    },
    meta: { inlineError: true },
  });
  const skip = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, {
      method: "POST",
      body: JSON.stringify({ to: "language" }),
    }),
    onSuccess: async () => { if (business) telemetry.track("web.onboarding.website_skipped", { businessId: business.businessId }); await queryClient.invalidateQueries({ queryKey: ["businesses"] }); navigate("/onboarding/language"); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "website.skipFailed")),
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAction("add");
    try {
      await add.mutateAsync();
    } catch (cause) {
      setError(getSafeOnboardingErrorMessage(cause, t, "website.submitFailed"));
    }
  }

  const working = add.isPending || skip.isPending || navigating;

  return (
    <div>
      <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field aria-busy={!business || undefined}>
          <FieldLabel htmlFor="onboarding-website-url">{t("website.label")}</FieldLabel>
          {!business ? <Skeleton aria-hidden="true" className="h-10 w-full rounded-xl" /> : (
            <div className="relative">
              <Globe aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoComplete="url" autoFocus className="pl-9" id="onboarding-website-url" onChange={(event) => { edited.current = true; setWebsiteUrl(event.target.value); }} placeholder={t("website.placeholder")} type="text" value={websiteUrl} />
            </div>
          )}
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 w-full" disabled={!business || websiteUrl.trim().length === 0 || working} type="submit">{working ? <><LoaderCircle className="size-4 animate-spin" />{t(action === "skip" ? "website.skippingImport" : "website.submitting")}</> : t("website.continue")}</Button>
      </FieldGroup>
      </form>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || working} onClick={() => { setError(null); setAction("skip"); skip.mutate(); }} type="button">{skip.isPending ? t("website.skipping") : t("website.skip")}</button>
      </div>
    </div>
  );
}
