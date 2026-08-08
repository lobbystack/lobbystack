import {
  ChartBlockSkeleton,
  DetailPageSkeleton,
  MetricCardGridSkeleton,
  PageHeaderSkeleton,
  SettingsItemGroupSkeleton,
  SplitPaneSkeleton,
  TableCardSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

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
          <Surface className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="space-y-2" key={index}>
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </Surface>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <Surface className="p-6">
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
          </Surface>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <ChartBlockSkeleton height={350} />
        <Surface className="p-6 lg:col-span-3">
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
        </Surface>
      </div>
    </div>
  );
}

/**
 * Generic skeleton used while any onboarding route's queries are loading.
 *
 * Renders the same wordmark + centred column structure as `OnboardingShell`
 * so the layout doesn't visually shift when the real content arrives.
 */
export function OnboardingRouteSkeleton() {
  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <header className="flex w-full items-center justify-center pt-16 pb-8">
        <Skeleton className="h-7 w-32" />
      </header>
      <main className="flex flex-1 flex-col items-center px-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="mt-10 flex w-full flex-col gap-3">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </main>
      <footer className="flex justify-center pb-12 pt-16">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton className="h-1.5 w-1.5 rounded-full" key={index} />
          ))}
        </div>
      </footer>
    </div>
  );
}
