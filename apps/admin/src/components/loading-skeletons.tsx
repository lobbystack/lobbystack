import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { statusShape } from "@/components/ui/status";
import { Surface, surfaceClassName } from "@/components/ui/surface";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableActionsColumn, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** `titles` holds each card's real title, hidden so its placeholder is as wide as the text, or null for a default width. */
export function MetricCardGridSkeleton({ count = 4, titles }: { count?: number; titles?: ReadonlyArray<string | null> }) {
  const columnClass = count === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

  return (
    <Surface aria-busy="true" className={`grid sm:grid-cols-2 ${columnClass}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="border-b p-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          key={index}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {titles?.[index] ? <HiddenTextSkeleton className="type-card-title">{titles[index]!}</HiddenTextSkeleton> : <Skeleton className="h-5 w-28" />}
              <Skeleton className="h-10 w-20" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </Surface>
  );
}

/**
 * Stands in for Home's phone line and last 30 days: the status heading and its dot over the card, then in the card
 * one number with its Test call level with it and who answers it first, a divider, and the three results, each
 * title with its value. The text pieces hold their real labels, hidden. Pass `status` and `answersFirst` for the
 * phone part, which Home keeps while it doesn't know whether the business has a number; without them the card is
 * the results alone, with no heading, as for a business with no number. Without `testCall` the row leaves the
 * button out.
 */
export function PhoneResultsSkeleton({ labels }: { labels: { results: ReadonlyArray<string>; status?: string; answersFirst?: string; testCall?: string } }) {
  const card = (
    <Surface>
      {labels.status ? (
        <div className="flex flex-col gap-2 border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div aria-hidden="true" className="type-metric-sm min-w-0 flex-1"><Skeleton className="h-[1lh] w-44 max-w-full" /></div>
            {labels.testCall ? <div className="flex shrink-0"><HeaderButtonSkeleton label={labels.testCall} /></div> : null}
          </div>
          {labels.answersFirst ? <Skeleton aria-hidden="true" className="inline-flex h-5 w-fit items-center gap-1 rounded-full px-1.5 type-label whitespace-nowrap"><span className="invisible">{labels.answersFirst}</span><span className="invisible size-3 shrink-0" /></Skeleton> : null}
        </div>
      ) : null}
      <div className="grid sm:grid-cols-3">
        {labels.results.map((title) => (
          <div className="flex min-w-0 flex-col gap-2 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0" key={title}>
            <HiddenTextSkeleton className="type-card-title">{title}</HiddenTextSkeleton>
            <Skeleton className="h-10 w-24" />
          </div>
        ))}
      </div>
    </Surface>
  );
  if (!labels.status) return <div aria-busy="true">{card}</div>;
  return (
    <section aria-busy="true" className="flex flex-col gap-3">
      <div className="flex items-start gap-2 px-1">
        <HiddenTextSkeleton className="type-section-title">{labels.status}</HiddenTextSkeleton>
        <span aria-hidden="true" className="flex h-lh shrink-0 items-center type-section-title"><Skeleton className="size-2 rounded-full" /></span>
      </div>
      {card}
    </section>
  );
}

export function TableCardSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <TableCard>
        <div className="flex h-12 items-center border-b bg-table-header px-4">
          <div
            className="grid w-full gap-4"
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
              className="grid gap-4 border-b p-4 last:border-b-0"
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

/** The workspace switcher's row: the same padding, the 24px initial, a one-line name and the chevron, and no border. */
export function SidebarTeamSkeleton() {
  return (
    <Item aria-hidden="true" className="pointer-events-none w-full gap-2 rounded-lg px-2 py-2" size="xs">
      <ItemMedia>
        <Skeleton className="size-6 rounded-full" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <Skeleton className="h-4 w-32 max-w-full" />
      </ItemContent>
      <ItemActions>
        <Skeleton className="size-4" />
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

/** Placeholder rows for the appointments list, matching its seven columns and 48px rows. */
export function AppointmentRowsSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  const cells = ["w-36", "w-28", "w-24", "w-20", "status", "w-14", "w-16 h-8 ms-auto"];

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow className="hover:bg-transparent" key={rowIndex}>
          {cells.map((width, cellIndex) => (
            <TableCell key={cellIndex}>
              {width === "status" ? <StatusSkeleton /> : <Skeleton className={`h-4 ${width}`} />}
              {rowIndex === 0 && cellIndex === 0 ? <span className="sr-only">{label}</span> : null}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/**
 * Stands in for the appointments calendar while it loads: its header, then a
 * time grid with a column per day (Day and Week) or a month of days, with a
 * few booking placeholders. The header holds its real labels, hidden.
 */
export function AppointmentsCalendarSkeleton({ label, labels, tabs, view, days }: { label: string; labels: { today: string; title: string }; tabs: { range: string[]; view: string[] }; view: "day" | "week" | "month"; days: number }) {
  const hours = 9;
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-4">
      <span className="sr-only" role="status">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <HiddenTextSkeleton className="shrink-0" skeletonClassName="h-8 rounded-full px-3 type-body">{labels.today}</HiddenTextSkeleton>
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 basis-40"><HiddenTextSkeleton className="type-section-title">{labels.title}</HiddenTextSkeleton></div>
        <TabsListSkeleton labels={tabs.range} />
        <TabsListSkeleton labels={tabs.view} />
      </div>
      {view === "month" ? (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-7 border-b">
            {Array.from({ length: 7 }, (_, index) => <div className="px-2 py-2" key={index}><Skeleton className="h-3 w-8" /></div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, index) => (
              <div className={cn("flex flex-col gap-1 p-1 md:h-32", index % 7 !== 6 && "border-r", index < 35 && "border-b")} key={index}>
                <Skeleton className="size-7 self-center rounded-full md:self-start" />
                {index % 3 === 1 ? <Skeleton className="hidden h-5 w-full md:block" /> : <div className="h-3 md:hidden" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className={cn(days > 1 && "min-w-[30rem]")}>
            <div className="grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${days}, minmax(0, 1fr))` }}>
              <div />
              {Array.from({ length: days }, (_, index) => <div className="flex items-center justify-center gap-1.5 border-l py-2" key={index}><Skeleton className="h-3 w-8" /><Skeleton className="size-7 rounded-full" /></div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: hours * 48 }}>
                {Array.from({ length: hours - 1 }, (_, index) => <Skeleton className="absolute right-2 h-3 w-8" key={index} style={{ top: (index + 1) * 48 - 6 }} />)}
              </div>
              {Array.from({ length: days }, (_, index) => (
                <div className="relative border-l" key={index} style={{ height: hours * 48, backgroundImage: "linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)", backgroundSize: "100% 48px" }}>
                  {index % 2 === 0 ? <Skeleton className="absolute inset-x-0.5" style={{ top: 48 + (index % 3) * 48, height: 48 }} /> : null}
                  {index % 3 === 1 ? <Skeleton className="absolute inset-x-0.5" style={{ top: 4 * 48, height: 72 }} /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder rows for the calls table, with the column widths of the real rows. */
export function CallRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell className="max-w-0"><Skeleton className="h-4 w-3/4" /></TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-32" /></TableCell>
          <TableCell className="w-12"><Skeleton className="ms-auto size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Stands in for DataTablePagination: the rows-per-page select, the row range and four page buttons, with its responsive layout. */
export function DataTablePaginationSkeleton({ rowsPerPage }: { rowsPerPage: string }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:flex-nowrap sm:justify-end sm:px-2 lg:gap-x-8">
      <div className="order-3 flex w-full flex-none items-center justify-between gap-2 sm:order-0 sm:w-auto sm:justify-start">
        <HiddenTextSkeleton className="type-body">{rowsPerPage}</HiddenTextSkeleton>
        <Skeleton className="h-8 w-[75px]" />
      </div>
      <div className="flex flex-1 items-center justify-start sm:w-[160px] sm:flex-none sm:justify-center">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="hidden size-8 rounded-full lg:block" />
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="hidden size-8 rounded-full lg:block" />
      </div>
    </div>
  );
}

/** One account setting: its title, what it is for, and the value it holds, with the Change button on the right. */
function AccountSettingSkeleton() {
  return (
    <Item variant="outline">
      <ItemContent>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-52 max-w-full" />
        <Skeleton className="h-6 w-44 max-w-full" />
      </ItemContent>
      <ItemActions>
        <Skeleton className="h-8 w-20 rounded-full" />
      </ItemActions>
    </Item>
  );
}

/** The rows of a passkey list: a name and the day it was added, then Rename and Remove. */
export function PasskeyRowsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: count }).map((_, index) => (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={index}>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for the contacts table, with the fixed column layout of the real rows. */
export function ContactRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          <TableCell>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="size-5 rounded-full" />
            </div>
          </TableCell>
          <TableCell>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="mx-auto h-4 w-5" /></TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="ms-auto size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Placeholder rows for the knowledge table, with the fixed column layout of the real rows. */
export function KnowledgeRowsSkeleton({ rows = 10, columns = {} }: { rows?: number; columns?: { checkbox?: boolean; toggle?: boolean; menu?: boolean } }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          {columns.checkbox ? <TableCell><Skeleton className="size-4" /></TableCell> : null}
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
          </TableCell>
          <TableCell className="max-w-0"><Skeleton className="h-4 w-3/4" /></TableCell>
          <TableCell><StatusSkeleton /></TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-32" /></TableCell>
          {columns.toggle ? <TableCell><Skeleton className="ms-auto h-[18px] w-8 rounded-full" /></TableCell> : null}
          {columns.menu === false ? null : <TableCell><Skeleton className="size-8" /></TableCell>}
        </TableRow>
      ))}
    </>
  );
}

