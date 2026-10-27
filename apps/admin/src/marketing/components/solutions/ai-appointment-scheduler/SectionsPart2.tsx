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
  Scissors,
  GraduationCap,
  Calculator,
  Code2,
  Check,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/* Business Fit                                                               */
/* -------------------------------------------------------------------------- */

export function BusinessFit() {
  const businesses = [
    { name: "Home service businesses", icon: Home },
    { name: "Contractors", icon: Wrench },
    { name: "Clinics", icon: Stethoscope },
    { name: "Law firms", icon: Scale },
    { name: "Agencies", icon: Target },
    { name: "Property managers", icon: Building2 },
    { name: "Salons and wellness businesses", icon: Scissors },
    { name: "Consultants", icon: GraduationCap },
    { name: "Local service teams", icon: ClipboardCheck },
    { name: "Appointment-based teams", icon: CalendarDays },
  ]

  return (
    <section className="section-spacing" id="business-fit">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Built for businesses that book by phone
          </h2>
          <p className="section-intro">
            LobbyStack is a good fit when appointments, service visits, consultations, or estimates are part of how your business makes money.
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
          If a caller needs a time on the calendar before they become a customer, LobbyStack can help them book faster.
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
      title: "Phone-based appointment booking",
      copy: "Let callers schedule appointments during a natural phone conversation instead of waiting for a callback.",
    },
    {
      title: "Calendar availability",
      copy: "Offer appointment times based on your connected calendar, availability, and scheduling rules.",
    },
    {
      title: "Caller intake",
      copy: "Collect the caller's name, phone number, service need, location, preferred time, and urgency before booking.",
    },
    {
      title: "Appointment confirmations",
      copy: "Send confirmation details by text so the caller knows the appointment was booked.",
    },
    {
      title: "Team notifications",
      copy: "Notify your team when a booking is made, including the caller's details, reason for the appointment, and next step.",
    },
    {
      title: "Rescheduling support",
      copy: "Handle simple rescheduling requests when your rules allow it.",
    },
    {
      title: "Urgent call routing",
      copy: "Transfer calls to a person when the request is urgent, sensitive, high-value, or outside your normal rules.",
    },
    {
      title: "Call summaries",
      copy: "Give your team a clear summary of what happened, what was booked, and what needs to happen next.",
    },
    {
      title: "Full transcripts",
      copy: "Review the full conversation when your team needs more detail than the summary.",
    },
    {
      title: "After-hours scheduling",
      copy: "Let customers book appointments even when your office is closed.",
    },
  ]

  return (
    <section className="section-spacing" id="capabilities">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            What your AI appointment scheduler can handle
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
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                See how many bookings missed calls may be costing you
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                If your business books appointments by phone, every missed call can become an empty spot on the calendar. Use the missed call revenue calculator to estimate how much revenue may be at risk when callers cannot reach you.
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
            <div className="flex flex-col justify-center rounded-2xl bg-muted p-8">
              <p className="text-sm leading-relaxed font-medium text-muted-foreground">
                The calculator uses your missed calls, booking rate, opportunity rate, and average job value to estimate weekly, monthly, and annual revenue at risk.
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
          title="Scheduling automation you can inspect and control"
          body="LobbyStack is built for teams that want practical automation without giving up control. You can define how calls are handled, what questions are asked, when appointments can be booked, and when a person should step in."
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
              Use the hosted product to start quickly
            </li>
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Control booking rules and fallback behavior
            </li>
            <li className="flex gap-3 text-base text-foreground/80">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
                <Check className="size-3 text-foreground/80" strokeWidth={2.5} />
              </span>
              Review summaries, transcripts, and outcomes
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
