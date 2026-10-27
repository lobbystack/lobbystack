import { TileFieldArt } from "@/marketing/components/system/art"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { bespokeEyebrows } from "@/marketing/lib/eyebrows"
import { buttonVariants } from "@/marketing/components/ui/button"
import { cn } from "@/marketing/lib/utils"
import {
  Building2,
  Wrench,
  Stethoscope,
  Scale,
  Home,
  Target,
  CalendarDays,
  ClipboardCheck,
  Calculator,
  Code2,
  Check,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/* Business Fit                                                               */
/* -------------------------------------------------------------------------- */

export function BusinessFit() {
  const businesses = [
    { name: "Contractors", icon: Wrench },
    { name: "Home service businesses", icon: Home },
    { name: "Clinics", icon: Stethoscope },
    { name: "Law firms", icon: Scale },
    { name: "Property managers", icon: Building2 },
    { name: "Agencies", icon: Target },
    { name: "Local service businesses", icon: ClipboardCheck },
    { name: "Appointment-based teams", icon: CalendarDays },
  ]

  return (
    <section className="section-spacing" id="business-fit">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Built for call-heavy small businesses
          </h2>
          <p className="section-intro">
            LobbyStack works best when phone calls turn into appointments,
            quotes, jobs, consultations, or urgent service requests.
          </p>
        </div>

        <div className="mt-16 flex flex-wrap justify-center gap-4">
          {businesses.map((b, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-full border border-border/70 bg-background px-6 py-3 text-sm font-medium text-foreground shadow-sm"
            >
              <b.icon className="size-4 text-muted-foreground" />
              <span>{b.name}</span>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm font-medium text-muted-foreground">
          If a missed call can mean a missed customer, LobbyStack can help you
          answer faster and give your team the details they need.
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Capabilities                                                               */
/* -------------------------------------------------------------------------- */

export function Capabilities() {
  const capabilities = [
    {
      title: "24/7 call answering",
      copy: "Answer during business hours, after hours, weekends, holidays, or whenever your team is unavailable.",
    },
    {
      title: "Natural conversations",
      copy: "Callers can speak normally instead of working through a rigid phone menu.",
    },
    {
      title: "Knowledge base answers",
      copy: "LobbyStack can answer from your services, policies, FAQs, hours, pricing guidance, and business instructions.",
    },
    {
      title: "Appointment booking",
      copy: "Book appointments directly and send confirmation details to the caller.",
    },
    {
      title: "Call transfers",
      copy: "Transfer calls to a person when the situation needs judgment, urgency, or approval.",
    },
    {
      title: "Follow-up capture",
      copy: "Text callers a booking confirmation, and alert your team when the receptionist takes a message.",
    },
    {
      title: "Call summaries",
      copy: "Give your team the reason for the call, caller details, outcome, and recommended next step.",
    },
    {
      title: "Full transcripts",
      copy: "Review the full conversation when the summary is not enough.",
    },
    {
      title: "Spam filtering",
      copy: "Keep junk calls, robocalls, wrong numbers, and instant hang-ups from wasting time.",
    },
    {
      title: "Multiple calls at once",
      copy: "Help more than one caller at the same time instead of sending people to voicemail.",
    },
  ]

  return (
    <section className="section-spacing" id="capabilities">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            What your AI phone answering service can handle
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((c, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/70 bg-background p-6"
            >
              <h3 className="text-base font-medium tracking-tight text-foreground">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {c.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Revenue Tie-In                                                             */
/* -------------------------------------------------------------------------- */

export function RevenueTieIn() {
  return (
    <section className="section-spacing" id="revenue">
      <div className="mx-auto max-w-4xl px-6">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-beige">
          <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12 lg:gap-12 lg:p-16">
            <div className="flex flex-col justify-center">
              <div className="mb-6 inline-flex size-11 items-center justify-center rounded-lg border border-border/80 bg-background shadow-[0_1px_2px_oklch(0_0_0/6%)]">
                <Calculator className="size-6 text-foreground" />
              </div>
              <h2 className="feature-heading">
                Find out what missed calls are costing you
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                If you know how many calls you miss each week, you can estimate
                how much revenue may be slipping away. Use the missed call
                revenue calculator to see the potential impact, then decide
                where AI phone answering should step in first.
              </p>
              <div className="mt-8">
                <a
                  href="/missed-call-revenue-calculator/"
                  className={buttonVariants({ variant: "default" })}
                >
                  Calculate missed-call revenue
                </a>
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-2xl bg-beige-strong/60 p-8">
              <p className="text-sm leading-relaxed font-medium text-muted-foreground">
                The calculator uses your missed calls, booking rate, opportunity
                rate, and average job value to estimate weekly, monthly, and
                annual revenue at risk.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Open Source                                                                */
/* -------------------------------------------------------------------------- */

export function OpenSource() {
  return (
    <section className="section-spacing" id="open-source">
      <div className="mx-auto max-w-site px-6">
        <SplitCard
          media={<TileFieldArt />}
          columns="md:grid-cols-[1.35fr_1fr]"
          eyebrow={bespokeEyebrows.openSource}
          headingLevel="h2"
          title="Open-source phone automation you can actually inspect"
          body="LobbyStack is built for businesses that want practical automation without mystery. You can start with the hosted product, review how the system works, and choose a setup that fits your team, volume, and technical needs."
          action={
            <>
              <ButtonLink href="https://github.com/lobbystack/lobbystack" target="_blank" rel="noopener noreferrer">
                View on GitHub
              </ButtonLink>
              <ButtonLink href="/solutions/self-hosted-ai-receptionist/" variant="secondary">
                Self-hosting overview
              </ButtonLink>
            </>
          }
        >
          <ul className="mt-6 space-y-3">
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Use the hosted product to get started quickly
            </li>
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Keep control over business instructions and call behavior
            </li>
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Review calls, transcripts, and outcomes in one place
            </li>
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Talk to us about enterprise or self-hosting needs
            </li>
          </ul>
        </SplitCard>
      </div>
    </section>
  )
}
