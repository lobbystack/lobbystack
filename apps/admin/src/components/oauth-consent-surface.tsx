"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type OAuthConsentProps =
  | { kind: "invalid" }
  | {
    kind: "consent";
    oauthQuery: string;
    client: { name: string | null; host: string | null };
    email: string;
    businesses: Array<{ businessId: string; name: string; active: boolean }>;
    /** Tool scopes the client asked for, in display order. */
    scopes: string[];
  };

const scopeKey = (scope: string) => scope.replace(":", "_");

/**
 * The consent screen for MCP clients: the owner picks the business the app
 * may use and which of the requested permissions it gets.
 */
export function OAuthConsentSurface(props: OAuthConsentProps) {
  const { t } = useTranslation("auth");
  const initialBusiness = props.kind === "consent" ? (props.businesses.find((business) => business.active) ?? props.businesses[0])?.businessId ?? "" : "";
  const [businessId, setBusinessId] = useState(initialBusiness);
  const [scopes, setScopes] = useState<string[]>(props.kind === "consent" ? props.scopes : []);
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.kind === "invalid") {
    return (
      <ReplacementOnboardingShell description={t("oauthConsent.invalidRequest.description")} title={t("oauthConsent.invalidRequest.title")} width="sm">
        {null}
      </ReplacementOnboardingShell>
    );
  }

  const client = props.client.name ?? t("oauthConsent.unknownClient");

  async function decide(accept: boolean) {
    if (pending) return;
    if (accept && scopes.length === 0) {
      setError(t("oauthConsent.noScopes"));
      return;
    }
    setError(null);
    setPending(accept ? "allow" : "deny");
    try {
      const response = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauth_query: props.kind === "consent" ? props.oauthQuery : "", accept, business_id: businessId, scopes }),
      });
      const result = await response.json().catch(() => null) as { url?: string } | null;
      if (!response.ok || !result?.url) throw new Error("consent failed");
      window.location.assign(result.url);
    } catch {
      setError(t("oauthConsent.failed", { client }));
      setPending(null);
    }
  }

  if (props.businesses.length === 0) {
    return (
      <ReplacementOnboardingShell description={t("oauthConsent.subtitle", { client })} title={t("oauthConsent.title", { client })} width="sm">
        <div className="flex flex-col gap-6">
          <Alert>
            <AlertTitle>{t("oauthConsent.noBusinesses.title")}</AlertTitle>
            <AlertDescription>{t("oauthConsent.noBusinesses.description")}</AlertDescription>
          </Alert>
          <Button disabled={pending !== null} onClick={() => void decide(false)} variant="outline">{t("oauthConsent.deny")}</Button>
        </div>
      </ReplacementOnboardingShell>
    );
  }

  return (
    <ReplacementOnboardingShell description={t("oauthConsent.subtitle", { client })} {...(props.client.host ? { eyebrow: t("oauthConsent.requestedBy", { host: props.client.host }) } : {})} title={t("oauthConsent.title", { client })} width="sm">
      <div className="flex w-full flex-col gap-6 text-left">
        <FieldGroup className="gap-6">
          <Field>
            <FieldLabel htmlFor="oauth-business">{t("oauthConsent.businessLabel")}</FieldLabel>
            <NativeSelect className="w-full" disabled={props.businesses.length === 1} id="oauth-business" onChange={(event) => setBusinessId(event.target.value)} value={businessId}>
              {props.businesses.map((business) => <NativeSelectOption key={business.businessId} value={business.businessId}>{business.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">{t("oauthConsent.scopesLabel", { client })}</legend>
            {props.scopes.map((scope) => (
              <div className="flex items-start gap-3 text-sm" key={scope}>
                <Checkbox
                  checked={scopes.includes(scope)}
                  id={`oauth-scope-${scopeKey(scope)}`}
                  onCheckedChange={(checked) => setScopes((current) => checked ? [...new Set([...current, scope])] : current.filter((value) => value !== scope))}
                />
                <label className="flex flex-col gap-0.5" htmlFor={`oauth-scope-${scopeKey(scope)}`}>
                  <span>{t(`oauthConsent.scopes.${scopeKey(scope)}`)}</span>
                  <code className="font-mono text-xs text-muted-foreground">{scope}</code>
                </label>
              </div>
            ))}
          </fieldset>
        </FieldGroup>

        <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p>{t("oauthConsent.staysConnected", { client })}</p>
            <p>{t("oauthConsent.warning", { client })}</p>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <div className="flex flex-col gap-3">
          <Button disabled={pending !== null || !businessId} onClick={() => void decide(true)}>{pending === "allow" ? t("oauthConsent.allowing") : t("oauthConsent.allow")}</Button>
          <Button disabled={pending !== null} onClick={() => void decide(false)} variant="outline">{t("oauthConsent.deny")}</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("oauthConsent.signedInAs", { email: props.email })}</p>
      </div>
    </ReplacementOnboardingShell>
  );
}
