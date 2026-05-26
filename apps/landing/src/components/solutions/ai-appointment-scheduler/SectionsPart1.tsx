import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Check,
  CalendarX,
  UserX,
  Clock,
  CalendarCheck,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 md:pt-20 md:pb-10 lg:pt-24 lg:pb-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-up display-heading delay-100">
            AI appointment scheduling for callers{" "}
            <span className="underline decoration-2 underline-offset-4">
              ready to book
            </span>
          </h1>

          <p className="animate-fade-up body-copy mx-auto mt-6 max-w-[65ch] delay-200 md:text-lg">
            LobbyStack answers calls, collects the details your team needs,
            offers available times, books appointments, and sends confirmations
            before the caller moves on.
          </p>

          <div className="animate-fade-up mt-8 flex items-center justify-center gap-4 delay-300">
            <a
              href={APP_SIGNUP_URL}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-7 text-sm"
              )}
            >
              Try for free
              <ArrowRight className="ml-1 size-4" />
            </a>
            <a
              href="/pricing/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              See pricing
            </a>
          </div>

          <p className="animate-fade-up fine-print mt-5 delay-400">
            No credit card required. Works with phone calls, calendars, and
            follow-up texts.
          </p>

          <div className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-muted-foreground delay-500">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Books appointments by phone</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Sends confirmation texts</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Captures caller details</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Routes urgent requests</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Problem                                                                    */
/* -------------------------------------------------------------------------- */

