import { ReceptionistKnowledgeSurface } from "@/components/receptionists/knowledge-surface";

export default async function ReceptionistKnowledgePage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <ReceptionistKnowledgeSurface agentId={agentId} />;
}
