import { LivePhoneNumberSettingsSurface } from "@/components/live-phone-number-settings-surface";

export default async function AgentPhoneNumberPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <LivePhoneNumberSettingsSurface agentId={(await params).agentId} />;
}
