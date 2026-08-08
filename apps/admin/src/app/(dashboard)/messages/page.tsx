"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { MessagesPage } from "@/features/messages/MessagesPage";

export default function MessagesRoutePage() {
  return (
    <WorkspaceShell>
      <MessagesPage />
    </WorkspaceShell>
  );
}
