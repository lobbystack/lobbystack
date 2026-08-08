"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentServicesPage } from "@/features/agent/AgentServicesPage";

export default function AgentServicesRoutePage() {
  return (
    <WorkspaceShell>
      <AgentLayout>
        <AgentServicesPage />
      </AgentLayout>
    </WorkspaceShell>
  );
}
