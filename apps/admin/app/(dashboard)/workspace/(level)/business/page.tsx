"use client";

import { WorkspaceBusinessSection } from "@/components/workspace-business-section";
import { useManagedBusiness } from "@/hooks/use-agent-settings";

export default function WorkspaceBusinessPage() {
  const { businessId, canManage } = useManagedBusiness();
  return <WorkspaceBusinessSection businessId={businessId} canManage={canManage} heading={false} />;
}
