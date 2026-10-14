"use client";

import { createContext, useContext, type ReactNode } from "react";

const OpenUpgradePlanDialogContext = createContext<(() => void) | null>(null);

export function UpgradePlanDialogProvider({
  children,
  onOpen,
}: {
  children: ReactNode;
  onOpen: () => void;
}) {
  return (
    <OpenUpgradePlanDialogContext.Provider value={onOpen}>
      {children}
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

/** The same opener, or null outside the dashboard shell, for components that onboarding renders too. */
export function useUpgradePlanDialogOpener(): (() => void) | null {
  return useContext(OpenUpgradePlanDialogContext);
}
