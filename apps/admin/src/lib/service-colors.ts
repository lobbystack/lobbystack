/**
 * The appointments calendar colors each service with one of eight soft
 * colors, the --calendar-N tokens in app/theme.css. A service's id picks its
 * color, so it keeps it on every page, week and device. Two services can
 * share one; the block also names its service.
 */

export const SERVICE_COLOR_COUNT = 8;

/** 1 to 8, the same for the same key every time (FNV-1a). */
export function serviceColor(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % SERVICE_COLOR_COUNT) + 1;
}

// Written out whole so Tailwind finds every class.
const CLASSES = [
  "bg-calendar-1 text-calendar-1-foreground border-calendar-1-accent",
  "bg-calendar-2 text-calendar-2-foreground border-calendar-2-accent",
  "bg-calendar-3 text-calendar-3-foreground border-calendar-3-accent",
  "bg-calendar-4 text-calendar-4-foreground border-calendar-4-accent",
  "bg-calendar-5 text-calendar-5-foreground border-calendar-5-accent",
  "bg-calendar-6 text-calendar-6-foreground border-calendar-6-accent",
  "bg-calendar-7 text-calendar-7-foreground border-calendar-7-accent",
  "bg-calendar-8 text-calendar-8-foreground border-calendar-8-accent",
] as const;

/** The background, text and accent border classes for a service. */
export function serviceColorClasses(key: string): string {
  return CLASSES[serviceColor(key) - 1]!;
}

const DOTS = ["bg-calendar-1-accent", "bg-calendar-2-accent", "bg-calendar-3-accent", "bg-calendar-4-accent", "bg-calendar-5-accent", "bg-calendar-6-accent", "bg-calendar-7-accent", "bg-calendar-8-accent"] as const;

/** A small dot in the service's color, for the phone month grid. */
export function serviceDotClass(key: string): string {
  return DOTS[serviceColor(key) - 1]!;
}