/**
 * The Specific knowledge page of an agent before its data arrives: the
 * agent's own sources, then the shared ones with this agent's switch, each
 * section's title and Select button in place.
 */
export function AgentKnowledgeSkeleton({ labels }: { labels: { own: string; shared: string; select: string; manageShared: string; headings: [title: string, preview: string, status: string, added: string]; toggle: string; rowsPerPage: string } }) {
  const section = (title: string, extra: string | null, toggle: boolean) => (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <HiddenTextSkeleton className="type-section-title">{title}</HiddenTextSkeleton>
        <div className="flex items-center gap-2">
          {extra ? <HiddenTextSkeleton className="type-button-sm" skeletonClassName="h-8 px-3 rounded-full">{extra}</HiddenTextSkeleton> : null}
          <HiddenTextSkeleton className="type-button-sm" skeletonClassName="h-8 px-3 rounded-full">{labels.select}</HiddenTextSkeleton>
        </div>
      </div>
      <TableCard>
        <Table className="min-w-[60rem] w-full table-fixed">
          <colgroup><col className="w-[22%]" /><col className="w-[42%]" /><col className="w-[12%]" /><col className="w-[18%]" />{toggle ? <col className="w-28" /> : null}<TableActionsColumn /></colgroup>
          <TableHeader>
            <TableRow>
              {labels.headings.map((heading, index) => <TableHead className={index === 3 ? "text-right" : undefined} key={heading}>{heading}</TableHead>)}
              {toggle ? <TableHead className="text-right">{labels.toggle}</TableHead> : null}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody><KnowledgeRowsSkeleton columns={{ toggle }} rows={3} /></TableBody>
        </Table>
      </TableCard>
      <DataTablePaginationSkeleton rowsPerPage={labels.rowsPerPage} />
    </section>
  );
  return <div aria-busy="true" className="flex w-full flex-col gap-10">{section(labels.own, null, false)}{section(labels.shared, labels.manageShared, true)}</div>;
}

