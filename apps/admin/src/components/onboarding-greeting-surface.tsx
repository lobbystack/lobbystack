"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type Business = { businessId: string; active: boolean };
type Profile = { greeting: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingGreetingSurface() {
  const { i18n, t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [greeting, setGreeting] = useState("");
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const agent = useQuery({ queryKey: ["onboarding-agent", business?.businessId], queryFn: () => requestJson<{ profile: Profile | null }>("/api/agent"), enabled: Boolean(business) });
  useEffect(() => {
    if (!hasUserEdited && agent.data?.profile?.greeting) setGreeting(agent.data.profile.greeting);
  }, [agent.data?.profile?.greeting, hasUserEdited]);
  const save = useMutation({
    mutationFn: async () => {
      await requestJson("/api/agent", { method: "PATCH", body: JSON.stringify({ greeting: greeting.trim(), locale: i18n.language.startsWith("fr") ? "fr" : "en" }) });
      return await requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "verify_phone" }) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/onboarding/verify-phone");
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("greeting.submitFailed"));
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-greeting">{t("greeting.label")}</FieldLabel>
          <Textarea autoFocus className="min-h-32 rounded-xl" id="onboarding-greeting" onChange={(event) => { setHasUserEdited(true); setGreeting(event.target.value); }} placeholder={t("greeting.placeholder")} value={greeting} />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={!business || greeting.trim().length === 0 || save.isPending} type="submit">{save.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("greeting.submitting")}</> : t("greeting.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
