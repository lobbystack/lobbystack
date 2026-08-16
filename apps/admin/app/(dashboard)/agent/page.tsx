import { redirect } from "next/navigation";

export default function AgentPage() { redirect("/agent/basic-settings"); }

function SetupCard({ title, description, href }: { title: string; description: string; href: string }) { return <a className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md" href={href}><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p><span className="mt-6 inline-block text-sm font-medium text-teal-700">Open settings →</span></a>; }
