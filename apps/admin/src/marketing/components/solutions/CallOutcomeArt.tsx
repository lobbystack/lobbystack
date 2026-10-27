import { Ban, CalendarCheck, MessageSquareText, PhoneForwarded, Repeat } from "lucide-react"

import { Badge, Chip, Footprint, Initials, planes, Tile, type Tilt } from "@/marketing/components/system/art"
import type { CallOutcome } from "@/marketing/lib/solution-details"
import { cn } from "@/marketing/lib/utils"

const icons = {
  booked: CalendarCheck,
  moved: Repeat,
  answered: MessageSquareText,
  ended: Ban,
  transferred: PhoneForwarded,
  message: MessageSquareText,
} satisfies Record<CallOutcome["kind"], unknown>

/**
 * What LobbyStack did on one call, drawn as a tile on the site's plane. It
 * fills its container, which gives it the beige panel.
 */
export function CallOutcomeArt({ outcome, tilt = "right", className }: { outcome: CallOutcome; tilt?: Tilt; className?: string }) {
  const Icon = icons[outcome.kind]
  return (
    <div aria-hidden="true" className={cn("absolute inset-0 overflow-hidden [perspective:1200px]", className)}>
      <div className="absolute top-1/2 left-1/2 w-[15rem] -translate-x-1/2 -translate-y-1/2" style={planes[tilt]}>
        <Footprint className="-inset-5" />
        <Tile className="relative" innerClassName="space-y-3 p-4">
          {outcome.kind === "answered" ? (
            <>
              <span className="block w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-beige-strong px-3 py-2 text-xs leading-snug">
                {outcome.question}
              </span>
              <span className="ml-auto block w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs leading-snug text-primary-foreground">
                {outcome.answer}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2.5">
                {outcome.kind === "transferred" && outcome.person ? (
                  <Initials name={outcome.person} />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{outcome.title}</span>
                  {outcome.detail && <span className="block truncate text-xs text-muted-foreground">{outcome.detail}</span>}
                </span>
              </span>
              {outcome.kind === "moved" && outcome.from && outcome.to ? (
                <span className="flex items-center gap-2 text-xs">
                  <Chip className="line-through decoration-foreground/40">{outcome.from}</Chip>
                  <span className="text-muted-foreground">→</span>
                  <Chip strong>{outcome.to}</Chip>
                </span>
              ) : (
                outcome.chip && <Chip strong={outcome.kind === "booked" || outcome.kind === "transferred"}>{outcome.chip}</Chip>
              )}
            </>
          )}
        </Tile>
        <Badge className="absolute -top-4 -right-4 size-9">
          <Icon className="size-4" strokeWidth={1.75} />
        </Badge>
      </div>
    </div>
  )
}
