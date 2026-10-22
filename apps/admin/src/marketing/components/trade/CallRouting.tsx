import {
  CalendarCheck,
  MessageSquareText,
  NotebookPen,
  PhoneForwarded,
  PhoneOff,
} from "lucide-react"

import type { CallAction, TradeDetails } from "@/marketing/lib/trade-details"

type CallRoutingProps = {
  details: Pick<TradeDetails, "noun" | "routing">
  intro?: string
  callHeading?: string
}

const actionIcons: Record<CallAction, typeof PhoneForwarded> = {
  Transfers: PhoneForwarded,
  Books: CalendarCheck,
  Answers: MessageSquareText,
  "Takes a message": NotebookPen,
  "Ends the call": PhoneOff,
}

export function CallRouting({ details, ...props }: CallRoutingProps) {
  const article = /^(?:[aeiou]|HVAC)/i.test(details.noun) ? "an" : "a"
  const {
    intro = `You decide what LobbyStack does with each kind of call. A typical setup for ${article} ${details.noun} business looks like this.`,
    callHeading = "When a caller has",
  } = props

  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-28" id="call-handling">
      <div className="max-w-3xl">
        <h2 className="section-heading">What happens to each {details.noun} call</h2>
        <p className="section-intro">{intro}</p>
      </div>

      <div
        className="mt-12 overflow-hidden rounded-[1.35rem] border border-border/70"
        role="region"
        aria-label={`How LobbyStack handles ${details.noun} calls`}
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead className="hidden bg-muted/50 md:table-header-group">
            <tr>
              <th scope="col" className="w-[34%] px-6 py-4 font-medium text-foreground">
                {callHeading}
              </th>
              <th scope="col" className="w-[20%] px-6 py-4 font-medium text-foreground">
                LobbyStack
              </th>
              <th scope="col" className="px-6 py-4 font-medium text-foreground">
                What happens
              </th>
            </tr>
          </thead>
          <tbody>
            {details.routing.map((row) => {
              const Icon = actionIcons[row.action]
              return (
                <tr
                  key={row.call}
                  className="grid grid-cols-1 gap-1 border-t border-border/60 px-5 py-4 first:border-t-0 md:table-row md:px-0 md:py-0 md:first:border-t"
                >
                  <th scope="row" className="font-medium text-foreground md:px-6 md:py-5 md:align-top">
                    {row.call}
                  </th>
                  <td className="md:px-6 md:py-5 md:align-top">
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {row.action}
                    </span>
                  </td>
                  <td className="leading-relaxed text-muted-foreground md:px-6 md:py-5 md:align-top">
                    {row.detail}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
