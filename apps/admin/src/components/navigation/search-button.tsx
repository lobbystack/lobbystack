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
        <SidebarMenuButton className="text-muted-foreground" onClick={() => opener?.()} tooltip={t("search.button")}>
          <SearchIcon />
          <span>{t("search.button")}</span>
          <kbd className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">⌘K</kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
