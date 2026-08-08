"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsBillingUsagePage } from "@/features/settings/SettingsBillingPage";

export default function SettingsUsageRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsBillingUsagePage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
