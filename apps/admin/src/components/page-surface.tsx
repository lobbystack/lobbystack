import { ArrowUpRight, CheckCircle2, Clock3, PhoneCall, Plus, RefreshCw } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export type PageSurfaceProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: string | undefined;
  children?: React.ReactNode;
};

export function PageSurface({ eyebrow, title, description, action, children }: PageSurfaceProps) {
  return <div className="space-y-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="space-y-2">{eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p> : null}<h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action ? <Button><Plus className="size-4" />{action}</Button> : null}</div>{children}</div>;
}

export function OverviewSurface() {
  return <PageSurface eyebrow="Monday, March 9" title="Good morning, Raphael" description="Here is what is happening across your front desk today."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Calls today" value="24" change="+18%" icon={PhoneCall} tone="teal" /><StatCard label="Appointments" value="12" change="3 pending" icon={Clock3} tone="blue" /><StatCard label="Messages" value="8" change="2 need replies" icon={ArrowUpRight} tone="amber" /><StatCard label="Answer rate" value="96%" change="+4.2%" icon={CheckCircle2} tone="violet" /></div><div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><Card><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>Call activity</CardTitle><CardDescription>Inbound call volume and outcomes over the last 7 days.</CardDescription></div><Button variant="ghost"><RefreshCw className="size-4" />Refresh</Button></CardHeader><CardContent><div className="flex h-64 items-end gap-3 border-b border-l border-slate-100 px-2 pb-0 pt-8">{[42, 58, 47, 74, 65, 88, 70].map((height, index) => <div className="flex flex-1 flex-col items-center gap-3" key={index}><div className="w-full rounded-t-lg bg-teal-500/80 transition-all hover:bg-teal-600" style={{ height: `${height}%` }} /><span className="text-xs text-slate-400">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle>Upcoming appointments</CardTitle><CardDescription>The next conversations on your calendar.</CardDescription></CardHeader><CardContent className="space-y-3">{[["09:30", "Maya Chen", "General checkup"], ["11:00", "Jordan Lee", "Consultation"], ["14:15", "Sam Rivera", "Follow-up"]].map(([time, name, service]) => <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3" key={`${time}-${name}`}><span className="pt-0.5 text-xs font-semibold text-teal-700">{time}</span><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{name}</p><p className="truncate text-xs text-slate-500">{service}</p></div></div>)}</CardContent></Card></div><Card><CardHeader><CardTitle>Setup checklist</CardTitle><CardDescription>Finish these steps to keep your receptionist ready.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3">{[["Business profile", "Complete"], ["Knowledge base", "Add content"], ["Calendar connection", "Connected"]].map(([label, status]) => <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4" key={label}><span className="text-sm font-medium text-slate-800">{label}</span><span className={status === "Complete" || status === "Connected" ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-amber-700"}>{status}</span></div>)}</div></CardContent></Card></PageSurface>;
}

function StatCard({ label, value, change, icon: Icon, tone }: { label: string; value: string; change: string; icon: typeof PhoneCall; tone: "teal" | "blue" | "amber" | "violet" }) {
  const colors = { teal: "bg-teal-50 text-teal-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" };
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-xs font-medium text-emerald-700">{change}</p></div><span className={`grid size-10 place-items-center rounded-full ${colors[tone]}`}><Icon className="size-5" /></span></div></CardContent></Card>;
}

export function DataSurface({ title, description, columns, rows = [], action }: { title: string; description: string; columns: string[]; rows?: string[][]; action?: string }) {
  return <PageSurface title={title} description={description} action={action}><Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">{columns.map((column) => <th className="px-3 py-3 font-semibold" key={column}>{column}</th>)}</tr></thead><tbody>{rows.length > 0 ? rows.map((row, index) => <tr className="border-b border-slate-50 last:border-0" key={index}>{row.map((cell, cellIndex) => <td className="px-3 py-4 text-slate-700" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={columns.length}>No records yet.</td></tr>}</tbody></table></div></CardContent></Card></PageSurface>;
}
