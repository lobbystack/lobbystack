"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Business = { businessId: string; name: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "business";
}

export function OnboardingBusinessSurface({ createNew = false }: { createNew?: boolean }) {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        slug: slugify(name),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        businessType: "service_company",
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/onboarding/website");
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (businesses.data?.businesses.length && !createNew) {
        router.push("/onboarding/website");
        return;
      }
      await create.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("businessName.submitFailed"));
    }
  }

  const existing = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const value = existing && !createNew ? existing.name : name;
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-business-name">{t("businessName.label")}</FieldLabel>
          <div className="relative">
            <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoComplete="organization" autoFocus className="h-11 pl-9" disabled={Boolean(existing && !createNew)} id="onboarding-business-name" onChange={(event) => setName(event.target.value)} placeholder={t("businessName.placeholder")} required type="text" value={value} />
          </div>
        </Field>
        {error || businesses.isError ? <FieldError>{error ?? t("businessName.unavailable")}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={businesses.isLoading || create.isPending || (!existing && name.trim().length === 0)} type="submit">{create.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("businessName.submitting")}</> : existing && !createNew ? t("businessName.continueSetup") : t("businessName.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
