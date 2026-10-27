"use client";

import { useMemo, useState } from "react";
import { LayoutTemplate, MoreHorizontal, Trash2, UserRoundCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { formatPriceAmount, type PackageOverage, type PackageSubscriptionStatus, type PartnerAccessLevel } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { AccessLevelOptions } from "@/components/partner-access-level-options";
import { PageHeader } from "@/components/page-header";
import { PartnerLifecycleNotice } from "@/components/partner-lifecycle-notice";
import { useConsolePartner } from "@/components/partner-shell";
import { fetchPartnerTemplates, partnerTemplatesQueryKey, SaveTemplateDialog } from "@/components/partner-templates-surface";
import { useTelemetry } from "@/components/product-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intlLocale } from "@/lib/locale";
import { parsePriceInput, priceInputValue } from "@/lib/price-input";
import { requestJson } from "@/lib/request-json";
import { availableTimeZones, groupTimeZones, isTimeZoneRegion, type TimeZoneOption } from "@/lib/time-zones";

/** What a business is sold, with its overage in the package's currency, which only owners and admins see. */
type PackageBilling = { kind: "package"; packageId: string; packageName: string; status: PackageSubscriptionStatus; overage: PackageOverage };
type BusinessBilling = { kind: "outside" } | PackageBilling;

type PartnerBusiness = {
  businessId: string;
  name: string;
  accessLevel: PartnerAccessLevel;
  onboardingStage: string;
  createdAt: string;
  owner: { email: string; status: "joined" } | { email: string; status: "invited"; expiresAt: string } | null;
  /** What it used this month: voice seconds and chats. */
  usage: { periodKey: string; voiceSeconds: number; chats: number };
  billing: BusinessBilling | null;
};

/** A package for sale, as GET /api/partner/packages lists it. */
type SellablePackage = { packageId: string; name: string; currency: string; monthlyPriceMinor: number; onConnectedAccount: boolean };
type Packages = { stripe: { configured: boolean }; packages: SellablePackage[] };

/** The template picker's value for a business that starts with nothing set up. */
const NO_TEMPLATE = "none";

/** The billing choice in the console: a package's id, or this for billed outside LobbyStack. */
const BILLED_OUTSIDE = "outside";

const BILLING_ERRORS: Record<string, string> = {
  subscription_active: "businesses.billing.errors.subscriptionActive",
  package_not_found: "businesses.billing.errors.packageGone",
  stripe_not_connected: "businesses.billing.errors.notConnected",
  stripe_not_configured: "businesses.billing.errors.notConfigured",
};

const STATUS_BADGE: Record<PackageSubscriptionStatus, string | undefined> = {
  awaiting_payment: "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200",
  active: undefined,
  past_due: "border-destructive/30 bg-destructive/10 text-destructive",
  inactive: undefined,
};

// Matches SelectTrigger, as the time zone picker in the receptionist's settings does.
const COMBOBOX_TRIGGER_CLASS = "flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:bg-input/50";

/** The time zone of the browser creating the business, which the partner changes when its client is elsewhere. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Billed outside LobbyStack, or one of the partner's packages on its connected account. */
function BillingSelect({ id, value, onChange, packages, current, disabled }: { id: string; value: string; onChange: (value: string) => void; packages: SellablePackage[]; current?: BusinessBilling | null; disabled?: boolean }) {
  const { t, i18n } = useTranslation("partner");
  const locale = intlLocale(i18n.language);
  const items: Array<{ value: string; label: string; disabled?: boolean }> = [
    { value: BILLED_OUTSIDE, label: t("businesses.billing.outside") },
    ...packages.filter((item) => item.onConnectedAccount).map((item) => ({ value: item.packageId, label: t("businesses.billing.option", { name: item.name, amount: formatPriceAmount(item.monthlyPriceMinor, item.currency, locale) }) })),
  ];
  // A business keeps a package the partner stopped selling, which no other business can pick.
  if (current?.kind === "package" && !items.some((item) => item.value === current.packageId)) items.push({ value: current.packageId, label: current.packageName, disabled: true });
  return (
    <Select disabled={disabled ?? false} items={items} onValueChange={(next) => { if (typeof next === "string") onChange(next); }} value={value}>
      <SelectTrigger className="w-full" id={id}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{items.map((item) => <SelectItem disabled={item.disabled ?? false} key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  );
}

const OVERAGE_ERRORS: Record<string, string> = {
  invalid_overage_rate: "businesses.overage.errors.invalidRate",
  invalid_overage_cap: "businesses.overage.errors.invalidCap",
  billed_outside: "businesses.overage.errors.billedOutside",
  stripe_not_configured: "businesses.billing.errors.notConfigured",
};

/** A business's overage in a few words, for its row on the Businesses page. */
function OverageSummary({ overage }: { overage: PackageOverage }) {
  const { t, i18n } = useTranslation("partner");
  const text = !overage.enabled
    ? t("businesses.overage.summary.off")
    : overage.capMinor === null
      ? t("businesses.overage.summary.noCap")
      : t("businesses.overage.summary.cap", { cap: formatPriceAmount(overage.capMinor, overage.currency, intlLocale(i18n.language)) });
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

/**
 * A business's overage on its package, for owners and admins: on or off,
 * what each minute and chat past the package's allowance costs, and the
 * monthly cap on what that comes to, in the package's currency. Turning
 * overage off keeps the rates and the cap, so turning it on again restores
 * them. The server checks the role and the values again.
 */
function OverageDialog({ partnerId, business, billing, onClose }: { partnerId: string; business: PartnerBusiness; billing: PackageBilling; onClose: () => void }) {
  const { t, i18n } = useTranslation("partner");
  const queryClient = useQueryClient();
  const { overage } = billing;
  const { currency } = overage;
  // A business whose overage was never set starts with empty rates rather than zeros.
  const set = overage.enabled || overage.voiceMinuteRateMinor > 0 || overage.chatRateMinor > 0 || overage.capMinor !== null;
  const [enabled, setEnabled] = useState(overage.enabled);
  const [minuteRate, setMinuteRate] = useState(() => set ? priceInputValue(overage.voiceMinuteRateMinor, currency, i18n.language) : "");
  const [chatRate, setChatRate] = useState(() => set ? priceInputValue(overage.chatRateMinor, currency, i18n.language) : "");
  const [cap, setCap] = useState(() => priceInputValue(overage.capMinor, currency, i18n.language));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const terms = enabled
        ? { voiceMinuteRateMinor: parsePriceInput(minuteRate, currency, i18n.language), chatRateMinor: parsePriceInput(chatRate, currency, i18n.language), capMinor: parsePriceInput(cap, currency, i18n.language) }
        : { voiceMinuteRateMinor: overage.voiceMinuteRateMinor, chatRateMinor: overage.chatRateMinor, capMinor: overage.capMinor };
      if (terms.voiceMinuteRateMinor === null || terms.voiceMinuteRateMinor === undefined || terms.chatRateMinor === null || terms.chatRateMinor === undefined) throw Object.assign(new Error("invalid rate"), { code: "invalid_overage_rate" });
      if (terms.capMinor === undefined) throw Object.assign(new Error("invalid cap"), { code: "invalid_overage_cap" });
      return await requestJson<{ billing: BusinessBilling }>("/api/partner/businesses/overage", { method: "PUT", body: JSON.stringify({ partnerId, businessId: business.businessId, enabled, ...terms }) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["partner-businesses", partnerId] });
      toast.success(t("businesses.overage.saved", { name: business.name }));
      onClose();
    },
    onError: (cause: Error & { code?: string }) => setError(t(OVERAGE_ERRORS[cause.code ?? ""] ?? "businesses.overage.errors.failed")),
  });

  const amount = (id: string, label: string, value: string, onChange: (next: string) => void, placeholder?: string) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput className="tabular-nums" disabled={save.isPending} id={id} inputMode="decimal" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
        <InputGroupAddon align="inline-end"><InputGroupText>{currency}</InputGroupText></InputGroupAddon>
      </InputGroup>
    </Field>
  );

  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      <DialogContent>
        <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); if (!save.isPending) { setError(null); save.mutate(); } }}>
          <DialogHeader>
            <DialogTitle>{t("businesses.overage.title", { name: business.name })}</DialogTitle>
            <DialogDescription>{t("businesses.overage.description", { packageName: billing.packageName })}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="partner-business-overage">{t("businesses.overage.toggle")}</FieldLabel>
                <FieldDescription>{t(enabled ? "businesses.overage.onHint" : "businesses.overage.offHint")}</FieldDescription>
              </FieldContent>
              <Switch checked={enabled} disabled={save.isPending} id="partner-business-overage" onCheckedChange={setEnabled} />
            </Field>
            {enabled ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {amount("partner-business-overage-minute", t("businesses.overage.minuteRateLabel"), minuteRate, setMinuteRate)}
                  {amount("partner-business-overage-chat", t("businesses.overage.chatRateLabel"), chatRate, setChatRate)}
                </div>
                <div className="flex flex-col gap-2">
                  {amount("partner-business-overage-cap", t("businesses.overage.capLabel"), cap, setCap, t("businesses.overage.capPlaceholder"))}
                  <FieldDescription>{t("businesses.overage.capHint")}</FieldDescription>
                </div>
              </>
            ) : null}
          </FieldGroup>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={save.isPending} loading={save.isPending} loadingLabel={t("businesses.overage.saving")} type="submit">{t("businesses.overage.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The console's Businesses page. Everyone on the team sees the partner's
 * businesses with their owners and their minutes and chats this month, and
 * opens any of them to work inside it on the partner's domain; the business's
 * audit log records each open. Owners and admins create one, pick the access
 * level its own operators get and the package it pays for, or bill it
 * outside LobbyStack, and invite its owner, who pays and signs in on the
 * partner's domain. They can start it from one of the partner's templates.
 * They also see and change each business's package and its overage, save a
 * business's setup as a template, release a business to an owner who
 * joined, or delete it.
 * Once the partner's paid tier ended, they also see when its businesses
 * pause and when the host deletes them. The server enforces the same rules.
 */
export function PartnerBusinessesSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const queryKey = ["partner-businesses", partner.partnerId];
  const businesses = useQuery({ queryKey, queryFn: () => requestJson<{ businesses: PartnerBusiness[] }>(`/api/partner/businesses?partnerId=${encodeURIComponent(partner.partnerId)}`) });
  const canCreate = partner.role === "owner" || partner.role === "admin";
  // Owners and admins pick each business's package. Without Stripe Connect, every business is billed outside LobbyStack.
  const packages = useQuery({ queryKey: ["partner-packages", partner.partnerId], queryFn: () => requestJson<Packages>(`/api/partner/packages?partnerId=${encodeURIComponent(partner.partnerId)}`), enabled: canCreate });
  const sellsPackages = canCreate && packages.data?.stripe.configured === true;
  const sellable = packages.data?.packages ?? [];

  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState(BILLED_OUTSIDE);
  const [changing, setChanging] = useState<PartnerBusiness | null>(null);
  const [newBilling, setNewBilling] = useState(BILLED_OUTSIDE);
  const [billingError, setBillingError] = useState<string | null>(null);
  // The business whose overage the dialog sets.
  const [overageFor, setOverageFor] = useState<{ business: PartnerBusiness; billing: PackageBilling } | null>(null);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [timezone, setTimezone] = useState(browserTimeZone);
  const [accessLevel, setAccessLevel] = useState<PartnerAccessLevel>("full");
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const templates = useQuery({ queryKey: partnerTemplatesQueryKey(partner.partnerId), queryFn: () => fetchPartnerTemplates(partner.partnerId), enabled: open });
  const templateOptions = [{ value: NO_TEMPLATE, label: t("businesses.create.noTemplate") }, ...(templates.data ?? []).map((template) => ({ value: template.templateId, label: template.name }))];
  const locale = intlLocale(i18n.language);
  const timeZoneGroups = useMemo(() => open ? groupTimeZones(availableTimeZones(timezone), locale) : [], [open, timezone, locale]);
  const timeZoneItems = useMemo(() => timeZoneGroups.map((group) => ({
    value: group.region ?? "",
    label: group.region === null ? "" : isTimeZoneRegion(group.region) ? t(`businesses.create.timezoneRegions.${group.region.toLowerCase()}`) : group.region,
    items: group.zones,
  })), [t, timeZoneGroups]);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const formatMinutes = (seconds: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round((seconds / 60) * 10) / 10);
  const formatCount = (count: number) => new Intl.NumberFormat(locale).format(count);
  const reset = () => { setName(""); setOwnerEmail(""); setTimezone(browserTimeZone()); setAccessLevel("full"); setBilling(BILLED_OUTSIDE); setTemplateId(NO_TEMPLATE); setError(null); };

  // A partner's business shows only on the partner's domains, so its dashboard opens there; from the host's domain the person signs in again.
  const openBusiness = useMutation({
    mutationFn: (business: PartnerBusiness) => requestJson<{ expiresAt: string; url: string }>("/api/partner/businesses/open", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, businessId: business.businessId }) }),
    onSuccess: (opened, business) => {
      telemetry.track("web.partner.business_opened", { partnerId: partner.partnerId, businessId: business.businessId, pathname: pathname ?? "/partner" });
      window.location.assign(opened.url);
    },
    onError: (_cause, business) => { toast.error(t("businesses.open.failed", { name: business.name })); },
  });

  // The business a confirmation dialog asks about, and what it would do.
  const [confirming, setConfirming] = useState<{ action: "release" | "delete"; business: PartnerBusiness } | null>(null);
  // The business the Save as template dialog saves, kept while the dialog closes.
  const [templateSource, setTemplateSource] = useState<{ open: boolean; business?: PartnerBusiness }>({ open: false });
  const release = useMutation({
    mutationFn: (business: PartnerBusiness) => requestJson("/api/partner/businesses/release", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, businessId: business.businessId }) }),
    onSuccess: async (_result, business) => {
      telemetry.track("web.partner.business_released", { partnerId: partner.partnerId, businessId: business.businessId, pathname: pathname ?? "/partner" });
      toast.success(t("businesses.release.released", { name: business.name, email: business.owner?.email ?? "" }));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (cause: Error & { code?: string }, business) => { toast.error(t(cause.code === "owner_required" ? "businesses.release.errors.ownerRequired" : cause.code === "subscription_active" ? "businesses.billing.errors.subscriptionActive" : "businesses.release.errors.failed", { name: business.name })); },
  });
  const remove = useMutation({
    mutationFn: (business: PartnerBusiness) => requestJson("/api/partner/businesses", { method: "DELETE", body: JSON.stringify({ partnerId: partner.partnerId, businessId: business.businessId }) }),
    onSuccess: async (_result, business) => {
      telemetry.track("web.partner.business_deleted", { partnerId: partner.partnerId, businessId: business.businessId, pathname: pathname ?? "/partner" });
      toast.success(t("businesses.delete.deleted", { name: business.name }));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (cause: Error & { code?: string }, business) => { toast.error(t(cause.code === "business_number_in_progress" ? "businesses.delete.errors.numberInProgress" : cause.code === "subscription_active" ? "businesses.billing.errors.subscriptionActive" : "businesses.delete.errors.failed", { name: business.name })); },
  });
  const busy = openBusiness.isPending || release.isPending || remove.isPending;

  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/partner/businesses", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, name: name.trim(), timezone, accessLevel, ownerEmail: ownerEmail.trim(), packageId: billing === BILLED_OUTSIDE ? null : billing, ...(templateId === NO_TEMPLATE ? {} : { templateId }) }) }),
    onSuccess: async (created) => {
      telemetry.track("web.partner.business_created", { partnerId: partner.partnerId, businessId: created.businessId, accessLevel, pathname: pathname ?? "/partner" });
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("businesses.create.created", { name: name.trim(), email: ownerEmail.trim() }));
      reset();
      setOpen(false);
    },
    onError: (cause: Error & { code?: string }) => {
      const messages: Record<string, string> = {
        invalid_name: "businesses.create.errors.invalidName",
        invalid_email: "businesses.create.errors.invalidEmail",
        invalid_timezone: "businesses.create.errors.invalidTimezone",
        partner_domain_required: "businesses.create.errors.domainRequired",
        owner_on_partner_team: "businesses.create.errors.ownerOnTeam",
        rate_limited: "businesses.create.errors.rateLimited",
        template_failed: "businesses.create.errors.templateFailed",
        template_not_found: "businesses.create.errors.templateNotFound",
        ...BILLING_ERRORS,
      };
      setError(t(messages[cause.code ?? ""] ?? "businesses.create.errors.failed"));
    },
  });

  const changeBilling = useMutation({
    mutationFn: (target: PartnerBusiness) => requestJson<{ billing: BusinessBilling }>("/api/partner/businesses/billing", { method: "PUT", body: JSON.stringify({ partnerId: partner.partnerId, businessId: target.businessId, packageId: newBilling === BILLED_OUTSIDE ? null : newBilling }) }),
    onSuccess: async (_result, target) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("businesses.billing.saved", { name: target.name }));
      setChanging(null);
    },
    onError: (cause: Error & { code?: string }) => setBillingError(t(BILLING_ERRORS[cause.code ?? ""] ?? "businesses.billing.errors.failed")),
  });
  const billingValue = (business: PartnerBusiness) => business.billing?.kind === "package" ? business.billing.packageId : BILLED_OUTSIDE;

  const createDialog = canCreate ? (
    <Dialog onOpenChange={(next) => { setOpen(next); if (!next) reset(); }} open={open}>
      <DialogTrigger render={<Button disabled={businesses.isLoading} size="sm" />}>{t("businesses.create.action")}</DialogTrigger>
      {/* With templates and packages the form runs taller than a laptop screen, so it scrolls inside the window. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!create.isPending && name.trim() && ownerEmail.trim()) { setError(null); create.mutate(); } }}>
          <DialogHeader>
            <DialogTitle>{t("businesses.create.title")}</DialogTitle>
            <DialogDescription>{t("businesses.create.description", { partnerName: partner.name })}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="partner-business-name">{t("businesses.create.nameLabel")}</FieldLabel>
              <Input autoComplete="off" id="partner-business-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t("businesses.create.namePlaceholder")} value={name} />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-business-owner">{t("businesses.create.ownerLabel")}</FieldLabel>
              <Input autoComplete="off" id="partner-business-owner" onChange={(event) => setOwnerEmail(event.target.value)} placeholder={t("businesses.create.ownerPlaceholder")} type="email" value={ownerEmail} />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-business-timezone">{t("businesses.create.timezoneLabel")}</FieldLabel>
              <Combobox
                isItemEqualToValue={(item: TimeZoneOption, value: TimeZoneOption) => item.id === value.id}
                items={timeZoneItems}
                itemToStringLabel={(zone: TimeZoneOption) => zone.label}
                onValueChange={(zone: TimeZoneOption | null) => { if (zone) setTimezone(zone.id); }}
                value={timeZoneGroups.flatMap((group) => group.zones).find((zone) => zone.id === timezone) ?? null}
              >
                <ComboboxTrigger aria-label={t("businesses.create.timezoneLabel")} className={COMBOBOX_TRIGGER_CLASS} id="partner-business-timezone">
                  <span className="min-w-0 flex-1 truncate text-left"><ComboboxValue /></span>
                </ComboboxTrigger>
                <ComboboxContent className="min-w-(--anchor-width)">
                  <ComboboxInput className="relative z-10" placeholder={t("businesses.create.timezoneSearch")} showTrigger={false} />
                  <ComboboxEmpty>{t("businesses.create.timezoneNoResults")}</ComboboxEmpty>
                  <ComboboxList>
                    {(group: { value: string; label: string; items: TimeZoneOption[] }) => (
                      <ComboboxGroup items={group.items} key={group.value}>
                        {group.label ? <ComboboxLabel>{group.label}</ComboboxLabel> : null}
                        <ComboboxCollection>{(zone: TimeZoneOption) => <ComboboxItem key={zone.id} value={zone}>{zone.label}</ComboboxItem>}</ComboboxCollection>
                      </ComboboxGroup>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
            <Field>
              <FieldLabel>{t("businesses.create.accessLabel")}</FieldLabel>
              <AccessLevelOptions onChange={setAccessLevel} value={accessLevel} />
            </Field>
            {sellsPackages ? (
              <Field>
                <FieldLabel htmlFor="partner-business-billing">{t("businesses.create.billingLabel")}</FieldLabel>
                <BillingSelect id="partner-business-billing" onChange={setBilling} packages={sellable} value={billing} />
                <FieldDescription>{t(billing === BILLED_OUTSIDE ? "businesses.create.billing.outside" : "businesses.create.billing.package")}</FieldDescription>
              </Field>
            ) : null}
            {templates.data?.length ? (
              <Field>
                <FieldLabel htmlFor="partner-business-template">{t("businesses.create.templateLabel")}</FieldLabel>
                <Select items={templateOptions} onValueChange={(value) => setTemplateId(typeof value === "string" ? value : NO_TEMPLATE)} value={templateId}>
                  <SelectTrigger aria-label={t("businesses.create.templateLabel")} className="w-full" id="partner-business-template"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{templateOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {templateId === NO_TEMPLATE ? null : <FieldDescription>{t("businesses.create.templateHelp")}</FieldDescription>}
              </Field>
            ) : null}
          </FieldGroup>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={create.isPending || !name.trim() || !ownerEmail.trim()} loading={create.isPending} loadingLabel={t("businesses.create.submitting")} type="submit">{t("businesses.create.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : undefined;

  const rows = businesses.data?.businesses ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={createDialog} title={t("businesses.title")} />
      <PartnerLifecycleNotice />
      {businesses.isLoading ? (
        <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Surface>
      ) : businesses.isError ? (
        <Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{t("businesses.loadFailed")}</p></Surface>
      ) : rows.length === 0 ? (
        <Surface className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-base font-medium">{t("businesses.empty.title")}</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t(canCreate ? "businesses.empty.description" : "businesses.empty.memberDescription")}</p>
        </Surface>
      ) : (
        <Surface className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("businesses.table.business")}</TableHead>
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("businesses.table.owner")}</TableHead>
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("businesses.table.access")}</TableHead>
                {canCreate ? <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("businesses.table.billing")}</TableHead> : null}
                <TableHead className="h-12 px-6 text-right text-sm font-medium text-foreground">{t("businesses.table.minutes")}</TableHead>
                <TableHead className="h-12 px-6 text-right text-sm font-medium text-foreground">{t("businesses.table.chats")}</TableHead>
                <TableHead className="h-12 px-6"><span className="sr-only">{t("businesses.table.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((business) => {
                const owner = business.owner;
                const expired = owner?.status === "invited" && new Date(owner.expiresAt) <= new Date();
                return (
                  <TableRow className="hover:bg-transparent" key={business.businessId}>
                    <TableCell className="px-6 py-5 whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col gap-1">
                        <p className="ph-mask text-sm font-medium">{business.name}</p>
                        <p className="text-sm text-muted-foreground">{t("businesses.createdOn", { date: formatDate(business.createdAt) })}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5 whitespace-normal [overflow-wrap:anywhere]">
                      {owner ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="ph-mask text-sm">{owner.email}</p>
                          {owner.status === "invited" ? <Badge className={expired ? undefined : "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200"} variant="outline">{t(expired ? "businesses.owner.expired" : "businesses.owner.invited")}</Badge> : null}
                        </div>
                      ) : <p className="text-sm text-muted-foreground">{t("businesses.owner.none")}</p>}
                    </TableCell>
                    <TableCell className="px-6 py-5"><Badge variant="secondary">{t(`businesses.access.${business.accessLevel}`)}</Badge></TableCell>
                    {canCreate ? (
                      // Words wrap whole here: breaking anywhere split "yourself" across lines on a narrow table.
                      <TableCell className="min-w-40 px-6 py-5 whitespace-normal break-words">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {business.billing?.kind === "package" ? <>
                              <p className="text-sm">{business.billing.packageName}</p>
                              <Badge className={STATUS_BADGE[business.billing.status]} variant={business.billing.status === "active" ? "secondary" : "outline"}>{t(`businesses.billing.status.${business.billing.status}`)}</Badge>
                            </> : <p className="text-sm text-muted-foreground">{t("businesses.billing.outside")}</p>}
                            {sellsPackages ? <Button aria-label={t("businesses.billing.changeFor", { name: business.name })} onClick={() => { setChanging(business); setNewBilling(billingValue(business)); setBillingError(null); }} size="sm" variant="ghost">{t("businesses.billing.change")}</Button> : null}
                          </div>
                          {business.billing?.kind === "package" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <OverageSummary overage={business.billing.overage} />
                              {sellsPackages ? <Button aria-label={t("businesses.overage.changeFor", { name: business.name })} onClick={() => { if (business.billing?.kind === "package") setOverageFor({ business, billing: business.billing }); }} size="sm" variant="ghost">{t("businesses.overage.change")}</Button> : null}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell className="px-6 py-5 text-right text-sm tabular-nums">{formatMinutes(business.usage.voiceSeconds)}</TableCell>
                    <TableCell className="px-6 py-5 text-right text-sm tabular-nums">{formatCount(business.usage.chats)}</TableCell>
                    <TableCell className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          aria-label={t("businesses.open.label", { name: business.name })}
                          disabled={busy}
                          loading={openBusiness.isPending && openBusiness.variables?.businessId === business.businessId}
                          loadingLabel={t("businesses.open.opening")}
                          onClick={() => openBusiness.mutate(business)}
                          size="sm"
                          variant="outline"
                        >
                          {t("businesses.open.action")}
                        </Button>
                        {canCreate ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button aria-label={t("businesses.actions.more", { name: business.name })} disabled={busy} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTemplateSource({ open: true, business })}><LayoutTemplate />{t("businesses.actions.saveTemplate")}</DropdownMenuItem>
                              {/* Releasing needs an owner who accepted the invitation; the server checks it too. */}
                              <DropdownMenuItem disabled={owner?.status !== "joined"} onClick={() => setConfirming({ action: "release", business })}><UserRoundCheck />{t("businesses.release.action")}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setConfirming({ action: "delete", business })} variant="destructive"><Trash2 />{t("businesses.delete.action")}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Surface>
      )}
      {canCreate && templateSource.business ? <SaveTemplateDialog business={templateSource.business} onOpenChange={(next) => setTemplateSource((current) => ({ ...current, open: next }))} open={templateSource.open} /> : null}
      {confirming ? (
        <ConfirmActionDialog
          cancelLabel={t("businesses.confirm.cancel")}
          confirmLabel={t(`businesses.${confirming.action}.confirm`)}
          confirmVariant={confirming.action === "delete" ? "destructive" : "default"}
          description={t(`businesses.${confirming.action}.description`, { name: confirming.business.name, email: confirming.business.owner?.email ?? "" })}
          onConfirm={async () => { await (confirming.action === "release" ? release : remove).mutateAsync(confirming.business); }}
          onOpenChange={(next) => { if (!next) setConfirming(null); }}
          open
          pending={release.isPending || remove.isPending}
          title={t(`businesses.${confirming.action}.title`, { name: confirming.business.name })}
        />
      ) : null}
      {overageFor ? <OverageDialog billing={overageFor.billing} business={overageFor.business} onClose={() => setOverageFor(null)} partnerId={partner.partnerId} /> : null}
      <Dialog onOpenChange={(next) => { if (!next) setChanging(null); }} open={changing !== null}>
        <DialogContent>
          <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (changing && !changeBilling.isPending) { setBillingError(null); changeBilling.mutate(changing); } }}>
            <DialogHeader>
              <DialogTitle>{t("businesses.billing.title", { name: changing?.name ?? "" })}</DialogTitle>
              <DialogDescription>{t("businesses.billing.description")}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="partner-business-change-billing">{t("businesses.create.billingLabel")}</FieldLabel>
              <BillingSelect current={changing?.billing ?? null} disabled={changeBilling.isPending} id="partner-business-change-billing" onChange={setNewBilling} packages={sellable} value={newBilling} />
              <FieldDescription>{t(newBilling === BILLED_OUTSIDE ? "businesses.billing.outsideHint" : "businesses.billing.packageHint")}</FieldDescription>
            </Field>
            {billingError ? <p className="text-sm text-destructive" role="alert">{billingError}</p> : null}
            <DialogFooter>
              <Button disabled={changeBilling.isPending || (changing !== null && newBilling === billingValue(changing))} loading={changeBilling.isPending} loadingLabel={t("businesses.billing.saving")} type="submit">{t("businesses.billing.submit")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
