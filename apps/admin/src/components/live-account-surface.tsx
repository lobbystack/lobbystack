"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AccountPasskeys } from "./account-passkeys";
import { AccountSecurityForms } from "./account-security-forms";
import { AccountSkeleton } from "./loading-skeletons";
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
  return <PageSurface title={t("account.title")}><div className="w-full">{account.isLoading ? <AccountSkeleton label={t("account.loading")} /> : account.isError || !account.data ? <p className="text-sm text-destructive">Account data is unavailable.</p> : <div className="flex flex-col gap-8"><AccountSecurityForms currentEmail={account.data.user.email} /><AccountPasskeys businessName={(account.data.businesses.find((business) => business.active) ?? account.data.businesses[0])?.name} /></div>}</div></PageSurface>;
}
