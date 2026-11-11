"use client"

import {
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  type ReactTable,
  type RowData,
} from "@tanstack/react-table"
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Every admin data table only paginates. Manual-pagination tables skip the paginated row model.
export const paginationFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

type DataTablePaginationLabels = {
  rowsPerPage: string
  viewing: (start: number, end: number, total: number) => string
  viewingAll: (total: number) => string
  firstPage: string
  previousPage: string
  nextPage: string
  lastPage: string
}

type DataTablePaginationProps<TData extends RowData> = {
  table: ReactTable<typeof paginationFeatures, TData>
  className?: string
  labels: DataTablePaginationLabels
}

/** Labels for DataTablePagination from the `pagination` keys of a namespace. */
export function useDataTablePaginationLabels(namespace: string): DataTablePaginationLabels {
  const { t } = useTranslation(namespace)
  return {
    rowsPerPage: t("pagination.rowsPerPage"),
    viewing: (start, end, total) => t("pagination.viewing", { start, end, total }),
    viewingAll: (total) => t("pagination.viewingAll", { count: total }),
    firstPage: t("pagination.firstPage"),
    previousPage: t("pagination.previousPage"),
    nextPage: t("pagination.nextPage"),
    lastPage: t("pagination.lastPage"),
  }
}

/** Polar's DataTablePagination layout (clients/packages/orbit/src/components/datatable/DataTablePagination.tsx). */
export function DataTablePagination<TData extends RowData>({
  table,
  className,
  labels,
}: DataTablePaginationProps<TData>) {
  const totalRows = table.getRowCount()
  const { pageIndex, pageSize } = table.state.pagination
  const startRow = pageIndex * pageSize + 1
  const endRow = Math.min(startRow + pageSize - 1, totalRows)

  if (totalRows <= 10) {
    return null
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 sm:flex-nowrap sm:justify-end sm:px-2 lg:gap-x-8",
        className,
      )}
    >
      <div className="order-3 flex w-full flex-none items-center justify-between gap-2 sm:order-0 sm:w-auto sm:justify-start">
        <p className="type-body">{labels.rowsPerPage}</p>
        <Select
          onValueChange={(value) => {
            table.setPageSize(Number(value))
          }}
          value={`${pageSize}`}
        >
          <SelectTrigger className="w-[75px]" size="sm">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 30, 40, 50].map((size) => (
              <SelectItem key={size} value={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="type-body flex flex-1 items-center justify-start sm:w-[160px] sm:flex-none sm:justify-center">
        {startRow === 1 && endRow === totalRows ? labels.viewingAll(totalRows) : labels.viewing(startRow, endRow, totalRows)}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          className="hidden lg:flex"
          size="icon-sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.setPageIndex(0)}
          type="button"
          variant="outline"
        >
          <span className="sr-only">{labels.firstPage}</span>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon-sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          type="button"
          variant="outline"
        >
          <span className="sr-only">{labels.previousPage}</span>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon-sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          type="button"
          variant="outline"
        >
          <span className="sr-only">{labels.nextPage}</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          className="hidden lg:flex"
          size="icon-sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          type="button"
          variant="outline"
        >
          <span className="sr-only">{labels.lastPage}</span>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
