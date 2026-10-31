"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GiftIcon } from "lucide-react";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranding } from "./branding-provider";
import { useBusinessCan } from "./business-capabilities-provider";
import { MOBILE_UTILITY_SLOT_ID } from "./site-header";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { DashboardTestCallWidget } from "./dashboard-test-call-widget";
import { DashboardFeedbackWidget } from "./dashboard-feedback-widget";
import { DashboardAbandonIntent } from "./dashboard-abandon-intent";


export function DashboardUtilityBar() {
  const { t } = useTranslation("nav");
  const { t: tCommon } = useTranslation("common");
  const { businesses, business } = useActiveBusiness();
  const can = useBusinessCan();
  // The host's affiliate program stays on the host's domain: a partner's businesses never get the host's marketing.
  const { partner } = useBranding();
  const isMobile = useIsMobile();
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setMobileSlot(isMobile ? document.getElementById(MOBILE_UTILITY_SLOT_ID) : null); }, [isMobile]);
  // The bar needs a business, but it holds its place while the businesses load, so it doesn't pop in.
  if (!business && !businesses.isLoading) return null;
  const items = !business ? (
    <>
      {can("setup") ? <>
        <div aria-hidden="true" className="hidden items-center md:flex">
          <Skeleton className="inline-flex h-8 items-center gap-1 rounded-4xl border border-transparent px-3 text-sm font-medium whitespace-nowrap">
            <span className="invisible size-4 shrink-0" />
            <span className="invisible">{tCommon("testCall.trigger")}</span>
          </Skeleton>
        </div>
        <span aria-hidden="true" className="ml-3 mr-2.5 hidden h-4 w-px bg-border md:block" />
      </> : null}
      {partner ? null : <Skeleton aria-hidden="true" className="size-6 rounded-md" />}
      <Skeleton aria-hidden="true" className="size-6 rounded-md" />
      <Skeleton aria-hidden="true" className="size-6 rounded-md" />
    </>
  ) : (
    <>
        {/* The test call tries out the receptionist's setup, which an activity-only business leaves to its partner. */}
        {can("setup") ? <>
          <DashboardTestCallWidget className="pointer-events-auto md:flex" businessId={business.businessId} businessSlug={business.slug} />
          {/* mr is smaller than ml because the icon button's own padding adds the rest of the visible gap. */}
          <span aria-hidden="true" className="ml-3 mr-2.5 hidden h-4 w-px bg-border md:block" />
        </> : null}
        {partner ? null : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t("items.affiliate")}
                  role="link"
                  className="pointer-events-auto text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground"
                  nativeButton={false}
                  render={<Link href="/affiliate" />}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              <GiftIcon className="size-[18px] -translate-x-px" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>{t("items.affiliate")}</TooltipContent>
          </Tooltip>
        )}
        <DashboardFeedbackWidget className="pointer-events-auto flex" businessId={business.businessId} />
    </>
  );
  return (
    <>
    {business ? <DashboardAbandonIntent businessId={business.businessId} /> : null}
    {mobileSlot
      ? createPortal(items, mobileSlot)
      : (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-40 hidden md:block">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-0.5 px-6">{items}</div>
        </div>
      )}
    </>
  );
}
