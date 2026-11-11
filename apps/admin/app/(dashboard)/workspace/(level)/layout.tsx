import { WorkspaceLevelShell } from "@/components/settings-level-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceLevelShell>{children}</WorkspaceLevelShell>;
}
