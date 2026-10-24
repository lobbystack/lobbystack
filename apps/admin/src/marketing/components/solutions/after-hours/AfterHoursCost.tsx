import { ArrowRight } from "lucide-react"

const plans = [
  { name: "Free", price: "$0", minutes: "30", overage: "None" },
  {
    name: "Starter",
    price: "$30 a month",
    minutes: "150",
    overage: "$0.20 a minute",
  },
  {
    name: "Pro",
    price: "$100 a month",
    minutes: "500",
    overage: "$0.18 a minute",
  },
]

export function AfterHoursCost() {
  return (
    <section className="border-t border-border/40 py-20 md:py-28" id="cost">
      <div className="mx-auto grid max-w-site gap-12 px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <h2 className="section-heading">What an after-hours answering service costs</h2>
          <p className="section-intro">
            Live answering services usually bill per minute or per call, and some
            add setup or holiday fees. LobbyStack charges a flat monthly plan with
            minutes included, and nights, weekends, and holidays cost the same as
            any other hour.
          </p>
          <div className="mt-8 rounded-xl border border-border/70 bg-muted/40 p-5">
            <p className="text-sm font-medium text-foreground">Example</p>
            <p className="body-copy mt-2 text-base">
              You get 40 after-hours calls a month and each one lasts about 3
              minutes. That&apos;s 120 minutes, which fits in Starter for $30. Spam calls
              and calls under 10 seconds don&apos;t count.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            <a
              href="/pricing/"
              className="inline-flex items-center gap-1.5 text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              Compare plans <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
            <a
              href="/missed-call-revenue-calculator/"
              className="inline-flex items-center gap-1.5 text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              Estimate what missed calls cost you
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="self-center overflow-x-auto rounded-[1.35rem] border border-border/70">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <caption className="sr-only">LobbyStack plans for after-hours answering</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium text-foreground">
                  Plan
                </th>
                <th scope="col" className="px-6 py-4 font-medium text-foreground">
                  Price
                </th>
                <th scope="col" className="px-6 py-4 font-medium text-foreground">
                  Minutes included
                </th>
                <th scope="col" className="px-6 py-4 font-medium text-foreground">
                  Extra minutes
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.name} className="border-t border-border/60">
                  <th scope="row" className="px-6 py-5 font-medium text-foreground">
                    {plan.name}
                  </th>
                  <td className="px-6 py-5 text-foreground">{plan.price}</td>
                  <td className="px-6 py-5 text-foreground tabular-nums">{plan.minutes}</td>
                  <td className="px-6 py-5 text-muted-foreground">{plan.overage}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
            Free includes a US or Canadian number for 14 days, so you can test
            LobbyStack on forwarded calls. Starter and Pro keep a dedicated number, and annual
            billing costs $288 or $960 a year.
          </p>
        </div>
      </div>
    </section>
  )
}
