"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Where a page's search and primary action go: the page header's action area.
 * `undefined` means the page has no shell around it, so the actions render in place.
 * `null` means the shell's header isn't mounted yet.
 */
export const HeaderActionsSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(HeaderActionsSlotContext);
  if (slot === undefined) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  return slot ? createPortal(children, slot) : null;
}

export function HeaderSearch({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label={label ?? placeholder} className="pl-10" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </div>
  );
}
