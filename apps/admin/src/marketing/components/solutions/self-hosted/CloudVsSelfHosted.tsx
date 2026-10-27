import { billingPlanCatalog, intlLocale } from "@lobbystack/shared"
import { Fragment } from "react"

import { signupLink } from "@/marketing/components/solution-layouts/self-hosting/parts"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { appSignupUrl } from "@/marketing/lib/app-links"

// Laid out like the pricing page's plan table: a beige header row, mono group
// labels and the highlighted column on a darker beige.

function monthly(cents: number) {
  return new Intl.NumberFormat(intlLocale("en"), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const freeMinutes = billingPlanCatalog.free_cloud.voiceSecondsIncluded / 60
const starterPrice = monthly(billingPlanCatalog.starter.monthlyChargeCents)
const proPrice = monthly(billingPlanCatalog.pro.monthlyChargeCents)

const groups: Array<{ label: string; rows: Array<{ topic: string; self: string; cloud: string }> }> = [
  {
    label: "Running it",
    rows: [
      { topic: "Who runs the servers", self: "You, with Docker Compose, Railway or your own cloud", cloud: "LobbyStack" },
      { topic: "Updates", self: "You pull a release and redeploy when you're ready", cloud: "LobbyStack rolls them out" },
      { topic: "Backups and monitoring", self: "Your team sets them up and tests restores", cloud: "LobbyStack handles them" },
    ],
  },
  {
    label: "Paying for it",
    rows: [
      { topic: "Software", self: "No license fee under the MIT License", cloud: `Free plan, then Starter at ${starterPrice} or Pro at ${proPrice} a month` },
      { topic: "Phone and AI usage", self: "Billed to your own Twilio and OpenAI accounts", cloud: `Voice minutes in each plan, ${freeMinutes} on the free plan` },
    ],
  },
  {
    label: "Your data and code",
    rows: [
      { topic: "Where call records live", self: "Your PostgreSQL database and storage", cloud: "LobbyStack's servers" },
      { topic: "Code", self: "The same open-source code, which you can change", cloud: "The open-source code on GitHub" },
    ],
  },
]

/** LobbyStack Cloud against self-hosting, for the English self-hosted page. */
export function CloudVsSelfHosted() {
  const signup = appSignupUrl("en")
  return (
    <section className="pt-20 md:pt-30" id="cloud-vs-self-hosted">
      <div className="mx-auto w-full max-w-site px-6">
        <SectionTitle
          centered
          eyebrow="Compare"
          intro="Both run the same receptionist. Self-host when you need the data on your own servers and have someone to look after them."
          className="max-w-3xl"
        >
          LobbyStack Cloud or self-hosted
        </SectionTitle>

        <div
          className="relative mt-12 overflow-x-auto rounded-2xl border border-border/60"
          role="region"
          aria-label="LobbyStack Cloud compared with self-hosting"
          tabIndex={0}
        >
          <table className="w-full min-w-[600px] text-sm">
            <caption className="sr-only">What changes between LobbyStack Cloud and a self-hosted install</caption>
            <thead>
              <tr className="bg-beige">
                <th scope="col" className="w-[26%] py-4 pr-8 pl-6 text-left text-xs font-medium text-muted-foreground">
                  Topic
                </th>
                <th scope="col" className="w-[37%] bg-beige-strong/60 px-6 py-4 text-left font-heading text-base font-medium tracking-[-0.03em]">
                  Self-hosted
                </th>
                <th scope="col" className="px-6 py-4 text-left font-heading text-base font-medium tracking-[-0.03em]">
                  LobbyStack Cloud
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.label}>
                  <tr>
                    <td colSpan={3} className="pt-8 pb-3 pl-6 font-mono text-xs font-semibold tracking-[-0.02em] text-beige-foreground uppercase">
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.topic} className="border-t border-border/50">
                      <th scope="row" className="py-3.5 pr-8 pl-6 text-left align-top font-medium text-foreground">
                        {row.topic}
                      </th>
                      <td className="bg-beige/70 px-6 py-3.5 align-top leading-relaxed text-foreground">{row.self}</td>
                      <td className="px-6 py-3.5 align-top leading-relaxed text-muted-foreground">{row.cloud}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine-print mt-6 text-center">
          Rather not run servers?{" "}
          <a
            href={signup}
            {...signupLink(signup, "self_hosted_compare")}
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Start on LobbyStack Cloud for free
          </a>
          .
        </p>
      </div>
    </section>
  )
}
