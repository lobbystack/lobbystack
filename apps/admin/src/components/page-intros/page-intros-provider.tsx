"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FIRST_DASHBOARD_VISIT, type PageIntroId, type PageIntroKey } from "@lobbystack/shared";

type PageIntrosContextValue = {
  /** The cards the person has closed, or null when none may show. */
  seen: ReadonlySet<PageIntroKey> | null;
  /** The person's very first dashboard page, until they open another one. */
  firstPageView: boolean;
  shownThisVisit: PageIntroId | null;
  /** The business the dashboard opened, for the events. */
  businessId: string | null;
  /** Takes this visit's one card for the page. False when another page took it first. */
  claim(page: PageIntroId): boolean;
  /** Records the card as closed, here and on the server. */
  markSeen(page: PageIntroId): void;
};

const PageIntrosContext = createContext<PageIntrosContextValue | null>(null);

/** The cards' state, or null outside the dashboard shell, where no card shows. */
export function usePageIntros(): PageIntrosContextValue | null {
  return useContext(PageIntrosContext);
}

function recordSeen(intro: PageIntroKey): void {
  // keepalive lets the request finish when the person closes the card and leaves the page at once.
  void fetch("/api/page-intros", { method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intro }) }).catch(() => undefined);
}

/**
 * Holds which intro cards the person has closed, from the list the dashboard
 * layout loaded with the page, and which card this visit has shown. A visit
 * lasts until the dashboard reloads. The first page of a person's first visit
 * shows no card, and that visit is recorded as soon as it starts.
 */
export function PageIntrosProvider({ businessId = null, children, seen: initial }: { businessId?: string | null; children: React.ReactNode; seen: readonly PageIntroKey[] | null }) {
  const pathname = usePathname();
  const [seen, setSeen] = useState<ReadonlySet<PageIntroKey> | null>(() => (initial ? new Set(initial) : null));
  const firstVisit = Boolean(initial) && !initial!.includes(FIRST_DASHBOARD_VISIT);
  const [firstVisitPath, setFirstVisitPath] = useState<string | null>(() => (firstVisit ? pathname : null));
  const [shownThisVisit, setShownThisVisit] = useState<PageIntroId | null>(null);
  const shownRef = useRef<PageIntroId | null>(null);
  const recordedFirstVisit = useRef(false);

  useEffect(() => {
    if (!firstVisit || recordedFirstVisit.current) return;
    recordedFirstVisit.current = true;
    recordSeen(FIRST_DASHBOARD_VISIT);
  }, [firstVisit]);

  // Opening another page ends the first page view.
  useEffect(() => {
    if (firstVisitPath !== null && pathname !== firstVisitPath) setFirstVisitPath(null);
  }, [firstVisitPath, pathname]);

  const claim = useCallback((page: PageIntroId) => {
    if (shownRef.current !== null && shownRef.current !== page) return false;
    shownRef.current = page;
    setShownThisVisit(page);
    return true;
  }, []);

  const markSeen = useCallback((page: PageIntroId) => {
    setSeen((current) => (current ? new Set([...current, page]) : current));
    recordSeen(page);
  }, []);

  const value = useMemo<PageIntrosContextValue>(() => ({ seen, firstPageView: firstVisitPath !== null, shownThisVisit, businessId, claim, markSeen }), [businessId, claim, firstVisitPath, markSeen, seen, shownThisVisit]);
  return <PageIntrosContext.Provider value={value}>{children}</PageIntrosContext.Provider>;
}
