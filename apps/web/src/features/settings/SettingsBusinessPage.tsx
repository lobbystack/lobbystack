import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { BusinessHoursForm } from "@/features/settings/BusinessHoursForm";
import { BookableTeamCard } from "@/features/settings/BookableTeamCard";
import { BusinessProfileForm } from "@/features/settings/BusinessProfileForm";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { PhoneNumbersCard } from "@/features/settings/PhoneNumbersCard";
import { ServicesCard } from "@/features/settings/ServicesCard";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
};

export function SettingsBusinessPage({ businessId, snapshot }: SettingsBusinessPageProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="flex flex-col gap-6">
        <BusinessProfileForm businessId={businessId} />
        <PhoneNumbersCard businessId={businessId} />
        <BusinessHoursForm businessId={businessId} />
        <ServicesCard businessId={businessId} />
        <BookableTeamCard businessId={businessId} />
      </div>
      <div className="flex flex-col gap-6">
        <BusinessSnapshotCard snapshot={snapshot} />
      </div>
    </div>
  );
}
