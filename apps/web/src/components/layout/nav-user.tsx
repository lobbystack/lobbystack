import { Bell, ChevronsUpDown, CreditCard, LogOut, Sparkles, User as UserIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { SidebarUserSkeleton } from "@/components/loading-skeletons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import type { User } from "@/components/layout/sidebar-types";

type NavUserProps = {
  onSignOut: () => void;
  user: User;
  isLoading?: boolean;
};

export function NavUser({ onSignOut, user, isLoading = false }: NavUserProps) {
  const { isMobile } = useSidebar();
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarUserSkeleton />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <Avatar className="shadow-xs" size="sm">
              <AvatarImage src={user.avatar} alt={user.name} />
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
            <div className="px-2 py-2 text-start text-sm">
              <div className="flex items-center gap-2">
                <Avatar className="shadow-xs" size="sm">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback>{emailInitial}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate text-sm">{user.email}</span>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/settings/account" />}>
                <UserIcon />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/settings/billing" />}>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/integrations" />}>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} variant="destructive">
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
