"use client";

import { SearchInput } from "@/components/ui/search-input";

/** The search field above a table. It doesn't submit a form, so Enter does nothing. */
export function TableSearch({ label, onValueChange, value }: { label: string; onValueChange: (value: string) => void; value: string }) {
  return (
    <SearchInput
      aria-label={label}
      groupClassName="w-full sm:max-w-xs"
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
      onValueChange={onValueChange}
      placeholder={label}
      value={value}
    />
  );
}
