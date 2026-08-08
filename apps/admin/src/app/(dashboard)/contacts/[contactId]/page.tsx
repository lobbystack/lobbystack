"use client";

import { use } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { ContactDetailPage } from "@/features/contacts/ContactDetailPage";

export default function ContactDetailRoutePage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = use(params);
  return (
    <WorkspaceShell>
      <ContactDetailPage />
    </WorkspaceShell>
  );
}
