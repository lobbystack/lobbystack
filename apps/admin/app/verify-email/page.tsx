import { redirect } from "next/navigation";
import { VerifyEmailStatus } from "@/components/verify-email-status";
import { getSafeReturnTo } from "@/lib/auth-return-to";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; callbackURL?: string }> }) {
  const { token, callbackURL } = await searchParams;
  if (token) {
    const callback = getSafeReturnTo(callbackURL) ?? "/login?verified=true";
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callback)}`);
  }
  return <VerifyEmailStatus />;
}
