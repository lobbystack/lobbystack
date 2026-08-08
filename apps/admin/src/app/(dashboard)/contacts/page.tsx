"use client";

import { WorkspaceShell } from "@/components/workspace-shell";
import { ContactsPage } from "@/features/contacts/ContactsPage";

export default function ContactsRoutePage() {
  return (
    <WorkspaceShell>
      <ContactsPage />
    </WorkspaceShell>
  );
}
