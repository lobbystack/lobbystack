"use client";

import "country-flag-icons/3x2/flags.css";
import { GlobeIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A country's flag as an SVG, so it looks the same on every operating system.
 * The stylesheet carries every flag inline, so showing one costs no request.
 * A missing region (a shared currency such as XAF) shows a globe.
 */
export function Flag({ className, region }: { className?: string; region: string | null }) {
  if (!region) return <GlobeIcon aria-hidden="true" className={cn("size-3.5 shrink-0 self-center text-muted-foreground", className)} />;
  return <span aria-hidden="true" className={cn(`flag:${region.toUpperCase()}`, "inline-block shrink-0 self-center align-middle rounded-[3px] ring-1 ring-inset ring-foreground/15", className)} data-flag={region.toUpperCase()} />;
}
