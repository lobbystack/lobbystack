import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { TableCard } from "@/components/ui/table";

export function MetricCardGridSkeleton({ count = 4 }: { count?: number }) {
  const columnClass = count === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

  return (
    <Surface className={`grid sm:grid-cols-2 ${columnClass}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="border-b p-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          key={index}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-10 w-20" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </Surface>
  );
}

export function TableCardSkeleton({ columns = 5 }: { columns?: number }) {
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
          {Array.from({ length: 5 }).map((_, rowIndex) => (
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
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    </div>
  );
}

export function SidebarTeamSkeleton() {
  return (
    <Item className="pointer-events-none gap-2 px-3 py-2" size="xs" variant="outline">
      <ItemMedia variant="icon">
        <Skeleton className="size-4 rounded-full" />
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </ItemContent>
      <ItemActions>
        <Skeleton className="size-4 rounded-full" />
      </ItemActions>
    </Item>
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
