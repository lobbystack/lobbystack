"use client";

import { DEFAULT_APP_NAME } from "@lobbystack/shared";

import { useBranding } from "@/components/branding-provider";
import { brandLogoSrc } from "@/lib/branding-snapshot";
import { cn } from "@/lib/utils";
import { versionedAssetUrl } from "@/lib/versioned-assets";

/** A logo beside a name, centered. Without a logo of its own, LobbyStack shows its mark and any other name stands alone. */
export function BrandLockup({ appName, logoUrl, className }: { appName: string; logoUrl: string | null; className?: string | undefined }) {
  const logo = brandLogoSrc({ appName, logoUrl });
  return (
    <div aria-label={appName} className={cn("flex w-full items-center justify-center gap-2.5", className)}>
      {logo ? <img alt="" aria-hidden="true" className={cn("h-6 w-auto max-w-24 select-none object-contain", logoUrl ? null : "dark:invert")} draggable={false} src={logo} /> : null}
      <span className="font-heading text-xl font-semibold leading-none text-foreground">{appName}</span>
    </div>
  );
}

/** The deployment's logo and name, as sign-in and onboarding pages show them above their title. */
export function BrandMark({ className }: { className?: string }) {
  const { appName, logoUrl, ready } = useBranding();
  // Hold the space until a prerendered page knows the name, so it never flashes another one.
  if (!ready) return <div aria-hidden="true" className={cn("h-6 w-full", className)} />;
  return <BrandLockup appName={appName} className={className} logoUrl={logoUrl} />;
}

/** The marketing header's logo: LobbyStack's wordmark, or the deployment's logo and name. */
export function BrandWordmark() {
  const { appName, logoUrl, ready } = useBranding();
  if (!ready) return <span aria-hidden="true" className="block h-7 w-[155px]" />;
  if (!logoUrl && appName === DEFAULT_APP_NAME) {
    return <img alt={appName} className="h-7 w-auto" decoding="async" height={43} src={versionedAssetUrl("/lobbystack-logo.svg")} width={155} />;
  }
  return (
    <span aria-label={appName} className="flex items-center gap-2">
      {logoUrl ? <img alt="" aria-hidden="true" className="h-7 w-auto max-w-28 object-contain" decoding="async" src={logoUrl} /> : null}
      <span className="font-heading text-lg font-semibold leading-none text-foreground">{appName}</span>
    </span>
  );
}
