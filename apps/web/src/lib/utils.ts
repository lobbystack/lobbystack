import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPageNumbers(currentPage: number, totalPages: number): Array<number | "..."> {
  const maxVisiblePages = 5
  const rangeWithDots: Array<number | "..."> = []

  if (totalPages <= maxVisiblePages) {
    for (let index = 1; index <= totalPages; index += 1) {
      rangeWithDots.push(index)
    }
  } else {
    rangeWithDots.push(1)

    if (currentPage <= 3) {
      for (let index = 2; index <= 4; index += 1) {
        rangeWithDots.push(index)
      }
      rangeWithDots.push("...", totalPages)
    } else if (currentPage >= totalPages - 2) {
      rangeWithDots.push("...")
      for (let index = totalPages - 3; index <= totalPages; index += 1) {
        rangeWithDots.push(index)
      }
    } else {
      rangeWithDots.push("...")
      for (let index = currentPage - 1; index <= currentPage + 1; index += 1) {
        rangeWithDots.push(index)
      }
      rangeWithDots.push("...", totalPages)
    }
  }

  return rangeWithDots
}
