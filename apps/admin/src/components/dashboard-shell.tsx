"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ChevronsUpDown, CircleHelp, ClipboardList, Contact, Inbox, LayoutDashboard, LogOut, MessageSquare, Phone, Settings, Users, X } from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Calls", href: "/calls", icon: Phone },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Appointments", href: "/appointments", icon: CalendarDays },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

const agentNavigation = [
  { label: "Basic settings", href: "/agent/basic-settings", icon: Settings },
  { label: "Knowledge", href: "/agent/knowledge", icon: BookOpen },
  { label: "Services", href: "/agent/services", icon: ClipboardList },
  { label: "Rules", href: "/agent/rules", icon: Inbox },
];

const settingsNavigation = [
  { label: "Team", href: "/settings/team" },
  { label: "Appearance", href: "/settings/appearance" },
  { label: "Phone number", href: "/settings/phone-number" },
  { label: "Plan and billing", href: "/settings/plan" },
  { label: "Notifications", href: "/settings/notifications" },
  { label: "Account", href: "/settings/account" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign out failed.");
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {mobileOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/20 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full", collapsed && "lg:w-20")}>
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-5">
          <Link href="/" className={cn("flex items-center gap-3 overflow-hidden", collapsed && "lg:justify-center") } onClick={() => setMobileOpen(false)}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-lg font-semibold text-white">L</span>
            <span className={cn("truncate text-base font-semibold tracking-tight text-slate-950", collapsed && "lg:hidden")}>LobbyStack</span>
          </Link>
          <button className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden" onClick={() => setMobileOpen(false)}><X className="size-5" /></button>
        </div>
        <div className={cn("border-b border-slate-100 p-4", collapsed && "lg:p-3") }>
           <WorkspaceSwitcher collapsed={collapsed} onSwitched={() => { queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "businesses" }); void queryClient.invalidateQueries({ queryKey: ["businesses"] }); router.refresh(); }} />
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div className="space-y-1">
            <p className={cn("mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400", collapsed && "lg:hidden")}>Workspace</p>
            {navigation.map((item) => <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} collapsed={collapsed} onClick={() => setMobileOpen(false)} />)}
          </div>
          <div className="space-y-1">
            <p className={cn("mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400", collapsed && "lg:hidden")}>Receptionist</p>
            {agentNavigation.map((item) => <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} collapsed={collapsed} onClick={() => setMobileOpen(false)} />)}
          </div>
          <div className="space-y-1">
            <p className={cn("mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400", collapsed && "lg:hidden")}>Settings</p>
            {settingsNavigation.map((item) => <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} collapsed={collapsed} onClick={() => setMobileOpen(false)} />)}
          </div>
        </nav>
        <div className={cn("space-y-1 border-t border-slate-100 p-4", collapsed && "lg:p-3") }>
          <NavItem label="Help center" href="/help" icon={CircleHelp} active={false} collapsed={collapsed} onClick={() => setMobileOpen(false)} />
          <button className={cn("group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950", collapsed && "lg:justify-center lg:px-2")} disabled={signingOut} onClick={() => void signOut()} type="button"><LogOut className="size-5 shrink-0 text-slate-400 group-hover:text-slate-700" /><span className={cn("truncate", collapsed && "lg:hidden")}>{signingOut ? "Signing out..." : "Sign out"}</span></button>
        </div>
        <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="absolute -right-3 top-24 hidden size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900 lg:grid" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button aria-label="Open navigation" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)}><MenuIcon /></button>
          <div className="hidden text-sm text-slate-500 lg:block">Workspace / {pathname === "/" ? "Overview" : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ")}</div>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 sm:block">French / English</span><span className="grid size-9 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">RM</span></div>
        </header>
        <div className="mx-auto w-full max-w-[1440px] px-4 py-8 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

function WorkspaceSwitcher({ collapsed, onSwitched }: { collapsed: boolean; onSwitched: () => void }) {
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: async () => {
    const response = await fetch("/api/businesses", { credentials: "include" });
    if (!response.ok) throw new Error("Unable to load workspaces.");
    return await response.json() as { businesses: Array<{ businessId: string; name: string; active: boolean }> };
  } });
  const [switching, setSwitching] = useState(false);
  const active = businesses.data?.businesses.find((business) => business.active) ?? businesses.data?.businesses[0];
  async function changeWorkspace(businessId: string) {
    if (businessId === active?.businessId) return;
    setSwitching(true);
    try {
      const response = await fetch("/api/businesses/switch", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ businessId }) });
      if (!response.ok) throw new Error("Workspace switch failed.");
      onSwitched();
    } finally {
      setSwitching(false);
    }
  }
  return <div className={cn("flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3", collapsed && "lg:justify-center lg:p-2")}>
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">{active?.name.slice(0, 1).toUpperCase() ?? "W"}</span>
    <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}><select aria-label="Workspace" className="w-full truncate bg-transparent text-sm font-medium text-slate-900 outline-none" disabled={switching || businesses.isLoading} value={active?.businessId ?? ""} onChange={(event) => void changeWorkspace(event.target.value)}>{businesses.data?.businesses.map((business) => <option key={business.businessId} value={business.businessId}>{business.name}</option>)}</select><span className="block truncate text-xs text-slate-500">Workspace</span></span>
    <ChevronsUpDown className={cn("size-4 text-slate-400", collapsed && "lg:hidden")} />
  </div>;
}

function NavItem({ label, href, icon: Icon = Settings, active, collapsed, onClick }: { label: string; href: string; icon?: typeof Settings; active: boolean; collapsed: boolean; onClick: () => void }) {
  return <Link href={href} onClick={onClick} className={cn("group flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors", active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950", collapsed && "lg:justify-center lg:px-2")}><Icon className={cn("size-5 shrink-0", active ? "text-teal-700" : "text-slate-400 group-hover:text-slate-700")} /><span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span></Link>;
}

function MenuIcon() { return <span className="block w-5 space-y-1"><span className="block h-0.5 bg-current" /><span className="block h-0.5 bg-current" /><span className="block h-0.5 bg-current" /></span>; }
