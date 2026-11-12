"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extraNumberPrices, planSellsExtraNumbers, type BillingPlanSlug } from "@lobbystack/shared";

import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { useExtraNumbersCheckoutReturn, useStartExtraNumbersCheckout } from "./extra-numbers-checkout";
import { HiddenTextSkeleton, SectionSkeleton, SmallButtonSkeleton } from "./loading-skeletons";
import { SectionBlock } from "./section-block";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";

type NumbersResponse = {
  phoneNumbers: Array<{ id: string; monthlyPriceCents: number | null }>;
  extraNumbers?: { available: boolean; priced: boolean; subscribed?: boolean; checkoutAvailable?: boolean; refusal: string | null };
};

/** The cheapest extra number in the catalog, which the add-on's card starts its price from. */
const lowestExtraNumberCents = Math.min(...Object.values(extraNumberPrices).flatMap((prices) => Object.values(prices as Record<string, number>)));

type Translate = ReturnType<typeof useTranslation<"settings">>["t"];

function addOnPrice(t: Translate, language: string): string {
  const price = new Intl.NumberFormat(intlLocale(language), { style: "currency", currency: "USD" }).format(lowestExtraNumberCents / 100);
  return t("billing.addOns.extraNumbers.price", { price });
}

/**
 * The billing page's add-ons: today, extra phone numbers, which bill monthly
 * through their own Polar subscription. Shown on plans that sell them, while
 * this deployment sells the add-on or the business already has it.
 */
export function BillingAddOns({ businessId, plan, canManage }: { businessId: string; plan: BillingPlanSlug; canManage: boolean }) {
  const { i18n, t } = useTranslation("settings");
  const sells = planSellsExtraNumbers(plan);
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], enabled: sells, queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const checkout = useStartExtraNumbersCheckout(businessId);
  const confirming = useExtraNumbersCheckoutReturn(businessId);
  if (!sells) return null;
  if (numbers.isLoading) return <BillingAddOnsSkeleton />;
  const extra = numbers.data?.extraNumbers;
  const active = extra?.subscribed === true;
  if (!active && !extra?.checkoutAvailable) return null;
  const count = numbers.data?.phoneNumbers.filter((number) => number.monthlyPriceCents !== null).length ?? 0;
  return (
    <SectionBlock title={t("billing.addOns.title")}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="type-card-title">{t("billing.addOns.extraNumbers.title")}</CardTitle>
            <CardDescription>{t("billing.addOns.extraNumbers.description")}</CardDescription>
            {active ? <CardAction><Badge variant="secondary">{t("billing.addOns.active")}</Badge></CardAction> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="type-title text-foreground">{addOnPrice(t, i18n.language)}</p>
            {active ? <p className="type-body-muted">{t("billing.addOns.extraNumbers.count", { count })}</p> : null}
          </CardContent>
          {!active && canManage ? (
            <CardFooter>
              <Button disabled={checkout.pending || confirming || !extra?.available} onClick={checkout.start} size="sm" type="button" variant="outline">
                {t("billing.addOns.get")}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </SectionBlock>
  );
}

/** Stands in for the add-ons while the business's numbers load. */
export function BillingAddOnsSkeleton() {
  const { i18n, t } = useTranslation("settings");
  return (
    <SectionSkeleton title={t("billing.addOns.title")}>
      <div aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <HiddenTextSkeleton className="type-card-title">{t("billing.addOns.extraNumbers.title")}</HiddenTextSkeleton>
            <HiddenTextSkeleton className="type-body">{t("billing.addOns.extraNumbers.description")}</HiddenTextSkeleton>
          </CardHeader>
          <CardContent>
            <HiddenTextSkeleton className="type-title">{addOnPrice(t, i18n.language)}</HiddenTextSkeleton>
          </CardContent>
          <CardFooter>
            <SmallButtonSkeleton label={t("billing.addOns.get")} />
          </CardFooter>
        </Card>
      </div>
    </SectionSkeleton>
  );
}
