import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}

export function safePathname(pathname: string): string {
  return pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
}

export function getPageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | "..."> {
  const pages: Array<number | "..."> = [];

  if (totalPages <= 5) {
    for (let page = 1; page <= totalPages; page += 1) pages.push(page);
    return pages;
  }

  pages.push(1);
  if (currentPage <= 3) {
    pages.push(2, 3, 4, "...", totalPages);
  } else if (currentPage >= totalPages - 2) {
    pages.push("...");
    for (let page = totalPages - 3; page <= totalPages; page += 1) pages.push(page);
  } else {
    pages.push("...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
  }

  return pages;
}
