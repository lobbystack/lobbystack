"use client";

import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/use-sign-out";

/**
 * What a signed-in person with no business on a partner's domain sees: the
 * partner hasn't added them to one. A partner's domain makes no direct
 * business, so there's no onboarding to start, only an invitation to wait for
 * or another account to sign in with.
 */
export function NoBusinessesSurface({ email }: { email: string }) {
  const { t } = useTranslation("onboarding");
  const signOut = useSignOut();
  return (
    <ReplacementOnboardingShell
      description={t("noBusinesses.description", { email })}
      icon={<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Building2 className="size-5" /></span>}
      progress={null}
      title={t("noBusinesses.title")}
      width="sm"
    >
      <Button className="h-11 w-full" onClick={() => void signOut()} type="button" variant="outline">{t("noBusinesses.switchAccount")}</Button>
    </ReplacementOnboardingShell>
  );
}
