"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SetupGuidePage } from "@/features/setup/SetupGuidePage";

export default function SetupGuideRoutePage() {
  return (
    <WorkspaceShell>
      <SetupGuidePage />
    </WorkspaceShell>
  );
}
