import type { Id } from "../../../../../convex/_generated/dataModel";
import { Analytics } from "@/features/home/components/analytics";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";

type AnalyticsPageProps = {
  businessId?: Id<"businesses">;
};

export function AnalyticsPage({ businessId }: AnalyticsPageProps) {
  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title="Analytics" />
      <Analytics businessId={businessId} />
    </section>
  );
}
