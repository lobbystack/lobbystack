import { LiveContactDetailSurface } from "@/components/live-contact-detail-surface";

export default async function ContactDetailPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return <LiveContactDetailSurface contactId={contactId} />;
}
