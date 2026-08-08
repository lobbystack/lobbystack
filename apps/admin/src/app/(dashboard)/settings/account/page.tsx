"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsAccountPage } from "@/features/settings/SettingsAccountPage";

export default function SettingsAccountRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsAccountPage />
    </WorkspaceShell>
  );
}
