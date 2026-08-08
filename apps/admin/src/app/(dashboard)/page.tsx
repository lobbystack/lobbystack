"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { HomePage } from "@/features/home/HomePage";

export default function DashboardHomePage() {
  return (
    <WorkspaceShell>
      <HomePage />
    </WorkspaceShell>
  );
}
