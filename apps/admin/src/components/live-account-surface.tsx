"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AccountSecurityForms } from "./account-security-forms";
import { PageSurface } from "./page-surface";

type Account = { user: { id: string; name?: string | null; email?: string | null }; session: { id: string; expiresAt: string }; businesses: Array<{ businessId: string; name: string; role: string; active: boolean }> };

async function getAccount(): Promise<Account> {
  const response = await fetch("/api/account", { credentials: "include" });
  if (!response.ok) throw new Error("Account data is unavailable.");
  return await response.json() as Account;
}

export function LiveAccountSurface() {
  const { t } = useTranslation("settings");
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });
  return <PageSurface title={t("account.title")} description=""><div className="w-full">{account.isLoading ? <p className="text-sm text-muted-foreground">Loading account...</p> : account.isError || !account.data ? <p className="text-sm text-destructive">Account data is unavailable.</p> : <AccountSecurityForms currentEmail={account.data.user.email} />}</div></PageSurface>;
}
