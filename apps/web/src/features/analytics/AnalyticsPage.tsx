import type { Id } from "../../../../../convex/_generated/dataModel";
import { Analytics } from "@/features/home/components/analytics";
import { UnitEconomics } from "@/features/analytics/components/unit-economics";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { useTranslation } from "react-i18next";

type AnalyticsPageProps = {
  businessId?: Id<"businesses">;
};

export function AnalyticsPage({ businessId }: AnalyticsPageProps) {
  const { t } = useTranslation("dashboard");

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
      <UnitEconomics businessId={businessId} />
    </section>
  );
}
