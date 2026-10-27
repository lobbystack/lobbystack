"use client";

import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSignOut } from "@/hooks/use-sign-out";
import { cn } from "@/lib/utils";

/**
 * What a signed-in person with no business on a partner's domain sees: the
 * partner hasn't added them to one. A partner's domain makes no direct
 * business, so there's no onboarding to start, only an invitation to wait for
 * or another account to sign in with. A business the partner released runs
 * on the host's dashboard, which `hostUrl` names when they have one there.
 */
export function NoBusinessesSurface({ email, hostUrl = null }: { email: string; hostUrl?: string | null }) {
  const { t } = useTranslation("onboarding");
  const signOut = useSignOut();
  return (
    <ReplacementOnboardingShell
      description={t(hostUrl ? "noBusinesses.released" : "noBusinesses.description", { email })}
      icon={<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Building2 className="size-5" /></span>}
      progress={null}
      title={t("noBusinesses.title")}
      width="sm"
    >
      <div className="flex flex-col gap-3">
        {hostUrl ? <a className={cn(buttonVariants(), "h-11 w-full")} href={hostUrl}>{t("noBusinesses.openDashboard")}</a> : null}
        <Button className="h-11 w-full" onClick={() => void signOut()} type="button" variant="outline">{t("noBusinesses.switchAccount")}</Button>
      </div>
    </ReplacementOnboardingShell>
  );
}
