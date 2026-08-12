"use client";

import { useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

async function postAuth(path: string, body?: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? "The account security request failed.");
  }
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange(value: string): void }) {
  return <label className="block space-y-2 text-sm font-medium text-slate-700">{label}<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3" type={type} value={value} onChange={(event) => onChange(event.target.value)} required /></label>;
}

export function AccountSecurityForms({ currentEmail }: { currentEmail: string | null | undefined }) {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setLoading(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : "The request failed."); } finally { setLoading(false); }
  }

  return <Card><CardHeader><CardTitle>Account security</CardTitle><CardDescription>Change credentials and revoke sessions without contacting support.</CardDescription></CardHeader><CardContent className="space-y-6">
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(async () => { await postAuth("change-email", { newEmail: email, callbackURL: "/settings/account?emailChanged=true" }); setEmail(""); }, "Check your email to confirm the address change."); }}><p className="text-sm text-slate-500">Current email: {currentEmail ?? "Not set"}</p><Field label="New email" type="email" value={email} onChange={setEmail} /><Button disabled={loading || !email} type="submit">Change email</Button></form>
    <form className="space-y-3 border-t border-slate-100 pt-6" onSubmit={(event) => { event.preventDefault(); void run(async () => { if (newPassword.length < 8) throw new Error("Use at least 8 characters for the new password."); await postAuth("change-password", { currentPassword, newPassword, revokeOtherSessions: true }); setCurrentPassword(""); setNewPassword(""); }, "Password changed and other sessions revoked."); }}><Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} /><Field label="New password" type="password" value={newPassword} onChange={setNewPassword} /><Button disabled={loading || !currentPassword || !newPassword} type="submit">Change password</Button></form>
    <div className="border-t border-slate-100 pt-6"><Button disabled={loading} variant="outline" onClick={() => void run(async () => await postAuth("revoke-other-sessions"), "Other sessions revoked.")}>Revoke other sessions</Button></div>
    {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
  </CardContent></Card>;
}
