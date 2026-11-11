"use client";

import { BookOpen, ChevronsUpDown, Contrast, Crown, ExternalLink, FileText, Gift, Handshake, LifeBuoy, LogOut, MessageSquare, ShieldCheck, User as UserIcon, type LucideIcon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { brandLinks } from "@lobbystack/shared";

import { useBranding } from "@/components/branding-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
type User = { email: string; name: string };

export type NavUserProps = {
  /** Opens the feedback dialog, which the caller keeps mounted outside the menu. */
  onFeedback?: (() => void) | undefined;
  /** Ends the person's open of the business they work in as the partner's staff, as they go back to the console. */
  onLeaveBusiness?: (() => void) | undefined;
  onSignOut: () => void;
  onUpgradeToPro?: (() => void) | undefined;
  /** Links to the partner console, for someone on a partner's team. */
  showPartnerConsole?: boolean;
  showUpgradeToPro?: boolean;
  user: User;
};

/** One item of the account menu: a page, an outside link, or an action. */
export type AccountMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  /** Opens in a new tab, or the mail app for a mailto link. */
  external?: boolean;
  onSelect?: () => void;
  /** The menu stays open after it, as for the theme toggle. */
  keepOpen?: boolean;
};

/**
 * The account menu's items in their groups, which the sidebar's dropdown and
 * the phone menu both show: an upgrade, the person's pages and links, a
 * partner's own links, then signing out.
 */
export function useAccountMenuGroups({ onFeedback, onLeaveBusiness, onSignOut, onUpgradeToPro, showPartnerConsole = false, showUpgradeToPro = false }: Omit<NavUserProps, "user">): AccountMenuItem[][] {
  const { t } = useTranslation(["nav", "common"]);
  const { resolvedTheme, setTheme } = useTheme();
  // On a partner's dashboard, the partner's own support, terms and privacy links, each only when it set one.
  const { partner } = useBranding();
  // A partner's businesses never get the host's docs or marketing.
  const docsHref = partner ? null : brandLinks().docsUrl;
  const upgrade: AccountMenuItem[] = showUpgradeToPro
    ? [{ key: "upgrade", label: t("sidebar.upgradeToPro"), icon: Crown, ...(onUpgradeToPro ? { onSelect: onUpgradeToPro } : { href: "/workspace/billing" }) }]
    : [];
  const own: AccountMenuItem[] = [
    { key: "account", label: t("sidebar.accountSettings"), icon: UserIcon, href: "/account" },
    ...(showPartnerConsole ? [{ key: "partner", label: t("sidebar.partnerConsole"), icon: Handshake, href: "/partner", ...(onLeaveBusiness ? { onSelect: onLeaveBusiness } : {}) }] : []),
    ...(onFeedback ? [{ key: "feedback", label: t("common:feedback.trigger"), icon: MessageSquare, onSelect: onFeedback }] : []),
    ...(docsHref ? [{ key: "help", label: t("common:feedback.helpCenter"), icon: BookOpen, href: docsHref, external: true }] : []),
    ...(partner ? [] : [{ key: "affiliate", label: t("items.affiliate"), icon: Gift, href: "/affiliate" }]),
    { key: "theme", label: t("sidebar.toggleTheme"), icon: Contrast, keepOpen: true, onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
  ];
  const partnerLinks: AccountMenuItem[] = partner
    ? [
        { key: "support", href: partner.links.support, label: t("sidebar.support"), icon: LifeBuoy },
        { key: "terms", href: partner.links.terms, label: t("sidebar.terms"), icon: FileText },
        { key: "privacy", href: partner.links.privacy, label: t("sidebar.privacy"), icon: ShieldCheck },
      ].filter((link): link is typeof link & { href: string } => Boolean(link.href)).map((link) => ({ ...link, external: !link.href.startsWith("mailto:") }))
    : [];
  return [upgrade, own, partnerLinks, [{ key: "signOut", label: t("sidebar.signOut"), icon: LogOut, onSelect: onSignOut }]].filter((group) => group.length > 0);
}

/** How an item's link opens: a new tab for an outside page, or the app's router. The row it renders fills the anchor. */
export function accountItemLink(item: AccountMenuItem) {
  if (!item.href) return undefined;
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- the menu item renders its icon and label into it
  if (item.href.startsWith("mailto:")) return <a href={item.href} />;
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- the menu item renders its icon and label into it
  if (item.external) return <a href={item.href} rel="noreferrer" target="_blank" />;
  return <Link href={item.href} />;
}

export function NavUser({ user, ...props }: NavUserProps) {
  const [open, setOpen] = useState(false);
  const groups = useAccountMenuGroups(props);
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            aria-expanded={open}
            render={
              <SidebarMenuButton
                // Collapsed, the button is a 32px square with no padding, so the avatar is the only content and sits in the middle.
                className="data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
                size="lg"
              />
            }
          >
            <Avatar size="sm">
              <AvatarFallback>{emailInitial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm">{user.email}</span>
            </div>
            <ChevronsUpDown className="ms-auto size-4 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side="right"
            sideOffset={4}
          >
            <div className="truncate px-3 py-2 text-sm text-muted-foreground" title={user.email}>{user.email}</div>
            {groups.map((group, index) => (
              <Fragment key={group[0]!.key}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuGroup>
                  {group.map((item) => {
                    const link = accountItemLink(item);
                    return (
                      <DropdownMenuItem
                        {...(item.keepOpen ? { closeOnClick: false } : {})}
                        {...(item.key === "help" ? { "aria-label": item.label } : {})}
                        key={item.key}
                        {...(item.onSelect ? { onClick: item.onSelect } : {})}
                        {...(link ? { render: link } : {})}
                      >
                        <item.icon />
                        {item.label}
                        {item.external && item.key === "help" ? <ExternalLink className="ms-auto text-muted-foreground" /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
