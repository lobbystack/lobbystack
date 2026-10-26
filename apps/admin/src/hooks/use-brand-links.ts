"use client";

import { brandLinks, contactEmailFor } from "@lobbystack/shared";

import { useBranding } from "@/components/branding-provider";
import type { SupportedLocale } from "@/lib/locale";
import { privacyHref, termsHref } from "@/lib/marketing-site-url";

export type BrandPageLinks = { terms: string | null; privacy: string | null; support: string | null };

/**
 * The terms, privacy and support links a page shows: the partner's own on a
 * partner's pages, with any it left out set to null so the page leaves them
 * out too, and the host's from the build everywhere else.
 */
export function useBrandLinks(locale: SupportedLocale): BrandPageLinks {
  const { partner } = useBranding();
  if (partner) return partner.links;
  return { terms: termsHref(locale), privacy: privacyHref(locale), support: `mailto:${contactEmailFor(brandLinks(), "support")}` };
}
