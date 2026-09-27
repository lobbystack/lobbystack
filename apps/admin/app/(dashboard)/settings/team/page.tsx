import { LiveTeamSurface } from "@/components/live-team-surface";
import { StaffSettingsCard } from "@/components/receptionists/staff-surface";

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6">
      <StaffSettingsCard />
      <LiveTeamSurface />
    </div>
  );
}
