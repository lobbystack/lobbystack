import type React from "react"
import type { LucideIcon } from "lucide-react"
import type { Locale } from "@/i18n"
import {
  Pencil,
  CalendarCheck,
  DollarSign,
  PhoneOutgoing,
  ArrowRightLeft,
  ShieldBan,
  Phone,
  Globe,
  Users,
  AudioWaveform,
  Hash,
  UserCheck,
  MapPin,
  MessageSquareText,
  CalendarClock,
  CalendarX,
  Bell,
  FileText,
  ScrollText,
  Mail,
  BarChart3,
  BookOpen,
  Layers,
  CircleSlash,
  LifeBuoy,
  PhoneMissed,
  ClipboardList,
  PhoneForwarded,
  Repeat,
  History,
  Target,
  CalendarDays,
  TrendingUp,
} from "lucide-react"

/* ─────────────────────────── Types ─────────────────────────── */

type CardSize = "large" | "medium" | "full"

interface FeatureCard {
  title: string
  description: string
  icon: LucideIcon
  size: CardSize
  tag?: string
  visual?: "workflow" | "calendar" | "quote" | "outbound" | "routing" | "usage"
}

/* ─────────────────────────── Data ─────────────────────────── */

const largeCards: FeatureCard[] = [
  {
    title: "Build workflows with words, not flowcharts",
    description:
      "Train LobbyStack the way you would train a real employee. Tell it what to ask, what to say, when to quote, when to book, when to transfer, and who to notify without touching a workflow builder.",
    icon: Pencil,
    size: "large",
    visual: "workflow",
  },
  {
    title: "Book appointments while the customer is still ready",
    description:
      "LobbyStack checks availability, offers times, books the appointment, and sends the confirmation before the caller moves on to someone else.",
    icon: CalendarCheck,
    size: "large",
    visual: "calendar",
  },
  {
    title: "Give quotes without making callers wait",
    description:
      "For approved services, LobbyStack can give exact prices, starting prices, or price ranges. For custom work, it asks the right questions and schedules a pricing callback.",
    icon: DollarSign,
    size: "large",
    visual: "quote",
  },
  {
    title: "Follow up instead of losing the lead",
    description:
      "LobbyStack can make outbound calls for callbacks, reminders, confirmations, quote follow-ups, and missed-call recovery.",
    icon: PhoneOutgoing,
    size: "large",
    visual: "outbound",
  },
  {
    title: "Transfer the calls that need a person",
    description:
      "LobbyStack handles routine calls first, then transfers based on your instructions. Urgent requests, upset customers, high-value leads, and special cases can go straight to the right person.",
    icon: ArrowRightLeft,
    size: "large",
    visual: "routing",
  },
  {
    title: "Pay for real calls, not junk",
    description:
      "LobbyStack excludes spam calls and calls under 10 seconds from usage, so wrong numbers, robocalls, instant hang-ups, and pocket dials do not eat your plan.",
    icon: ShieldBan,
    size: "large",
    visual: "usage",
  },
]

