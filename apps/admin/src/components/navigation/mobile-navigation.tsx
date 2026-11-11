"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DashboardFeedbackDialog } from "@/components/dashboard-feedback-widget";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIsMobile } from "@/hooks/use-mobile";
import type { NavigationUser } from "./account-menu";
import { MobileMenuSheet } from "./mobile-menu-sheet";
import { MobileTabBar } from "./mobile-tab-bar";

/**
 * The menu sheet's place in the browser history. Opening the sheet adds an
 * entry on the same URL, so the back button and the back gesture close it.
 * Closing it any other way goes back over that entry, and a page opened from
 * the sheet opens after it, so the sheet never leaves an entry behind.
 */
function useMenuHistory() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  const after = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onPopState = () => {
      if (!pushed.current) return;
      pushed.current = false;
      setOpen(false);
      const next = after.current;
      after.current = null;
      // After the router has handled the traversal back.
      if (next) setTimeout(next, 0);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // A page opened some other way, such as the agent switcher, closes the sheet too.
  const [shownPathname, setShownPathname] = useState(pathname);
  if (shownPathname !== pathname) {
    setShownPathname(pathname);
    if (open) setOpen(false);
  }
  useEffect(() => { pushed.current = false; }, [pathname]);

  const show = useCallback(() => {
    if (pushed.current) return;
    window.history.pushState({ lobbystackMenu: true }, "");
    pushed.current = true;
    setOpen(true);
  }, []);

  /** Closes the sheet, then runs `next`, once the browser is back on the page's own entry. */
  const closeThen = useCallback((next?: () => void) => {
    if (pushed.current) {
      after.current = next ?? null;
      window.history.back();
      return;
    }
    setOpen(false);
    next?.();
  }, []);

  const navigate = useCallback((href: string) => {
    const here = `${window.location.pathname}${window.location.search}`;
    closeThen(href === here ? undefined : () => router.push(href));
  }, [closeThen, router]);

  return { open, show, closeThen, navigate };
}

/**
 * The dashboard's navigation below the md breakpoint: the bottom tab bar and
 * the full-screen menu sheet behind its Menu tab. Tablets and desktops keep
 * the sidebar, and this draws nothing there.
 */
export function MobileNavigation({ partnerConsole = false, user }: { partnerConsole?: boolean; user: NavigationUser }) {
  const menu = useMenuHistory();
  const isMobile = useIsMobile();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { business } = useActiveBusiness();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { closeThen, open } = menu;
  // Turning a tablet to the sidebar's width closes the sheet.
  useEffect(() => { if (!isMobile && open) closeThen(); }, [closeThen, isMobile, open]);
  return (
    <>
      <MobileTabBar menuButtonRef={menuButtonRef} menuOpen={menu.open} onOpenMenu={menu.show} />
      <MobileMenuSheet
        closeThen={menu.closeThen}
        finalFocus={menuButtonRef}
        navigate={menu.navigate}
        onFeedback={() => setFeedbackOpen(true)}
        open={menu.open}
        partnerConsole={partnerConsole}
        user={user}
      />
      {/* Outside the sheet, which closes before the dialog opens. */}
      <DashboardFeedbackDialog businessId={business?.businessId} onOpenChange={setFeedbackOpen} open={feedbackOpen} />
    </>
  );
}
