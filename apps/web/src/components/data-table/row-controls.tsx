import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const DATA_TABLE_ROW_ACCESSORY_COLGROUP_CLASS = "w-6";
const DATA_TABLE_ROW_ACCESSORY_CELL_CLASS = "w-6 pr-0 text-right";
const DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS = "w-[8%]";
const DATA_TABLE_ROW_ACTIONS_CELL_CLASS = "w-16 text-right";
const DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS = "translate-x-12";

function DataTableRowAccessory({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("ml-auto flex w-6 translate-x-6 items-center justify-end", className)}
      data-slot="data-table-row-accessory"
    >
      {children}
    </div>
  );
}

function DataTableRowActions({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex w-16 translate-x-2 justify-end pr-0", className)}
      data-slot="data-table-row-actions"
    >
      {children}
    </div>
  );
}

export {
  DATA_TABLE_ROW_ACCESSORY_CELL_CLASS,
  DATA_TABLE_ROW_ACCESSORY_COLGROUP_CLASS,
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS,
  DataTableRowAccessory,
  DataTableRowActions,
};
