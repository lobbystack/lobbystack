import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS = "w-12";
// Below xl the table scrolls sideways, so the actions stay pinned to the right edge where people can reach them.
const DATA_TABLE_ROW_ACTIONS_CELL_CLASS = "text-right max-xl:sticky max-xl:right-0 max-xl:bg-card";

function DataTableRowActions({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex justify-end", className)}
      data-slot="data-table-row-actions"
    >
      {children}
    </div>
  );
}

export {
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DataTableRowActions,
};
