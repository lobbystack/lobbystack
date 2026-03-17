import type { Id } from "../../../../../convex/_generated/dataModel";
import { Analytics } from "@/features/home/components/analytics";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";

type AnalyticsPageProps = {
  businessId?: Id<"businesses">;
};

export function AnalyticsPage({ businessId }: AnalyticsPageProps) {
  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
      </div>
      <Analytics businessId={businessId} />
    </section>
  );
}
