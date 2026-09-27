import { ReceptionistBookingSurface } from "@/components/receptionists/booking-surface";

export default async function ReceptionistBookingPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistBookingSurface agentId={agentId} />;
}
