"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/brand-mark";
import { useBranding } from "@/components/branding-provider";
import { useBrandLinks } from "@/hooks/use-brand-links";
import { resolveLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

type OnboardingShellProps = {
  /** Shown above the title. */
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** The step dots. `routes` names the page of each step when the owner's onboarding skips some, as a partner's business does. */
  progress?: { current: number; navigableUntil?: number; total: number; routes?: readonly string[] } | null;
  width?: "sm" | "md" | "lg" | "xl" | "wide";
  children: React.ReactNode;
  legalFooter?: React.ReactNode;
  /** The agreement line login and signup show, for the action the person is taking. Left out when the partner has no terms or privacy page. */
  legalAgreement?: "login" | "signup" | "business" | "emailChange";
  onSignOut?: () => void;
};

/**
 * Onboarding routes after sign-up (step 1), keyed by path. The brand step
 * comes before the business only for a deployment's first owner, so it shares
 * step 2 and the progress dots keep linking that step to the business.
 */
export const onboardingRoutes = {
  "/onboarding/brand": { key: "brand", step: 2, width: "md" },
  "/onboarding/business": { key: "businessName", step: 2, width: "md" },
  "/onboarding/website": { key: "website", step: 3, width: "md" },
  "/onboarding/knowledge": { key: "knowledge", step: 4, width: "lg" },
  "/onboarding/greeting": { key: "greeting", step: 5, width: "md" },
  "/onboarding/test-call": { key: "testCall", step: 6, width: "md" },
  "/onboarding/verify-phone": { key: "verifyPhone", step: 7, width: "md" },
  "/onboarding/number": { key: "number", step: 8, width: "lg" },
  "/onboarding/attribution": { key: "attribution", step: 9, width: "xl" },
} as const;

const progressRoutes: Record<number, string> = Object.fromEntries(Object.entries(onboardingRoutes).map(([path, route]) => [route.step, path]));

const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", wide: "max-w-7xl" } as const;

const legalPrefixKeys = { login: "login.legalPrefix", signup: "signup.legal.prefix", business: "signup.legal.businessPrefix", emailChange: "signup.legal.emailChangePrefix" } as const;

export function ReplacementOnboardingShell({ icon, eyebrow, title, description, progress, width = "md", children, legalFooter: customLegalFooter, legalAgreement, onSignOut }: OnboardingShellProps) {
  const { t, i18n } = useTranslation("onboarding");
  const { t: tAuth } = useTranslation("auth");
  const links = useBrandLinks(resolveLocale(i18n.resolvedLanguage, i18n.language));
  const { partner } = useBranding();
  const legalFooter = customLegalFooter ?? (legalAgreement && links.terms && links.privacy ? (
    <p className="max-w-full text-center text-xs leading-5 text-muted-foreground sm:whitespace-nowrap">
      {tAuth(legalPrefixKeys[legalAgreement])} {" "}
      <a className="underline underline-offset-4 hover:text-foreground" href={links.terms} rel="noreferrer" target="_blank">{tAuth("signup.legal.terms")}</a>{" "}
      {tAuth("signup.legal.and")} {" "}
      <a className="underline underline-offset-4 hover:text-foreground" href={links.privacy} rel="noreferrer" target="_blank">{tAuth("signup.legal.privacy")}</a>
      {tAuth("signup.legal.suffix")}
    </p>
  ) : undefined);
  // Terms and privacy, unless the page's own legal line names them, and on a
  // partner's pages its support too. Each link the partner left out stays out.
  const footerLinks = [
    ...(legalFooter ? [] : [{ key: "terms", href: links.terms, label: t("shell.terms") }, { key: "privacy", href: links.privacy, label: t("shell.privacy") }]),
    ...(partner ? [{ key: "support", href: links.support, label: t("shell.support") }] : []),
  ].filter((link): link is { key: string; href: string; label: string } => Boolean(link.href));
  return (
    <div className="relative flex min-h-svh w-full flex-col bg-background text-foreground">
      {onSignOut ? (
        <button className="absolute right-6 top-6 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" onClick={onSignOut} type="button">
          {t("shell.signOut")}
        </button>
      ) : null}
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className={cn("my-auto flex w-full flex-col items-center", widths[width])}>
          <BrandMark />
          <div className="mt-10 flex w-full flex-col items-center gap-4 text-center">
            {icon}
            {eyebrow ? <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{eyebrow}</span> : null}
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
            {description ? <p className="text-[15px] leading-7 text-muted-foreground">{description}</p> : null}
          </div>
          <div className="mt-10 w-full">{children}</div>
        </div>
      </main>
      <footer className="flex flex-col items-center gap-4 px-6 pb-12 pt-16">
        {progress ? (
          <nav aria-label={`Onboarding progress: step ${progress.current} of ${progress.total}`}>
            <ol className="flex items-center justify-center gap-1.5">
              {Array.from({ length: progress.total }, (_, index) => index + 1)
                .map((step) => {
                  const active = step === progress.current;
                  const completed = step < progress.current;
                  const canNavigate = step <= (progress.navigableUntil ?? progress.current);
                  const href = !active && canNavigate ? (progress.routes ? progress.routes[step - 1] : progressRoutes[step]) : undefined;
                  const className = cn(
                    "h-1.5 rounded-full transition-all",
                    active ? "w-6 bg-foreground" : "w-1.5",
                    completed ? "bg-foreground/40" : active ? "bg-foreground" : "bg-border",
                  );
                  return <li className="flex" key={step}>{href ? <Link aria-label={`Go to onboarding step ${step}`} className={className} href={href} /> : <span role="img" aria-label={`Onboarding step ${step}${active ? ", current step" : ""}`} aria-current={active ? "step" : undefined} className={className} />}</li>;
                })}
            </ol>
          </nav>
        ) : null}
        {legalFooter}
        {footerLinks.length ? <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {footerLinks.map((link, index) => (
            <Fragment key={link.key}>
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              <a className="hover:text-foreground" href={link.href} {...(link.href.startsWith("mailto:") ? {} : { rel: "noreferrer", target: "_blank" })}>{link.label}</a>
            </Fragment>
          ))}
        </div> : null}
      </footer>
    </div>
  );
}
