"use client";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { DashboardAbandonIntent } from "@/components/dashboard-abandon-intent";
import { SearchDialog } from "@/components/search/search-dialog";
import { TestWindow } from "@/components/test-window";
import { useActiveBusiness } from "@/hooks/use-active-business";

/**
 * What the dashboard keeps mounted with no place of its own: the test window
 * behind every Test call button, search behind the sidebar's button and ⌘K,
 * and the "Before you go" survey.
 */
export function ShellRuntime() {
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  if (!business) return null;
  return (
    <>
      <DashboardAbandonIntent businessId={business.businessId} />
      <SearchDialog businessId={business.businessId} />
      {/* A test call tries out the agent's setup, which an activity-only business leaves to its partner. */}
      {can("setup") ? <TestWindow businessId={business.businessId} businessSlug={business.slug} trigger={false} /> : null}
    </>
  );
}
