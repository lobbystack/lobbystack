"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GiftIcon } from "lucide-react";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIsMobile } from "@/hooks/use-mobile";
import { MOBILE_UTILITY_SLOT_ID } from "./site-header";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { DashboardTestCallWidget } from "./dashboard-test-call-widget";
import { DashboardFeedbackWidget } from "./dashboard-feedback-widget";
import { DashboardAbandonIntent } from "./dashboard-abandon-intent";


export function DashboardUtilityBar() {
  const { t } = useTranslation("nav");
  const { business } = useActiveBusiness();
  const isMobile = useIsMobile();
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setMobileSlot(isMobile ? document.getElementById(MOBILE_UTILITY_SLOT_ID) : null); }, [isMobile]);
  if (!business) return null;
  const items = (
    <>
        <DashboardTestCallWidget className="pointer-events-auto flex" businessId={business.businessId} businessSlug={business.slug} />
        {/* mr is smaller than ml because the icon button's own padding adds the rest of the visible gap. */}
        <span aria-hidden="true" className="ml-3 mr-2.5 h-4 w-px bg-border" />
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
        <DashboardFeedbackWidget className="pointer-events-auto flex" businessId={business.businessId} />
    </>
  );
  return (
    <>
    <DashboardAbandonIntent businessId={business.businessId} />
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
