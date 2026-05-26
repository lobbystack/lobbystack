import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
      <div className="mx-auto max-w-7xl px-6">
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
          answer faster and follow up with better context.
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
      copy: "Send confirmation details, summaries, alerts, and next-step notes after a call.",
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
    <section className="section-spacing bg-muted/30" id="capabilities">
      <div className="mx-auto max-w-7xl px-6">
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
        <div className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background">
          <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12 lg:gap-12 lg:p-16">
            <div className="flex flex-col justify-center">
              <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
                <Calculator className="size-6 text-foreground" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
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
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "rounded-full"
                  )}
                >
                  Calculate missed-call revenue
                </a>
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-2xl bg-muted p-8">
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
    <section
      className="section-spacing bg-foreground text-background"
      id="open-source"
    >
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Open-source phone automation you can actually inspect
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-background/80">
              LobbyStack is built for businesses that want practical automation
              without mystery. You can start with the hosted product, review how
              the system works, and choose a setup that fits your team, volume,
              and technical needs.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              <div className="flex gap-3">
                <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-background/20">
                  <Check className="size-3 text-background" />
                </div>
                <span className="text-sm text-background/80">
                  Use the hosted product to get started quickly
                </span>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-background/20">
                  <Check className="size-3 text-background" />
                </div>
                <span className="text-sm text-background/80">
                  Keep control over business instructions and call behavior
                </span>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-background/20">
                  <Check className="size-3 text-background" />
                </div>
                <span className="text-sm text-background/80">
                  Review calls, transcripts, and outcomes in one place
                </span>
              </div>
              <div className="flex gap-3">
                <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-background/20">
                  <Check className="size-3 text-background" />
                </div>
                <span className="text-sm text-background/80">
                  Talk to us about enterprise or self-hosting needs
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="inline-flex size-32 items-center justify-center rounded-full bg-background/10">
              <Code2 className="size-16 text-background" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
