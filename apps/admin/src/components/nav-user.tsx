"use client";

import { BookOpen, ChevronsUpDown, Contrast, Crown, ExternalLink, FileText, Gift, Handshake, LifeBuoy, LogOut, MessageSquare, ShieldCheck, User as UserIcon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useState } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";
type User = { email: string; name: string };

type NavUserProps = {
  /** Opens the feedback dialog, which the caller keeps mounted outside the menu. */
  onFeedback?: (() => void) | undefined;
  /** Ends the person's open of the business they work in as the partner's staff, as they go back to the console. */
  onLeaveBusiness?: (() => void) | undefined;
  onSignOut: () => void;
  onUpgradeToPro?: () => void;
  /** Links to the partner console, for someone on a partner's team. */
  showPartnerConsole?: boolean;
  showUpgradeToPro?: boolean;
  user: User;
};

export function NavUser({
  onFeedback,
  onLeaveBusiness,
  onSignOut,
  onUpgradeToPro,
  showPartnerConsole = false,
  showUpgradeToPro = false,
  user,
}: NavUserProps) {
  const { t } = useTranslation(["nav", "common"]);
  const [open, setOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";
  // The links below open another page, which leaves the mobile sidebar sheet covering it.
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  // On a partner's dashboard, the partner's own support, terms and privacy links, each only when it set one.
  const { partner } = useBranding();
  // A partner's businesses never get the host's docs or marketing.
  const docsHref = partner ? null : brandLinks().docsUrl;
  const partnerLinks = partner
    ? [
        { key: "support", href: partner.links.support, label: t("sidebar.support"), icon: LifeBuoy },
        { key: "terms", href: partner.links.terms, label: t("sidebar.terms"), icon: FileText },
        { key: "privacy", href: partner.links.privacy, label: t("sidebar.privacy"), icon: ShieldCheck },
      ].filter((link): link is typeof link & { href: string } => Boolean(link.href))
    : [];

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
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <div className="truncate px-3 py-2 text-sm text-muted-foreground" title={user.email}>{user.email}</div>
            {showUpgradeToPro ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    {...(onUpgradeToPro
                      ? {
                          onClick: onUpgradeToPro,
                        }
                      : {
                          onClick: closeMobileSidebar,
                          render: <Link href="/workspace/billing" />,
                        })}
                  >
                    <Crown />
                    {t("sidebar.upgradeToPro")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={closeMobileSidebar}
                render={<Link href="/account" />}
              >
                <UserIcon />
                {t("sidebar.account")}
              </DropdownMenuItem>
              {showPartnerConsole ? (
                <DropdownMenuItem onClick={onLeaveBusiness} render={<Link href="/partner" />}>
                  <Handshake />
                  {t("sidebar.partnerConsole")}
                </DropdownMenuItem>
              ) : null}
              {onFeedback ? (
                <DropdownMenuItem onClick={() => { closeMobileSidebar(); onFeedback(); }}>
                  <MessageSquare />
                  {t("common:feedback.trigger")}
                </DropdownMenuItem>
              ) : null}
              {docsHref ? (
                <DropdownMenuItem render={<a aria-label={t("common:feedback.helpCenter")} href={docsHref} rel="noreferrer" target="_blank" />}>
                  <BookOpen />
                  {t("common:feedback.helpCenter")}
                  <ExternalLink className="ms-auto text-muted-foreground" />
                </DropdownMenuItem>
              ) : null}
              {partner ? null : (
                <DropdownMenuItem onClick={closeMobileSidebar} render={<Link href="/affiliate" />}>
                  <Gift />
                  {t("items.affiliate")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                closeOnClick={false}
                onClick={toggleTheme}
              >
                <Contrast />
                {t("sidebar.toggleTheme")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {partnerLinks.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {partnerLinks.map((link) => (
                    <DropdownMenuItem key={link.key} render={<Link href={link.href} prefetch={false} {...(link.href.startsWith("mailto:") ? {} : { rel: "noreferrer", target: "_blank" })} />}>
                      <link.icon />
                      {link.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut />
              {t("sidebar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
