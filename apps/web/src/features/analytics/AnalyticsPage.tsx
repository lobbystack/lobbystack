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
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
      </div>
      <Analytics businessId={businessId} />
    </section>
  );
}
