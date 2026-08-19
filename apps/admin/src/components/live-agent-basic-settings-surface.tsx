"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";
import { Surface } from "./ui/surface";
import { Input } from "./ui/input";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean };
type Profile = {
  greeting: string;
  tone: string;
  summary: string;
  bookingPolicy: string;
  voiceInstructions: string | null;
  smsInstructions: string | null;
  chatInstructions: string | null;
  transferMode: string;
  transferNumber: string | null;
};
type AgentResponse = { business: Business | null; profile: Profile | null };
type FormState = Omit<Profile, "voiceInstructions" | "smsInstructions" | "chatInstructions" | "transferNumber"> & {
  voiceInstructions: string;
  smsInstructions: string;
  chatInstructions: string;
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
  chatInstructions: "",
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
      chatInstructions: profile.chatInstructions ?? "",
      transferMode: profile.transferMode,
      transferNumber: profile.transferNumber ?? "",
    });
  }, [agent.data?.profile]);

  const save = useMutation({
    mutationFn: () => requestJson<{ profile: Profile }>(`/api/agent?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ ...form, transferNumber: form.transferNumber || null, voiceInstructions: form.voiceInstructions || null, smsInstructions: form.smsInstructions || null, chatInstructions: form.chatInstructions || null }) }),
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
    <form className="w-full overflow-y-auto pb-12" onSubmit={(event) => { event.preventDefault(); setMessage(null); save.mutate(); }}>
      <ItemGroup spacing="section" className="gap-8">
        <section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Defaults</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Greeting</ItemTitle><ItemDescription>The first message the receptionist uses when answering.</ItemDescription><div className="pt-2"><Input className="w-full sm:max-w-md" value={form.greeting} onChange={(event) => update("greeting", event.target.value)} required /></div></ItemContent><ItemActions className="w-full justify-end self-center sm:w-auto"><Button disabled={save.isPending} size="sm" type="submit" variant="outline">{save.isPending ? "Saving..." : "Save"}</Button></ItemActions></Item><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Tone</ItemTitle><ItemDescription>Describe the personality and style for generated replies.</ItemDescription><div className="pt-2"><Input className="w-full sm:max-w-md" value={form.tone} onChange={(event) => update("tone", event.target.value)} required /></div></ItemContent></Item><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Transfer number</ItemTitle><ItemDescription>Optional number to use when a caller asks for a human.</ItemDescription><div className="pt-2"><Input className="w-full sm:max-w-md" value={form.transferNumber} onChange={(event) => update("transferNumber", event.target.value)} placeholder="Optional E.164 number" /></div></ItemContent></Item></Surface></section>
        <section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Receptionist context</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Business summary</ItemTitle><ItemDescription>Facts the receptionist should know about this business.</ItemDescription><textarea className="mt-2 min-h-24 w-full rounded-xl border bg-transparent p-3" value={form.summary} onChange={(event) => update("summary", event.target.value)} required /></ItemContent></Item><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Booking policy</ItemTitle><ItemDescription>Explain how availability and bookings should be handled.</ItemDescription><textarea className="mt-2 min-h-24 w-full rounded-xl border bg-transparent p-3" value={form.bookingPolicy} onChange={(event) => update("bookingPolicy", event.target.value)} required /></ItemContent></Item><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Transfer policy</ItemTitle><ItemDescription>When should the receptionist offer a human transfer?</ItemDescription><select className="mt-2 min-h-10 w-full max-w-md rounded-xl border bg-transparent px-3" value={form.transferMode} onChange={(event) => update("transferMode", event.target.value)}><option value="on_request">On request</option><option value="on_urgent">For urgent requests</option><option value="always">Always offer transfer</option></select></ItemContent></Item></Surface></section>
        <section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Additional instructions</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Voice instructions</ItemTitle><ItemDescription>Optional guidance for live calls.</ItemDescription><textarea className="mt-2 min-h-28 w-full rounded-xl border bg-transparent p-3" value={form.voiceInstructions} onChange={(event) => update("voiceInstructions", event.target.value)} /></ItemContent></Item><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>SMS instructions</ItemTitle><ItemDescription>Optional guidance for SMS replies.</ItemDescription><textarea className="mt-2 min-h-28 w-full rounded-xl border bg-transparent p-3" value={form.smsInstructions} onChange={(event) => update("smsInstructions", event.target.value)} /></ItemContent></Item><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Website chat instructions</ItemTitle><ItemDescription>Optional guidance for embedded website chat replies.</ItemDescription><textarea className="mt-2 min-h-28 w-full rounded-xl border bg-transparent p-3" value={form.chatInstructions} onChange={(event) => update("chatInstructions", event.target.value)} /></ItemContent></Item></Surface></section>
      </ItemGroup>
      <div className="mt-6 flex items-center gap-4"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save changes"}</Button>{message ? <p className="text-sm text-muted-foreground">{message}</p> : null}{save.isError ? <p className="text-sm text-destructive">{save.error.message}</p> : null}</div>
    </form>
  </PageSurface>;
}
