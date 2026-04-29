import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { TableCard } from "@/components/ui/table";

export function PageHeaderSkeleton({
  title,
  description,
  actionWidth,
  className,
}: {
  title: string;
  description?: string;
  actionWidth?: string;
  className?: string;
}) {
  return (
    <PageHeader
      title={title}
      {...(className ? { className } : {})}
      {...(description ? { description } : {})}
      {...(actionWidth ? { actions: <Skeleton className={`h-9 ${actionWidth}`} /> } : {})}
    />
  );
}

export function MetricCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Surface className="grid sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="border-b p-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          key={index}
        >
          <Skeleton className="h-4 w-24" />
          <div className="mt-8">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        </div>
      ))}
    </Surface>
  );
}

export function TableCardSkeleton({
  columns = 5,
  rows = 5,
  showPagination = true,
}: {
  columns?: number;
  rows?: number;
  showPagination?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TableCard>
        <div className="border-b px-4 py-3">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton className="h-4 w-20" key={index} />
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              className="grid gap-4 border-b px-4 py-4 last:border-b-0"
              key={rowIndex}
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <Skeleton
                  className={`h-4 ${columnIndex === 0 ? "w-24" : columnIndex === columns - 1 ? "w-12" : "w-full"}`}
                  key={columnIndex}
                />
              ))}
            </div>
          ))}
        </div>
      </TableCard>
      {showPagination ? (
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-28" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsItemGroupSkeleton({
  rows = 3,
}: {
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, index) => (
        <Surface className="px-6 py-5" key={index}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-9 w-56 max-w-full" />
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </Surface>
      ))}
    </div>
  );
}

export function SplitPaneSkeleton({
  items = 6,
  showComposer = true,
}: {
  items?: number;
  showComposer?: boolean;
}) {
  return (
    <section className="flex h-full min-w-0 gap-6">
      <div className="flex min-w-0 w-full flex-col gap-3 sm:w-56 lg:w-72 2xl:w-80">
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-background px-4 py-2 sm:static sm:z-auto sm:mx-0 sm:p-0">
          <PageHeaderSkeleton className="py-0" title="" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <div className="-mx-3 no-scrollbar h-full overflow-y-auto p-3">
          {Array.from({ length: items }).map((_, index) => (
            <div className="py-1" key={index}>
              <div className="flex w-full gap-2 rounded-md px-2 py-2">
                <Skeleton className="size-8 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
            </div>
          ))}
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col border bg-background sm:flex sm:rounded-md">
        <div className="border-b bg-card p-4 sm:rounded-t-md">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <div className="flex flex-1 flex-col gap-4 py-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                className={`max-w-72 px-3 py-3 ${index % 2 === 0 ? "self-start rounded-[16px_16px_16px_0]" : "self-end rounded-[16px_16px_0_16px]"}`}
                key={index}
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-4 w-32" />
              </div>
            ))}
          </div>
          {showComposer ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md sm:hidden" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function DetailPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-5 w-32" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Surface className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </Surface>
        <div className="flex flex-col gap-4">
          {Array.from({ length: cards }).map((_, index) => (
            <Surface className="p-6" key={index}>
              <div className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SidebarTeamSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function SidebarUserSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="size-4 rounded-full" />
    </div>
  );
}

export function ChartBlockSkeleton({ height = 320 }: { height?: number }) {
  return (
    <Surface className="p-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="mt-6 w-full rounded-xl" style={{ height }} />
    </Surface>
  );
}
