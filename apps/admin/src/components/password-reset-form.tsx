"use client";

import { useState } from "react";

export function PasswordResetForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "This reset link is missing or invalid.");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (!response.ok) {
        throw new Error("This reset link is expired or invalid.");
      }
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  }

  if (complete) {
    return <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Your password was updated. <a className="font-medium underline" href="/login">Sign in</a>.</p>;
  }

  return <form className="space-y-4" onSubmit={submit}><label className="block space-y-2 text-sm font-medium text-slate-700">New password<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="block space-y-2 text-sm font-medium text-slate-700">Confirm password<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3" minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<button className="min-h-11 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={loading || !token} type="submit">{loading ? "Updating..." : "Update password"}</button></form>;
}
