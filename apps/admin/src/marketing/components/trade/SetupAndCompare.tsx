import type { TradeDetails } from "@/marketing/lib/trade-details"

type SetupAndCompareProps = {
  details: Pick<TradeDetails, "noun">
}

const comparison = [
  {
    topic: "Calls at the same time",
    ai: "Plans don't limit how many it answers at once",
    live: "Depends on how many operators are on shift",
  },
  {
    topic: "Booking",
    ai: "Books into Google Calendar during the call",
    live: "Varies by service, often a message for you to return",
  },
  {
    topic: "Emergencies",
    ai: "Follows rules you write and transfers to your on-call number",
    live: "Follows a script you provide",
  },
  {
    topic: "Call records",
    ai: "Transcript, recording, and summary for each call",
    live: "Message notes, which vary by service",
  },
  {
    topic: "Pricing",
    ai: "Free plan, then $30 or $100 a month with included minutes",
    live: "Usually billed per minute or per call",
  },
  {
    topic: "Calls that need a person",
    ai: "Transfers them to your team",
    live: "An operator handles them",
  },
]

export function SetupAndCompare({ details }: SetupAndCompareProps) {
  // "an HVAC emergency", "an after-hours emergency", "a plumbing emergency"
  const article = /^(?:[aeiou]|HVAC)/i.test(details.noun) ? "an" : "a"

  const steps = [
    {
      title: "Forward your number",
      body: "Keep the number your customers know. Forward every call, or only after-hours and overflow calls, to LobbyStack.",
    },
    {
      title: "Write your rules",
      body: `Describe in plain language what counts as ${article} ${details.noun} emergency, which jobs to book, and which prices callers can hear. Then add the one number that urgent calls transfer to.`,
    },
    {
      title: "Place a test call",
      body: "Call your own line, try an emergency and a routine request, and adjust the rules before a customer calls.",
    },
  ]

  return (
    <>
      <section className="mx-auto max-w-7xl px-6 py-20 md:py-28" id="setup">
        <h2 className="section-heading max-w-3xl">Set up LobbyStack in three steps</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t border-border/70 pt-6">
              <span className="text-sm font-medium text-muted-foreground tabular-nums">Step {index + 1}</span>
              <h3 className="card-heading mt-2">{step.title}</h3>
              <p className="body-copy mt-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border/40 py-20 md:py-28" id="ai-vs-live-answering">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <h2 className="section-heading">AI and live {details.noun} answering services compared</h2>
            <p className="section-intro">
              A live answering service puts an operator on the line. LobbyStack
              answers with AI and hands calls to your team when your rules say so.
            </p>
          </div>

          <div className="mt-12 overflow-x-auto rounded-[1.35rem] border border-border/70">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="w-[24%] px-6 py-4 font-medium text-foreground">
                    <span className="sr-only">Topic</span>
                  </th>
                  <th scope="col" className="w-[38%] px-6 py-4 font-medium text-foreground">
                    LobbyStack
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium text-foreground">
                    Live answering service
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.topic} className="border-t border-border/60">
                    <th scope="row" className="px-6 py-5 align-top font-medium text-foreground">
                      {row.topic}
                    </th>
                    <td className="px-6 py-5 align-top leading-relaxed text-foreground">{row.ai}</td>
                    <td className="px-6 py-5 align-top leading-relaxed text-muted-foreground">{row.live}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
