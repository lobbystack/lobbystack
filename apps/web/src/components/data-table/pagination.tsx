"use client"

import type { Table } from "@tanstack/react-table"
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn, getPageNumbers } from "@/lib/utils"

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  className?: string
  labels: {
    rowsPerPage: string
    pageOf: (page: number, total: number) => string
    firstPage: string
    previousPage: string
    nextPage: string
    lastPage: string
    goToPage: (page: number) => string
  }
}

export function DataTablePagination<TData>({
  table,
  className,
  labels,
}: DataTablePaginationProps<TData>) {
  const totalRows = table.getPrePaginationRowModel().rows.length
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount()
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  if (totalRows <= 10) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between overflow-clip px-2",
        "@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4",
        className,
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div className="flex w-full items-center justify-between">
        <div className="type-body flex w-[100px] items-center justify-center @2xl/content:hidden">
          {labels.pageOf(currentPage, totalPages)}
        </div>
        <div className="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
          <Select
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
            value={`${table.getState().pagination.pageSize}`}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="type-body hidden sm:block">{labels.rowsPerPage}</p>
        </div>
      </div>

      <div className="flex items-center sm:space-x-6 lg:space-x-8">
        <div className="type-body flex w-[100px] items-center justify-center @max-3xl/content:hidden">
          {labels.pageOf(currentPage, totalPages)}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            className="size-8 rounded-md p-0 @max-md/content:hidden"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            type="button"
            variant="outline"
          >
            <span className="sr-only">{labels.firstPage}</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            className="size-8 rounded-md p-0"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            type="button"
            variant="outline"
          >
            <span className="sr-only">{labels.previousPage}</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {pageNumbers.map((pageNumber, index) => (
            <div className="flex items-center" key={`${pageNumber}-${index}`}>
              {pageNumber === "..." ? (
                <span className="type-body-muted px-1">...</span>
              ) : (
                <Button
                  className="h-8 min-w-8 rounded-md px-2"
                  onClick={() => table.setPageIndex(pageNumber - 1)}
                  type="button"
                  variant={currentPage === pageNumber ? "default" : "outline"}
                >
                  <span className="sr-only">{labels.goToPage(pageNumber)}</span>
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            className="size-8 rounded-md p-0"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            type="button"
            variant="outline"
          >
            <span className="sr-only">{labels.nextPage}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            className="size-8 rounded-md p-0 @max-md/content:hidden"
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
    </div>
  )
}
