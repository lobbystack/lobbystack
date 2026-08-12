"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Mail, MessageSquare, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

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
    <div className="space-y-6">
       <Card><CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="size-5 text-teal-700" />Delivery channels</CardTitle><CardDescription>Disabling a channel suppresses all event deliveries through that channel.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><ChannelToggle icon={Mail} label="Email notifications" checked={form.emailEnabled} onChange={(checked) => setForm({ ...form, emailEnabled: checked })} /><ChannelToggle icon={MessageSquare} label="SMS notifications" checked={form.smsEnabled} onChange={(checked) => setForm({ ...form, smsEnabled: checked })} /></CardContent></Card>
       <Card><CardHeader><CardTitle>Daily summary</CardTitle><CardDescription>Receive one email or opted-in SMS summary of the previous day’s operational alerts.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-3 text-sm font-medium text-slate-800"><input type="checkbox" checked={form.dailySummaryEnabled} onChange={(event) => setForm({ ...form, dailySummaryEnabled: event.target.checked, dailySummarySendTime: event.target.checked ? form.dailySummarySendTime ?? "09:00" : form.dailySummarySendTime })} className="size-5 accent-teal-700" />Enable daily summary</label><label className="flex items-center gap-3 text-sm text-slate-600">Send at <input aria-label="Daily summary send time" type="time" value={form.dailySummarySendTime ?? "09:00"} disabled={!form.dailySummaryEnabled} onChange={(event) => setForm({ ...form, dailySummarySendTime: event.target.value })} className="min-h-11 rounded-xl border border-slate-200 px-3 text-slate-900" /></label></CardContent></Card>
      <Card><CardHeader><CardTitle>Event preferences</CardTitle><CardDescription>Select the channel used for each operational event.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[0.12em] text-slate-400"><th className="py-3 font-semibold">Event</th><th className="w-28 py-3 text-center font-semibold">Email</th><th className="w-28 py-3 text-center font-semibold">SMS</th></tr></thead><tbody>{events.map(([key, label, description]) => <tr key={key} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-medium text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-500">{description}</p></td><td className="py-4 text-center"><input aria-label={`${label} email`} type="checkbox" checked={form.eventPreferences[key].email} disabled={!form.emailEnabled} onChange={() => toggleEvent(key, "email")} className="size-4 accent-teal-700" /></td><td className="py-4 text-center"><input aria-label={`${label} SMS`} type="checkbox" checked={form.eventPreferences[key].sms} disabled={!form.smsEnabled} onChange={() => toggleEvent(key, "sms")} className="size-4 accent-teal-700" /></td></tr>)}</tbody></table></CardContent></Card>
      <div className="flex items-center justify-end gap-3">{save.isError ? <p className="text-sm text-red-600">{save.error.message}</p> : null}{save.isSuccess ? <p className="text-sm text-teal-700">Preferences saved.</p> : null}<Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-4" />{save.isPending ? "Saving..." : "Save preferences"}</Button></div>
    </div>
  </PageSurface>;
}

function ChannelToggle({ icon: Icon, label, checked, onChange }: { icon: typeof Mail; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><span className="flex items-center gap-3 font-medium text-slate-800"><Icon className="size-5 text-teal-700" />{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-teal-700" /></label>;
}
