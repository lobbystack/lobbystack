"use client";

import { readPublicAuthSession } from "@/lib/public-auth-session";

import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { PackageSubscriptionStatus } from "@lobbystack/shared";

import { useBranding } from "./branding-provider";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";
import { useSignOut } from "@/hooks/use-sign-out";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { rememberInvitedEmail } from "@/lib/invited-email";
import { intlLocale, resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

/** The package the invited owner pays their partner for, without its price, which only Stripe's checkout shows. canPay is false while the checkout can't open. */
type Payment = { packageName: string; allowance: { voiceMinutes: number; chats: number }; status: PackageSubscriptionStatus; canPay: boolean };
type Invitation = { businessName: string; email: string; expired: boolean; status: string; payment?: Payment | null };

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
  // Where Stripe sent the owner back from the package's checkout: complete or canceled.
  const [checkout, setCheckout] = useState<string | null>(null);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const signOut = useSignOut();
  // A partner's domain opens only the partner's businesses, whose team page an activity-only operator can't open.
  const { partner } = useBranding();
  const signedInHome = partner ? "/" : "/settings/team";

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const nextToken = search.get("token")?.trim() ?? "";
    setToken(nextToken);
    setCheckout(search.get("checkout"));
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
  const payment = isInvitationValid ? invitation?.payment ?? null : null;
  // Stripe sends the owner back before its webhook arrives, so a finished checkout counts as paid here.
  const paid = checkout === "complete";
  // A package the partner can't sell yet waits: the owner signs in now, and the business stays off until it pays.
  const needsPayment = Boolean(payment?.canPay && !paid && (payment.status === "awaiting_payment" || payment.status === "inactive"));
  const returnPath = `${localizePublicPath("/accept-invite", locale)}${token ? `?token=${encodeURIComponent(token)}${paid ? "&checkout=complete" : ""}` : ""}`;
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
      if (!response.ok) {
        // Someone on the business's partner's team works in it through the partner console instead of joining.
        const refused = await response.json().catch(() => null) as { code?: string } | null;
        if (refused?.code === "partner_member_not_on_team") {
          setErrorMessage(t("acceptInvite.partnerMember", { businessName: invitation?.businessName ?? t("acceptInvite.workspaceFallback") }));
          setIsSubmitting(false);
          return;
        }
        throw new Error();
      }
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

  async function openCheckout() {
    if (!token) return;
    setIsOpeningCheckout(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/team/accept/checkout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json().catch(() => null) as { url?: string; code?: string } | null;
      if (!response.ok || !result?.url) throw Object.assign(new Error(), { code: result?.code });
      window.location.assign(result.url);
    } catch (error) {
      setErrorMessage(t((error as { code?: string }).code === "payments_unavailable" ? "acceptInvite.payment.unavailable" : "acceptInvite.payment.failed"));
      setIsOpeningCheckout(false);
    }
  }

  const count = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);
  const offer = payment ? (
    <div className="flex flex-col gap-2 rounded-xl border px-4 py-4 text-sm">
      <p className="font-medium">{payment.packageName}</p>
      <p className="text-muted-foreground">{t("acceptInvite.payment.allowance", { minutes: t("acceptInvite.payment.minutes", { count: payment.allowance.voiceMinutes, amount: count(payment.allowance.voiceMinutes) }), chats: t("acceptInvite.payment.chats", { count: payment.allowance.chats, amount: count(payment.allowance.chats) }) })}</p>
    </div>
  ) : null;

  let description = t("acceptInvite.invalidLink");
  if (isPreviewLoading) description = t("acceptInvite.loading");
  else if (invitation?.expired) description = t("acceptInvite.expired");
  else if (needsPayment) description = t("acceptInvite.payment.subtitle", { businessName: invitation!.businessName });
  else if (payment && paid) description = t("acceptInvite.payment.paid", { businessName: invitation!.businessName });
  else if (isInvitationValid) description = t("acceptInvite.subtitle", { businessName: invitation!.businessName, email: invitation!.email });

  // A link that can't be accepted offers no button, only the way back.
  const closed = !isPreviewLoading && !isInvitationValid && !needsPayment && !(payment && paid);

  return <div className="ph-no-capture"><ReplacementOnboardingShell description={description} progress={null} title={t("acceptInvite.title")} width="sm"><div className="flex flex-col gap-6">
    {errorMessage ? <p className="text-center text-sm text-destructive">{errorMessage}</p> : null}
    {needsPayment ? <div className="flex flex-col gap-4">
      {offer}
      <Button className="h-11 w-full" disabled={isOpeningCheckout} loading={isOpeningCheckout} loadingLabel={t("acceptInvite.payment.opening")} onClick={() => void openCheckout()}>{t("acceptInvite.payment.pay")}</Button>
      <p className="text-center text-sm text-muted-foreground">{t("acceptInvite.payment.then")}</p>
    </div> : closed ? null : isAuthenticated && wrongAccount ? <Button className="h-11 w-full" onClick={() => void signOut(loginHref)}>{t("acceptInvite.switchAccount")}</Button> : isAuthenticated ? <form className="flex flex-col" onSubmit={submit}><Button className="h-11 w-full" disabled={!isInvitationValid || isSubmitting || isPreviewLoading} loading={isSubmitting} loadingLabel={t("acceptInvite.submitting")} type="submit">{t("acceptInvite.submit")}</Button></form> : <div className="flex flex-col gap-3">
      <Button className="h-11 w-full" onClick={() => rememberInvitedEmail(invitation?.email)} role="link" nativeButton={false} render={<Link href={loginHref} />}>{t("acceptInvite.signIn")}</Button>
      <Button className="h-11 w-full" onClick={() => rememberInvitedEmail(invitation?.email)} role="link" nativeButton={false} render={<Link href={signupHref} />} variant="outline">{t("acceptInvite.createAccount")}</Button>
    </div>}
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={isAuthenticated ? signedInHome : localizePublicPath("/login", locale)}>{isAuthenticated ? t(partner ? "acceptInvite.backToDashboard" : "acceptInvite.backToSettings") : t("acceptInvite.backToLogin")}</Link></p>
  </div></ReplacementOnboardingShell></div>;
}
