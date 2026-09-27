import { LiveAppointmentsSurface } from "@/components/live-appointments-surface";
import { redirectLegacyPage, searchString } from "@/lib/navigation-server";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirectLegacyPage("/appointments", searchString(await searchParams));
  return <LiveAppointmentsSurface />;
}
