"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { DashboardAbandonIntent } from "@/components/dashboard-abandon-intent";
import { SearchDialog } from "@/components/search/search-dialog";
import { MOBILE_UTILITY_SLOT_ID } from "@/components/site-header";
import { TestWindow } from "@/components/test-window";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIsMobile } from "@/hooks/use-mobile";
import { HelpMenu } from "./help-menu";

/**
 * What the dashboard keeps mounted with no place of its own: the test window
 * behind every Test call button, search behind the sidebar's button and ⌘K,
 * the "Before you go" survey and, on phones, the help menu in the header.
 */
export function ShellRuntime() {
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const isMobile = useIsMobile();
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setMobileSlot(isMobile ? document.getElementById(MOBILE_UTILITY_SLOT_ID) : null); }, [isMobile]);
  if (!business) return null;
  return (
    <>
      <DashboardAbandonIntent businessId={business.businessId} />
      <SearchDialog businessId={business.businessId} />
      {/* A test call tries out the agent's setup, which an activity-only business leaves to its partner. */}
      {can("setup") ? <TestWindow businessId={business.businessId} businessSlug={business.slug} trigger={false} /> : null}
      {mobileSlot ? createPortal(<HelpMenu side="bottom" />, mobileSlot) : null}
    </>
  );
}
