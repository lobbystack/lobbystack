import { motion, useAnimation } from "motion/react";
import { ChevronsUpDown } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { SidebarUserSkeleton } from "@/components/loading-skeletons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ContrastIcon, type ContrastIconHandle } from "@/components/ui/contrast";
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
import { UserIcon, type UserIconHandle } from "@/components/ui/user";
import type { User } from "@/components/layout/sidebar-types";

type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type IconAnimationControls = ReturnType<typeof useAnimation>;

function startIconAnimation(ref: { current: AnimatedIconHandle | null }) {
  ref.current?.startAnimation();
}

function stopIconAnimation(ref: { current: AnimatedIconHandle | null }) {
  ref.current?.stopAnimation();
}

function CrownAnimatedIcon({ controls }: { controls: IconAnimationControls }) {
  return (
    <motion.svg
      animate={controls}
      fill="none"
      height="16"
      initial="normal"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      transition={{ duration: 0.35, ease: "easeOut" }}
      variants={{
        normal: { y: 0, rotate: 0 },
        animate: { y: -1, rotate: -6 },
      }}
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.path
        d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"
        variants={{
          normal: { pathLength: 1 },
          animate: { pathLength: [0.2, 1] },
        }}
      />
      <motion.path
        d="M5 20h14"
        variants={{
          normal: { pathLength: 1 },
          animate: { pathLength: [0, 1] },
        }}
      />
    </motion.svg>
  );
}

function LogOutAnimatedIcon({ controls }: { controls: IconAnimationControls }) {
  return (
    <svg
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <motion.path
        animate={controls}
        d="M16 17l5-5-5-5"
        initial="normal"
        variants={{
          normal: { x: 0 },
          animate: { x: [0, 2, 0] },
        }}
      />
      <motion.path
        animate={controls}
        d="M21 12H9"
        initial="normal"
        variants={{
          normal: { pathLength: 1 },
          animate: { pathLength: [0.35, 1] },
        }}
      />
    </svg>
  );
}

type NavUserProps = {
  onSignOut: () => void;
  showUpgradeToPro?: boolean;
  user: User;
  isLoading?: boolean;
};

export function NavUser({
  onSignOut,
  showUpgradeToPro = false,
  user,
  isLoading = false,
}: NavUserProps) {
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const emailInitial = user.email.trim().charAt(0).toUpperCase() || "?";
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  const accountIconRef = useRef<UserIconHandle>(null);
  const themeIconRef = useRef<ContrastIconHandle>(null);
  const crownControls = useAnimation();
  const logOutControls = useAnimation();

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
            {showUpgradeToPro ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onBlur={() => void crownControls.start("normal")}
                    onFocus={() => void crownControls.start("animate")}
                    onMouseEnter={() => void crownControls.start("animate")}
                    onMouseLeave={() => void crownControls.start("normal")}
                    render={<Link to="/settings/billing" />}
                  >
                    <CrownAnimatedIcon controls={crownControls} />
                    Upgrade to Pro
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuItem
                onBlur={() => stopIconAnimation(accountIconRef)}
                onFocus={() => startIconAnimation(accountIconRef)}
                onMouseEnter={() => startIconAnimation(accountIconRef)}
                onMouseLeave={() => stopIconAnimation(accountIconRef)}
                render={<Link to="/settings/account" />}
              >
                <UserIcon ref={accountIconRef} size={16} />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                closeOnClick={false}
                onClick={toggleTheme}
                onBlur={() => stopIconAnimation(themeIconRef)}
                onFocus={() => startIconAnimation(themeIconRef)}
                onMouseEnter={() => startIconAnimation(themeIconRef)}
                onMouseLeave={() => stopIconAnimation(themeIconRef)}
              >
                <ContrastIcon ref={themeIconRef} size={16} />
                Toggle theme
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onBlur={() => void logOutControls.start("normal")}
              onClick={onSignOut}
              onFocus={() => void logOutControls.start("animate")}
              onMouseEnter={() => void logOutControls.start("animate")}
              onMouseLeave={() => void logOutControls.start("normal")}
              variant="destructive"
            >
              <LogOutAnimatedIcon controls={logOutControls} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
