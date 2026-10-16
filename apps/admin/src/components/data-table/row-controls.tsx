import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Same as the services and rules tables: a narrow column that scrolls with the rest.
const DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS = "w-12";
const DATA_TABLE_ROW_ACTIONS_CELL_CLASS = "text-right";

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
