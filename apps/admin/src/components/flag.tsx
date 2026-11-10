"use client";

import { GlobeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { hasFlagComponent, loadFlagComponent, type FlagComponent } from "@/lib/country-flag-components";
import { cn } from "@/lib/utils";

// A list shows the same flags again as it filters, so each one is kept once its chunk has loaded.
const loadedFlags = new Map<string, FlagComponent>();
const FLAG_SHAPE = "inline-block h-[1em] w-[1.5em] shrink-0 self-center overflow-hidden bg-muted align-middle rounded-[3px] ring-1 ring-inset ring-foreground/15";

/**
 * A country's flag as an SVG, so it looks the same on every operating system.
 * Each flag is its own chunk, fetched when the page first shows it. A missing
 * region (a shared currency such as XAF) shows a globe.
 */
export function Flag({ className, region }: { className?: string; region: string | null }) {
  const code = region?.toUpperCase() ?? null;
  const [loaded, setLoaded] = useState<{ code: string; component: FlagComponent } | null>(() => {
    const component = code ? loadedFlags.get(code) : null;
    return code && component ? { code, component } : null;
  });

  useEffect(() => {
    if (!code) return;
    const cached = loadedFlags.get(code);
    if (cached) {
      setLoaded({ code, component: cached });
      return;
    }

    let active = true;
    void loadFlagComponent(code)?.then((component) => {
      loadedFlags.set(code, component);
      if (active) setLoaded({ code, component });
    });
    return () => { active = false; };
  }, [code]);

  if (!code || !hasFlagComponent(code)) return <GlobeIcon aria-hidden="true" className={cn("size-3.5 shrink-0 self-center text-muted-foreground", className)} />;
  const FlagSvg = loaded?.code === code ? loaded.component : null;
  return (
    <span aria-hidden="true" className={cn(FLAG_SHAPE, className)} data-flag={code}>
      {FlagSvg ? <FlagSvg className="block size-full" /> : null}
    </span>
  );
}
