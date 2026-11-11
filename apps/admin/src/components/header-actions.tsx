"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * Where a page's primary action goes: the page header's action area.
 * `undefined` means the page has no shell around it, so the actions render in place.
 * `null` means the shell's header isn't mounted yet.
 */
export const HeaderActionsSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(HeaderActionsSlotContext);
  if (slot === undefined) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  return slot ? createPortal(children, slot) : null;
}
