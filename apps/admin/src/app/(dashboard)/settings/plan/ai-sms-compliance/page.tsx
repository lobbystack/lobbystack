"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsBillingCompliancePage } from "@/features/settings/SettingsBillingPage";

export default function SettingsPlanComplianceRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsBillingCompliancePage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
