"use client";

import { useMemo, useState } from "react";
import { Building2, MoreHorizontal, Trash2, UserRoundCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PartnerAccessLevel } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { availableTimeZones, groupTimeZones, isTimeZoneRegion, type TimeZoneOption } from "@/lib/time-zones";
import { cn } from "@/lib/utils";

type PartnerBusiness = {
  businessId: string;
  name: string;
  accessLevel: PartnerAccessLevel;
  onboardingStage: string;
  createdAt: string;
  owner: { email: string; status: "joined" } | { email: string; status: "invited"; expiresAt: string } | null;
  /** What it used this month: voice seconds and chats. */
  usage: { periodKey: string; voiceSeconds: number; chats: number };
};

const ACCESS_LEVELS: PartnerAccessLevel[] = ["full", "activity"];

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

function AccessLevelOptions({ value, onChange }: { value: PartnerAccessLevel; onChange: (level: PartnerAccessLevel) => void }) {
  const { t } = useTranslation("partner");
  return (
    <div className="flex flex-col gap-3" role="radiogroup">
      {ACCESS_LEVELS.map((level) => {
        const selected = value === level;
        return (
          <button aria-checked={selected} className="flex w-full items-start gap-3 py-1 text-left" key={level} onClick={() => onChange(level)} role="radio" type="button">
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-foreground" : "border-muted-foreground")}>{selected ? <span className="size-2 rounded-full bg-foreground" /> : null}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">{t(`businesses.access.${level}`)}</span>
              <span className="text-sm leading-6 text-muted-foreground">{t(`businesses.create.access.${level}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The console's Businesses page. Everyone on the team sees the partner's
 * businesses with their owners and their minutes and chats this month, and
 * opens any of them to work inside it on the partner's domain; the business's
 * audit log records each open. Owners and admins create one, pick the access
 * level its own operators get, and invite its owner, who signs in on the
 * partner's domain. They also release a business to an owner who joined, or
 * delete it. The server enforces the same rules.
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

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [timezone, setTimezone] = useState(browserTimeZone);
  const [accessLevel, setAccessLevel] = useState<PartnerAccessLevel>("full");
  const [error, setError] = useState<string | null>(null);
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
  const reset = () => { setName(""); setOwnerEmail(""); setTimezone(browserTimeZone()); setAccessLevel("full"); setError(null); };

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
  const release = useMutation({
    mutationFn: (business: PartnerBusiness) => requestJson("/api/partner/businesses/release", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, businessId: business.businessId }) }),
    onSuccess: async (_result, business) => {
      telemetry.track("web.partner.business_released", { partnerId: partner.partnerId, businessId: business.businessId, pathname: pathname ?? "/partner" });
      toast.success(t("businesses.release.released", { name: business.name, email: business.owner?.email ?? "" }));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (cause: Error & { code?: string }, business) => { toast.error(t(cause.code === "owner_required" ? "businesses.release.errors.ownerRequired" : "businesses.release.errors.failed", { name: business.name })); },
  });
  const remove = useMutation({
    mutationFn: (business: PartnerBusiness) => requestJson("/api/partner/businesses", { method: "DELETE", body: JSON.stringify({ partnerId: partner.partnerId, businessId: business.businessId }) }),
    onSuccess: async (_result, business) => {
      telemetry.track("web.partner.business_deleted", { partnerId: partner.partnerId, businessId: business.businessId, pathname: pathname ?? "/partner" });
      toast.success(t("businesses.delete.deleted", { name: business.name }));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (cause: Error & { code?: string }, business) => { toast.error(t(cause.code === "business_number_in_progress" ? "businesses.delete.errors.numberInProgress" : "businesses.delete.errors.failed", { name: business.name })); },
  });
  const busy = openBusiness.isPending || release.isPending || remove.isPending;

  const create = useMutation({
    mutationFn: () => requestJson<{ businessId: string }>("/api/partner/businesses", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, name: name.trim(), timezone, accessLevel, ownerEmail: ownerEmail.trim() }) }),
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
      };
      setError(t(messages[cause.code ?? ""] ?? "businesses.create.errors.failed"));
    },
  });

  const createDialog = canCreate ? (
    <Dialog onOpenChange={(next) => { setOpen(next); if (!next) reset(); }} open={open}>
      <DialogTrigger render={<Button disabled={businesses.isLoading} size="sm" />}>{t("businesses.create.action")}</DialogTrigger>
      <DialogContent>
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
      <div className="flex flex-col gap-1">
        <PageHeader actions={createDialog} title={t("businesses.title")} />
        <p className="text-sm text-muted-foreground">{t("businesses.description")}</p>
      </div>
      {businesses.isLoading ? (
        <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Surface>
      ) : businesses.isError ? (
        <Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{t("businesses.loadFailed")}</p></Surface>
      ) : rows.length === 0 ? (
        <Surface className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Building2 className="size-5" />
          </span>
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
                        <p className="text-sm font-medium">{business.name}</p>
                        <p className="text-sm text-muted-foreground">{t("businesses.createdOn", { date: formatDate(business.createdAt) })}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5 whitespace-normal [overflow-wrap:anywhere]">
                      {owner ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm">{owner.email}</p>
                          {owner.status === "invited" ? <Badge className={expired ? undefined : "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200"} variant="outline">{t(expired ? "businesses.owner.expired" : "businesses.owner.invited")}</Badge> : null}
                        </div>
                      ) : <p className="text-sm text-muted-foreground">{t("businesses.owner.none")}</p>}
                    </TableCell>
                    <TableCell className="px-6 py-5"><Badge variant="secondary">{t(`businesses.access.${business.accessLevel}`)}</Badge></TableCell>
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
    </div>
  );
}
