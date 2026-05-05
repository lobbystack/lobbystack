
import { useEffect } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Analytics } from "@/features/home/components/analytics";

import { useObservedMutation } from "@/lib/observed-convex";
type AnalyticsPageProps = {
  businessId?: Id<"businesses">;
};

type UnitEconomicsRefreshState = {
  phase: "calls" | "notifications" | "conversations" | "telemetry" | "finalize";
  callsCursor?: string;
  notificationsCursor?: string;
  messagesCursor?: string;
  outboxCursor?: string;
};

export function AnalyticsPage({ businessId }: AnalyticsPageProps) {
  const refreshUnitEconomicsMonth = useObservedMutation(api.unitEconomics.refreshMonth);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    let cancelled = false;

    const ensureCurrentMonthRollup = async () => {
      let state: UnitEconomicsRefreshState | undefined;

      for (let attempt = 0; attempt < 200 && !cancelled; attempt += 1) {
        const result = await refreshUnitEconomicsMonth({
          businessId,
          ...(state ? { state } : {}),
        });

        if (result.done) {
          return;
        }

        state = result.state;
      }
    };

    void ensureCurrentMonthRollup();

    return () => {
      cancelled = true;
    };
  }, [businessId, refreshUnitEconomicsMonth]);

  if (!businessId) {
    return null;
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <Analytics businessId={businessId} />
    </section>
  );
}
