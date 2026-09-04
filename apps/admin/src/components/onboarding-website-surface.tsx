"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Business = { businessId: string; active: boolean };

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
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const add = useMutation({
    mutationFn: () => requestJson("/api/knowledge", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, title: websiteUrl.trim(), sourceType: "website", sourceUrl: websiteUrl.trim() }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/onboarding/knowledge");
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await add.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("website.submitFailed"));
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-website-url">{t("website.label")}</FieldLabel>
          <div className="relative">
            <Globe aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoComplete="url" autoFocus className="h-11 pl-9" id="onboarding-website-url" onChange={(event) => setWebsiteUrl(event.target.value)} placeholder={t("website.placeholder")} required type="url" value={websiteUrl} />
          </div>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={!business || websiteUrl.trim().length === 0 || add.isPending} type="submit">{add.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("website.submitting")}</> : t("website.continue")}</Button>
      </FieldGroup>
    </form>
  );
}
