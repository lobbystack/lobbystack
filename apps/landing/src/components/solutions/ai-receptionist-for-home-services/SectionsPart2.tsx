import {
  ArrowRight,
  MapPin,
  ShieldCheck,
  Wrench,
  ClipboardList,
} from "lucide-react"

export function BusinessFit() {
  const trades = [
    {
      name: "HVAC",
      copy: "Capture emergency no-heat and no-cool calls, book seasonal maintenance, and route after-hours emergencies to your on-call technician.",
    },
    {
      name: "Plumbing",
      copy: "Handle burst pipe emergencies, schedule drain cleanings, and collect leak details so your plumber shows up with the right parts.",
    },
    {
      name: "Electrical",
      copy: "Triage outage calls, book panel upgrades, and answer questions about permits and code requirements.",
    },
    {
      name: "Landscaping",
      copy: "Book seasonal maintenance, estimate visits, and collect property details for design and installation projects.",
    },
  ]

  return (
    <section className="section-spacing" id="business-fit">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Built for the trades that run on phone calls
          </h2>
          <p className="section-intro">
            LobbyStack works for any home services business where a missed call
            means a missed job.
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {trades.map((t) => (
            <div
              key={t.name}
              className="rounded-[1.35rem] border border-border/70 bg-background p-8"
            >
              <h3 className="text-xl font-medium tracking-tight">{t.name}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {t.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Capabilities() {
  const caps = [
    {
      icon: Wrench,
      title: "Job intake",
      copy: "Collect service type, address, urgency, and property details before your technician arrives.",
    },
    {
      icon: MapPin,
      title: "Service area routing",
      copy: "Ask for ZIP code or city and route calls to the right crew based on where you actually work.",
    },
    {
      icon: ClipboardList,
      title: "Quote requests",
      copy: "Capture scope details and schedule estimate visits so your sales team walks in prepared.",
    },
    {
      icon: ShieldCheck,
      title: "Warranty and parts",
      copy: "Answer routine questions about coverage, part availability, and return policies without interrupting work.",
    },
  ]

  return (
    <section className="section-spacing bg-muted/30" id="capabilities">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            What your AI receptionist can handle
          </h2>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {caps.map((c) => (
            <div
              key={c.title}
              className="rounded-[1.35rem] border border-border/70 bg-background p-8"
            >
              <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
                <c.icon className="size-6 text-foreground" />
              </div>
              <h3 className="text-xl font-medium tracking-tight">{c.title}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {c.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function RevenueTieIn() {
  return (
    <section className="section-spacing bg-background" id="revenue-tie-in">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">
            Every missed call could be a $500 job
          </h2>
          <p className="section-intro">
            In home services, a single missed emergency call can mean a lost job
            worth hundreds or thousands of dollars. Use the calculator to see
            what unanswered calls are costing your business.
          </p>
          <div className="mt-8">
            <a
              href="/missed-call-revenue-calculator/"
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              Calculate missed-call revenue
              <ArrowRight className="size-3.5" />
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Enter your weekly missed calls, booking rate, and average job value
            to estimate annual revenue at risk.
          </p>
        </div>
      </div>
    </section>
  )
}

export function OpenSource() {
  return (
    <section className="section-spacing bg-muted/30" id="open-source">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">Open source and self-hosted ready</h2>
          <p className="section-intro">
            LobbyStack is open source. You can self-host on your own
            infrastructure for full data control, custom deployments, and
            white-label options.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <a
              href="https://github.com/lobbystack/lobbystack"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              View on GitHub
              <ArrowRight className="size-3.5" />
            </a>
            <a
              href="/solutions/self-hosted-ai-receptionist/"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              Self-hosted AI receptionist
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
