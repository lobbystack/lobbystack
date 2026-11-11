"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, CircleDashed, Copy, ExternalLink } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CUSTOM_DOMAIN_MAX_LENGTH, normalizeCustomDomain, type CustomDomainDnsRecord, type CustomDomainStatus, type PartnerRole } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { useBranding } from "@/components/branding-provider";
import { useCopiedField } from "@/components/detail-fields";
import { useConsolePartner } from "@/components/partner-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { Status } from "@/components/ui/status";
import { CUSTOM_DOMAIN_STATUS_VARIANTS } from "@/lib/status-variants";

/** What GET, POST and DELETE /api/partner/domain answer. */
export type PartnerDomains = {
  role: PartnerRole;
  subdomain: string | null;
  subdomainUrl: string | null;
  customDomains: "available" | "paid_tier_required" | "unavailable";
  custom: {
    hostname: string;
    status: CustomDomainStatus;
    records: CustomDomainDnsRecord[];
    errors: string[];
    checkedAt: string | null;
    url: string | null;
    /** Another partner proved it controls the domain first. */
    taken?: boolean;
  } | null;
};

const ERROR_KEYS: Record<string, string> = {
  invalid_domain: "branding.domain.own.errors.invalid",
  domain_reserved: "branding.domain.own.errors.reserved",
  domain_taken: "branding.domain.own.errors.taken",
  custom_domain_exists: "branding.domain.own.errors.exists",
  paid_tier_required: "branding.domain.own.errors.paidTier",
  custom_domains_unavailable: "branding.domain.own.errors.unavailable",
  forbidden: "branding.domain.own.errors.forbidden",
};

// While a domain waits for its DNS records, the worker checks it every minute
// at first, so the page asks again often enough to show it go live.
const PENDING_REFRESH_MS = 15_000;

