"use client";

import { useEffect, useId, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MAX_BRAND_LOGO_BYTES, PARTNER_NAME_MAX_LENGTH, brandLogoContentType, brandLogoContentTypes, normalizeBrandColor, type BrandImage, type PartnerRole } from "@lobbystack/shared";
import { BrandLockup } from "@/components/brand-mark";
import { PageHeader } from "@/components/page-header";
import { PartnerDomainSettings } from "@/components/partner-domain-settings";
import { useConsolePartner } from "@/components/partner-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

/** What GET and PUT /api/partner/branding answer. */
type BrandSettings = {
  role: PartnerRole;
  name: string;
  subdomain: string | null;
  subdomainUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  color: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
};

type TextFields = Pick<BrandSettings, "name" | "color" | "termsUrl" | "privacyUrl" | "supportUrl" | "supportEmail">;
type Draft = { [Field in keyof TextFields]: string };

/** An image picked to upload, or null to remove the saved one. Undefined keeps what's saved. */
type ImageChoice = { bytes: Uint8Array; previewUrl: string } | null | undefined;

const ERROR_KEYS: Record<string, string> = {
  invalid_name: "branding.errors.name",
  invalid_color: "branding.errors.color",
  invalid_terms_url: "branding.errors.link",
  invalid_privacy_url: "branding.errors.link",
  invalid_support_url: "branding.errors.link",
  invalid_support_email: "branding.errors.supportEmail",
  invalid_logo: "branding.errors.imageType",
  invalid_favicon: "branding.errors.imageType",
  logo_too_large: "branding.errors.imageSize",
  favicon_too_large: "branding.errors.imageSize",
  body_too_large: "branding.errors.imageSize",
  forbidden: "branding.errors.forbidden",
};

