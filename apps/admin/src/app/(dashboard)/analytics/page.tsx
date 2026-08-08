"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";

export default function AnalyticsRoutePage() {
  return (
    <WorkspaceShell>
      <AnalyticsPage />
    </WorkspaceShell>
  );
}
