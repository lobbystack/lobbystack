"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { partnerSlugFromName } from "@lobbystack/shared";
import { useBranding } from "@/components/branding-provider";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { useSignOut } from "@/hooks/use-sign-out";
import { buildAuthPathWithReturnTo, buildPartnerAuthPath, buildPartnerConsoleLoginPath, buildPartnerLoginPath } from "@/lib/auth-return-to";
import { rememberInvitedEmail } from "@/lib/invited-email";
import { resolveLocale } from "@/lib/locale";
import { recordPendingPartnerSignup } from "@/lib/partner-analytics";
import { requestJson } from "@/lib/request-json";

/** Why the signup form can't be used, if it can't. */
export type PartnerSignupBlock = "inviteOnly" | "invitationInvalid" | "invitationUsed" | "wrongAccount";

/**
 * What a signed-out visitor sees on a team invitation: a way to sign in or
 * make an account that brings them back to the same link.
 */
export function PartnerSignedOutSurface({ page, returnTo, values = {} }: { page: "acceptInvite"; returnTo: string; values?: Record<string, string> }) {
  const { t, i18n } = useTranslation("partner");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  // White Label's own pages on the host's domain; a partner's host has only the dashboard's.
  const onPartnerHost = useBranding().partner !== null;
  const signIn = buildPartnerConsoleLoginPath(onPartnerHost, returnTo, locale);
  const signUp = onPartnerHost ? buildAuthPathWithReturnTo("/signup", returnTo, locale) : buildPartnerAuthPath("/signup", returnTo);
  return (
    <ReplacementOnboardingShell description={t(`signedOut.${page}`, values)} progress={null} title={t(`${page}.title`, values)} width="sm">
      <div className="flex flex-col gap-3">
        <Button className="h-11 w-full" nativeButton={false} onClick={() => rememberInvitedEmail(values.email)} render={<Link href={signIn} />} role="link">{t("signedOut.signIn")}</Button>
        <Button className="h-11 w-full" nativeButton={false} onClick={() => rememberInvitedEmail(values.email)} render={<Link href={signUp} />} role="link" variant="outline">{t("signedOut.createAccount")}</Button>
      </div>
    </ReplacementOnboardingShell>
  );
}

/** The button that signs out of the wrong account and comes back to the same link signed in as another. */
export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
  const { t, i18n } = useTranslation("partner");
  const signOut = useSignOut();
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const onPartnerHost = useBranding().partner !== null;
  return <Button className="h-11 w-full" onClick={() => void signOut(buildPartnerConsoleLoginPath(onPartnerHost, returnTo, locale))}>{t("signedOut.switchAccount")}</Button>;
}

const SIGNUP_ERRORS: Record<string, string> = {
  subdomain_taken: "signup.errors.subdomainTaken",
  invalid_subdomain: "signup.errors.invalidSubdomain",
  rate_limited: "signup.errors.rateLimited",
  invitation_invalid: "signup.invitationInvalid",
  invitation_required: "signup.inviteOnly",
};

/**
 * Partner signup on the host's domain: the company's name, and its dashboard
 * address when the deployment has a partner base domain. It lands in the new
 * partner's console.
 */
export function PartnerSignupSurface({ baseDomain, blocked, invitation, invitedEmail, returnTo, signedIn = true }: { baseDomain: string | null; blocked: PartnerSignupBlock | null; invitation: string | null; invitedEmail: string | null; returnTo: string; signedIn?: boolean }) {
  const { t } = useTranslation("partner");
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Until someone edits it, the address follows the name.
  const shownSubdomain = subdomain ?? partnerSlugFromName(name);
  const signup = useMutation({
    // The address on screen is the one the partner gets, or signup refuses it as taken.
    mutationFn: () => requestJson<{ partnerId: string; subdomain: string | null }>("/api/partner/signup", { method: "POST", body: JSON.stringify({ name: name.trim(), ...(baseDomain ? { subdomain: shownSubdomain } : {}), ...(invitation ? { invitation } : {}) }) }),
    onSuccess: (result) => {
      // The new partner's console sends the event once its telemetry setting is known.
      recordPendingPartnerSignup({ partnerId: result.partnerId, pathname: pathname ?? "/partner/signup", invited: Boolean(invitation), subdomain: result.subdomain !== null });
      router.replace(`/partner/${result.partnerId}/businesses`);
      router.refresh();
    },
    onError: (failure: Error & { code?: string }) => setError(t(failure.code === "wrong_account" ? "signup.wrongAccount" : SIGNUP_ERRORS[failure.code ?? ""] ?? "signup.errors.failed", { email: invitedEmail ?? "" })),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signup.isPending || !name.trim()) return;
    setError(null);
    signup.mutate();
  }

  if (blocked) {
    return (
      <ReplacementOnboardingShell description={t(`signup.${blocked}`, { email: invitedEmail ?? "" })} progress={null} title={t("signup.title")} width="sm">
        {/* Someone signed out who can't sign up here may already be a partner, so sign-in stays one click away. */}
        {blocked === "wrongAccount" ? <SwitchAccountButton returnTo={returnTo} /> : !signedIn ? <Button className="h-11 w-full" nativeButton={false} render={<Link href={buildPartnerLoginPath("/partner")} />} role="link" variant="outline">{t("signedOut.signIn")}</Button> : <span />}
      </ReplacementOnboardingShell>
    );
  }

  return (
    <ReplacementOnboardingShell progress={null} title={t("signup.title")} width="md">
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="partner-name">{t("signup.nameLabel")}</FieldLabel>
            <Input autoComplete="organization" id="partner-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("signup.namePlaceholder")} value={name} />
          </Field>
          {baseDomain ? (
            <Field>
              <FieldLabel htmlFor="partner-subdomain">{t("signup.subdomainLabel")}</FieldLabel>
              <InputGroup>
                <InputGroupInput autoCapitalize="none" autoComplete="off" id="partner-subdomain" maxLength={40} onChange={(event) => setSubdomain(event.target.value.toLowerCase())} spellCheck={false} value={shownSubdomain} />
                <InputGroupAddon align="inline-end"><InputGroupText>.{baseDomain}</InputGroupText></InputGroupAddon>
              </InputGroup>
              <FieldDescription>{t("signup.subdomainHelp")}</FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
        {error ? <p className="text-center text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="flex flex-col gap-3">
          <Button className="h-11 w-full" disabled={!name.trim() || (baseDomain !== null && !shownSubdomain)} loading={signup.isPending} loadingLabel={t("signup.submitting")} type="submit">{t("signup.submit")}</Button>
        </div>
      </form>
    </ReplacementOnboardingShell>
  );
}
