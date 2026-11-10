"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

/**
 * One menu row. `leading` is an icon and `trailing` a chevron, count or
 * badge. On a phone, `keepOpen` leaves the drawer open, for a row that swaps
 * the menu rather than opening a page to read.
 */
export function MenuRow({ active = false, href, indented = false, keepOpen = false, label, leading, title, trailing }: { active?: boolean; href: string; indented?: boolean; keepOpen?: boolean; label: ReactNode; leading?: ReactNode; title: string; trailing?: ReactNode }) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    // An indented row lines up with the label above it, and the collapsed rail has no room for it.
    <SidebarMenuItem className={indented ? "group-data-[collapsible=icon]:hidden" : undefined}>
      <SidebarMenuButton
        className={indented ? "pl-8 text-muted-foreground" : undefined}
        isActive={active}
        onClick={() => { if (isMobile) { router.push(href); if (!keepOpen) setOpenMobile(false); } }}
        tooltip={title}
        {...(!isMobile ? { render: <Link href={href} /> } : {})}
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

/** The row every swapped menu opens with. It names where it goes, because that changes with the way in. */
export function BackRow({ href, label }: { href: string; label: string }) {
  const { t } = useTranslation("nav");
  const text = t("back", { place: label });
  return (
    <SidebarGroup className="pb-0">
      <SidebarMenu>
        <MenuRow href={href} keepOpen label={text} leading={<ArrowLeft className="text-muted-foreground" />} title={text} />
      </SidebarMenu>
    </SidebarGroup>
  );
}
