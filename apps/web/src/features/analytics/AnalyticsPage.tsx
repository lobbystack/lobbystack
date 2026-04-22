import { useMutation } from "convex/react";
import { useEffect } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Analytics } from "@/features/home/components/analytics";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("dashboard");
  const refreshUnitEconomicsMonth = useMutation(api.unitEconomics.refreshMonth);

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
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader
        title={t("analyticsPage.title")}
        description={t("analyticsPage.description")}
      />
      <Analytics businessId={businessId} />
    </section>
  );
}
