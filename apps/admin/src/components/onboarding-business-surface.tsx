"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingBusinessSurface({ createNew = false }: { createNew?: boolean }) {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [businessType, setBusinessType] = useState("service_company");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/businesses", { method: "POST", body: JSON.stringify({ name, slug, timezone, businessType }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/onboarding/website");
    },
  });

  if (businesses.isLoading) return <p className="text-sm text-slate-500">{t("businessName.loading")}</p>;
  if (businesses.isError) return <p className="text-sm text-red-600">{t("businessName.unavailable")}</p>;
  if (businesses.data?.businesses.length && !createNew) return <PageSurface eyebrow="Step 1 of 8" title={t("businessName.existingTitle")} description={t("businessName.existingDescription")}><Card><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-900">{businesses.data.businesses.find((item) => item.active)?.name ?? businesses.data.businesses[0]?.name}</p><p className="mt-1 text-sm text-slate-500">{t("businessName.configured")}</p></div><Button onClick={() => router.push("/onboarding/website")}>{t("businessName.continueSetup")}</Button></CardContent></Card></PageSurface>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("businessName.submitFailed"));
    }
  }

  return <PageSurface eyebrow="Step 1 of 8" title={t("businessName.title")} description={t("businessName.description")}><Card><CardHeader><CardTitle>{t("businessName.createTitle")}</CardTitle><CardDescription>{t("businessName.createDescription")}</CardDescription></CardHeader><CardContent><form className="grid gap-5 md:grid-cols-2" onSubmit={submit}><label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">{t("businessName.label")}<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("businessName.placeholder")} required /></label><label className="space-y-2 text-sm font-medium text-slate-700">{t("businessName.slugLabel")}<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={t("businessName.slugPlaceholder")} pattern="[a-z0-9-]+" required /></label><label className="space-y-2 text-sm font-medium text-slate-700">{t("businessName.timezoneLabel")}<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder={t("businessName.timezonePlaceholder")} required /></label><label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">{t("businessName.typeLabel")}<select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal" value={businessType} onChange={(event) => setBusinessType(event.target.value)}><option value="service_company">{t("businessName.types.serviceCompany")}</option><option value="clinic">{t("businessName.types.clinic")}</option><option value="salon">{t("businessName.types.salon")}</option><option value="professional_services">{t("businessName.types.professionalServices")}</option><option value="other">{t("businessName.types.other")}</option></select></label><div className="md:col-span-2"><Button type="submit" disabled={create.isPending}>{create.isPending ? t("businessName.submitting") : t("businessName.create")}</Button></div></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</CardContent></Card></PageSurface>;
}
