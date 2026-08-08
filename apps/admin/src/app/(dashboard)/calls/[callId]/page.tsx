"use client";

import { use } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { CallDetailPage } from "@/features/calls/CallDetailPage";

export default function CallDetailRoutePage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = use(params);
  return (
    <WorkspaceShell>
      <CallDetailPage />
    </WorkspaceShell>
  );
}