/** A website's pages in its dialog, before they arrive: a row per page with its address and switch. */
export function WebsitePagesSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col divide-y divide-border/70">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 py-3" key={index}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          <Skeleton className="h-[18px] w-8 rounded-full" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}

/** The whole knowledge page body, for the moment before the workspace is known and the real table can render. */
export function KnowledgePageSkeleton({ headings, rowsPerPage }: { headings: [title: string, preview: string, status: string, added: string]; rowsPerPage: string }) {
  return (
    <>
      <TableCard>
        <Table className="min-w-[60rem] w-full table-fixed">
          <colgroup><col className="w-[20%]" /><col className="w-[46%]" /><col className="w-[12%]" /><col className="w-[22%]" /><TableActionsColumn /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>{headings[0]}</TableHead>
              <TableHead>{headings[1]}</TableHead>
              <TableHead>{headings[2]}</TableHead>
              <TableHead className="text-right">{headings[3]}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody aria-busy="true"><KnowledgeRowsSkeleton /></TableBody>
        </Table>
      </TableCard>
      <DataTablePaginationSkeleton rowsPerPage={rowsPerPage} />
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4 px-1">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <Card className="border-border/70">
          <CardContent className="flex flex-col gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="flex flex-col gap-2" key={index}>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

/**
 * Stands in for a header button with a leading icon, such as "+ Add knowledge". The label stays in the layout
 * but is hidden, so the placeholder is as wide as the real button in every language.
 */
export function HeaderButtonSkeleton({ label, trailingIcon = false }: { label: string; trailingIcon?: boolean }) {
  return (
    <Skeleton
      aria-hidden="true"
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 type-button whitespace-nowrap"
    >
      <span className="invisible size-4 shrink-0" />
      <span className="invisible">{label}</span>
      {trailingIcon ? <span className="invisible size-4 shrink-0" /> : null}
    </Skeleton>
  );
}

/**
 * Stands in for a TabsList. It copies the list's height and padding and the triggers' padding and type,
 * with the real labels hidden in place, so it is as wide as the real tabs in every language.
 */
export function TabsListSkeleton({ labels }: { labels: string[] }) {
  return (
    <Skeleton aria-hidden="true" className="inline-flex h-9 w-fit shrink-0 items-center justify-center gap-1 rounded-full p-1">
      {labels.map((label) => (
        <span
          className="invisible inline-flex h-full flex-1 items-center justify-center border border-transparent px-3 py-1.5 type-label whitespace-nowrap"
          key={label}
        >
          {label}
        </span>
      ))}
    </Skeleton>
  );
}

/** Placeholder rows for the services table, with the fixed column layout of the real rows. */
export function ServiceRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-28" />
            </div>
          </TableCell>
          <TableCell className="max-w-0"><Skeleton className="h-4 w-3/4" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><StatusSkeleton /></TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** The services table and its pagination, for the moment before the workspace is known and the real table can render. */
export function ServicesPageSkeleton({ headings, rowsPerPage }: { headings: [title: string, preview: string, price: string, status: string, added: string]; rowsPerPage: string }) {
  return (
    <>
      <TableCard>
        <Table className="min-w-[60rem] w-full table-fixed">
          <colgroup><col className="w-[25%]" /><col className="w-[42%]" /><col className="w-[18%]" /><col className="w-[15%]" /><col className="w-48" /><TableActionsColumn /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>{headings[0]}</TableHead>
              <TableHead>{headings[1]}</TableHead>
              <TableHead>{headings[2]}</TableHead>
              <TableHead>{headings[3]}</TableHead>
              <TableHead className="text-right">{headings[4]}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody aria-busy="true"><ServiceRowsSkeleton /></TableBody>
        </Table>
      </TableCard>
      <DataTablePaginationSkeleton rowsPerPage={rowsPerPage} />
    </>
  );
}

/** Placeholder rows for the employees table, with the fixed column layout of the real rows. */
export function EmployeeRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-24" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <StatusSkeleton />
              <Skeleton className="h-4 w-20" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Rules' rows: the handle, title, channel (holding `channelLabel`, the label most rules show, hidden), preview, status, date and menu. */
export function RuleRowsSkeleton({ channelLabel, handle = true, rows = 10 }: { channelLabel: string; handle?: boolean; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRow className="hover:bg-transparent" key={index}>
          {handle ? <TableCell className="pr-0"><Skeleton className="size-7 rounded-md" /></TableCell> : null}
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><HiddenTextSkeleton className="type-body">{channelLabel}</HiddenTextSkeleton></TableCell>
          <TableCell className="max-w-0"><Skeleton className="h-4 w-3/4" /></TableCell>
          <TableCell><StatusSkeleton /></TableCell>
          <TableCell><Skeleton className="ms-auto h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="size-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** The rules table and its pagination, for the moment before the workspace is known and the real table can render. */
export function RulesPageSkeleton({ channelLabel, headings, rowsPerPage }: { channelLabel: string; headings: [title: string, channel: string, preview: string, status: string, added: string]; rowsPerPage: string }) {
  return (
    <>
      <TableCard>
        <Table className="min-w-[60rem] w-full table-fixed">
          <colgroup><col className="w-12" /><col className="w-[25%]" /><col className="w-[20%]" /><col className="w-[37%]" /><col className="w-[18%]" /><col className="w-48" /><TableActionsColumn /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>{headings[0]}</TableHead>
              <TableHead>{headings[1]}</TableHead>
              <TableHead>{headings[2]}</TableHead>
              <TableHead>{headings[3]}</TableHead>
              <TableHead className="text-right">{headings[4]}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody aria-busy="true"><RuleRowsSkeleton channelLabel={channelLabel} /></TableBody>
        </Table>
      </TableCard>
      <DataTablePaginationSkeleton rowsPerPage={rowsPerPage} />
    </>
  );
}

/**
 * Stands in for the analytics header: the granularity menu, and the calendar button joined to the range menu.
 * Each holds its real label, hidden, so it is as wide as the real button in every language.
 */
export function AnalyticsControlsSkeleton({ granularityLabel, rangeLabel }: { granularityLabel: string; rangeLabel: string }) {
  return (
    <>
      <Skeleton aria-hidden="true" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-transparent px-5 type-button whitespace-nowrap">
        <span className="invisible">{granularityLabel}</span>
        <span className="invisible size-4 shrink-0" />
      </Skeleton>
      <div aria-hidden="true" className="flex w-fit items-stretch">
        <Skeleton className="size-10 rounded-full rounded-r-none" />
        <Skeleton className="inline-flex h-10 max-w-56 items-center rounded-full rounded-l-none border border-transparent border-l-0 px-5 type-button whitespace-nowrap">
          <span className="invisible truncate">{rangeLabel}</span>
        </Skeleton>
      </div>
    </>
  );
}

/** Stands in for a small outline button such as "Connect" or "Manage", sized from its hidden label. */
export function SmallButtonSkeleton({ label }: { label: string }) {
  return (
    <Skeleton aria-hidden="true" className="inline-flex h-8 shrink-0 items-center rounded-full border border-transparent px-3 type-title whitespace-nowrap">
      <span className="invisible">{label}</span>
    </Skeleton>
  );
}

/** A whole integration card, for a card that may not exist once its status has loaded. */
export function IntegrationCardSkeleton({ label }: { label: string }) {
  return (
    <li aria-hidden="true" className={`${surfaceClassName} p-4`}>
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center"><Skeleton className="size-7 rounded-full" /></div>
        <SmallButtonSkeleton label={label} />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    </li>
  );
}

/**
 * A settings section while its data loads: the title and description are placeholders too, so the whole
 * section turns real together. Each holds its real text, hidden, so it is as wide as the text it stands in for.
 */
export function SectionSkeleton({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div aria-hidden="true" className="type-section-title">
            <Skeleton className="h-6 w-fit"><span className="invisible">{title}</span></Skeleton>
          </div>
          {description ? (
            <div aria-hidden="true" className="type-section-description">
              <Skeleton className="h-5 w-fit max-w-full"><span className="invisible">{description}</span></Skeleton>
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Placeholder rows for a list of credentials, such as API keys or MCP connections, with the real rows' padding and two text lines. */
export function CredentialRowsSkeleton({ actions, rows = 2 }: { actions: number; rows?: number }) {
  return (
    <Surface>
      <ul aria-busy="true" className="divide-y">
        {Array.from({ length: rows }).map((_, index) => (
          <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6" key={index}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex h-6 items-center"><Skeleton className="h-4 w-40" /></div>
              <div className="flex h-6 items-center"><Skeleton className="h-4 w-64 max-w-full" /></div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {Array.from({ length: actions }).map((__, action) => <Skeleton className="h-8 w-20" key={action} />)}
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/** A placeholder for a piece of fixed text. It holds the real text, hidden, so it is as wide and tall as the text. `skeletonClassName` shapes the placeholder itself, such as a button or a full-width bar. */
/** Stands in for a Status chip: its shape and size, holding the label hidden when it is known. */
export function StatusSkeleton({ children, className }: { children?: string; className?: string }) {
  return <Skeleton aria-hidden="true" className={cn(statusShape(), className)}><span className={children ? "invisible" : "invisible w-12"}>{children ?? "\u00a0"}</span></Skeleton>;
}

export function HiddenTextSkeleton({ children, className, skeletonClassName }: { children: string; className?: string; skeletonClassName?: string }) {
  return <div aria-hidden="true" className={className}><Skeleton className={skeletonClassName ? `max-w-full ${skeletonClassName}` : "w-fit max-w-full"}><span className="invisible">{children}</span></Skeleton></div>;
}

/** Stands in for Getting started on Home: its heading row and the list of setup steps, so the guide doesn't push the page down when it loads. */
export function SetupGuideSkeleton({ labels }: { labels: { title: string; skip: string; steps: string[] } }) {
  return (
    <section aria-busy="true" className="flex w-full flex-col gap-4">
      <HiddenTextSkeleton className="type-section-title">{labels.title}</HiddenTextSkeleton>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton aria-hidden="true" className="size-5 shrink-0 rounded-full" />
          <Skeleton aria-hidden="true" className="h-5 w-56 max-w-full" />
        </div>
        <Skeleton aria-hidden="true" className="inline-flex h-10 shrink-0 items-center rounded-full border border-transparent px-5 type-button whitespace-nowrap"><span className="invisible">{labels.skip}</span></Skeleton>
      </div>
      <Surface>
        <div className="divide-y divide-border">
          {labels.steps.map((step) => (
            <div className="flex min-h-16 items-center gap-4 px-6" key={step}>
              <Skeleton aria-hidden="true" className="size-6 shrink-0 rounded-full" />
              <HiddenTextSkeleton className="type-body-lg">{step}</HiddenTextSkeleton>
            </div>
          ))}
        </div>
      </Surface>
    </section>
  );
}

/** The Passkeys card before its list, or whether passkeys are on at all, is known. */
export function PasskeysCardSkeleton() {
  return (
    <Item className="flex-wrap" variant="outline">
      <ItemContent>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </ItemContent>
      <ItemActions>
        <Skeleton className="h-8 w-32 rounded-full" />
      </ItemActions>
      <div className="w-full basis-full">
        <PasskeyRowsSkeleton />
      </div>
    </Item>
  );
}

/** The account page while its data loads: Email and Password side by side, then Passkeys. `label` is what a screen reader hears. */
export function AccountSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-8" role="status">
      <span className="sr-only">{label}</span>
      <div className="grid gap-8 md:grid-cols-2">
        <AccountSettingSkeleton />
        <AccountSettingSkeleton />
      </div>
      <PasskeysCardSkeleton />
    </div>
  );
}

/** Stands in for the phone number chooser: the country and area code row, and the list of numbers. */
export function PhoneNumberChooserSkeleton({ labels, rows = 4 }: { labels: { country: string; areaCode: string; search: string; phoneNumber: string }; rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_160px_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <span className="type-title">{labels.country}</span>
          <Skeleton aria-hidden="true" className="h-10 w-20 rounded-xl" />
        </div>
        <div aria-hidden="true" className="hidden sm:block" />
        <div className="flex flex-col gap-2">
          <span className="type-title">{labels.areaCode}</span>
          <Skeleton aria-hidden="true" className="h-10 w-full rounded-xl" />
        </div>
        <HiddenTextSkeleton skeletonClassName="inline-flex h-10 w-full items-center justify-center rounded-full px-5 type-button whitespace-nowrap sm:w-fit">{labels.search}</HiddenTextSkeleton>
      </div>
      <Surface className="flex h-96 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4 type-title text-muted-foreground">
          <span>{labels.phoneNumber}</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          {Array.from({ length: rows }).map((_, index) => <Skeleton aria-hidden="true" className="h-12 w-full" key={index} />)}
        </div>
      </Surface>
    </div>
  );
}

/**
 * The brand step's form while the server decides whether the step applies and
 * which fields it asks. Both fields hold a place, since either can appear, and
 * each line holds its real text, hidden, so the form keeps its size in every
 * language.
 */
export function OnboardingBrandSkeleton({ labels }: { labels: { name: string; nameHint: string; logo: string; logoChoose: string; logoHint: string; preview: string; continue: string; skip: string } }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <span className="type-title">{labels.name}</span>
          <Skeleton aria-hidden="true" className="h-10 w-full rounded-xl" />
          <HiddenTextSkeleton className="type-body">{labels.nameHint}</HiddenTextSkeleton>
        </div>
        <div className="flex flex-col gap-3">
          <span className="type-title">{labels.logo}</span>
          <Skeleton aria-hidden="true" className="flex w-full items-center gap-3 rounded-xl px-4 py-3">
            <span className="invisible size-10 shrink-0 rounded-full" />
            <span className="invisible type-title">{labels.logoChoose}</span>
          </Skeleton>
          <HiddenTextSkeleton className="type-body">{labels.logoHint}</HiddenTextSkeleton>
        </div>
        <div className="flex flex-col gap-2">
          <span className="type-meta">{labels.preview}</span>
          <Surface className="px-4 py-5"><Skeleton aria-hidden="true" className="mx-auto h-6 w-40" /></Surface>
        </div>
      </div>
      <HiddenTextSkeleton className="mt-2" skeletonClassName="flex h-10 w-full items-center justify-center rounded-full type-button">{labels.continue}</HiddenTextSkeleton>
      <HiddenTextSkeleton className="text-center" skeletonClassName="mx-auto h-5">{labels.skip}</HiddenTextSkeleton>
    </div>
  );
}

/** Stands in for the mobile number form on the Verify phone step. */
export function VerifyPhoneFormSkeleton({ labels }: { labels: { mobileNumber: string; hint: string; submit: string } }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="type-title">{labels.mobileNumber}</span>
        <div className="flex min-w-0">
          <Skeleton aria-hidden="true" className="h-10 w-24 rounded-l-xl rounded-r-none" />
          <Skeleton aria-hidden="true" className="h-10 min-w-0 flex-1 rounded-l-none rounded-r-xl" />
        </div>
        <HiddenTextSkeleton className="type-body">{labels.hint}</HiddenTextSkeleton>
      </div>
      <HiddenTextSkeleton className="mt-2" skeletonClassName="flex h-10 w-full items-center justify-center rounded-full type-button">{labels.submit}</HiddenTextSkeleton>
    </div>
  );
}

/** Stands in for the test call and chat beside the Meet your agent form. */
export function TestPanelSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <Skeleton aria-hidden="true" className="size-40 rounded-full" />
        <Skeleton aria-hidden="true" className="h-10 w-28 rounded-full" />
      </div>
      <Skeleton aria-hidden="true" className="h-10 w-full shrink-0 rounded-xl" />
    </div>
  );
}

/** The goal and attribution choices while their answers load: each button's shape, holding its real label so the grid keeps its size. */
export function OnboardingOptionsSkeleton({ gridClassName, itemClassName, labels }: { gridClassName: string; itemClassName: string; labels: ReadonlyArray<string> }) {
  return (
    <div aria-busy="true" className={gridClassName}>
      {labels.map((label) => (
        <Skeleton aria-hidden="true" className={`flex items-center rounded-xl px-4 type-title ${itemClassName}`} key={label}>
          <span className="invisible">{label}</span>
        </Skeleton>
      ))}
    </div>
  );
}

/** The reading line and bar under the wait's slide while the knowledge list answers, so the controls keep their place. */
export function ReadingStatusSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col items-center gap-3">
      <HiddenTextSkeleton className="max-w-full type-body" skeletonClassName="w-fit">{label}</HiddenTextSkeleton>
      <Skeleton aria-hidden="true" className="h-1 w-full rounded-full" />
    </div>
  );
}

/** Stands in for the agent's name, voice, greeting and language on Meet your agent. */
export function MeetFormSkeleton({ labels }: { labels: { name: string; voice: string; greeting: string; language: string } }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      {([["name", "h-10 rounded-xl"], ["voice", "h-10 rounded-xl"], ["greeting", "h-28 rounded-xl"], ["language", "h-10 rounded-xl"]] as const).map(([key, size]) => (
        <div className="flex flex-col gap-2" key={key}>
          <span className="type-title">{labels[key]}</span>
          <Skeleton aria-hidden="true" className={`w-full ${size}`} />
        </div>
      ))}
    </div>
  );
}

/** The open times grid while a day's times load: buttons the size of a time. */
export function OpeningTimesSkeleton({ count = 6 }: { count?: number }) {
  return <div aria-busy="true" className="grid grid-cols-3 gap-2 sm:grid-cols-2">{Array.from({ length: count }, (_, index) => <Skeleton className="h-10 rounded-full" key={index} />)}</div>;
}

/** A combobox's options while they load: a few one-line rows the height of an option. */
export function ComboboxOptionsSkeleton({ rows = 3 }: { rows?: number }) {
  return <div aria-busy="true" className="flex flex-col gap-1 p-1">{Array.from({ length: rows }, (_, index) => <div className="flex h-9 items-center px-3" key={index}><Skeleton className="h-4 w-2/3" /></div>)}</div>;
}

/** A select or input while its options load: the control's own height and full width. */
export function FieldControlSkeleton() {
  return <Skeleton aria-busy="true" className="h-10 w-full rounded-xl" />;
}

/** Stands in for the bell's list while it loads: rows with the icon, title, line and time of a notification. */
export function NotificationListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="flex items-start gap-3 px-4 py-3" key={index}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
