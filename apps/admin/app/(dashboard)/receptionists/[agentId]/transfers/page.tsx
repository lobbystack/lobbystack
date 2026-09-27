import { ReceptionistTransfersSurface } from "@/components/receptionists/transfers-surface";

export default async function ReceptionistTransfersPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistTransfersSurface agentId={agentId} />;
}
