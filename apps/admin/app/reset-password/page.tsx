"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { PasswordResetForm } from "@/components/password-reset-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ResetPasswordFormFromQuery() {
  const searchParams = useSearchParams();
  return <PasswordResetForm token={searchParams.get("token")} />;
}

export default function ResetPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><Card className="w-full max-w-md"><CardHeader><CardTitle>Choose a new password</CardTitle><CardDescription className="mt-2">Your new password will protect this LobbyStack account.</CardDescription></CardHeader><CardContent><Suspense fallback={<p className="text-sm text-slate-500">Loading reset link...</p>}><ResetPasswordFormFromQuery /></Suspense></CardContent></Card></main>;
}
