"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentRulesPage } from "@/features/agent/AgentRulesPage";

export default function AgentRulesRoutePage() {
  return (
    <WorkspaceShell>
      <AgentLayout>
        <AgentRulesPage />
      </AgentLayout>
    </WorkspaceShell>
  );
}
