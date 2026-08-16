"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean };
type Profile = {
  greeting: string;
  tone: string;
  summary: string;
  bookingPolicy: string;
  voiceInstructions: string | null;
  smsInstructions: string | null;
  transferMode: string;
  transferNumber: string | null;
};
type AgentResponse = { business: Business | null; profile: Profile | null };
type FormState = Omit<Profile, "voiceInstructions" | "smsInstructions" | "transferNumber"> & {
  voiceInstructions: string;
  smsInstructions: string;
  transferNumber: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

const emptyForm: FormState = {
  greeting: "",
  tone: "professional",
  summary: "",
  bookingPolicy: "",
  voiceInstructions: "",
  smsInstructions: "",
  transferMode: "on_request",
  transferNumber: "",
};

export function LiveAgentBasicSettingsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const agent = useQuery({ queryKey: ["agent", business?.businessId], queryFn: () => requestJson<AgentResponse>(`/api/agent?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const profile = agent.data?.profile;
    if (!profile) return;
    setForm({
      greeting: profile.greeting,
      tone: profile.tone,
      summary: profile.summary,
      bookingPolicy: profile.bookingPolicy,
      voiceInstructions: profile.voiceInstructions ?? "",
      smsInstructions: profile.smsInstructions ?? "",
      transferMode: profile.transferMode,
      transferNumber: profile.transferNumber ?? "",
    });
  }, [agent.data?.profile]);

  const save = useMutation({
    mutationFn: () => requestJson<{ profile: Profile }>(`/api/agent?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ ...form, transferNumber: form.transferNumber || null, voiceInstructions: form.voiceInstructions || null, smsInstructions: form.smsInstructions || null }) }),
    onSuccess: async () => {
      setMessage("Saved. The receptionist context will refresh through the worker.");
      await queryClient.invalidateQueries({ queryKey: ["agent", business?.businessId] });
    },
  });

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  if (businesses.isLoading || agent.isLoading) return <p className="text-sm text-slate-500">Loading receptionist settings...</p>;
  if (businesses.isError || agent.isError) return <p className="text-sm text-red-600">Receptionist settings are unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before configuring the receptionist.</p>;

  return <PageSurface eyebrow={business.name} title="Basic settings" description="Configure the structured context used by voice and SMS replies.">
    <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); setMessage(null); save.mutate(); }}>
      <Card>
        <CardHeader><CardTitle>Receptionist voice</CardTitle><CardDescription>These values are included in the next generated business context snapshot.</CardDescription></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Greeting<textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" value={form.greeting} onChange={(event) => update("greeting", event.target.value)} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Tone<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={form.tone} onChange={(event) => update("tone", event.target.value)} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Transfer policy<select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal" value={form.transferMode} onChange={(event) => update("transferMode", event.target.value)}><option value="on_request">On request</option><option value="on_urgent">For urgent requests</option><option value="always">Always offer transfer</option></select></label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Transfer number<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={form.transferNumber} onChange={(event) => update("transferNumber", event.target.value)} placeholder="Optional E.164 number" /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Business summary<textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" value={form.summary} onChange={(event) => update("summary", event.target.value)} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Booking policy<textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" value={form.bookingPolicy} onChange={(event) => update("bookingPolicy", event.target.value)} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Voice instructions<textarea className="min-h-28 w-full rounded-xl border border-slate-200 p-3 font-normal" value={form.voiceInstructions} onChange={(event) => update("voiceInstructions", event.target.value)} placeholder="Optional guidance for live calls" /></label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>SMS instructions</CardTitle><CardDescription>Short operational guidance for generated SMS replies.</CardDescription></CardHeader>
        <CardContent><textarea className="min-h-28 w-full rounded-xl border border-slate-200 p-3" value={form.smsInstructions} onChange={(event) => update("smsInstructions", event.target.value)} placeholder="Optional guidance for SMS replies" /></CardContent>
      </Card>
      <div className="flex items-center gap-4"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save changes"}</Button>{message ? <p className="text-sm text-teal-700">{message}</p> : null}{save.isError ? <p className="text-sm text-red-600">{save.error.message}</p> : null}</div>
    </form>
  </PageSurface>;
}
