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

export function useOpenUpgradePlanDialog(): () => void {
  const openUpgradePlanDialog = useContext(OpenUpgradePlanDialogContext);
  if (!openUpgradePlanDialog) {
    throw new Error("useOpenUpgradePlanDialog must be used within AuthenticatedLayout.");
  }
  return openUpgradePlanDialog;
}
