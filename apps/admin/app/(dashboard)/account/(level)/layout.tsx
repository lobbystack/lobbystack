import { AccountLevelShell } from "@/components/settings-level-shell";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountLevelShell>{children}</AccountLevelShell>;
}
