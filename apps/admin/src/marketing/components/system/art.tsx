import { Server, type LucideIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

// The site's illustration kit: white tiles laid on one tilted plane, each in a
// pale halo, over dashed guide lines. Scenes built from it stay sharp at any
// zoom and carry translated text.

/**
 * The plane a scene lies on. Tilted scenes share one angle, leaning right or
 * mirrored to the left, so the set reads as one; flat scenes face the reader.
 * Neighbouring scenes should use different tilts.
 */
export type Tilt = "right" | "left" | "flat"

export const planes: Record<Tilt, CSSProperties> = {
  right: { transform: "rotateX(42deg) rotateY(-16deg) rotateZ(20deg)", transformStyle: "preserve-3d" },
  left: { transform: "rotateX(42deg) rotateY(16deg) rotateZ(-20deg)", transformStyle: "preserve-3d" },
  flat: {},
}

/** The right-leaning plane, the default. */
export const plane = planes.right

export const tileShadow =
  "shadow-[0_1px_1px_oklch(0_0_0/4%),0_10px_20px_-6px_oklch(0.3_0.02_60/14%),0_30px_60px_-20px_oklch(0.3_0.02_60/22%)]"

/** A white tile inside a pale halo. `accent` gives the beige highlight. */
export function Tile({
  className,
  innerClassName,
  accent,
  children,
}: {
  className?: string
  innerClassName?: string
  accent?: boolean | undefined
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] bg-white/60 p-2 ring-1 ring-black/[0.04] backdrop-blur-[2px]",
        tileShadow,
        className
      )}
    >
      <div
        className={cn(
          "rounded-[1.25rem] border",
          accent
            ? "border-[oklch(0.8_0.04_65)] bg-[linear-gradient(135deg,oklch(0.99_0.008_75),oklch(0.9_0.03_65))] shadow-[inset_0_1px_0_white,0_0_0_5px_oklch(0.9_0.03_65/40%),0_12px_32px_-8px_oklch(0.75_0.06_60/45%)]"
            : "border-black/[0.06] bg-[linear-gradient(180deg,white,oklch(0.985_0.002_70))] shadow-[inset_0_1px_0_white]",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Parallel dashed lines running along the plane. */
export function GuideLines({ count, gap, className }: { count: number; gap: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute left-[-20%] block h-0 w-[140%] border-t border-dashed border-beige-line/80"
          style={{ top: `${index * gap}px` }}
        />
      ))}
    </div>
  )
}

/** A dashed outline under a tile, a sheet's footprint on the plane. */
export function Footprint({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("absolute rounded-[2rem] border border-dashed border-beige-line", className)} />
}

/** A round near-black badge holding an icon, set on a tile's corner. */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground ring-[6px] ring-white/70",
        tileShadow,
        className
      )}
    >
      {children}
    </span>
  )
}

/** A person's initials on beige, where an illustration needs someone. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-xs font-semibold text-foreground/80 ring-2 ring-white",
        className
      )}
    >
      {initials}
    </span>
  )
}

/** A small rounded label inside a tile: a status, a time, a tag. */
export function Chip({ children, strong, className }: { children: ReactNode; strong?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        strong ? "bg-primary text-primary-foreground" : "bg-beige-strong text-foreground/80",
        className
      )}
    >
      {children}
    </span>
  )
}

/** The dashed plane on its own, faint behind a closing call to action. */
export function PlaneGrid({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 [perspective:1800px]", className)}>
      <div className="absolute inset-0 [mask-image:radial-gradient(50%_60%_at_50%_50%,black,transparent)]">
        <div className="absolute top-[-30%] left-[10%] h-[160%] w-[80%]" style={plane}>
          <GuideLines count={16} gap={56} />
        </div>
      </div>
    </div>
  )
}

/**
 * A field of blank tiles on the plane, with one raised tile carrying an icon,
 * the way one machine in a rack is yours.
 */
export function TileFieldArt({ icon: Icon = Server, className }: { icon?: LucideIcon; className?: string }) {
  // An odd grid, so the raised tile sits in the middle cell at every width.
  const size = 5
  const middle = Math.floor((size * size) / 2)
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden [perspective:1800px]", className)}>
      <div className="absolute inset-0 flex items-center justify-center scale-[0.72] md:scale-100">
        <div className="grid w-[82rem] shrink-0 grid-cols-5 gap-7" style={plane}>
          {Array.from({ length: size * size }, (_, index) =>
            index === middle ? (
              <div key={index} className="flex h-44 items-center justify-center">
                <Tile className="rounded-[2.25rem] p-3.5" innerClassName="flex size-32 items-center justify-center rounded-[1.6rem]">
                  <Icon className="size-12 text-foreground/85" strokeWidth={1.5} />
                </Tile>
              </div>
            ) : (
              <span
                key={index}
                className="block h-44 rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,oklch(0.985_0.002_70),oklch(0.955_0.004_70))] shadow-[inset_0_1px_0_white,0_10px_24px_-12px_oklch(0.3_0.02_60/16%)]"
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A scene: a beige panel with the tilted plane in its middle. Children are
 * placed on the plane in its own coordinates, `width` by `height` pixels. The
 * panel scales the plane to fit through the `--scene-scale` variable.
 */
export function Scene({
  width,
  height,
  tilt = "right",
  className,
  planeClassName,
  children,
}: {
  width: number
  height: number
  tilt?: Tilt
  className?: string
  planeClassName?: string
  children: ReactNode
}) {
  return (
    <div aria-hidden="true" className={cn("relative h-full w-full overflow-hidden [perspective:1600px]", className)}>
      <div className="absolute inset-0 [mask-image:radial-gradient(75%_75%_at_50%_50%,black,transparent)]">
        <div className="absolute top-[-15%] left-[-5%] h-[130%] w-[110%]" style={planes[tilt]}>
          <GuideLines count={14} gap={56} />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn("relative shrink-0 [scale:var(--scene-scale,1)]", planeClassName)}
          style={{ ...planes[tilt], width, height }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** A tile placed at x, y on a scene's plane. */
export function Place({ x, y, children, className }: { x: number; y: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute", className)} style={{ left: x, top: y }}>
      {children}
    </div>
  )
}

/** A dashed connector on a scene's plane, horizontal or vertical. */
export function Connector({
  x,
  y,
  length,
  vertical,
}: {
  x: number
  y: number
  length: number
  vertical?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute block border-dashed border-beige-line", vertical ? "border-l" : "border-t")}
      style={vertical ? { left: x, top: y, height: length } : { left: x, top: y, width: length }}
    />
  )
}
