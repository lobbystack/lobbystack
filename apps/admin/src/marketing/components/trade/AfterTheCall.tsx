import { AppFrame, Screenshot } from "@/marketing/components/system/AppFrame"
import { dashboardShot } from "@/marketing/lib/screenshots"
import { Check } from "lucide-react"

import type { TradeDetails } from "@/marketing/lib/trade-details"

type AfterTheCallProps = {
  details: Pick<TradeDetails, "noun" | "intake">
}

export function AfterTheCall({ details }: AfterTheCallProps) {
  return (
    <section className="section-spacing" id="intake">
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
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                  <Check className="size-3.5 text-foreground/80" strokeWidth={2.5} />
                </span>
                {question}
              </li>
            ))}
          </ul>
        </div>

        <figure>
          <AppFrame>
            <Screenshot
              shot={dashboardShot("en")}
              alt="LobbyStack dashboard Home page with monthly calls, follow-ups, upcoming appointments, and recent calls"
            />
          </AppFrame>
          <figcaption className="mt-4 text-sm text-muted-foreground">
            Each answered call shows up in the dashboard with its outcome, the
            caller&apos;s answers, a transcript, and a recording.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
