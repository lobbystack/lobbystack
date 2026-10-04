"use client";

import { ChevronsUpDown, Contrast, Crown, LogOut, User as UserIcon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

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
  showUpgradeToPro?: boolean;
  user: User;
};

export function NavUser({
  onSignOut,
  onUpgradeToPro,
  showUpgradeToPro = false,
  user,
}: NavUserProps) {
  const { t } = useTranslation("nav");
  const [open, setOpen] = useState(false);
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

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
              <DropdownMenuItem
                closeOnClick={false}
                onClick={toggleTheme}
              >
                <Contrast />
                {t("sidebar.toggleTheme")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
