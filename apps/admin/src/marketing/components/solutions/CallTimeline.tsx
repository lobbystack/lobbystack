import { ArrowLeft, ArrowRight } from "lucide-react"

import { CallOutcomeArt } from "@/marketing/components/solutions/CallOutcomeArt"
import { CallTimelineControls } from "@/marketing/components/solutions/CallTimelineControls"
import type { TimelineCall } from "@/marketing/lib/solution-details"
import { cn } from "@/marketing/lib/utils"

type CallTimelineProps = {
  title: string
  calls: TimelineCall[]
}

export function CallTimeline({ title, calls }: CallTimelineProps) {
  const id = `timeline-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return (
    <figure aria-labelledby={id} data-call-timeline>
      <figcaption>
        <h2 id={id} className="section-heading">
          {title}
        </h2>
      </figcaption>

      <ol
        className="mt-12 flex snap-x snap-mandatory gap-8 overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:mt-16 [&::-webkit-scrollbar]:hidden"
        aria-label={`${title}, in order`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the track scrolls sideways, so keyboard users need to focus it
        tabIndex={0}
        data-call-timeline-track
      >
        {calls.map((call) => {
          const urgent = call.action === "Transfers"
          return (
            <li key={call.at} className="relative flex w-[min(80vw,22rem)] shrink-0 snap-start flex-col">
              {/* Each call draws the line to the next one */}
              <span className="absolute top-4 -right-8 left-0 h-px bg-border" aria-hidden="true" />
              <span
                className={cn(
                  "relative inline-flex h-8 w-fit items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap tabular-nums",
                  urgent
                    ? "border-foreground bg-foreground text-background"
                    : "border-beige-line/60 bg-beige text-foreground"
                )}
              >
                {call.at}
              </span>
              <p className="mt-5 min-h-[2.75rem] text-base leading-snug font-medium text-foreground">{call.reason}</p>
              <div className="mt-4" role="img" aria-label={call.imageAlt}>
                <CallOutcomeArt outcome={call.outcome} />
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-beige-strong text-foreground transition-colors hover:bg-beige-strong/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-40"
          aria-label="Earlier calls"
          data-call-timeline-prev
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-beige-strong text-foreground transition-colors hover:bg-beige-strong/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-40"
          aria-label="Later calls"
          data-call-timeline-next
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <CallTimelineControls labelId={id} />
    </figure>
  )
}
