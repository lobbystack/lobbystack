"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";
import type { PageIntroId } from "@lobbystack/shared";

import { useBranding } from "@/components/branding-provider";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { helpCenterUrl } from "@/lib/help-center";
import { isTestCallActive } from "@/lib/test-window";
import { PAGE_INTROS } from "./pages";
import { dismissalForReason, shouldShowPageIntro, type PageIntroDismissal } from "./page-intro-rules";
import { usePageIntros } from "./page-intros-provider";

/**
 * The card a page opens with the first time a person visits it. Each page
 * mounts one with its id; the dashboard shell decides whether it shows.
 */
export function PageIntro({ page }: { page: PageIntroId }) {
  const intros = usePageIntros();
  const pathname = usePathname() ?? "";
  const telemetry = useTelemetry();
  const [open, setOpen] = useState(false);
  const seen = intros?.seen ?? null;
  const firstPageView = intros?.firstPageView ?? false;
  const shownThisVisit = intros?.shownThisVisit ?? null;
  const claim = intros?.claim;
  const businessId = intros?.businessId ?? null;

  useEffect(() => {
    if (open || !claim) return;
    const show = shouldShowPageIntro(page, { seen, shownThisVisit, firstPageView, onboarding: pathname.startsWith("/onboarding"), testCallActive: isTestCallActive() });
    // A second effect run for the same card, as React's strict mode makes, finds it claimed and open already.
    if (!show || shownThisVisit === page || !claim(page)) return;
    setOpen(true);
    telemetry.track("web.page.intro_shown", { businessId, pageId: page });
  }, [businessId, claim, firstPageView, open, page, pathname, seen, shownThisVisit, telemetry]);

  if (!intros) return null;

  const dismiss = (method: PageIntroDismissal) => {
    setOpen(false);
    intros.markSeen(page);
    telemetry.track("web.page.intro_dismissed", { businessId, pageId: page, method });
  };

  return (
    <Dialog open={open} onOpenChange={(next, details) => { if (!next) dismiss(dismissalForReason(details?.reason)); }}>
      {open ? <PageIntroCard page={page} onDismiss={dismiss} /> : null}
    </Dialog>
  );
}

/** The card itself: the page's picture, its title, three or four lines and the two ways out. */
export function PageIntroCard({ page, onDismiss }: { page: PageIntroId; onDismiss: (method: PageIntroDismissal) => void }) {
  const { t, i18n } = useTranslation("intros");
  // A partner's businesses never get the host's Help Center.
  const { partner } = useBranding();
  const { guide, lines, Illustration } = PAGE_INTROS[page];
  const guideHref = partner ? null : helpCenterUrl(guide, i18n.resolvedLanguage ?? i18n.language);
  return (
    <DialogContent
      size="sm"
      data-page-intro={page}
      className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 motion-safe:data-open:slide-in-from-bottom-4 motion-safe:data-open:duration-300 motion-reduce:animate-none"
      overlayClassName="motion-reduce:animate-none"
    >
      <Illustration />
      <div className="flex flex-col gap-5 p-6">
        <DialogTitle className="text-center type-section-title text-balance">{t(`pages.${page}.title`)}</DialogTitle>
        <ul className="flex flex-col gap-3">
          {lines.map(({ key, icon: Icon }) => (
            <li className="flex items-start gap-3 type-body" key={key}>
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
              <span className="text-muted-foreground">{t(`pages.${page}.${key}`)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 pt-1">
          <Button className="w-full" onClick={() => onDismiss("get_started")}><Check data-icon="inline-start" />{t("actions.getStarted")}</Button>
          {guideHref ? (
            <Button className="w-full" variant="ghost" render={<Link href={guideHref} rel="noreferrer" target="_blank" />} nativeButton={false} role="link" onClick={() => onDismiss("guide")}>
              {t("actions.readGuide")}<ExternalLink data-icon="inline-end" />
            </Button>
          ) : null}
        </div>
      </div>
    </DialogContent>
  );
}
