import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight, Check, PhoneOff, UserX, Clock, Phone } from "lucide-react"

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 md:pt-20 md:pb-10 lg:pt-24 lg:pb-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-up display-heading delay-100">
            AI phone answering that turns calls into{" "}
            <span className="underline decoration-2 underline-offset-4">
              booked work
            </span>
          </h1>

          <p className="animate-fade-up body-copy mx-auto mt-6 max-w-[65ch] delay-200 md:text-lg">
            LobbyStack picks up when your team cannot. It answers common
            questions, captures caller details, books appointments, sends
            follow-up texts, and routes urgent calls to the right person.
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
            No credit card required. Works with your existing business number.
          </p>

          <div className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-muted-foreground delay-500">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Answers calls 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Books appointments</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Sends call summaries</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Transfers urgent calls</span>
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
            Customers call when they are ready to act
          </h2>
          <p className="section-intro">
            Most people do not leave voicemails anymore. They call, wait a few
            rings, then try the next business they found. If you are on another
            job, helping a customer, driving, closed for the day, or
            short-staffed, that call can disappear before you even know it
            happened.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Clock className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Voicemail slows everything down
            </h3>
            <p className="body-copy mt-4">
              A voicemail still needs to be heard, understood, logged, and
              returned. By then, the caller may have already booked someone
              else.
            </p>
          </article>

          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <UserX className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Your team cannot answer every call
            </h3>
            <p className="body-copy mt-4">
              People miss calls because they are doing real work. They are with
              customers, on job sites, in meetings, or handling another call.
            </p>
          </article>

          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <PhoneOff className="size-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-medium tracking-[-0.03em]">
              Traditional answering services get expensive
            </h3>
            <p className="body-copy mt-4">
              A human answering service can help, but coverage, scripts, call
              volume, and pricing can become hard to manage as your business
              grows.
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
    "Answer routine questions using your business information",
    "Ask for the caller's name, phone number, service need, location, and urgency",
    "Book appointments while the caller is still on the phone",
    "Send confirmation texts and internal notifications",
    "Transfer urgent or high-value calls to a person",
    "Save recordings, transcripts, summaries, and next steps",
  ]

  return (
    <section className="section-spacing" id="solution">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h2 className="section-heading text-left">
              A receptionist that is always ready to pick up
            </h2>
            <p className="section-intro text-left">
              LobbyStack gives your business a phone answering layer that works
              around the clock. It can answer every call, or only step in when
              your team is busy, closed, or unavailable.
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
            {/* Using an illustration concept that matches the existing site, assuming we have one or just a nice UI block */}
            <div className="flex h-[400px] items-center justify-center bg-background/50 p-8">
              <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                      <Phone className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Incoming Call</p>
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
                    Hello! You've reached Apex Home Services. How can I help you
                    today?
                  </div>
                  <div className="ml-8 rounded-2xl rounded-tr-sm bg-primary p-3 text-sm text-primary-foreground">
                    Hi, I need someone to look at my AC unit. It stopped blowing
                    cold air.
                  </div>
                  <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm text-foreground/80">
                    I can definitely help with that. We have technicians
                    available tomorrow afternoon. Would you like me to book a
                    time?
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
      title: "After-hours answering",
      copy: "Pick up nights, weekends, holidays, and lunch breaks without asking staff to stay near the phone.",
    },
    {
      title: "Busy-line overflow",
      copy: "Let LobbyStack answer when your team is already on another call, in a meeting, or helping a customer.",
    },
    {
      title: "Appointment booking",
      copy: "Offer available times, book the appointment, and send the caller a confirmation text before they hang up.",
    },
    {
      title: "Lead qualification",
      copy: "Ask about service type, location, timeline, budget, and urgency so your team knows which calls need attention first.",
    },
    {
      title: "Urgent call routing",
      copy: "Send emergencies, upset customers, high-value leads, and special cases to the right person with context attached.",
    },
    {
      title: "Missed-call recovery",
      copy: "Follow up with callers who slipped through, collect the details, and help them book before the opportunity goes cold.",
    },
  ]

  return (
    <section className="section-spacing bg-background" id="use-cases">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Use AI phone answering where missed calls hurt most
          </h2>
          <p className="section-intro">
            Set LobbyStack up for the parts of your phone workflow that cost
            time, revenue, or attention.
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
      title: "Connect your phone",
      copy: "Use a dedicated LobbyStack number or forward calls from the business number your customers already know.",
    },
    {
      title: "Add your business knowledge",
      copy: "Give LobbyStack your services, hours, prices, policies, FAQs, service areas, booking rules, and fallback instructions.",
    },
    {
      title: "Choose when it should answer",
      copy: "Have it answer every call, only after hours, only when your team is busy, or only for specific phone lines.",
    },
    {
      title: "Review every outcome",
      copy: "See what happened after each call, including the caller's details, summary, transcript, recording, booking, and next step.",
    },
  ]

  return (
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">How LobbyStack answers your calls</h2>
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
      what: "The caller has to leave a message and wait for a callback.",
      bestFor: "Low-priority calls that do not need a fast response.",
      limit: "Many callers hang up or call someone else.",
    },
    {
      option: "Phone tree",
      what: "The caller presses buttons and follows a fixed menu.",
      bestFor: "Simple routing in larger organizations.",
      limit: "It feels slow and frustrating when callers just want help.",
    },
    {
      option: "Traditional answering service",
      what: "A person answers from a script and takes a message.",
      bestFor: "Businesses that need human operators for every call.",
      limit:
        "Costs rise with coverage and volume, and call handling depends on the operator.",
    },
    {
      option: "LobbyStack",
      what: "AI answers, asks questions, books, follows up, summarizes, and transfers when needed.",
      bestFor:
        "Small businesses that want reliable coverage without adding headcount.",
      limit: "Complex or sensitive situations should still go to a human.",
    },
  ]

  return (
    <section className="section-spacing bg-muted/30" id="comparison">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Better phone coverage without another full-time hire
          </h2>
          <p className="section-intro">
            LobbyStack is not just voicemail with a nicer greeting. It handles
            the call while the caller is still interested.
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
