"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageUp, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MAX_APP_NAME_LENGTH, MAX_BRAND_LOGO_BYTES, brandLogoContentType, brandLogoContentTypes, normalizeAppName } from "@lobbystack/shared";

import { BrandLockup } from "@/components/brand-mark";
import { useBranding } from "@/components/branding-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { BRANDING_API_PATH, parseBrandingResponse } from "@/lib/branding-snapshot";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { cn } from "@/lib/utils";

const NEXT_STEP = "/onboarding/business";

// The server's answers when the choice is no longer this person's to make.
const CLOSED_CODES = new Set(["branding_already_saved", "branding_not_allowed"]);

const ERROR_KEYS: Record<string, string> = {
  invalid_app_name: "brand.errors.appName",
  invalid_logo: "brand.errors.logoType",
  logo_too_large: "brand.errors.logoSize",
};

type PickedLogo = { bytes: Uint8Array; previewUrl: string };

type InitialBranding = { appName?: string; logo?: string };

function errorCode(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return typeof code === "string" ? code : null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // A chunk at a time, because a whole logo is more arguments than one call takes.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * The deployment's name and logo, chosen by its first owner. Saving or skipping
 * ends the choice for everyone, so the step never comes back. Fields that an
 * environment variable sets aren't asked.
 */
export function OnboardingBrandSurface({ askAppName, askLogo }: { askAppName: boolean; askLogo: boolean }) {
  const { t } = useTranslation("onboarding");
  const branding = useBranding();
  const { navigate, navigating } = useStepNavigation();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.previewUrl); }, [logo]);

  const save = useMutation({
    mutationFn: (body: InitialBranding) => requestJson<unknown>("/api/branding/initial", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (response) => {
      const saved = parseBrandingResponse(response);
      if (saved) branding.setBranding(saved);
      navigate(NEXT_STEP);
    },
    onError: async (cause) => {
      const code = errorCode(cause);
      if (code === null || !CLOSED_CODES.has(code)) {
        setError(t(ERROR_KEYS[code ?? ""] ?? "brand.errors.failed"));
        return;
      }
      setClosed(true);
      // Show the name and logo the deployment has instead.
      const current = await requestJson<unknown>(BRANDING_API_PATH).then(parseBrandingResponse, () => null);
      if (current) branding.setBranding(current);
    },
    meta: { inlineError: true },
  });
  const working = save.isPending || navigating;

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BRAND_LOGO_BYTES) {
      setError(t("brand.errors.logoSize"));
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The server checks the same way, so a refused logo is caught before saving.
    const contentType = brandLogoContentType(bytes);
    if (!contentType) {
      setError(t("brand.errors.logoType"));
      return;
    }
    // Typed from the bytes, since an SVG only renders as image/svg+xml.
    setLogo({ bytes, previewUrl: URL.createObjectURL(new Blob([bytes], { type: contentType })) });
  }

  const typedName = askAppName ? normalizeAppName(name) : null;
  const chosen = (askAppName && name.trim() !== "") || (askLogo && logo !== null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (askAppName && name.trim() !== "" && !typedName) {
      setError(t("brand.errors.appName"));
      return;
    }
    save.mutate({
      ...(typedName ? { appName: typedName } : {}),
      ...(askLogo && logo ? { logo: toBase64(logo.bytes) } : {}),
    });
  }

  if (closed) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm text-muted-foreground" role="status">{t("brand.errors.closed")}</p>
        <Button className="h-11 w-full" disabled={navigating} onClick={() => navigate(NEXT_STEP)} type="button">
          {navigating ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {t("brand.continue")}
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FieldGroup className="gap-5">
        {askAppName ? (
          <Field>
            <FieldLabel htmlFor="onboarding-brand-name">{t("brand.nameLabel")}</FieldLabel>
            <Input autoComplete="off" autoFocus className="h-11" id="onboarding-brand-name" maxLength={MAX_APP_NAME_LENGTH} onChange={(event) => setName(event.target.value)} placeholder={branding.appName} type="text" value={name} />
            <FieldDescription>{t("brand.nameHint")}</FieldDescription>
          </Field>
        ) : null}
        {askLogo ? (
          <Field>
            <FieldLabel htmlFor="onboarding-brand-logo">{t("brand.logoLabel")}</FieldLabel>
            <div className="flex items-center gap-2">
              <label
                className={cn(
                  "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                  dragging ? "border-foreground/60 bg-muted/40" : "border-border hover:border-foreground/40 hover:bg-muted/20",
                )}
                onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void pick(event.dataTransfer.files[0]); }}
              >
                <input
                  accept={brandLogoContentTypes.join(",")}
                  className="sr-only"
                  disabled={working}
                  id="onboarding-brand-logo"
                  onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }}
                  type="file"
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  {logo ? <img alt="" className="size-6 object-contain" src={logo.previewUrl} /> : <ImageUp aria-hidden="true" className="size-4 text-muted-foreground" />}
                </span>
                <span>{t(logo ? "brand.logoChange" : "brand.logoChoose")}</span>
              </label>
              {logo ? (
                <Button aria-label={t("brand.logoRemove")} disabled={working} onClick={() => setLogo(null)} size="icon-sm" type="button" variant="ghost">
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <FieldDescription>{t("brand.logoHint")}</FieldDescription>
          </Field>
        ) : null}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("brand.preview")}</span>
          <Surface className="px-4 py-5">
            <BrandLockup appName={typedName ?? branding.appName} logoUrl={logo?.previewUrl ?? branding.logoUrl} />
          </Surface>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={working || !chosen} type="submit">
          {working ? <><LoaderCircle className="size-4 animate-spin" />{t("brand.saving")}</> : t("brand.continue")}
        </Button>
        <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={working} onClick={() => { setError(null); save.mutate({}); }} type="button">
          {t("brand.skip")}
        </button>
      </FieldGroup>
    </form>
  );
}
