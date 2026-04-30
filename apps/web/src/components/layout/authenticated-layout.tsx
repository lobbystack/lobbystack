import type { CSSProperties, ReactNode } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";

import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { FeedbackWidget } from "@/components/feedback-widget";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type AuthenticatedLayoutProps = {
  businessId?: Id<"businesses">;
  businessName?: string;
  children: ReactNode;
  onSignOut: () => void;
  operatorAvatar?: string;
  operatorEmail?: string;
  operatorName?: string;
  showUpgradeToPro?: boolean;
  isLoading?: boolean;
};

function getSidebarDefaultOpen(): boolean {
  if (typeof document === "undefined") {
    return true;
  }

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("sidebar_state="));

  return match?.split("=")[1] !== "false";
}

export function AuthenticatedLayout({
  businessId,
  businessName,
  children,
  onSignOut,
  operatorAvatar,
  operatorEmail,
  operatorName,
  showUpgradeToPro = false,
  isLoading = false,
}: AuthenticatedLayoutProps) {
  const defaultOpen = getSidebarDefaultOpen();

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "16rem",
        } as CSSProperties
      }
    >
      <AppSidebar
        isLoading={isLoading}
        onSignOut={onSignOut}
        {...(businessName ? { businessName } : {})}
        {...(operatorAvatar ? { operatorAvatar } : {})}
        {...(operatorEmail ? { operatorEmail } : {})}
        {...(operatorName ? { operatorName } : {})}
        showUpgradeToPro={showUpgradeToPro}
      />
      <SidebarInset
        className={cn(
          "@container/content",
          "has-data-[layout=fixed]:h-svh",
          "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]",
        )}
      >
        <SiteHeader fixed />
        {!isLoading ? (
          <div className="relative z-40 hidden h-0 justify-end md:flex">
            <FeedbackWidget
              className="mt-4 mr-4"
              {...(businessId ? { businessId } : {})}
            />
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
