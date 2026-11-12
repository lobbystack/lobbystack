"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/request-json";

type ExtraNumbersCheckout = { id: string; status: "pending" | "processing" | "ready" | "error"; checkoutUrl: string | null; error: string | null; subscribed: boolean };

/** The query string Polar's success page brings the payer back with. */
export const EXTRA_NUMBERS_CHECKOUT_PARAM = "extraNumbersCheckout";

function checkoutUrl(businessId: string, requestId: string): string {
  return `/api/billing/extra-numbers/checkout?businessId=${encodeURIComponent(businessId)}&requestId=${encodeURIComponent(requestId)}`;
}

/**
 * Starts the Polar checkout for the monthly extra numbers add-on and sends the
 * operator to it once Polar's page is ready. Polar brings them back to this
 * agent's phone page.
 */
export function ExtraNumbersCheckoutButton({ businessId, agentId, label, variant = "outline" }: { businessId: string; agentId?: string | undefined; label: string; variant?: "outline" | "default" }) {
  const { t } = useTranslation("settings");
  const [requestId, setRequestId] = useState<string | null>(null);
  const redirected = useRef<string | null>(null);
  const start = useMutation({
    mutationFn: () => requestJson<{ requestId: string }>("/api/billing/extra-numbers/checkout", { method: "POST", body: JSON.stringify({ businessId, ...(agentId ? { agentId } : {}) }) }),
    onSuccess: (result) => setRequestId(result.requestId),
    onError: () => toast.error(t("phoneNumber.extra.checkoutFailed")),
  });
  const checkout = useQuery({
    queryKey: ["extra-numbers-checkout", businessId, requestId],
    enabled: Boolean(requestId),
    queryFn: () => requestJson<ExtraNumbersCheckout>(checkoutUrl(businessId, requestId!)),
    refetchInterval: (query) => ["ready", "error"].includes(query.state.data?.status ?? "") ? false : 1500,
  });
  useEffect(() => {
    const data = checkout.data;
    if (!data || !requestId) return;
    if (data.status === "ready" && data.checkoutUrl && redirected.current !== requestId) {
      redirected.current = requestId;
      window.location.assign(data.checkoutUrl);
    } else if (data.status === "error") {
      toast.error(t("phoneNumber.extra.checkoutFailed"));
      setRequestId(null);
    }
  }, [checkout.data, requestId, t]);
  const pending = start.isPending || Boolean(requestId);
  return (
    <Button disabled={pending} onClick={() => start.mutate()} size="sm" type="button" variant={variant}>
      {label}
    </Button>
  );
}

/**
 * After Polar's checkout, waits for its webhook to start the add-on, then
 * reloads the numbers so the operator can buy one. Returns whether it's still
 * waiting.
 */
export function useExtraNumbersCheckoutReturn(businessId: string): boolean {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [requestId, setRequestId] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(EXTRA_NUMBERS_CHECKOUT_PARAM);
    if (value) setRequestId(value);
  }, []);
  const checkout = useQuery({
    queryKey: ["extra-numbers-checkout", businessId, requestId, "return"],
    enabled: Boolean(businessId && requestId),
    queryFn: () => requestJson<ExtraNumbersCheckout>(checkoutUrl(businessId, requestId!)),
    refetchInterval: (query) => query.state.data?.subscribed ? false : 2000,
  });
  const subscribed = checkout.data?.subscribed === true;
  useEffect(() => {
    if (!subscribed) return;
    toast.success(t("phoneNumber.extra.subscribed"));
    void queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] });
    const url = new URL(window.location.href);
    url.searchParams.delete(EXTRA_NUMBERS_CHECKOUT_PARAM);
    window.history.replaceState(null, "", url.toString());
    setRequestId(null);
  }, [businessId, queryClient, subscribed, t]);
  return Boolean(requestId) && !subscribed && !checkout.isError;
}
