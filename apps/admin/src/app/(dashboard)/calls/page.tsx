"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { CallsPage } from "@/features/calls/CallsPage";

export default function CallsRoutePage() {
  return (
    <WorkspaceShell>
      <CallsPage />
    </WorkspaceShell>
  );
}
