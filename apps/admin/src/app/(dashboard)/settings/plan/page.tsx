"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsBillingPage } from "@/features/settings/SettingsBillingPage";

export default function SettingsPlanRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsBillingPage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
