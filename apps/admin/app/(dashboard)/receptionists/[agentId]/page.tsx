import { ReceptionistOverviewSurface } from "@/components/receptionists/overview-surface";

export default async function ReceptionistOverviewPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistOverviewSurface agentId={agentId} />;
}
