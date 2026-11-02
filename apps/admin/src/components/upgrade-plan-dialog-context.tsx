"use client";

import { createContext, useContext, type ReactNode } from "react";

const OpenUpgradePlanDialogContext = createContext<(() => void) | null>(null);

/** How a plans offer ended: closed with nothing picked, or a plan clicked. */
export type PlanOfferCallbacks = { onDismiss: () => void; onPlanClicked: (plan: "starter" | "pro") => void };

const OpenPlanOfferContext = createContext<((callbacks: PlanOfferCallbacks) => void) | null>(null);

export function UpgradePlanDialogProvider({
  children,
  onOffer,
  onOpen,
}: {
  children: ReactNode;
  onOffer?: (callbacks: PlanOfferCallbacks) => void;
  onOpen: () => void;
}) {
  return (
    <OpenUpgradePlanDialogContext.Provider value={onOpen}>
      <OpenPlanOfferContext.Provider value={onOffer ?? null}>
        {children}
      </OpenPlanOfferContext.Provider>
    </OpenUpgradePlanDialogContext.Provider>
  );
}

/**
 * Opens the plan picker from any component inside the dashboard shell. It
 * opens on the plan picked on the pricing page, or Starter.
 */
export function useOpenUpgradePlanDialog(): () => void {
  const openUpgradePlanDialog = useContext(OpenUpgradePlanDialogContext);
  if (!openUpgradePlanDialog) {
    throw new Error("useOpenUpgradePlanDialog must be used within AuthenticatedLayout.");
  }
  return openUpgradePlanDialog;
}

/** The same opener, or null outside its provider, for components that some pages render without one. */
export function useUpgradePlanDialogOpener(): (() => void) | null {
  return useContext(OpenUpgradePlanDialogContext);
}

/** Opens the plan picker as an offer, which adds "Not now" and reports how it ended. Null outside the provider. */
export function usePlanOfferOpener(): ((callbacks: PlanOfferCallbacks) => void) | null {
  return useContext(OpenPlanOfferContext);
}
