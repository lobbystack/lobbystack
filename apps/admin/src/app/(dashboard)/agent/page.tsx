"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentBasicSettingsPage } from "@/features/agent/AgentBasicSettingsPage";

export default function AgentIndexPage() {
  return (
    <WorkspaceShell>
      <AgentLayout>
        <AgentBasicSettingsPage />
      </AgentLayout>
    </WorkspaceShell>
  );
}
