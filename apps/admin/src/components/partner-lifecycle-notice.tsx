"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useConsolePartner } from "@/components/partner-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/**
 * Where the partner stands since its paid tier ended or a payment failed, as
 * GET /api/partner/lifecycle answers. A date is null while it isn't known:
 * a past due tier hasn't ended, so its deletion has no date yet.
 */
type PartnerLifecycle = {
  state: "active" | "past_due" | "ending" | "paused" | "deleted";
  tierEndedAt: string | null;
  pausesAt: string | null;
  deletesAt: string | null;
};

/**
 * Tells the partner's owners and admins that its paid tier ended or its
 * payment failed: until when its businesses answer, when they pause, and
 * when the host deletes them. Owners update their card or pay for a tier on
 * the Billing page, and admins ask one to; both can release businesses
 * meanwhile. A partner paused while its payment failed still holds its tier,
 * so it's told to update its card. Members see nothing, and an active
 * partner shows nothing.
 */
export function PartnerLifecycleNotice() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const keeps = partner.role === "owner" || partner.role === "admin";
  const lifecycle = useQuery({
    queryKey: ["partner-lifecycle", partner.partnerId],
    enabled: keeps,
    queryFn: () => requestJson<PartnerLifecycle>(`/api/partner/lifecycle?partnerId=${encodeURIComponent(partner.partnerId)}`),
  });
  const current = lifecycle.data;
  if (!keeps || !current || current.state === "active") return null;
  const format = new Intl.DateTimeFormat(intlLocale(i18n.language), { dateStyle: "medium" });
  const dates = Object.fromEntries((["tierEndedAt", "pausesAt", "deletesAt"] as const).flatMap((name) => {
    const value = current[name];
    return value ? [[name, format.format(new Date(value))]] : [];
  }));
  const copy = current.state === "paused" && !current.tierEndedAt ? "paused_past_due" : current.state;
  const answering = current.state === "past_due" || current.state === "ending";
  return (
    <Alert variant={answering ? "default" : "destructive"}>
      <AlertTitle>{t(`lifecycle.${copy}.title`, dates)}</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <span>{t(`lifecycle.${copy}.description`, dates)}</span>
        <span>{t(`lifecycle.${copy}.${partner.role === "owner" ? "owner" : "admin"}`, dates)}</span>
      </AlertDescription>
    </Alert>
  );
}