const mediumCards: FeatureCard[] = [
  {
    title: "Your phone, always staffed",
    description:
      "LobbyStack can answer every call or step in only when your team is busy, closed, or unavailable.",
    icon: Phone,
    size: "medium",
    tag: "Always on",
  },
  {
    title: "One receptionist. 57 languages.",
    description:
      "Serve more customers with AI voice models that handle natural conversations across 57 languages.",
    icon: Globe,
    size: "medium",
    tag: "Multilingual",
  },
  {
    title: "Unlimited concurrent calls",
    description:
      "Multiple customers can be helped at the same time instead of waiting in a queue or hitting a busy line.",
    icon: Users,
    size: "medium",
    tag: "No queue",
  },
  {
    title: "Natural conversations",
    description:
      "Customers can speak normally. LobbyStack handles interruptions, follow-up questions, and messy real-world calls.",
    icon: AudioWaveform,
    size: "medium",
  },
  {
    title: "Dedicated call lines",
    description:
      "Use LobbyStack for a sales line, quote line, booking line, support line, intake line, or campaign number.",
    icon: Hash,
    size: "medium",
  },
  {
    title: "Lead qualification",
    description:
      "Have LobbyStack ask about budget, timeline, location, service type, urgency, and buying intent before booking or transferring.",
    icon: UserCheck,
    size: "medium",
  },
  {
    title: "Service-area checks",
    description:
      "Ask for a postal code or ZIP code before booking and route customers based on where you actually serve.",
    icon: MapPin,
    size: "medium",
  },
  {
    title: "Appointment confirmation texts",
    description:
      "After booking, LobbyStack sends the customer a confirmation text with the appointment details.",
    icon: MessageSquareText,
    size: "medium",
  },
  {
    title: "Rescheduling",
    description:
      "Customers can reschedule when your rules allow it, without waiting for your team to call back.",
    icon: CalendarClock,
    size: "medium",
  },
  {
    title: "Cancellations",
    description:
      "LobbyStack can handle cancellations according to your policies and notify your team.",
    icon: CalendarX,
    size: "medium",
  },
  {
    title: "Appointment reminders",
    description:
      "Remind customers before upcoming appointments so fewer people forget or no-show.",
    icon: Bell,
    size: "medium",
  },
  {
    title: "Call summaries",
    description:
      "Every important call can end with a clear summary, outcome, and next step.",
    icon: FileText,
    size: "medium",
  },
  {
    title: "Full transcripts",
    description:
      "Review the full conversation when your team needs more detail than the summary.",
    icon: ScrollText,
    size: "medium",
  },
  {
    title: "Email and SMS notifications",
    description:
      "Send booking updates, quote requests, urgent alerts, missed-transfer summaries, and high-value lead notices to the right person.",
    icon: Mail,
    size: "medium",
  },
  {
    title: "Daily recap",
    description:
      "Send a daily summary of bookings, quote requests, missed calls, spam blocked, and follow-ups.",
    icon: BarChart3,
    size: "medium",
  },
  {
    title: "Business knowledge",
    description:
      "Add your services, prices, hours, locations, policies, FAQs, and staff details so LobbyStack knows what to say.",
    icon: BookOpen,
    size: "medium",
  },
  {
    title: "Service rules",
    description:
      "Set different instructions for different services, locations, staff, appointment types, or lead types.",
    icon: Layers,
    size: "medium",
  },
  {
    title: "Do-not-say instructions",
    description:
      "Tell LobbyStack what it should never promise, explain, diagnose, quote, or book.",
    icon: CircleSlash,
    size: "medium",
  },
  {
    title: "Fallback behavior",
    description:
      "When LobbyStack does not know something, it can ask follow-up questions, schedule a callback, transfer, or notify the team.",
    icon: LifeBuoy,
    size: "medium",
  },
  {
    title: "Failed-transfer fallback",
    description:
      "If no one answers, LobbyStack can schedule a callback, send a summary, and keep the customer moving.",
    icon: PhoneForwarded,
    size: "medium",
  },
  {
    title: "Intake completion",
    description:
      "Call customers to collect missing details before an appointment, estimate, or callback.",
    icon: ClipboardList,
    size: "medium",
  },
  {
    title: "Missed-call recovery",
    description:
      "Call back people who hang up, call after hours, or miss your team during busy periods.",
    icon: PhoneMissed,
    size: "medium",
  },
  {
    title: "Quote follow-up",
    description:
      "Follow up with customers who asked for pricing but have not booked yet.",
    icon: Repeat,
    size: "medium",
  },
  {
    title: "Call history",
    description:
      "See every call, caller, outcome, summary, appointment, transfer, and follow-up.",
    icon: History,
    size: "medium",
  },
  {
    title: "Lead status",
    description:
      "See which calls became qualified leads, quote requests, appointments, or callbacks.",
    icon: Target,
    size: "medium",
  },
  {
    title: "Appointment activity",
    description:
      "Review bookings, reschedules, cancellations, and confirmation texts.",
    icon: CalendarDays,
    size: "medium",
  },
  {
    title: "Revenue opportunities",
    description:
      "Highlight calls that became bookings, quotes, callbacks, or high-value leads.",
    icon: TrendingUp,
    size: "medium",
  },
]

/* ─────────────────────────── Visual sub-components ─────────────────────────── */

function WorkflowVisual() {
  return (
    <div className="rounded-xl bg-muted/60 p-4">
      <p className="font-mono text-[12px] leading-relaxed text-foreground/70">
        If a caller asks for pricing, ask the required quote questions, give the
        approved price range, and schedule a callback if they need exact
        pricing.
      </p>
    </div>
  )
}

function CalendarVisual() {
  return (
    <div className="space-y-2">
      {[
        "Appointment booked",
        "Customer confirmation sent",
        "Team notified",
        "Notes attached",
      ].map((item) => (
        <div
          key={item}
          className="flex items-center gap-2 text-[13px] text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {item}
        </div>
      ))}
    </div>
  )
}

function QuoteVisual() {
  return (
    <div className="space-y-2">
      {[
        { label: "Service", value: "Renovation estimate" },
        { label: "Location", value: "Downtown" },
        { label: "Budget", value: "$8k – $12k" },
        { label: "Timeline", value: "Next month" },
      ].map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium text-foreground">{item.value}</span>
        </div>
      ))}
      <div className="mt-2 border-t border-border/50 pt-2 text-[13px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Price range shared · Callback scheduled
        </div>
      </div>
    </div>
  )
}

