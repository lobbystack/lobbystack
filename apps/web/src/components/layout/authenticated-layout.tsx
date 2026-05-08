import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { CheckIcon, CopyIcon, PhoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";

import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { FeedbackWidget } from "@/components/feedback-widget";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhoneNumberDisplay } from "@/lib/phone";

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

type PrimaryPhoneNumber = {
  e164: string;
};

function AiPhoneNumberPill({
  businessId,
}: {
  businessId?: Id<"businesses">;
}) {
  const { i18n, t } = useTranslation("common");
  const [copied, setCopied] = useState(false);
  const primaryPhoneNumber = useQuery(
    api.businesses.catalog.getPrimaryPhoneNumber,
    businessId ? { businessId } : "skip",
  ) as PrimaryPhoneNumber | null | undefined;

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  if (!businessId) {
    return null;
  }

  if (primaryPhoneNumber === undefined) {
    return (
      <div className="pointer-events-auto flex h-8 items-center gap-3 rounded-4xl border border-border bg-input/30 px-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  if (!primaryPhoneNumber) {
    return null;
  }

  const displayNumber = formatPhoneNumberDisplay(
    primaryPhoneNumber.e164,
    i18n.resolvedLanguage ?? i18n.language,
  );

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(primaryPhoneNumber?.e164 ?? "");
    setCopied(true);
  }

  return (
    <div className="pointer-events-auto flex h-8 max-w-sm items-center gap-1 rounded-4xl border border-border bg-input/30 px-3 text-sm">
      <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-medium tabular-nums text-foreground">
        {displayNumber}
      </span>
      <Button
        aria-label={copied ? t("aiPhoneNumber.copied") : t("aiPhoneNumber.copy")}
        className="-mr-1 size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => void handleCopy()}
        size="icon"
        type="button"
        variant="ghost"
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </Button>
    </div>
  );
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
          <div className="pointer-events-none absolute top-4 inset-x-0 z-40 hidden md:block">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-3 px-6">
              <AiPhoneNumberPill {...(businessId ? { businessId } : {})} />
              <FeedbackWidget
                className="pointer-events-auto"
                {...(businessId ? { businessId } : {})}
              />
            </div>
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
