import { LiveCallDetailSurface } from "@/components/live-call-detail-surface";

export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <LiveCallDetailSurface callId={callId} />;
}
