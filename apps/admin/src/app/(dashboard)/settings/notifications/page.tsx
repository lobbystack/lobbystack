"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsNotificationsPage } from "@/features/settings/SettingsNotificationsPage";

export default function SettingsNotificationsRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsNotificationsPage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
