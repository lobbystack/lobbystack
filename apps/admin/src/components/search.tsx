import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SearchProps = {
  className?: string;
  placeholder?: string;
};

export function Search({ className = "", placeholder = "Search" }: SearchProps) {
  return (
    <Button
      className={cn(
        "group relative h-8 w-full flex-1 justify-start rounded-md bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64",
        className,
      )}
      variant="outline"
    >
      <SearchIcon
        aria-hidden="true"
        className="absolute start-2 top-1/2 -translate-y-1/2"
        size={16}
      />
      <span className="ms-4">{placeholder}</span>
      <kbd className="pointer-events-none absolute end-1 top-1 hidden h-5 items-center gap-1 rounded-sm border bg-muted px-2 font-mono text-[10px] font-medium opacity-100 select-none group-hover:bg-accent sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}
