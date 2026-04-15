import { LogOut, ShieldCheck, Smartphone } from "lucide-react";

import {
  ChartBlockSkeleton,
  DetailPageSkeleton,
  MetricCardGridSkeleton,
  PageHeaderSkeleton,
  SettingsItemGroupSkeleton,
  SplitPaneSkeleton,
  TableCardSkeleton,
} from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceRouteSkeleton({ pathname }: { pathname: string }) {
  if (pathname.startsWith("/calls/")) {
    return <DetailPageSkeleton />;
  }

  if (pathname.startsWith("/contacts/")) {
    return <DetailPageSkeleton />;
  }

  if (pathname === "/messages") {
    return <SplitPaneSkeleton />;
  }

  if (pathname === "/analytics") {
    return (
      <section className="flex flex-1 flex-col gap-6">
        <PageHeaderSkeleton title="Analytics" description="Operational metrics and trends" />
        <ChartBlockSkeleton />
        <MetricCardGridSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <ChartBlockSkeleton height={220} />
          <ChartBlockSkeleton height={220} />
        </div>
      </section>
    );
  }

  if (pathname === "/calls") {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <PageHeaderSkeleton
          actionWidth="w-20"
          description="Recent call activity"
          title="Calls"
        />
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <TableCardSkeleton />
      </div>
    );
  }

  if (pathname === "/contacts") {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <PageHeaderSkeleton description="Saved contacts and activity" title="Contacts" />
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <TableCardSkeleton />
      </div>
    );
  }

  if (pathname === "/integrations") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeaderSkeleton title="Integrations" />
        <SettingsItemGroupSkeleton rows={3} />
      </div>
    );
  }

  if (pathname.startsWith("/settings")) {
    return (
      <div className="flex flex-col gap-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <PageHeaderSkeleton title="Settings" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton className="h-10 w-24 rounded-full" key={index} />
            ))}
          </div>
          <SettingsItemGroupSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/agent")) {
    return (
      <section className="flex flex-1 flex-col gap-6">
        <PageHeaderSkeleton description="Receptionist behavior and knowledge" title="Agent" />
        <SettingsItemGroupSkeleton rows={3} />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton title="Dashboard" />
      <MetricCardGridSkeleton />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="space-y-2" key={index}>
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="flex items-center justify-between gap-3" key={index}>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="space-y-2 text-right">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <ChartBlockSkeleton height={350} />
        <div className="rounded-xl border bg-card p-6 lg:col-span-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="mt-6 space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="flex items-center gap-4" key={index}>
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingNumberRouteSkeleton({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(82,43,173,0.16),_transparent_36%),linear-gradient(180deg,_#120f1d_0%,_#09080d_100%)] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">
            {import.meta.env.VITE_APP_NAME ?? "AI Receptionist"}
          </div>
          <div className="flex items-center gap-3">
            {email ? (
              <span className="hidden text-sm text-zinc-400 sm:inline">{email}</span>
            ) : null}
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onSignOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-xl border-white/10 bg-white/5 text-white shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 shadow-inner shadow-violet-950/40">
                <Smartphone className="size-9" />
              </div>
              <CardTitle className="text-4xl font-semibold tracking-tight">Choose your number</CardTitle>
              <CardDescription className="type-section-description max-w-md text-zinc-300">
                Pick a business number that matches your market.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Skeleton className="h-5 w-32 rounded-full bg-white/10" />
                <div className="rounded-xl border border-white/10 bg-black/20 px-6 py-6 text-center">
                  <Skeleton className="mx-auto h-4 w-24 bg-white/10" />
                  <Skeleton className="mx-auto mt-4 h-10 w-56 bg-white/10" />
                  <Skeleton className="mx-auto mt-3 h-4 w-32 bg-white/10" />
                </div>
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-12 w-full rounded-md bg-white/10" />
                  <Skeleton className="h-10 w-full rounded-md bg-white/10" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function OnboardingVerifyRouteSkeleton({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(82,43,173,0.16),_transparent_36%),linear-gradient(180deg,_#120f1d_0%,_#09080d_100%)] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">
            {import.meta.env.VITE_APP_NAME ?? "AI Receptionist"}
          </div>
          <div className="flex items-center gap-3">
            {email ? (
              <span className="hidden text-sm text-zinc-400 sm:inline">{email}</span>
            ) : null}
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onSignOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-xl border-white/10 bg-white/5 text-white shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 shadow-inner shadow-violet-950/40">
                <ShieldCheck className="size-9" />
              </div>
              <CardTitle className="text-4xl font-semibold tracking-tight">Verify your phone</CardTitle>
              <CardDescription className="type-section-description max-w-md text-zinc-300">
                Confirm your mobile number before provisioning a business line.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Skeleton className="h-12 w-full rounded-md bg-white/10" />
              <Skeleton className="h-4 w-48 bg-white/10" />
              <Skeleton className="h-12 w-full rounded-md bg-white/10" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
