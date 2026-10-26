"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { formatMoney } from "@/components/billing-spending-cap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { formatCapInput, parseCapInputToCents } from "@/lib/billing-cap";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

export type PoolUsage = { periodKey: string; voiceSecondsUsed: number; chatsUsed: number; overageSpendCents: number };
export type PoolOverage = { enabled: boolean; capCents: number | null; billed: boolean };

/** When a usage period starts over: the first of the next month, in UTC, as periods run. */
function periodResetsAt(periodKey: string): Date {
  const [year, month] = periodKey.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 1));
}

/** Use against what the pool includes. A pool the host set may leave a kind with no limit, which shows the use alone. */
function Meter({ label, used, included }: { label: string; used: number; included: number | null }) {
  const { t, i18n } = useTranslation("partner");
  const count = (value: number) => new Intl.NumberFormat(intlLocale(i18n.language)).format(value);
  return (
    <div className="flex flex-col gap-2 border-b border-border px-6 py-5 last:border-b-0">
      <div className="flex items-center justify-between gap-4 text-[15px] leading-6">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{included === null ? t("billing.pool.noLimit", { used: count(used) }) : `${count(used)} / ${count(included)}`}</span>
      </div>
      {included === null ? null : (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-foreground transition-all duration-700" style={{ width: `${included > 0 ? Math.min(100, (used / included) * 100) : 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** What the partner's businesses used of the pool this month, against what the pool includes. */
export function PoolUsageSection({ usage, pool }: { usage: PoolUsage; pool: { voiceSeconds: number | null; chats: number | null } }) {
  const { t, i18n } = useTranslation("partner");
  const resetsAt = new Intl.DateTimeFormat(intlLocale(i18n.language), { month: "long", day: "numeric", timeZone: "UTC" }).format(periodResetsAt(usage.periodKey));
  return (
    <section aria-labelledby="partner-billing-pool" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground" id="partner-billing-pool">{t("billing.pool.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("billing.pool.description", { resetsAt })}</p>
      </div>
      <Surface className="p-0">
        <Meter included={pool.voiceSeconds === null ? null : Math.floor(pool.voiceSeconds / 60)} label={t("billing.pool.minutes")} used={Math.ceil(usage.voiceSecondsUsed / 60)} />
        <Meter included={pool.chats} label={t("billing.pool.chats")} used={usage.chatsUsed} />
      </Surface>
    </section>
  );
}

/**
 * Pool overage: whether the partner's businesses keep answering past the
 * pool at the tier's overage rates, and the monthly cap on what that costs.
 * Free has no overage, so it shows why instead. The server checks the owner
 * and the values again.
 */
export function PoolOverageSection({ partnerId, overage, spendCents }: { partnerId: string; overage: PoolOverage; spendCents: number }) {
  const { t, i18n } = useTranslation("partner");
  const queryClient = useQueryClient();
  const [capInput, setCapInput] = useState(() => formatCapInput(overage.capCents, i18n.language));
  useEffect(() => { setCapInput(formatCapInput(overage.capCents, i18n.language)); }, [i18n.language, overage.capCents]);

  const save = useMutation({
    mutationFn: (next: { enabled: boolean; capCents: number | null }) => requestJson<PoolOverage>(`/api/partner/billing/overage?partnerId=${encodeURIComponent(partnerId)}`, { method: "POST", body: JSON.stringify({ partnerId, ...next }) }),
    onSuccess: async (_result, next) => {
      toast.success(t(next.enabled !== overage.enabled ? (next.enabled ? "billing.overage.turnedOn" : "billing.overage.turnedOff") : next.capCents === null ? "billing.overage.capRemoved" : "billing.overage.capSaved"));
      await queryClient.invalidateQueries({ queryKey: ["partner-billing", partnerId] });
    },
    onError: () => toast.error(t("billing.overage.saveFailed")),
  });

  function saveCap() {
    const capCents = parseCapInputToCents(capInput, i18n.language);
    if (capCents === null) {
      toast.error(t("billing.overage.invalidAmount"));
      return;
    }
    save.mutate({ enabled: overage.enabled, capCents });
  }

  // Free bills no overage, so it skips what overage does and says why instead.
  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-muted-foreground" id="partner-billing-overage">{t("billing.overage.title")}</h2>
      {overage.billed ? <p className="text-sm text-muted-foreground">{t("billing.overage.description")}</p> : null}
    </div>
  );
  if (!overage.billed) {
    return (
      <section aria-labelledby="partner-billing-overage" className="flex flex-col gap-3">
        {header}
        <Surface className="px-6 py-5"><p className="text-sm text-muted-foreground">{t("billing.overage.free")}</p></Surface>
      </section>
    );
  }

  const capReached = overage.enabled && overage.capCents !== null && spendCents >= overage.capCents;
  const busy = save.isPending;
  return (
    <section aria-labelledby="partner-billing-overage" className="flex flex-col gap-3">
      {header}
      <Surface className="flex flex-col gap-6 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-[15px] font-medium" htmlFor="partner-pool-overage">{t("billing.overage.toggle")}</Label>
          <Switch checked={overage.enabled} disabled={busy} id="partner-pool-overage" onCheckedChange={(enabled) => save.mutate({ enabled, capCents: overage.capCents })} />
        </div>
        {overage.enabled ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                <span className="font-medium">{overage.capCents === null ? t("billing.overage.noCap") : t("billing.overage.spend")}</span>
                <span className="tabular-nums text-muted-foreground">
                  {overage.capCents === null
                    ? t("billing.overage.spendNoCap", { spend: formatMoney(spendCents, "usd", i18n.language) })
                    : t("billing.overage.spendOfCap", { spend: formatMoney(spendCents, "usd", i18n.language), cap: formatMoney(overage.capCents, "usd", i18n.language) })}
                </span>
              </div>
              {overage.capCents !== null ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className={capReached ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-foreground"} style={{ width: `${overage.capCents === 0 ? 100 : Math.min(100, (spendCents / overage.capCents) * 100)}%` }} />
                </div>
              ) : null}
              {capReached ? <span className="text-sm leading-6 text-destructive">{t("billing.overage.capReached")}</span> : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Label htmlFor="partner-pool-overage-cap">{t("billing.overage.capLabel")}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input className="pl-7" disabled={busy} id="partner-pool-overage-cap" inputMode="decimal" onChange={(event) => setCapInput(event.target.value)} placeholder={t("billing.overage.capPlaceholder")} value={capInput} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || capInput.trim().length === 0} onClick={saveCap} size="sm">{t(overage.capCents === null ? "billing.overage.saveCap" : "billing.overage.updateCap")}</Button>
                {overage.capCents !== null ? (
                  <Button disabled={busy} onClick={() => save.mutate({ enabled: true, capCents: null })} size="sm" variant="outline">{t("billing.overage.removeCap")}</Button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("billing.overage.off")}</p>
        )}
      </Surface>
    </section>
  );
}
