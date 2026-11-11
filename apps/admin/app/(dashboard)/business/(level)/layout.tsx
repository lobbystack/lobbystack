import { BusinessLevelShell } from "@/components/settings-level-shell";

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <BusinessLevelShell>{children}</BusinessLevelShell>;
}
