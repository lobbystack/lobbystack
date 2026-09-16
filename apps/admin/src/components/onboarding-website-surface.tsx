"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Business = { businessId: string; active: boolean; websiteUrl?: string | null };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingWebsiteSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const edited = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  useEffect(() => { if (!edited.current && business?.websiteUrl) setWebsiteUrl(business.websiteUrl); }, [business?.websiteUrl]);
  const add = useMutation({
    mutationFn: () => requestJson("/api/knowledge", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, title: websiteUrl.trim(), sourceType: "website", sourceUrl: websiteUrl.trim(), onboarding: true }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/onboarding/knowledge");
    },
  });
  const skip = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, {
      method: "POST",
      body: JSON.stringify({ to: "knowledge" }),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); router.push("/onboarding/knowledge"); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "website.skipFailed")),
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await add.mutateAsync();
    } catch (cause) {
      setError(getSafeOnboardingErrorMessage(cause, t, "website.submitFailed"));
    }
  }

  const working = add.isPending || skip.isPending;

  return (
    <div>
      <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-website-url">{t("website.label")}</FieldLabel>
          <div className="relative">
            <Globe aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoComplete="url" autoFocus className="h-11 pl-9" id="onboarding-website-url" onChange={(event) => { edited.current = true; setWebsiteUrl(event.target.value); }} placeholder={t("website.placeholder")} type="text" value={websiteUrl} />
          </div>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={!business || websiteUrl.trim().length === 0 || working} type="submit">{add.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("website.submitting")}</> : t("website.continue")}</Button>
      </FieldGroup>
      </form>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || working} onClick={() => { setError(null); skip.mutate(); }} type="button">{skip.isPending ? t("website.skipping") : t("website.skip")}</button>
      </div>
    </div>
  );
}
