"use client";

import { readPublicAuthSession } from "@/lib/public-auth-session";

import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useBranding } from "./branding-provider";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";
import { useSignOut } from "@/hooks/use-sign-out";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

type Invitation = { businessName: string; email: string; expired: boolean; status: string };

export function AcceptInviteSurface() {
  const { t, i18n } = useTranslation("auth");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const router = useRouter();
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);
  const signOut = useSignOut();
  // A partner's domain opens only the partner's businesses, whose team page an activity-only operator can't open.
  const { partner } = useBranding();
  const signedInHome = partner ? "/" : "/settings/team";

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
  const returnPath = `${localizePublicPath("/accept-invite", locale)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const loginHref = buildAuthPathWithReturnTo("/login", returnPath, locale);
  const signupHref = buildAuthPathWithReturnTo("/signup", returnPath, locale);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAuthenticated) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/team/accept", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (response.status === 403) {
        // The signed-in account is not the invited address, or that address is not verified yet.
        setWrongAccount(true);
        setErrorMessage(t("acceptInvite.wrongAccount", { email: invitation?.email ?? "" }));
        setIsSubmitting(false);
        return;
      }
      if (!response.ok) throw new Error();
      const joined = await response.json().catch(() => null) as { partnerId?: string | null } | null;
      toast.success(t("acceptInvite.success", { businessName: invitation?.businessName ?? t("acceptInvite.workspaceFallback") }));
      // Someone joining a partner's business, such as its owner, lands in it, and onboarding starts there if it hasn't finished.
      router.replace(joined?.partnerId ? "/" : "/settings/team");
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

  return <div className="ph-no-capture"><ReplacementOnboardingShell description={description} progress={null} title={t("acceptInvite.title")} width="sm"><div className="flex flex-col gap-6">
    {errorMessage ? <p className="text-center text-sm text-destructive">{errorMessage}</p> : null}
    {isAuthenticated && wrongAccount ? <Button className="h-11 w-full" onClick={() => void signOut(loginHref)}>{t("acceptInvite.switchAccount")}</Button> : isAuthenticated ? <form className="flex flex-col" onSubmit={submit}><Button className="h-11 w-full" disabled={!isInvitationValid || isSubmitting || isPreviewLoading} loading={isSubmitting} loadingLabel={t("acceptInvite.submitting")} type="submit">{t("acceptInvite.submit")}</Button></form> : <div className="flex flex-col gap-3">
      <Button className="h-11 w-full" role="link" nativeButton={false} render={<Link href={loginHref} />}>{t("acceptInvite.signIn")}</Button>
      <Button className="h-11 w-full" role="link" nativeButton={false} render={<Link href={signupHref} />} variant="outline">{t("acceptInvite.createAccount")}</Button>
    </div>}
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={isAuthenticated ? signedInHome : localizePublicPath("/login", locale)}>{isAuthenticated ? t(partner ? "acceptInvite.backToDashboard" : "acceptInvite.backToSettings") : t("acceptInvite.backToLogin")}</Link></p>
  </div></ReplacementOnboardingShell></div>;
}
