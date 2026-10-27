import { ArrowLeft, ArrowRight } from "lucide-react"

import { CallOutcomeArt } from "@/marketing/components/solutions/CallOutcomeArt"
import { CallTimelineControls } from "@/marketing/components/solutions/CallTimelineControls"
import { Chip, type Tilt } from "@/marketing/components/system/art"
import type { TimelineCall } from "@/marketing/lib/solution-details"
import { cn } from "@/marketing/lib/utils"

type CallTimelineProps = {
  title: string
  intro?: string
  calls: TimelineCall[]
  className?: string
}

// Neighbouring cards lean different ways, so the row doesn't read as one picture repeated.
const tilts: Tilt[] = ["right", "flat", "left"]

const arrowButton =
  "flex size-10 cursor-pointer items-center justify-center rounded-full bg-beige-strong text-foreground transition-colors hover:bg-beige-strong/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-40"

/**
 * A run of calls in time order, as a sideways row of picture cards: the time,
 * the caller's reason, a scene of what LobbyStack did and the same in words.
 */
export function CallTimeline({ title, intro, calls, className }: CallTimelineProps) {
  const id = `timeline-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return (
    <figure aria-labelledby={id} data-call-timeline className={className}>
      <figcaption className="mx-auto max-w-3xl text-center">
        <h2 id={id} className="section-heading">
          {title}
        </h2>
        {intro && <p className="section-intro mx-auto">{intro}</p>}
      </figcaption>

      <ol
        className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`${title}, in order`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the track scrolls sideways, so keyboard users need to focus it
        tabIndex={0}
        data-call-timeline-track
      >
        {calls.map((call, index) => (
          <li key={call.at} className="flex w-[min(82vw,21rem)] shrink-0 snap-start">
            <article className="flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-beige">
              <div className="relative h-52 bg-beige-strong/60">
                <CallOutcomeArt outcome={call.outcome} tilt={tilts[index % tilts.length] ?? "right"} />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="flex items-center justify-between gap-3">
                  <span className="eyebrow tabular-nums">{call.at}</span>
                  <Chip strong={call.action === "Transfers"} className={cn(call.action !== "Transfers" && "bg-background")}>
                    {call.action}
                  </Chip>
                </p>
                <h3 className="card-heading mt-3">{call.reason}</h3>
                <p className="mt-3 text-base leading-6 text-pretty text-muted-foreground">{call.summary}</p>
              </div>
            </article>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex justify-center gap-3">
        <button type="button" className={arrowButton} aria-label="Earlier calls" data-call-timeline-prev>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={arrowButton} aria-label="Later calls" data-call-timeline-next>
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <CallTimelineControls labelId={id} />
    </figure>
  )
}
