"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { IntegrationsPage } from "@/features/settings/IntegrationsPage";

export default function IntegrationsRoutePage() {
  return (
    <WorkspaceShell>
      <IntegrationsPage />
    </WorkspaceShell>
  );
}
