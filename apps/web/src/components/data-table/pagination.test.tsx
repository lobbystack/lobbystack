import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { DataTablePagination } from "@/components/data-table/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  value: string;
};

const columns: Array<ColumnDef<Row>> = [
  {
    accessorKey: "value",
    header: () => "Value",
  },
];

function PaginationHarness() {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  });

  const data = React.useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: `Row ${index + 1}` })),
    [],
  );

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DataTablePagination
        labels={{
          rowsPerPage: "Rows per page",
          pageOf: (page, total) => `Page ${page} of ${total}`,
          firstPage: "First page",
          previousPage: "Previous page",
          nextPage: "Next page",
          lastPage: "Last page",
          goToPage: (page) => `Go to page ${page}`,
        }}
        table={table}
      />
    </div>
  );
}

describe("DataTablePagination", () => {
  it("changes the active page when the next control is clicked", async () => {
    const user = userEvent.setup();

    render(<PaginationHarness />);

    expect(screen.getByText("Row 1")).toBeTruthy();
    expect(screen.queryByText("Row 6")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.queryByText("Row 1")).toBeNull();
    expect(screen.getByText("Row 6")).toBeTruthy();
    expect(screen.getAllByText("Page 2 of 3").length).toBeGreaterThan(0);
  });
});
