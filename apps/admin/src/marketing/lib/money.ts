import { intlLocale } from "@lobbystack/shared"

import type { Locale } from "@/marketing/i18n"

/** US dollars rounded to the whole dollar, as plan cards show prices. */
export const wholeUsd = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
