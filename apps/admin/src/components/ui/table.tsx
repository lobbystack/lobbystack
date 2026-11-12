"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { surfaceClassName } from "@/components/ui/surface"

type TableProps = React.ComponentProps<"table"> & {
  containerClassName?: string
}

function Table({
  className,
  containerClassName,
  ...props
}: TableProps) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom type-body", className)}
        {...props}
      />
    </div>
  )
}

function TableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-card"
      className={cn(surfaceClassName, className)}
      {...props}
    />
  )
}

/**
 * `empty` hides the column titles below lg, for a table showing only its
 * empty message: with the sidebar open, the titles of a wide table crowd that
 * message on anything narrower.
 */
function TableHeader({ className, empty = false, ...props }: React.ComponentProps<"thead"> & { empty?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-table-header [&_tr]:border-b", empty && "max-lg:hidden", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 type-title [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-12 px-4 text-left align-middle type-table-head whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-4 align-middle whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

/**
 * The row-actions column of a fixed-layout table: an icon-sm button (32px)
 * plus the cell's 16px padding on each side. Give the columns without a fixed
 * width percentages that add up to 100%, so this one keeps its width.
 */
function TableActionsColumn() {
  return <col data-slot="table-actions-column" className="w-16" />
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 type-body-muted", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableCard,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableActionsColumn,
}
