import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<ClassValue>): string {
  return twMerge(clsx(inputs));
}

export function getPageNumbers(currentPage: number, totalPages: number): Array<number | "..."> {
  const maxVisiblePages = 5;
  const rangeWithDots: Array<number | "..."> = [];

  if (totalPages <= maxVisiblePages) {
    for (let page = 1; page <= totalPages; page += 1) {
      rangeWithDots.push(page);
    }
    return rangeWithDots;
  }

  rangeWithDots.push(1);

  if (currentPage <= 3) {
    for (let page = 2; page <= 4; page += 1) {
      rangeWithDots.push(page);
    }
    rangeWithDots.push("...", totalPages);
    return rangeWithDots;
  }

  if (currentPage >= totalPages - 2) {
    rangeWithDots.push("...");
    for (let page = totalPages - 3; page <= totalPages; page += 1) {
      rangeWithDots.push(page);
    }
    return rangeWithDots;
  }

  rangeWithDots.push("...");
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    rangeWithDots.push(page);
  }
  rangeWithDots.push("...", totalPages);

  return rangeWithDots;
}
