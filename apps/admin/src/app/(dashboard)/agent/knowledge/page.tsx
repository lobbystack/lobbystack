"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentKnowledgePage } from "@/features/agent/AgentKnowledgePage";

export default function AgentKnowledgeRoutePage() {
  return (
    <WorkspaceShell>
      <AgentLayout>
        <AgentKnowledgePage section="knowledge" />
      </AgentLayout>
    </WorkspaceShell>
  );
}
