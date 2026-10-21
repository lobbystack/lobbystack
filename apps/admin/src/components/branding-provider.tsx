"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { i18n as I18nextInstance } from "i18next";

import { setI18nAppName } from "@/i18n";
import { BRANDING_API_PATH, DEFAULT_BRANDING_SNAPSHOT, brandLogoSrc, parseBrandingResponse, type BrandingSnapshot } from "@/lib/branding-snapshot";

type BrandingContextValue = {
  appName: string;
  logoUrl: string | null;
  /** False while a prerendered page is still asking the server for the name and logo. */
  ready: boolean;
  /** Shows a name and logo the browser just saved, before the next server render. */
  setBranding: (branding: Pick<BrandingSnapshot, "appName" | "logoUrl">) => void;
};

const BrandingContext = createContext<BrandingContextValue>({
  appName: DEFAULT_BRANDING_SNAPSHOT.appName,
  logoUrl: DEFAULT_BRANDING_SNAPSHOT.logoUrl,
  ready: true,
  setBranding: () => undefined,
});

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}

type Shown = Pick<BrandingSnapshot, "appName" | "logoUrl"> & { ready: boolean };

// An icon link to nothing, so the tab shows the browser's own icon.
const NO_ICON = "data:,";

/**
 * Keeps the tab's title and icon on the deployment's name and logo when they
 * differ from what the server rendered into the page head. Next.js rewrites
 * the head on navigation, so this follows its changes. Links Next.js owns are
 * repointed, never removed, so React can still update them.
 */
function useDocumentBranding(rendered: BrandingSnapshot, shown: Shown) {
  const { appName: renderedName, logoUrl: renderedLogo } = rendered;
  const { appName: shownName, logoUrl: shownLogo, ready } = shown;
  useEffect(() => {
    if (!ready || (renderedName === shownName && renderedLogo === shownLogo)) return;
    const renderedIcon = brandLogoSrc({ appName: renderedName, logoUrl: renderedLogo });
    const shownIcon = brandLogoSrc({ appName: shownName, logoUrl: shownLogo }) ?? NO_ICON;
    let appliedTitle: string | null = null;
    const apply = () => {
      const title = document.title;
      if (renderedName !== shownName && title !== appliedTitle && title.includes(renderedName)) {
        appliedTitle = title.split(renderedName).join(shownName);
        document.title = appliedTitle;
      }
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
      for (const link of links) {
        if (renderedIcon !== null && link.getAttribute("href") === renderedIcon && renderedIcon !== shownIcon) link.setAttribute("href", shownIcon);
      }
      if (links.length === 0 && shownIcon !== NO_ICON) {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = shownIcon;
        document.head.append(link);
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [ready, renderedName, renderedLogo, shownName, shownLogo]);
}

/**
 * The deployment's name and logo for every component below. A prerendered
 * page carries only what the build environment set, so it asks the server for
 * the rest; until then `ready` is false and the brand mark holds its space.
 */
export function BrandingProvider({ initial, i18n, children }: { initial: BrandingSnapshot; i18n: I18nextInstance; children: React.ReactNode }) {
  const [shown, setShown] = useState<Shown>(() => ({ appName: initial.appName, logoUrl: initial.logoUrl, ready: initial.final }));

  // A new server render (a refresh, or a layout above this one changing) brings the current branding.
  useEffect(() => {
    if (!initial.final) return;
    setShown((current) => current.appName === initial.appName && current.logoUrl === initial.logoUrl && current.ready ? current : { appName: initial.appName, logoUrl: initial.logoUrl, ready: true });
  }, [initial.appName, initial.logoUrl, initial.final]);

  useEffect(() => {
    if (initial.final) return;
    let cancelled = false;
    void fetch(BRANDING_API_PATH, { cache: "no-store", credentials: "omit" })
      .then(async (response) => response.ok ? parseBrandingResponse(await response.json()) : null)
      .catch(() => null)
      .then((branding) => {
        if (!cancelled) setShown((current) => ({ ...(branding ?? current), ready: true }));
      });
    return () => { cancelled = true; };
  }, [initial.final]);

  useEffect(() => { setI18nAppName(i18n, shown.appName); }, [i18n, shown.appName]);
  useDocumentBranding(initial, shown);

  const setBranding = useCallback((branding: Pick<BrandingSnapshot, "appName" | "logoUrl">) => {
    setShown({ appName: branding.appName, logoUrl: branding.logoUrl, ready: true });
  }, []);
  const value = useMemo(() => ({ ...shown, setBranding }), [shown, setBranding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