export function Problem() {
  return (
    <section className="section-spacing bg-muted/30" id="problem">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Scheduling should not depend on catching every call
          </h2>
          <p className="section-intro">
            When someone calls to book, they are ready to make a decision. If
            your team misses the call, asks them to wait for a callback, or
            spends the next hour trading times back and forth, that appointment
            can disappear.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <CalendarX className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Missed calls become missed appointments
            </h3>
            <p className="body-copy mt-4">
              People looking for service often call more than one business. If
              they cannot book with you quickly, they may book with the next
              company that answers.
            </p>
          </article>

          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <UserX className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Manual scheduling slows down your team
            </h3>
            <p className="body-copy mt-4">
              Every appointment takes time to confirm, reschedule, log, and
              explain. That work adds up quickly when your team is already
              handling customers, jobs, and follow-up.
            </p>
          </article>

          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Clock className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Back-and-forth costs momentum
            </h3>
            <p className="body-copy mt-4">
              A caller who wants to book now should not have to wait for someone
              to check the calendar and call them back later.
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Solution                                                                   */
/* -------------------------------------------------------------------------- */

export function Solution() {
  const points = [
    "Answer booking calls during business hours, after hours, and weekends",
    "Collect the caller's name, phone number, service need, location, and timing",
    "Offer available appointment windows based on your scheduling rules",
    "Book the appointment and send confirmation details",
    "Notify your team with the caller's details and reason for booking",
    "Transfer urgent or unusual calls to a person when needed",
  ]

  return (
    <section className="section-spacing" id="solution">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h2 className="section-heading text-left">
              Let callers book while they are still on the phone
            </h2>
            <p className="section-intro text-left">
              LobbyStack gives your business an AI appointment scheduler that
              can answer the call, understand what the caller needs, check your
              rules, offer times, and book the appointment in the same
              conversation.
            </p>
            <ul className="mt-8 space-y-4">
              {points.map((point, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-muted-foreground"
                >
                  <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" />
                  </div>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-muted">
            <div className="flex h-[400px] items-center justify-center bg-background/50 p-8">
              <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                      <CalendarCheck className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Booking Request</p>
                      <p className="text-xs text-muted-foreground">
                        LobbyStack AI
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
                    Active
                  </span>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm text-foreground/80">
                    I have an opening on Thursday at 2:00 PM or Friday at 10:00
                    AM. Do either of those work for you?
                  </div>
                  <div className="ml-8 rounded-2xl rounded-tr-sm bg-primary p-3 text-sm text-primary-foreground">
                    Thursday at 2:00 PM would be great.
                  </div>
                  <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm text-foreground/80">
                    Perfect. I've booked you for Thursday at 2:00 PM. I'll send
                    a confirmation text right now with all the details. We'll
                    see you then!
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Use Cases                                                                  */
/* -------------------------------------------------------------------------- */

export function UseCases() {
  const cases = [
    {
      title: "New appointment requests",
      copy: "Help new callers book without waiting for a receptionist, office manager, or callback.",
    },
    {
      title: "After-hours booking",
      copy: "Let customers schedule appointments at night, on weekends, or during holidays without leaving a voicemail.",
    },
    {
      title: "Service call intake",
      copy: "Ask what service the caller needs, where they are located, how urgent the issue is, and when they are available.",
    },
    {
      title: "Consultation scheduling",
      copy: "Book calls, estimates, demos, visits, and consultations while collecting the details your team needs before the appointment.",
    },
    {
      title: "Rescheduling requests",
      copy: "Handle simple rescheduling requests according to your rules, without making the customer wait for a manual reply.",
    },
    {
      title: "Urgent booking handoff",
      copy: "Route emergencies, high-value requests, and sensitive situations to a real person with context from the call.",
    },
  ]

  return (
    <section className="section-spacing bg-background" id="use-cases">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Use AI scheduling where speed matters
          </h2>
          <p className="section-intro">
            LobbyStack helps with the scheduling moments that usually create
            delays, missed bookings, and extra admin work.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c, i) => (
            <div
              key={i}
              className="flex flex-col rounded-2xl border border-border/70 bg-muted/30 p-6 transition-colors hover:bg-muted/50"
            >
              <h3 className="text-lg font-medium tracking-tight text-foreground">
                {c.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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
/* How It Works                                                               */
/* -------------------------------------------------------------------------- */

export function HowItWorks() {
  const steps = [
    {
      title: "Connect your phone and calendar",
      copy: "Use a dedicated LobbyStack number or forward calls from your existing business number. Connect the calendar your team already uses for appointments.",
    },
    {
      title: "Add your booking rules",
      copy: "Set your hours, services, appointment types, service areas, availability rules, required questions, and handoff instructions.",
    },
    {
      title: "Let LobbyStack handle the call",
      copy: "When someone calls to book, LobbyStack answers, asks the right questions, offers available times, and confirms the appointment.",
    },
    {
      title: "Review the appointment details",
      copy: "Your team receives the booking details, caller information, summary, transcript, and next step so nothing gets lost.",
    },
  ]

  return (
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            How LobbyStack schedules appointments
          </h2>
        </div>
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="relative ml-4 border-l border-border/70 md:ml-0 md:border-l-0">
            <div className="space-y-12 pl-8 md:pl-0">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="relative md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8"
                >
                  <div className="hidden md:block md:text-right">
                    {i % 2 === 0 ? (
                      <div>
                        <h3 className="text-xl font-medium tracking-tight text-foreground">
                          {step.title}
                        </h3>
                        <p className="mt-2 leading-relaxed text-muted-foreground">
                          {step.copy}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="absolute top-1 left-[-40px] flex size-8 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-foreground md:static md:top-auto">
                    {i + 1}
                  </div>

                  <div className="md:text-left">
                    <h3 className="text-xl font-medium tracking-tight text-foreground md:hidden">
                      {step.title}
                    </h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground md:hidden">
                      {step.copy}
                    </p>

                    {i % 2 !== 0 ? (
                      <div className="hidden md:block">
                        <h3 className="text-xl font-medium tracking-tight text-foreground">
                          {step.title}
                        </h3>
                        <p className="mt-2 leading-relaxed text-muted-foreground">
                          {step.copy}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* -------------------------------------------------------------------------- */

export function Comparison() {
  const comparisons = [
    {
      option: "Voicemail",
      what: "The caller leaves a message and waits.",
      bestFor: "Low-priority requests.",
      limit: "Loses people who want to book now.",
    },
    {
      option: "Online forms",
      what: "Forms can collect details.",
      bestFor: "Customers willing to stop calling and fill something out.",
      limit: "Some callers will only book by phone.",
    },
    {
      option: "Manual scheduling",
      what: "A person can handle edge cases well.",
      bestFor: "Complex situations requiring a human touch.",
      limit: "Every routine booking takes time from your team.",
    },
    {
      option: "LobbyStack",
      what: "Answers the call, collects details, schedules, confirms, and hands off when needed.",
      bestFor: "Callers who want to talk, ask questions, and book instantly.",
      limit: "Complex scheduling situations should still go to a human.",
    },
  ]

  return (
    <section className="section-spacing bg-muted/30" id="comparison">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Faster booking without more scheduling work
          </h2>
          <p className="section-intro">
            LobbyStack helps callers schedule in the moment, instead of forcing
            them into voicemail, forms, or manual callbacks.
          </p>
        </div>

        <div className="mt-16 overflow-x-auto pb-4">
          <div className="min-w-[800px] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
            <div className="grid grid-cols-4 border-b border-border/70 bg-muted/50 p-4 text-sm font-medium text-foreground">
              <div>Option</div>
              <div>What happens</div>
              <div>Best for</div>
              <div>Limit</div>
            </div>
            {comparisons.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-4 gap-4 border-b border-border/70 p-4 text-sm last:border-0"
              >
                <div className="font-medium text-foreground">{c.option}</div>
                <div className="text-muted-foreground">{c.what}</div>
                <div className="text-muted-foreground">{c.bestFor}</div>
                <div className="text-muted-foreground">{c.limit}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
