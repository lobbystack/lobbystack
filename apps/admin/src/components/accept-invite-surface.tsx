"use client";

import { readPublicAuthSession } from "@/lib/public-auth-session";

import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";

type Invitation = { businessName: string; email: string; expired: boolean; status: string };

export function AcceptInviteSurface() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextToken = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
    setToken(nextToken);
    const sessionController = new AbortController();
    void readPublicAuthSession(sessionController.signal).then((session) => setIsAuthenticated(Boolean(session?.user))).catch(() => undefined);
    if (!nextToken) return () => sessionController.abort();
    setIsPreviewLoading(true);
    void fetch(`/api/team/accept?token=${encodeURIComponent(nextToken)}`)
      .then(async (response) => response.ok ? await response.json() as { invitation: Invitation | null } : { invitation: null })
      .then((result) => setInvitation(result.invitation))
      .catch(() => setInvitation(null))
      .finally(() => setIsPreviewLoading(false));
    return () => sessionController.abort();
  }, []);

  const isInvitationValid = Boolean(invitation && invitation.status === "pending" && !invitation.expired && invitation.businessName);
  const returnPath = `/accept-invite${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(returnPath)}`;
  const signupHref = `/signup?returnTo=${encodeURIComponent(returnPath)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAuthenticated) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/team/accept", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error();
      toast.success(t("acceptInvite.success", { businessName: invitation?.businessName ?? t("acceptInvite.workspaceFallback") }));
      router.replace("/settings/team");
      router.refresh();
    } catch {
      setErrorMessage(t("acceptInvite.failed"));
      setIsSubmitting(false);
    }
  }

  let description = t("acceptInvite.invalidLink");
  if (isPreviewLoading) description = t("acceptInvite.loading");
  else if (invitation?.expired) description = t("acceptInvite.expired");
  else if (isInvitationValid) description = t("acceptInvite.subtitle", { businessName: invitation!.businessName, email: invitation!.email });

  return <div data-ph-no-capture><ReplacementOnboardingShell description={description} progress={null} title={t("acceptInvite.title")} width="sm"><div className="flex flex-col gap-6">
    {errorMessage ? <p className="text-center text-sm text-destructive">{errorMessage}</p> : null}
    {isAuthenticated ? <form className="flex flex-col" onSubmit={submit}><Button className="h-11 w-full" disabled={!isInvitationValid || isSubmitting || isPreviewLoading} loading={isSubmitting} loadingLabel={t("acceptInvite.submitting")} type="submit">{t("acceptInvite.submit")}</Button></form> : <div className="flex flex-col gap-3">
      <Button className="h-11 w-full" role="link" nativeButton={false} render={<Link href={loginHref} />}>{t("acceptInvite.signIn")}</Button>
      <Button className="h-11 w-full" role="link" nativeButton={false} render={<Link href={signupHref} />} variant="outline">{t("acceptInvite.createAccount")}</Button>
    </div>}
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={isAuthenticated ? "/settings/team" : "/login"}>{isAuthenticated ? t("acceptInvite.backToSettings") : t("acceptInvite.backToLogin")}</Link></p>
  </div></ReplacementOnboardingShell></div>;
}
