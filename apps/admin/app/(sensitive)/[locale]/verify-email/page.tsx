import { redirect } from "next/navigation";
import { VerifyEmailStatus } from "@/components/verify-email-status";
import { getSafeReturnTo } from "@/lib/auth-return-to";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string; callbackURL?: string }> }) {
  const [{ locale }, { token, callbackURL }] = await Promise.all([params, searchParams]);
  if (token) {
    const callback = getSafeReturnTo(callbackURL) ?? `${localizePublicPath("/login", resolveLocale(locale))}?verified=true`;
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callback)}`);
  }
  return <VerifyEmailStatus />;
}
