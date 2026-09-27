import { ReceptionistNumbersSurface } from "@/components/receptionists/numbers-surface";

export default async function ReceptionistNumbersPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistNumbersSurface agentId={agentId} />;
}
