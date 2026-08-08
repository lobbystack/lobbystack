"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsAppearancePage } from "@/features/settings/SettingsAppearancePage";

export default function SettingsAppearanceRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsAppearancePage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
