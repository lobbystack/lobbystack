"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useTelemetry } from "@/components/product-analytics";
import { currentWebsiteImport, isWebsiteImportRunning, WebsiteImportProgress, type WebsiteImportSummary } from "./website-import-progress";

type Profile = { greeting: string };
type KnowledgeDocument = { id: string; createdAt?: string; websiteImport?: WebsiteImportSummary | null };

export function OnboardingGreetingSurface() {
  const { i18n, t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const [greeting, setGreeting] = useState("");
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { business } = useActiveBusiness();
  // Warm the next step while the greeting is being written, so continuing
  // waits only on the save and its progress refresh.
  useEffect(() => { prefetch("/onboarding/plan"); }, [prefetch]);
  const agent = useQuery({ queryKey: ["onboarding-agent", business?.businessId], queryFn: () => requestJson<{ profile: Profile | null }>("/api/agent"), enabled: Boolean(business) });
  const documents = useQuery({
    queryKey: ["onboarding-knowledge", business?.businessId],
    queryFn: () => requestJson<{ documents: KnowledgeDocument[] }>(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business),
    refetchInterval: query => query.state.data?.documents?.some(document => isWebsiteImportRunning(document.websiteImport)) ? 2000 : false,
  });
  const websiteImport = currentWebsiteImport(documents.data?.documents, business?.websiteUrl);
  useEffect(() => {
    if (!hasUserEdited && agent.data?.profile?.greeting) setGreeting(agent.data.profile.greeting);
  }, [agent.data?.profile?.greeting, hasUserEdited]);
  const save = useMutation({
    mutationFn: async () => {
      await requestJson("/api/agent", { method: "PATCH", body: JSON.stringify({ greeting: greeting.trim(), locale: i18n.language.startsWith("fr") ? "fr" : "en" }) });
      return await requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "plan" }) });
    },
    onSuccess: async () => {
      if (business) telemetry.track("web.onboarding.greeting_submitted", { businessId: business.businessId });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      navigate("/onboarding/plan");
    },
    meta: { inlineError: true },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync();
    } catch (cause) {
      setError(getSafeOnboardingErrorMessage(cause, t, "greeting.submitFailed"));
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {websiteImport ? <WebsiteImportProgress job={websiteImport} /> : null}
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-greeting">{t("greeting.label")}</FieldLabel>
          <Textarea autoFocus className="min-h-32 rounded-xl" id="onboarding-greeting" onChange={(event) => { setHasUserEdited(true); setGreeting(event.target.value); }} placeholder={t("greeting.placeholder")} value={greeting} />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={!business || greeting.trim().length === 0 || save.isPending || navigating} type="submit">{save.isPending || navigating ? <><LoaderCircle className="size-4 animate-spin" />{t("greeting.submitting")}</> : t("greeting.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
