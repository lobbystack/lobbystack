import { Check } from "lucide-react"

import type { TradeDetails } from "@/marketing/lib/trade-details"

type AfterTheCallProps = {
  details: Pick<TradeDetails, "noun" | "intake">
}

export function AfterTheCall({ details }: AfterTheCallProps) {
  return (
    <section className="border-t border-border/40 bg-muted/15 py-20 md:py-28" id="intake">
      <div className="mx-auto grid max-w-site gap-12 px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <h2 className="section-heading">What LobbyStack asks {details.noun} callers</h2>
          <p className="section-intro">
            You choose the questions. These are the ones {details.noun} businesses start
            with, and every answer lands in the call transcript.
          </p>
          <ul className="mt-8 space-y-3">
            {details.intake.map((question) => (
              <li key={question} className="flex items-start gap-3 text-base text-foreground">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <Check className="size-3.5 text-foreground/80" strokeWidth={2.5} />
                </span>
                {question}
              </li>
            ))}
          </ul>
        </div>

        <figure className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background">
          <img
            src="/screenshots/dashboard-home.webp"
            alt="LobbyStack dashboard Home page with monthly calls, follow-ups, upcoming appointments, and recent calls"
            width="2560"
            height="1920"
            className="h-auto w-full"
            loading="lazy"
            decoding="async"
          />
          <figcaption className="border-t border-border/60 px-5 py-4 text-sm text-muted-foreground">
            Each answered call shows up in the dashboard with its outcome, the
            caller&apos;s answers, a transcript, and a recording.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
