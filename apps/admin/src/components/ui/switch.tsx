"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return <SwitchPrimitive.Root className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50", className)} data-slot="switch" {...props}><SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-xs transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0" data-slot="switch-thumb" /></SwitchPrimitive.Root>;
}

export { Switch };
