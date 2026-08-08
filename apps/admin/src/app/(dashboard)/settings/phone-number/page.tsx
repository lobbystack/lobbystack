"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsPhoneNumberPage } from "@/features/settings/SettingsPhoneNumberPage";

export default function SettingsPhoneNumberRoutePage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsPhoneNumberPage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
