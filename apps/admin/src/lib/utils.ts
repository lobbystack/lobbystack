import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}

export function safePathname(pathname: string): string {
  return pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
}
