"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsBusinessPage } from "@/features/settings/SettingsBusinessPage";

export default function SettingsTeamPage() {
  return (
    <WorkspaceShell>
      <SettingsLayout>
        <SettingsBusinessPage />
      </SettingsLayout>
    </WorkspaceShell>
  );
}