function draftFrom(settings: BrandSettings): Draft {
  return {
    name: settings.name,
    color: settings.color ?? "",
    termsUrl: settings.termsUrl ?? "",
    privacyUrl: settings.privacyUrl ?? "",
    supportUrl: settings.supportUrl ?? "",
    supportEmail: settings.supportEmail ?? "",
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // A chunk at a time, because a whole image is more arguments than one call takes.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function ImageField({ id, image, label, help, savedUrl, choice, disabled, onChange, onError }: {
  id: string;
  image: BrandImage;
  label: string;
  help: string;
  savedUrl: string | null;
  choice: ImageChoice;
  disabled: boolean;
  onChange: (choice: ImageChoice) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation("partner");
  const shown = choice === undefined ? savedUrl : choice?.previewUrl ?? null;

  async function pick(file: File | undefined) {
    onError(null);
    if (!file) return;
    if (file.size > MAX_BRAND_LOGO_BYTES) {
      onError(t("branding.errors.imageSize"));
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The server checks the same way, so a refused image is caught before saving.
    const contentType = brandLogoContentType(bytes);
    if (!contentType) {
      onError(t("branding.errors.imageType"));
      return;
    }
    // Typed from the bytes, since an SVG only renders as image/svg+xml.
    onChange({ bytes, previewUrl: URL.createObjectURL(new Blob([bytes], { type: contentType })) });
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <label className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-foreground/40 hover:bg-muted/20")}>
          <input accept={brandLogoContentTypes.join(",")} className="sr-only" disabled={disabled} id={id} onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} type="file" />
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            {shown ? <img alt="" className="size-6 object-contain" src={shown} /> : <ImageUp aria-hidden="true" className="size-4 text-muted-foreground" />}
          </span>
          <span>{t(shown ? "branding.imageChange" : "branding.imageChoose")}</span>
        </label>
        {shown && !disabled ? (
          <Button aria-label={t(image === "logo" ? "branding.logoRemove" : "branding.faviconRemove")} onClick={() => onChange(null)} size="icon-sm" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      <FieldDescription>{help}</FieldDescription>
    </Field>
  );
}

/**
 * The console's Branding & domain page: the partner's addresses, and the
 * name, logo, favicon, color and links its businesses see on them and in its
 * emails. Owners and admins save it; members see it with no way to change it.
 * The server enforces the same rule.
 */
export function PartnerBrandingSurface() {
  const { t } = useTranslation("partner");
  const id = useId();
  const partner = useConsolePartner();
  const queryClient = useQueryClient();
  const queryKey = ["partner-branding", partner.partnerId];
  const settings = useQuery({ queryKey, queryFn: () => requestJson<BrandSettings>(`/api/partner/branding?partnerId=${encodeURIComponent(partner.partnerId)}`) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logo, setLogo] = useState<ImageChoice>(undefined);
  const [favicon, setFavicon] = useState<ImageChoice>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (settings.data && !draft) setDraft(draftFrom(settings.data)); }, [settings.data, draft]);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.previewUrl); }, [logo]);
  useEffect(() => () => { if (favicon) URL.revokeObjectURL(favicon.previewUrl); }, [favicon]);

  const role = settings.data?.role ?? partner.role;
  const canEdit = role === "owner" || role === "admin";

  const save = useMutation({
    mutationFn: (form: Draft) => requestJson<BrandSettings>("/api/partner/branding", {
      method: "PUT",
      body: JSON.stringify({
        partnerId: partner.partnerId,
        ...form,
        ...(logo === undefined ? {} : { logo: logo ? toBase64(logo.bytes) : null }),
        ...(favicon === undefined ? {} : { favicon: favicon ? toBase64(favicon.bytes) : null }),
      }),
    }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setDraft(draftFrom(saved));
      setLogo(undefined);
      setFavicon(undefined);
      toast.success(t("branding.saved"));
    },
    onError: (cause: Error & { code?: string }) => setError(t(ERROR_KEYS[cause.code ?? ""] ?? "branding.errors.failed")),
    meta: { inlineError: true },
  });

  const set = (change: Partial<Draft>) => setDraft((current) => current && { ...current, ...change });
  const pickedColor = draft ? normalizeBrandColor(draft.color) : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || save.isPending) return;
    setError(null);
    if (draft.color.trim() && !pickedColor) {
      setError(t("branding.errors.color"));
      return;
    }
    save.mutate(draft);
  }

  if (settings.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("branding.title")} />
        <p className="text-sm text-muted-foreground" role="alert">{t("branding.loadFailed")}</p>
      </div>
    );
  }

  const data = settings.data;
  const field = (name: keyof Draft) => `${id}-${name}`;
  const working = save.isPending || !canEdit;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("branding.title")} />
      {/* Its own form and requests, beside the brand's. */}
      <PartnerDomainSettings />
      {!data || !draft ? (
        <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Surface>
      ) : (
        <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
          <Surface className="p-6">
            <FieldGroup className="gap-8">
              <FieldSet>
                <FieldLegend>{t("branding.brand.title")}</FieldLegend>
                <FieldGroup className="gap-5">
                  <Field>
                    <FieldLabel htmlFor={field("name")}>{t("branding.nameLabel")}</FieldLabel>
                    <Input disabled={working} id={field("name")} maxLength={PARTNER_NAME_MAX_LENGTH} onChange={(event) => set({ name: event.target.value })} required value={draft.name} />
                    <FieldDescription>{t("branding.nameHelp")}</FieldDescription>
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <ImageField choice={logo} disabled={working} help={t("branding.logoHelp")} id={`${id}-logo`} image="logo" label={t("branding.logoLabel")} onChange={setLogo} onError={setError} savedUrl={data.logoUrl} />
                    <ImageField choice={favicon} disabled={working} help={t("branding.faviconHelp")} id={`${id}-favicon`} image="favicon" label={t("branding.faviconLabel")} onChange={setFavicon} onError={setError} savedUrl={data.faviconUrl} />
                  </div>
                  <Field className="sm:max-w-[calc(50%-10px)]">
                    <FieldLabel htmlFor={field("color")}>{t("branding.colorLabel")}</FieldLabel>
                    <div className="flex items-center gap-2">
                      <label className={cn("relative size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/25 ring-inset focus-within:ring-[3px] focus-within:ring-ring/50", working ? "cursor-not-allowed" : "cursor-pointer")} style={{ backgroundColor: pickedColor ?? "transparent" }}>
                        <span className="sr-only">{t("branding.colorPick")}</span>
                        <input className="absolute inset-0 cursor-pointer opacity-0" disabled={working} onChange={(event) => set({ color: event.target.value })} type="color" value={pickedColor ?? "#000000"} />
                      </label>
                      <Input className="font-mono" dir="ltr" disabled={working} id={field("color")} maxLength={7} onChange={(event) => set({ color: event.target.value })} placeholder="#0f766e" spellCheck={false} value={draft.color} />
                    </div>
                    <FieldDescription>{t("branding.colorHelp")}</FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>{t("branding.links.title")}</FieldLegend>
                <FieldDescription>{t("branding.links.description")}</FieldDescription>
                <FieldGroup className="gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {(["termsUrl", "privacyUrl", "supportUrl"] as const).map((name) => (
                      <Field key={name}>
                        <FieldLabel htmlFor={field(name)}>{t(`branding.links.${name}`)}</FieldLabel>
                        <Input dir="ltr" disabled={working} id={field(name)} onChange={(event) => set({ [name]: event.target.value })} placeholder={t(`branding.links.${name}Placeholder`)} type="url" value={draft[name]} />
                      </Field>
                    ))}
                    <Field>
                      <FieldLabel htmlFor={field("supportEmail")}>{t("branding.links.supportEmail")}</FieldLabel>
                      <Input dir="ltr" disabled={working} id={field("supportEmail")} onChange={(event) => set({ supportEmail: event.target.value })} placeholder={t("branding.links.supportEmailPlaceholder")} type="email" value={draft.supportEmail} />
                      <FieldDescription>{t("branding.links.supportEmailHelp")}</FieldDescription>
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("branding.preview")}</span>
                <Surface className="px-4 py-5">
                  <BrandLockup appName={draft.name.trim() || data.name} logoUrl={logo === undefined ? data.logoUrl : logo?.previewUrl ?? null} partner />
                </Surface>
              </div>
            </FieldGroup>
          </Surface>

          {error ? <FieldError>{error}</FieldError> : null}
          {canEdit ? (
            <div className="flex justify-end">
              <Button disabled={save.isPending || !draft.name.trim()} loading={save.isPending} loadingLabel={t("branding.saving")} type="submit">{t("branding.save")}</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("branding.membersCantEdit")}</p>
          )}
        </form>
      )}
    </div>
  );
}
