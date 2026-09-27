import { ReceptionistBehaviorSurface } from "@/components/receptionists/behavior-surface";

export default async function ReceptionistBehaviorPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistBehaviorSurface agentId={agentId} />;
}
