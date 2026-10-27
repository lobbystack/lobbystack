"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { STRIPE_ACCOUNT_COUNTRIES, intlLocale, isStripeAccountCountry, type PartnerStripeStatus } from "@lobbystack/shared";
import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { requestJson } from "@/lib/request-json";

/** What GET /api/partner/stripe answers. */
type Connection = {
  configured: boolean;
  status: PartnerStripeStatus;
  accountId: string | null;
  country: string | null;
  currency: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disconnectedAt: string | null;
};

const STATUS_KEYS: Record<PartnerStripeStatus, string> = {
  not_connected: "stripe.status.notConnected",
  onboarding: "stripe.status.onboarding",
  restricted: "stripe.status.restricted",
  active: "stripe.status.active",
  disconnected: "stripe.status.disconnected",
};

const ERROR_KEYS: Record<string, string> = {
  invalid_country: "stripe.errors.invalidCountry",
  stripe_not_configured: "stripe.errors.notConfigured",
  stripe_connection_changed: "stripe.errors.changed",
  owner_only: "stripe.ownersOnly",
};

/** The country in the browser's language tag, such as CA for en-CA, when Stripe opens accounts there. */
function browserCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return isStripeAccountCountry(region) ? region : "";
  } catch {
    return "";
  }
}

/**
 * The console's Stripe page, for owners. It connects the partner's own Stripe
 * account through Stripe's hosted onboarding and shows where the account
 * stands. Coming back from Stripe, it asks Stripe for the account at once;
 * Stripe sends an owner whose link expired back here, and the page opens a
 * new link.
 */
export function PartnerStripeSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = useSearchParams().get("onboarding");
  const locale = intlLocale(i18n.language);
  const isOwner = partner.role === "owner";
  // Coming back from Stripe is when the account most likely changed.
  const refresh = onboarding === "return";
  const connection = useQuery({
    queryKey: ["partner-stripe", partner.partnerId, refresh],
    queryFn: () => requestJson<Connection>(`/api/partner/stripe?partnerId=${encodeURIComponent(partner.partnerId)}${refresh ? "&refresh=1" : ""}`),
    enabled: isOwner,
  });
  const [country, setCountry] = useState(browserCountry);
  const [error, setError] = useState<string | null>(null);
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return STRIPE_ACCOUNT_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const status = connection.data?.status;
  const needsCountry = status === "not_connected" || status === "disconnected";
  const start = useMutation({
    mutationFn: () => requestJson<{ url: string }>("/api/partner/stripe/onboarding", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, ...(needsCountry ? { country } : {}) }) }),
    onSuccess: ({ url }) => {
      telemetry.track("web.partner.stripe_onboarding_started", { partnerId: partner.partnerId, resumed: !needsCountry, pathname: pathname ?? "/partner" });
      window.location.assign(url);
    },
    onError: (cause: Error & { code?: string }) => setError(t(ERROR_KEYS[cause.code ?? ""] ?? "stripe.errors.failed")),
  });

  // Stripe sends the owner here when an onboarding link expired or was used; a new one picks up where they left off.
  const refreshed = useRef(false);
  useEffect(() => {
    if (onboarding !== "refresh" || refreshed.current || !status || needsCountry || !connection.data?.configured) return;
    refreshed.current = true;
    start.mutate();
  }, [connection.data?.configured, needsCountry, onboarding, start, status]);
  useEffect(() => {
    if (refresh && connection.isSuccess) router.replace(pathname ?? `/partner/${partner.partnerId}/payments`);
  }, [connection.isSuccess, partner.partnerId, pathname, refresh, router]);

  const header = (
    <PageHeader title={t("stripe.title")} />
  );
  const message = (text: string) => <Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{text}</p></Surface>;
  if (!isOwner) return <div className="flex flex-col gap-6">{header}{message(t("stripe.ownersOnly"))}</div>;
  const data = connection.data;
  if (connection.isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {connection.isError ? message(t(ERROR_KEYS[(connection.error as Error & { code?: string }).code ?? ""] ?? "stripe.loadFailed")) : <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /></Surface>}
      </div>
    );
  }
  if (!data.configured) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Surface className="flex flex-col gap-2 p-6">
          <h2 className="text-base font-medium">{t("stripe.notConfigured.title")}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t("stripe.notConfigured.description")}</p>
        </Surface>
      </div>
    );
  }

  const copy = {
    not_connected: { title: "stripe.connect.title", description: "stripe.connect.description", action: "stripe.connect.action" },
    onboarding: { title: "stripe.onboarding.title", description: "stripe.onboarding.description", action: "stripe.onboarding.action" },
    restricted: { title: "stripe.restricted.title", description: "stripe.restricted.description", action: "stripe.restricted.action" },
    active: { title: "stripe.active.title", description: "stripe.active.description", action: null },
    disconnected: { title: "stripe.disconnected.title", description: "stripe.disconnected.description", action: "stripe.disconnected.action" },
  }[data.status];
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const regionName = (code: string) => countries.find((option) => option.code === code)?.name ?? code;
  const working = start.isPending || (onboarding === "refresh" && !needsCountry && !error);

  return (
    <div className="flex flex-col gap-6">
      {header}
      <Surface className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><CreditCard className="size-5" /></span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-medium">{t(copy.title)}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{t(copy.description, { currency: data.currency ?? "", date: data.disconnectedAt ? formatDate(data.disconnectedAt) : "" })}</p>
            </div>
          </div>
          <Badge className="shrink-0" variant={data.status === "active" ? "secondary" : "outline"}>{t(STATUS_KEYS[data.status])}</Badge>
        </div>
        {data.accountId && data.status !== "disconnected" ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{t("stripe.details.account")}</dt><dd className="font-mono [overflow-wrap:anywhere]" dir="ltr">{data.accountId}</dd></div>
            {data.country ? <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{t("stripe.details.country")}</dt><dd>{regionName(data.country)}</dd></div> : null}
            {data.currency ? <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{t("stripe.details.currency")}</dt><dd>{data.currency}</dd></div> : null}
            <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{t("stripe.details.payouts")}</dt><dd>{t(data.payoutsEnabled ? "stripe.details.payoutsOn" : "stripe.details.payoutsOff")}</dd></div>
          </dl>
        ) : null}
        {needsCountry ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="partner-stripe-country">{t("stripe.connect.countryLabel")}</FieldLabel>
              <NativeSelect className="w-full sm:w-80" id="partner-stripe-country" onChange={(event) => { setCountry(event.target.value); setError(null); }} value={country}>
                <NativeSelectOption disabled value="">{t("stripe.connect.countryPlaceholder")}</NativeSelectOption>
                {countries.map((option) => <NativeSelectOption key={option.code} value={option.code}>{option.name}</NativeSelectOption>)}
              </NativeSelect>
              <FieldDescription>{t("stripe.connect.countryHelp")}</FieldDescription>
            </Field>
          </FieldGroup>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          {copy.action ? (
            <Button disabled={working || (needsCountry && !country)} loading={working} loadingLabel={t("stripe.opening")} onClick={() => { setError(null); start.mutate(); }} type="button">{t(copy.action)}</Button>
          ) : null}
          {data.status === "active" || data.status === "restricted" ? (
            <a className={buttonVariants({ variant: "outline" })} href="https://dashboard.stripe.com/" rel="noopener noreferrer" target="_blank">
              <ExternalLink />
              {t("stripe.active.dashboard")}
            </a>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
