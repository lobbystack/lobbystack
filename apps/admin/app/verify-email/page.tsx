import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function safeCallback(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/login?verified=true";
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; callbackURL?: string }> }) {
  const { token, callbackURL } = await searchParams;
  if (token) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(safeCallback(callbackURL))}`);
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><Card className="w-full max-w-md"><CardHeader><CardTitle>Invalid verification link</CardTitle><CardDescription>This email verification link is missing its secure token.</CardDescription></CardHeader><CardContent><a className="text-sm font-medium text-teal-700 underline" href="/login">Return to sign in</a></CardContent></Card></main>;
}