function OutboundVisual() {
  return (
    <div className="space-y-2">
      {[
        { label: "Missed caller callback", status: "Queued" },
        { label: "Quote follow-up", status: "Scheduled" },
        { label: "Appointment reminder", status: "Sent" },
        { label: "Intake completion", status: "Pending" },
      ].map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
            {item.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function RoutingVisual() {
  return (
    <div className="space-y-2">
      {[
        { label: "Urgent call", action: "Routed to manager" },
        { label: "Sales lead", action: "Routed to sales" },
        { label: "Billing request", action: "Routed to billing" },
        { label: "No answer", action: "Callback scheduled" },
      ].map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="text-foreground/80">{item.action}</span>
        </div>
      ))}
    </div>
  )
}

function UsageVisual() {
  return (
    <div className="space-y-2">
      {[
        { label: "Real customer calls", value: "42", counted: true },
        { label: "Spam calls", value: "12", counted: false },
        { label: "Under 10 seconds", value: "7", counted: false },
      ].map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between text-[13px]"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{item.value}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                item.counted
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.counted ? "Counted" : "Excluded"}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

const visualMap: Record<string, () => React.ReactNode> = {
  workflow: WorkflowVisual,
  calendar: CalendarVisual,
  quote: QuoteVisual,
  outbound: OutboundVisual,
  routing: RoutingVisual,
  usage: UsageVisual,
}

/* ─────────────────────────── Card renderers ─────────────────────────── */

function LargeFeatureCard({ card }: { card: FeatureCard }) {
  const Icon = card.icon
  const Visual = card.visual ? visualMap[card.visual] : null

  return (
    <article className="flex flex-col rounded-2xl border border-border/70 bg-background p-6 transition-colors hover:border-border md:p-8">
      {/* Header row */}
      <div className="mb-1 flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-[18px] text-foreground/70" />
        </div>
      </div>

      {/* Copy */}
      <h3 className="mt-4 font-heading text-lg leading-snug font-medium tracking-tight">
        {card.title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground md:min-h-[4.5rem]">
        {card.description}
      </p>

      {/* Visual */}
      {Visual && (
        <div className="mt-5">
          <Visual />
        </div>
      )}
    </article>
  )
}

function MediumFeatureCard({ card }: { card: FeatureCard }) {
  const Icon = card.icon

  return (
    <article className="group flex flex-col rounded-2xl border border-border/70 bg-background p-6 transition-colors hover:border-border">
      {/* Icon + tag row */}
      <div className="flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-[18px] text-foreground/70" />
        </div>
        {card.tag && (
          <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            {card.tag}
          </span>
        )}
      </div>

      {/* Copy */}
      <h3 className="mt-4 font-heading text-[15px] leading-snug font-medium tracking-tight">
        {card.title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {card.description}
      </p>
    </article>
  )
}

/* ─────────────────────────── Full-width callout ─────────────────────────── */

function FullWidthCallout() {
  return (
    <article className="col-span-full rounded-2xl border border-border/70 bg-background p-8 md:p-10">
      <div className="mx-auto max-w-3xl">
        <h3 className="font-heading text-2xl leading-tight font-medium tracking-tight md:text-[1.7rem]">
          Your business is not a flowchart
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Real calls are messy. Customers interrupt, change their mind, ask
          multiple questions, and explain things out of order. LobbyStack lets
          you describe the outcome in plain English instead of building fragile
          call trees.
        </p>
        <div className="mt-6 rounded-xl bg-muted/60 p-5">
          <p className="font-mono text-[13px] leading-relaxed text-foreground/70">
            If a customer asks for pricing, ask the required quote questions,
            give the approved price range, and schedule a callback if they need
            exact pricing.
          </p>
        </div>
      </div>
    </article>
  )
}

/* ─────────────────────────── Main export ─────────────────────────── */

type FeatureWallProps = {
  locale?: Locale
}

export function FeatureWall({ locale = "en" }: FeatureWallProps) {
  void locale

  return (
    <section className="section-spacing" id="feature-wall">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section intro */}
        <div className="mb-12 max-w-3xl md:mb-16">
          <h2 className="section-heading">
            Everything your front desk should already be doing
          </h2>
          <p className="section-intro">
            LobbyStack answers, books, qualifies, quotes, transfers, follows up,
            filters junk, and keeps your team in the loop.
          </p>
        </div>

        {/* Large cards, 2-column grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {largeCards.map((card) => (
            <LargeFeatureCard key={card.title} card={card} />
          ))}
        </div>

        {/* Full-width callout */}
        <div className="mt-4">
          <FullWidthCallout />
        </div>

        {/* Medium cards, 3-to-4-column grid */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {mediumCards.map((card) => (
            <MediumFeatureCard key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  )
}
