"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
      });
      if (!response.ok) {
        throw new Error("Unable to request a password reset.");
      }
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><Card className="w-full max-w-md"><CardHeader><CardTitle>Reset your password</CardTitle><CardDescription className="mt-2">Enter your email and we will send a secure reset link if an account exists.</CardDescription></CardHeader><CardContent>{submitted ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">If an account exists for that address, a reset link is on its way.</p> : <form className="space-y-4" onSubmit={submit}><label className="block space-y-2 text-sm font-medium text-slate-700">Email<input aria-label="Email" className="min-h-11 w-full rounded-xl border border-slate-200 px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<button className="min-h-11 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? "Sending..." : "Send reset link"}</button></form>}<Link className="mt-6 block text-center text-sm text-slate-500 hover:text-slate-900" href="/login">Back to sign in</Link></CardContent></Card></main>;
}
