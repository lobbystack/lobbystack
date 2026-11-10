"use client";

import { useSyncExternalStore } from "react";
import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

// The search dialog registers how to open it, as the test window does, so
// the sidebar's button never mounts a second one. Until a dialog registers,
// the button stays hidden.

let opener: (() => void) | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

export function registerSearch(next: () => void): () => void {
  opener = next;
  notify();
  return () => {
    if (opener === next) {
      opener = null;
      notify();
    }
  };
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => { subscribers.delete(onChange); };
}

/** Opens search. It sits under the workspace switcher, on every menu. */
export function SearchButton() {
  const { t } = useTranslation("nav");
  const ready = useSyncExternalStore(subscribe, () => opener !== null, () => false);
  if (!ready) return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Drawn as a search field, with the inputs' border and fill. On the collapsed rail it's the plain icon button. */}
        <SidebarMenuButton className="rounded-xl border border-input bg-input/30 text-muted-foreground hover:bg-input/50 hover:text-muted-foreground group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:hover:bg-sidebar-accent" onClick={() => opener?.()} tooltip={t("search.button")}>
          <SearchIcon />
          <span className="group-data-[collapsible=icon]:hidden">{t("search.button")}</span>
          <kbd className="ml-auto inline-flex h-5 shrink-0 items-center rounded-md border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">⌘K</kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
