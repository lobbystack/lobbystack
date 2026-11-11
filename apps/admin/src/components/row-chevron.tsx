import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** The small chevron after a clickable row's title on Home. Decorative, so it stays out of the row's accessible name. */
export function RowChevron({ className }: { className?: string }) {
  return <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
}
