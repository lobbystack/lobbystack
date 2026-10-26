"use client";

import { ChevronsUpDown, Contrast, Crown, FileText, Handshake, LifeBuoy, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

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
  onSignOut: () => void;
  onUpgradeToPro?: () => void;
  /** Links to the partner console, for someone on a partner's team. */
  showPartnerConsole?: boolean;
  showUpgradeToPro?: boolean;
  user: User;
};

export function NavUser({
  onSignOut,
  onUpgradeToPro,
  showPartnerConsole = false,
  showUpgradeToPro = false,
  user,
}: NavUserProps) {
  const { t } = useTranslation("nav");
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  // On a partner's dashboard, the partner's own support, terms and privacy links, each only when it set one.
  const { partner } = useBranding();
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
                className="data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <Avatar className="shadow-xs" size="sm">
              <AvatarFallback>{emailInitial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate text-sm">{user.email}</span>
            </div>
            <ChevronsUpDown className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56 rounded-xl"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            {showUpgradeToPro ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    {...(onUpgradeToPro
                      ? {
                          onClick: onUpgradeToPro,
                        }
                      : {
                          render: <Link href="/settings/plan" />,
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
                render={<Link href="/settings/account" />}
              >
                <UserIcon />
                {t("sidebar.account")}
              </DropdownMenuItem>
              {showPartnerConsole ? (
                <DropdownMenuItem render={<Link href="/partner" />}>
                  <Handshake />
                  {t("sidebar.partnerConsole")}
                </DropdownMenuItem>
              ) : null}
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
            <DropdownMenuItem
              onClick={onSignOut}
              variant="destructive"
            >
              <LogOut />
              {t("sidebar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
