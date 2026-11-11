"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * How a menu row opens its page. The phone menu sets it to close itself
 * first; the sidebar leaves it unset and its links open the page directly.
 */
export const MenuNavigationContext = createContext<((href: string) => void) | null>(null);

/** Opens a row's page through the phone menu, when the row sits in it. */
export function useMenuLinkClick() {
  const navigate = useContext(MenuNavigationContext);
  return (event: React.MouseEvent, href: string) => {
    if (!navigate || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
}

/**
 * One menu row. `leading` is an icon and `trailing` a chevron, count or
 * badge. `onSelect` takes the click in place of opening `href`, for a row
 * that drills back into the section the person is on.
 */
export function MenuRow({ active = false, href, indented = false, label, leading, onSelect, title, trailing }: { active?: boolean; href: string; indented?: boolean; label: ReactNode; leading?: ReactNode; onSelect?: () => void; title: string; trailing?: ReactNode }) {
  const onLinkClick = useMenuLinkClick();
  return (
    // An indented row lines up with the label above it, and the collapsed rail has no room for it.
    <SidebarMenuItem className={indented ? "group-data-[collapsible=icon]:hidden" : undefined}>
      <SidebarMenuButton
        className={indented ? "pl-8 text-muted-foreground" : undefined}
        isActive={active}
        onClick={(event: React.MouseEvent) => {
          if (onSelect) { event.preventDefault(); onSelect(); return; }
          onLinkClick(event, href);
        }}
        render={<Link href={href} />}
        tooltip={title}
      >
        {leading}
        <span className="min-w-0 truncate">{label}</span>
        {trailing ? <span className="ml-auto flex shrink-0 items-center group-data-[collapsible=icon]:hidden">{trailing}</span> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function MenuGroup({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <SidebarGroup>
      {title ? <SidebarGroupLabel>{title}</SidebarGroupLabel> : null}
      <SidebarMenu>{children}</SidebarMenu>
    </SidebarGroup>
  );
}

/**
 * The row every section's menu opens with: an arrow and the section's name.
 * It shows the workspace menu again and leaves the page as it is.
 */
export function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <SidebarGroup className="pb-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="font-medium" data-back-row="" onClick={onBack} tooltip={label}>
            <ArrowLeft className="text-muted-foreground" />
            <span className="min-w-0 truncate">{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** The trailing part of the row for the section the person is in: the page they're on, muted, then a chevron. */
export function SectionTrailing({ page }: { page: string | null }) {
  return <>
    {page ? <span className="me-1 max-w-28 truncate type-caption text-muted-foreground">{page}</span> : null}
    <ChevronRight className="size-4 text-muted-foreground/60" />
  </>;
}
