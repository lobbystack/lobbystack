import type { Metadata } from "next";

import { brandingSnapshot, requireRequestBrand } from "@/lib/branding";
import { brandIconSrc, type BrandingSnapshot } from "@/lib/branding-snapshot";

/** The title, description and tab icon every page takes from its brand: the host's name and logo, or a partner's name and favicon. */
export function brandingMetadata(branding: Pick<BrandingSnapshot, "appName" | "logoUrl" | "partner">): Metadata {
  const icon = brandIconSrc(branding);
  return {
    title: branding.appName,
    description: "AI receptionist dashboard",
    ...(icon ? { icons: { icon } } : {}),
  };
}

/** Metadata for a layout rendered per request, from the brand of the request's hostname. */
export async function generateBrandingMetadata(): Promise<Metadata> {
  return brandingMetadata(brandingSnapshot(await requireRequestBrand()));
}
