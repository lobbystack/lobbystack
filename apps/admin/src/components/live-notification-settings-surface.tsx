"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Mail, MessageSquare, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "./ui/item";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const events = [
  ["voiceMessage", "Voice message", "A caller leaves a message for the team."],
  ["pausedSms", "Human SMS handoff", "AI automation pauses for operator attention."],
  ["smsFailed", "SMS delivery failure", "A customer message cannot be delivered."],
  ["calendarSync", "Calendar sync issue", "A connected calendar needs attention."],
  ["transferFailed", "Call transfer failure", "A requested live transfer fails."],
  ["aiReplyFailed", "AI reply failure", "An automated reply cannot be generated."],
] as const;
type EventKey = (typeof events)[number][0];
type Preferences = { emailEnabled: boolean; smsEnabled: boolean; eventPreferences: Record<EventKey, { email: boolean; sms: boolean }>; dailySummaryEnabled: boolean; dailySummarySendTime: string | null };
type Business = { businessId: string; name: string; active: boolean };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load notification preferences.");
  return await response.json() as T;
}

export function LiveNotificationSettingsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const preferences = useQuery({ queryKey: ["notification-preferences", business?.businessId], queryFn: () => getJson<Preferences>(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const [form, setForm] = useState<Preferences | null>(null);
  useEffect(() => { if (preferences.data) setForm(preferences.data); }, [preferences.data]);
  const save = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error("Unable to save notification preferences.");
    },
    onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["notification-preferences", business?.businessId] }),
  });
  const toggleEvent = (key: EventKey, channel: "email" | "sms") => setForm((current) => current ? { ...current, eventPreferences: { ...current.eventPreferences, [key]: { ...current.eventPreferences[key], [channel]: !current.eventPreferences[key][channel] } } } : current);
  if (businesses.isLoading || preferences.isLoading || !form) return <PageSurface title="Notifications" description="Choose when operators receive email and SMS alerts."><Card><CardContent className="py-16 text-center text-sm text-slate-500">Loading preferences...</CardContent></Card></PageSurface>;
  if (businesses.isError || preferences.isError) return <PageSurface title="Notifications" description="Choose when operators receive email and SMS alerts."><Card><CardContent className="py-16 text-center text-sm text-red-600">Notification preferences are unavailable.</CardContent></Card></PageSurface>;
  return <PageSurface title="Notifications" description={`Delivery preferences for ${business?.name ?? "the active workspace"}.`}>
    <div className="w-full overflow-y-auto pb-12"><div className="flex w-full flex-col gap-8"><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Delivery channels</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" />Email notifications</ItemTitle><ItemDescription>Disabling email suppresses all email event deliveries.</ItemDescription></ItemContent><ItemActions><input aria-label="Email notifications" type="checkbox" checked={form.emailEnabled} onChange={(event) => setForm({ ...form, emailEnabled: event.target.checked })} className="size-4 accent-primary" /></ItemActions></Item><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle className="flex items-center gap-2"><MessageSquare className="size-4 text-muted-foreground" />SMS notifications</ItemTitle><ItemDescription>Disabling SMS suppresses all SMS event deliveries.</ItemDescription></ItemContent><ItemActions><input aria-label="SMS notifications" type="checkbox" checked={form.smsEnabled} onChange={(event) => setForm({ ...form, smsEnabled: event.target.checked })} className="size-4 accent-primary" /></ItemActions></Item></Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Daily summary</h2><Surface className="flex flex-col"><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Daily summary</ItemTitle><ItemDescription>Receive one summary of the previous day’s operational alerts.</ItemDescription></ItemContent><ItemActions><input aria-label="Enable daily summary" type="checkbox" checked={form.dailySummaryEnabled} onChange={(event) => setForm({ ...form, dailySummaryEnabled: event.target.checked, dailySummarySendTime: event.target.checked ? form.dailySummarySendTime ?? "09:00" : form.dailySummarySendTime })} className="size-4 accent-primary" /><input aria-label="Daily summary send time" type="time" value={form.dailySummarySendTime ?? "09:00"} disabled={!form.dailySummaryEnabled} onChange={(event) => setForm({ ...form, dailySummarySendTime: event.target.value })} className="min-h-9 rounded-xl border bg-transparent px-2 text-sm" /></ItemActions></Item></Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Event preferences</h2><TableCard><Table className="min-w-[38rem]"><TableHeader className="bg-transparent"><TableRow><TableHead>Event</TableHead>{form.emailEnabled ? <TableHead className="w-28 text-center">Email</TableHead> : null}{form.smsEnabled ? <TableHead className="w-28 text-center">SMS</TableHead> : null}</TableRow></TableHeader><TableBody>{events.map(([key, label, description]) => <TableRow key={key}><TableCell className="whitespace-normal"><div className="flex flex-col gap-1"><span className="font-medium">{label}</span><span className="text-sm text-muted-foreground">{description}</span></div></TableCell>{form.emailEnabled ? <TableCell className="text-center"><input aria-label={`${label} email`} type="checkbox" checked={form.eventPreferences[key].email} onChange={() => toggleEvent(key, "email")} className="size-4 accent-primary" /></TableCell> : null}{form.smsEnabled ? <TableCell className="text-center"><input aria-label={`${label} SMS`} type="checkbox" checked={form.eventPreferences[key].sms} onChange={() => toggleEvent(key, "sms")} className="size-4 accent-primary" /></TableCell> : null}</TableRow>)}</TableBody></Table></TableCard></section><div className="flex items-center justify-end gap-3">{save.isError ? <p className="text-sm text-destructive">{save.error.message}</p> : null}{save.isSuccess ? <p className="text-sm text-muted-foreground">Preferences saved.</p> : null}<Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-4" />{save.isPending ? "Saving..." : "Save preferences"}</Button></div></div></div>
  </PageSurface>;
}

function ChannelToggle({ icon: Icon, label, checked, onChange }: { icon: typeof Mail; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><span className="flex items-center gap-3 font-medium text-slate-800"><Icon className="size-5 text-teal-700" />{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-teal-700" /></label>;
}