function RecordsTable({ records }: { records: CustomDomainDnsRecord[] }) {
  const { t } = useTranslation("partner");
  const { copiedField, copy } = useCopiedField();
  const copyButton = (text: string, field: string) => (
    <Button aria-label={t(copiedField === field ? "branding.domain.own.records.copied" : "branding.domain.own.records.copy")} onClick={() => copy(text, field)} size="icon-sm" type="button" variant="ghost">
      {copiedField === field ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("branding.domain.own.records.type")}</TableHead>
            <TableHead>{t("branding.domain.own.records.name")}</TableHead>
            <TableHead>{t("branding.domain.own.records.value")}</TableHead>
            <TableHead>{t("branding.domain.own.records.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => (
            <TableRow key={`${record.type}:${record.name}:${record.value}`}>
              <TableCell className="font-mono type-caption">{record.type}</TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                <div className="flex items-center gap-1"><span className="min-w-0 font-mono type-caption [overflow-wrap:anywhere]" dir="ltr">{record.name}</span>{copyButton(record.name, `name-${index}`)}</div>
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                <div className="flex items-center gap-1"><span className="min-w-0 font-mono type-caption [overflow-wrap:anywhere]" dir="ltr">{record.value}</span>{copyButton(record.value, `value-${index}`)}</div>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 type-caption whitespace-nowrap text-muted-foreground">
                  {record.verified ? <Check aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <CircleDashed aria-hidden="true" className="size-3.5" />}
                  {t(record.verified ? "branding.domain.own.records.verified" : "branding.domain.own.records.waiting")}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The Branding & domain page's addresses: the partner's subdomain of the
 * partner base domain, and the domain of its own it connects on a paid tier,
 * with the DNS records to add and whether each checks out yet. Owners and
 * admins connect and remove a domain; members see it. The server enforces the
 * same rules, and the partner's tier.
 */
export function PartnerDomainSettings() {
  const { t, i18n } = useTranslation("partner");
  const id = useId();
  const partner = useConsolePartner();
  const { appName } = useBranding();
  const queryClient = useQueryClient();
  const queryKey = ["partner-domains", partner.partnerId];
  const domains = useQuery({
    queryKey,
    queryFn: () => requestJson<PartnerDomains>(`/api/partner/domain?partnerId=${encodeURIComponent(partner.partnerId)}`),
    refetchInterval: (query) => query.state.data?.custom?.status === "pending" ? PENDING_REFRESH_MS : false,
  });
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const onError = (cause: Error & { code?: string }) => setError(t(ERROR_KEYS[cause.code ?? ""] ?? "branding.domain.own.errors.failed", { appName }));
  const connect = useMutation({
    mutationFn: (value: string) => requestJson<PartnerDomains>("/api/partner/domain", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, hostname: value }) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setHostname("");
      toast.success(t("branding.domain.own.added"));
    },
    onError,
    meta: { inlineError: true },
  });
  const remove = useMutation({
    mutationFn: () => requestJson<PartnerDomains>("/api/partner/domain", { method: "DELETE", body: JSON.stringify({ partnerId: partner.partnerId }) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      toast.success(t("branding.domain.own.removed"));
    },
    onError,
    meta: { inlineError: true },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connect.isPending) return;
    setError(null);
    // The server checks the same way.
    const value = normalizeCustomDomain(hostname);
    if (!value) {
      setError(t("branding.domain.own.errors.invalid"));
      return;
    }
    connect.mutate(value);
  }

  if (domains.isError) {
    return <Surface className="p-6"><p className="type-body-muted" role="alert">{t("branding.domain.own.errors.loadFailed")}</p></Surface>;
  }
  const data = domains.data;
  if (!data) {
    return <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /></Surface>;
  }

  const role = data.role ?? partner.role;
  const canEdit = role === "owner" || role === "admin";
  const custom = data.custom;
  const showsOwnDomain = Boolean(custom) || data.customDomains !== undefined;
  const field = `${id}-hostname`;

  return (
    <Surface className="p-6">
      {/* A fieldset is as wide as its content by default, which would push a long DNS value past the page. */}
      <FieldSet className="min-w-0">
        <FieldLegend>{t("branding.domain.title")}</FieldLegend>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            {data.subdomain && data.subdomainUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono type-body [overflow-wrap:anywhere]" dir="ltr">{data.subdomain}</span>
                <a className={buttonVariants({ size: "sm", variant: "outline" })} href={data.subdomainUrl} rel="noopener noreferrer" target="_blank">
                  <ExternalLink />
                  {t("branding.domain.open")}
                </a>
              </div>
            ) : (
              <p className="type-body-muted">{t("branding.domain.none")}</p>
            )}
          </div>

          {showsOwnDomain ? (
            <div className="flex flex-col gap-4 border-t border-border pt-6">
              <h3 className="type-title">{t("branding.domain.own.title")}</h3>

              {custom ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono type-body [overflow-wrap:anywhere]" dir="ltr">{custom.hostname}</span>
                    <Status variant={CUSTOM_DOMAIN_STATUS_VARIANTS[custom.status]}>{t(`branding.domain.own.status.${custom.status}`)}</Status>
                    {custom.url ? (
                      <a className={buttonVariants({ size: "sm", variant: "outline" })} href={custom.url} rel="noopener noreferrer" target="_blank">
                        <ExternalLink />
                        {t("branding.domain.open")}
                      </a>
                    ) : null}
                  </div>
                  {custom.status === "failed" ? <p className="type-body-muted">{t(custom.taken ? "branding.domain.own.takenHelp" : "branding.domain.own.failedHelp")}</p> : null}
                  {custom.status === "pending" ? (
                    <p className="type-body-muted">{t(custom.records.length > 0 ? "branding.domain.own.pendingHelp" : "branding.domain.own.settingUp")}</p>
                  ) : null}
                  {custom.records.length > 0 && custom.status !== "active" && !custom.taken ? <RecordsTable records={custom.records} /> : null}
                  {custom.errors.length > 0 && custom.status !== "active" ? (
                    <div className="flex flex-col gap-1">
                      <span className="type-meta">{t("branding.domain.own.providerSays")}</span>
                      <ul className="flex list-disc flex-col gap-1 ps-5 type-body-muted">
                        {custom.errors.map((message) => <li key={message}>{message}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {custom.checkedAt && custom.status !== "active" ? <p className="type-caption text-muted-foreground">{t("branding.domain.own.checkedAt", { time: formatDateTime(custom.checkedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" }) })}</p> : null}
                  {canEdit ? (
                    <div>
                      <Button disabled={remove.isPending} onClick={() => setConfirmingRemove(true)} size="sm" type="button" variant="outline">{t("branding.domain.own.remove")}</Button>
                    </div>
                  ) : null}
                </div>
              ) : data.customDomains === "unavailable" ? (
                <p className="type-body-muted">{t(data.subdomain ? "branding.domain.own.unavailable" : "branding.domain.own.unavailableNoSubdomain")}</p>
              ) : data.customDomains === "paid_tier_required" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="type-body-muted">{t(role === "owner" ? "branding.domain.own.paidTier" : "branding.domain.own.paidTierAskOwner")}</p>
                  {role === "owner" ? <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/partner/${partner.partnerId}/billing`}>{t("branding.domain.own.chooseTier")}</Link> : null}
                </div>
              ) : canEdit ? (
                <form className="flex flex-col gap-2" noValidate onSubmit={submit}>
                  <Field>
                    <FieldLabel htmlFor={field}>{t("branding.domain.own.label")}</FieldLabel>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input autoCapitalize="none" autoComplete="off" className="font-mono" dir="ltr" disabled={connect.isPending} id={field} maxLength={CUSTOM_DOMAIN_MAX_LENGTH} onChange={(event) => setHostname(event.target.value)} placeholder={t("branding.domain.own.placeholder")} spellCheck={false} value={hostname} />
                      <Button className="shrink-0" disabled={connect.isPending || !hostname.trim()} loading={connect.isPending} loadingLabel={t("branding.domain.own.connecting")} type="submit">{t("branding.domain.own.connect")}</Button>
                    </div>
                  </Field>
                </form>
              ) : (
                <p className="type-body-muted">{t("branding.domain.own.membersCantEdit")}</p>
              )}
              {error ? <FieldError>{error}</FieldError> : null}
            </div>
          ) : null}
        </div>
      </FieldSet>
      {custom ? (
        <ConfirmActionDialog
          cancelLabel={t("branding.domain.own.cancel")}
          confirmLabel={t("branding.domain.own.remove")}
          confirmVariant="destructive"
          description={t("branding.domain.own.removeDescription")}
          onConfirm={async () => { setError(null); await remove.mutateAsync(); }}
          onOpenChange={setConfirmingRemove}
          open={confirmingRemove}
          pending={remove.isPending}
          title={t("branding.domain.own.removeTitle", { hostname: custom.hostname })}
        />
      ) : null}
    </Surface>
  );
}
