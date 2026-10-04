import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS = "w-[8%]";
const DATA_TABLE_ROW_ACTIONS_CELL_CLASS = "w-16 text-right";
const DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS = "translate-x-12";

function DataTableRowActions({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex w-16 justify-end pr-0", className)}
      data-slot="data-table-row-actions"
    >
      {children}
    </div>
  );
}

export {
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS,
  DataTableRowActions,
};
