"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PartnerRole } from "@lobbystack/shared";
import { SwitchAccountButton } from "@/components/partner-signup-surface";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/request-json";

export type PartnerInvitationPreview = { partnerName: string; email: string; role: PartnerRole };

const ACCEPT_ERRORS: Record<string, string> = {
  wrong_account: "acceptInvite.wrongAccount",
  invitation_stale: "acceptInvite.stale",
  invitation_invalid: "acceptInvite.used",
  not_found: "acceptInvite.invalid",
};

/** Joining a partner's team from an invitation link, signed in. */
export function PartnerAcceptInviteSurface({ invitation, state, token, returnTo }: { invitation: PartnerInvitationPreview | null; state: "valid" | "invalid" | "expired" | "used"; token: string; returnTo: string }) {
  const { t } = useTranslation("partner");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);
  const accept = useMutation({
    mutationFn: () => requestJson<{ partnerId: string }>("/api/partner/team/accept", { method: "POST", body: JSON.stringify({ token }) }),
    onSuccess: (result) => {
      toast.success(t("acceptInvite.success", { partnerName: invitation?.partnerName ?? "" }));
      router.replace(`/partner/${result.partnerId}/businesses`);
      router.refresh();
    },
    onError: (failure: Error & { code?: string }) => {
      setWrongAccount(failure.code === "wrong_account");
      setError(t(ACCEPT_ERRORS[failure.code ?? ""] ?? "acceptInvite.failed", { email: invitation?.email ?? "" }));
    },
  });

  if (state !== "valid" || !invitation) {
    return <ReplacementOnboardingShell description={t(`acceptInvite.${state === "valid" ? "invalid" : state}`)} progress={null} title={invitation ? t("acceptInvite.title", { partnerName: invitation.partnerName }) : t("acceptInvite.genericTitle")} width="sm"><span /></ReplacementOnboardingShell>;
  }
  return (
    <ReplacementOnboardingShell description={t("acceptInvite.description", { email: invitation.email, role: t(`roles.${invitation.role}`) })} progress={null} title={t("acceptInvite.title", { partnerName: invitation.partnerName })} width="sm">
      <div className="flex flex-col gap-6">
        {error ? <p className="text-center text-sm text-destructive" role="alert">{error}</p> : null}
        {wrongAccount ? <SwitchAccountButton returnTo={returnTo} /> : <Button className="h-11 w-full" loading={accept.isPending} loadingLabel={t("acceptInvite.submitting")} onClick={() => { setError(null); accept.mutate(); }}>{t("acceptInvite.submit")}</Button>}
      </div>
    </ReplacementOnboardingShell>
  );
}
