import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight, Check, Clock, UserX, PhoneOff, Phone } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 md:pt-20 md:pb-10 lg:pt-24 lg:pb-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-up font-heading text-4xl leading-[1.1] font-medium tracking-tight delay-100 md:text-5xl lg:text-[4rem]">
            AI receptionist for home services that books jobs while your crew{" "}
            <span className="underline decoration-2 underline-offset-4">
              works
            </span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground delay-200 md:text-lg">
            LobbyStack answers calls for HVAC, plumbing, electrical, roofing,
            and landscaping businesses. It captures emergency calls, books
            appointments, and routes urgent jobs to your team while you are busy
            doing the work.
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
          <p className="animate-fade-up mt-5 text-xs text-muted-foreground delay-400">
            No credit card required. Works with your existing business number.
          </p>
          <div className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-muted-foreground delay-500">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Emergency call routing</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Books appointments 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Captures job details</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              <span>Works on job sites</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Problem() {
  return (
    <section className="section-spacing bg-muted/30" id="problem">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Missed calls are missed jobs in home services
          </h2>
          <p className="section-intro">
            Homeowners call when their AC dies, their pipe bursts, or their roof
            leaks. If you are on another job, under a house, or driving between
            calls, that lead goes to the next company on their list.
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Clock className="size-6 text-foreground" />
            </div>
            <h3 className="text-xl font-medium tracking-tight">
              Voicemail costs real money
            </h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              A homeowner with a broken furnace does not leave a voicemail. They
              call the next HVAC company. By the time you check messages, the
              job is gone.
            </p>
          </article>
          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <UserX className="size-6 text-foreground" />
            </div>
            <h3 className="text-xl font-medium tracking-tight">
              Your crew cannot answer from a crawl space
            </h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Technicians miss calls because they are doing real work. They are
              on roofs, in attics, under sinks, or already talking to a
              customer.
            </p>
          </article>
          <article className="rounded-[1.35rem] border border-border/70 bg-background p-8">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
              <PhoneOff className="size-6 text-foreground" />
            </div>
            <h3 className="text-xl font-medium tracking-tight">
              After-hours emergencies go unanswered
            </h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              A burst pipe at 10 PM does not wait for business hours. Without
              coverage, emergency calls go to voicemail or your competitor who
              answers.
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}

export function Solution() {
  const points = [
    "Answer routine questions about services, pricing, and availability",
    "Collect job details: service type, address, urgency, and budget",
    "Book appointments while the homeowner is still on the phone",
    "Send confirmation texts and notify your team instantly",
    "Route emergency calls to your on-call technician with full context",
    "Save recordings, transcripts, summaries, and next steps",
  ]

  return (
    <section className="section-spacing" id="solution">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h2 className="section-heading text-left">
              A receptionist that works while your crew works
            </h2>
            <p className="section-intro text-left">
              LobbyStack gives your home services business a phone answering
              layer that captures leads, books jobs, and handles emergencies
              around the clock.
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
                    Hello! Apex Heating and Cooling. How can I help you today?
                  </div>
                  <div className="ml-8 rounded-2xl rounded-tr-sm bg-primary p-3 text-sm text-primary-foreground">
                    My AC stopped working and it is 90 degrees outside. Can
                    someone come today?
                  </div>
                  <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm text-foreground/80">
                    I can help with that. We have a technician available this
                    afternoon between 2 and 4 PM. Would you like me to book
                    that?
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

export function UseCases() {
  const cases = [
    {
      title: "After-hours emergencies",
      copy: "Capture late-night HVAC failures, plumbing leaks, and electrical issues. Route true emergencies to your on-call tech.",
    },
    {
      title: "Overflow during jobs",
      copy: "Answer calls while your crew is on a roof, under a sink, or driving. No more missed leads because everyone is busy.",
    },
    {
      title: "Quote intake",
      copy: "Collect project details, square footage, issue descriptions, and photos so your estimator shows up prepared.",
    },
    {
      title: "Appointment booking",
      copy: "Offer open slots, book the service call, and send the homeowner a confirmation with arrival window.",
    },
    {
      title: "Parts and warranty questions",
      copy: "Answer routine questions about warranty coverage, part availability, and return policies without pulling a tech off a job.",
    },
    {
      title: "Missed-call recovery",
      copy: "Follow up with callers who got voicemail, collect the details, and help them book before they call someone else.",
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
            time, revenue, or callbacks.
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

export function HowItWorks() {
  const steps = [
    {
      title: "Connect your phone",
      copy: "Use a dedicated LobbyStack number or forward calls from the business line your customers already know.",
    },
    {
      title: "Add your services and coverage areas",
      copy: "Give LobbyStack your service list, pricing, hours, service areas, emergency policies, and booking rules.",
    },
    {
      title: "Choose when it should answer",
      copy: "Have it answer every call, only after hours, only when your team is busy, or only for overflow lines.",
    },
    {
      title: "Review every job lead",
      copy: "See what happened after each call: caller details, job type, appointment, transcript, and next step.",
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

export function Comparison() {
  const comparisons = [
    {
      option: "Voicemail",
      what: "The caller leaves a message and waits for a callback.",
      bestFor: "Low-priority calls that do not need a fast response.",
      limit: "Homeowners with urgent issues call the next company.",
    },
    {
      option: "Phone tree",
      what: "The caller presses buttons and follows a fixed menu.",
      bestFor: "Large companies with dedicated departments.",
      limit: "Frustrating when someone just needs a technician today.",
    },
    {
      option: "Traditional answering service",
      what: "A person answers from a script and takes a message.",
      bestFor: "Businesses that need human operators for every call.",
      limit: "Costs scale with volume. Messages still need callback.",
    },
    {
      option: "LobbyStack",
      what: "AI answers, asks questions, books appointments, and routes emergencies.",
      bestFor:
        "Trades and home services that want 24/7 coverage without adding headcount.",
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
            LobbyStack handles the call while the homeowner is still interested.
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
