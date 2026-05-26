import { APP_SIGNUP_URL } from "@/lib/app-links"
import { ArrowRight, Check, History, Pencil } from "lucide-react"

const extensionCards = [
  {
    title: "Turn unanswered calls into booked work",
    description:
      "LobbyStack answers when your team cannot, captures what the caller needs, and helps them book or request a callback.",
    cta: "See how it works",
    href: "#how-it-works",
    image: "/illustrations/missed-calls-v4.webp",
    alt: "Missed calls organized into a LobbyStack call capture flow",
  },
  {
    title: "Send the right calls to your team",
    description:
      "LobbyStack can answer routine calls, take a message, or route urgent conversations to your team with the caller's details and reason attached.",
    cta: "Set routing rules",
    href: "#control",
    image: "/illustrations/calls-need-person.webp",
    alt: "LobbyStack call summary with routing details and appointment context",
  },
]

const toolCards = [
  {
    title: "A receptionist that picks up when you need it to",
    description:
      "Let LobbyStack answer every call, or only step in when your team is busy, after hours, or unable to pick up.",
    cta: "Answering",
    image: "/illustrations/call-capture.webp",
    alt: "LobbyStack call capture interface illustration",
  },
  {
    title: "Appointments booked without the back-and-forth",
    description:
      "Offer available times, confirm appointments, and send follow-up details without manual back-and-forth.",
    cta: "Booking",
    image: "/illustrations/booking-flow.webp",
    alt: "LobbyStack appointment booking flow illustration",
  },
  {
    title: "Human handoff when a call needs it",
    description:
      "Route urgent or unusual calls to a human with the caller's reason, contact details, and conversation context attached.",
    cta: "Handoff",
    image: "/illustrations/human-handoff.webp",
    alt: "LobbyStack handoff from an incoming call to a team member",
  },
]

const workflowSteps = [
  {
    title: "Connect your phone",
    description:
      "Use a new local number or forward calls from the business number customers already call.",
  },
  {
    title: "Add your knowledge",
    description:
      "Import your website, files, services, FAQs, hours, policies, and the details callers ask about most.",
  },
  {
    title: "Set the rules",
    description:
      "Decide when LobbyStack should answer, book appointments, take a message, or hand the call to a person.",
  },
  {
    title: "Go live",
    description:
      "LobbyStack starts answering calls, helping customers, and sending confirmations and summaries automatically.",
  },
]

const controlCards = [
  {
    title: "Control what your AI receptionist can say",
    description:
      "Update services, pricing, policies, FAQs, and instructions whenever your business changes, without waiting on a developer.",
    icon: Pencil,
  },
  {
    title: "Review every call in one place",
    description:
      "See recordings, transcripts, summaries, caller details, bookings, and next steps without digging through voicemails or scattered notes.",
    icon: History,
  },
]

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    description:
      "Starter voice minutes, outbound call attempts, SMS alerts, appointment booking, summaries, and call history.",
  },
  {
    name: "Pro",
    price: "$15/mo",
    description:
      "Higher included limits, usage-based billing, and priority email support.",
  },
  {
    name: "Enterprise",
    price: "Custom",
    description:
      "Higher volume, multiple numbers, multi-location routing, custom fallback rules, and self-hosting implementation support.",
  },
]



export function ProductExtensionSection() {
  return (
    <section
      className="px-0 pt-0 pb-12 md:pb-16 lg:pb-20"
      id="missed-calls"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {extensionCards.map((card) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background"
            >
              <div className="h-[300px] overflow-hidden border-b border-border/70 bg-muted md:h-[360px]">
                <img
                  src={card.image}
                  alt={card.alt}
                  width={1200}
                  height={800}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="p-8 md:p-10">
                <h3 className="card-heading">
                  {card.title}
                </h3>
                <p className="body-copy mt-5">
                  {card.description}
                </p>
                <div className="mt-6">
                  <a
                    href={card.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
                  >
                    {card.cta}
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ConnectedReceptionistSection() {
  return (
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid overflow-hidden rounded-[1.35rem] border border-border/70 bg-background lg:grid-cols-[1.18fr_0.82fr]">
          <div className="min-h-[360px] overflow-hidden border-b border-border/70 bg-muted md:min-h-[460px] lg:border-r lg:border-b-0">
            <img
              src="/illustrations/business-knowledge.webp"
              alt="Business knowledge sources connected to LobbyStack answer routing"
              width={1200}
              height={800}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16">
            <h2 className="section-heading">
              Answers from everything your business knows
            </h2>
            <p className="section-intro">
              Import your website, PDFs, documents, spreadsheets, service lists,
              policies, and FAQs so LobbyStack can answer with the same context
              your team uses every day.
            </p>
            <div className="mt-8">
              <a
                href={APP_SIGNUP_URL}
                data-ph-signup-cta
                data-ph-capture-attribute-section="how_it_works"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={APP_SIGNUP_URL}
                className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Try for free
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function QualityToolsSection() {
  return (
    <section className="section-spacing" id="phone-tools">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">
            AI receptionist for teams who care about response quality
          </h2>
          <p className="section-intro">
            Cover the phone without giving up the details, judgment, and follow
            through that customers notice.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-16 md:gap-24">
          {toolCards.map((card, index) => (
            <article
              key={card.title}
              className={`flex flex-col gap-8 md:gap-12 lg:gap-16 items-center ${
                index % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
              }`}
            >
              <div className="w-full flex-1 overflow-hidden rounded-[1.35rem] border border-border/70 bg-muted">
                <img
                  src={card.image}
                  alt={card.alt}
                  width={1200}
                  height={800}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="w-full flex-1 md:py-8">
                <span className="eyebrow-label mb-4 block">
                  {card.cta}
                </span>
                <h3 className="card-heading md:text-3xl">
                  {card.title}
                </h3>
                <p className="body-copy mt-5 max-w-[65ch] md:text-lg">
                  {card.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorkflowSection() {
  return (
    <section className="section-spacing" id="workflow">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">
            Launch your AI receptionist in minutes
          </h2>
          <p className="section-intro">
            Set up the receptionist once, then refine how it answers, books,
            routes, and summarizes as your business grows.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 border-y border-border/70 md:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <article
              key={step.title}
              className="border-b border-border/70 py-8 last:border-b-0 md:px-8 md:[&:nth-child(2n)]:border-l lg:border-b-0 lg:border-l lg:first:border-l-0 lg:[&:nth-child(2n)]:border-l"
            >
              <div className="font-mono text-sm font-medium text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-6 font-heading text-xl leading-tight font-medium tracking-[-0.03em]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ControlOwnershipSection() {
  return (
    <section className="section-spacing" id="control">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">Keep control of every call</h2>
          <p className="section-intro mx-auto">
            LobbyStack handles routine conversations, but your team decides what
            it knows, what it can do, and when the call should come back to a
            person.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-[1.35rem] border border-border/70 bg-background">
          <img
            src="/screenshots/dashboard.webp"
            alt="LobbyStack dashboard with call metrics, action required, upcoming appointments, and recent calls"
            width={1600}
            height={1000}
            className="w-full"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {controlCards.map((card) => {
            const Icon = card.icon
            return (
              <article
                key={card.title}
                className="flex min-h-[260px] flex-col rounded-[1.35rem] border border-border/70 bg-background p-8 md:p-10"
              >
                <div className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm">
                  <Icon className="size-5 text-foreground/80" aria-hidden="true" />
                </div>
                <div className="mt-8">
                  <h3 className="card-heading">
                    {card.title}
                  </h3>
                  <p className="body-copy mt-5">
                    {card.description}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function PricingPreviewSection() {
  return (
    <section className="section-spacing" id="pricing-preview">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">
            Start free. Upgrade when calls grow.
          </h2>
          <p className="section-intro">
            Try LobbyStack with starter usage, then move to predictable Pro
            pricing when you are ready for production call coverage.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan, index) => {
            const isPro = index === 1;
            return (
              <article
                key={plan.name}
                className={`flex min-h-[310px] flex-col rounded-[1.35rem] p-8 ${
                  isPro
                    ? "border-2 border-foreground bg-background shadow-sm"
                    : "border border-border/70 bg-background"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="card-heading">
                      {plan.name}
                    </h3>
                    {isPro && (
                      <span className="inline-flex rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                        Most Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                    {plan.price}
                  </p>
                  <p className="body-copy mt-5">
                    {plan.description}
                  </p>
                  <Check className={`mt-6 size-5 ${isPro ? "text-foreground" : "text-foreground/70"}`} aria-hidden="true" />
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="/pricing/"
            data-ph-capture-attribute-section="pricing_preview"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            View pricing details
            <ArrowRight className="size-4" />
          </a>
          <p className="text-sm text-muted-foreground">
            No credit card required to start.
          </p>
        </div>
      </div>
    </section>
  )
}

function OpenSourceSection() {
  return (
    <section className="section-spacing" id="open-source">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">Proudly open-source, self-hosted</h2>
          <p className="section-intro mx-auto">
            Host LobbyStack on your own server. Own your customer data and stay
            fully compliant with regulatory standards.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href="https://github.com/lobbystack/lobbystack"
            target="_blank"
            rel="noopener noreferrer"
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_github"
            data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            View on GitHub
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

export function LandingPageAdditions() {
  return (
    <>
      <ConnectedReceptionistSection />
      <QualityToolsSection />
      <WorkflowSection />
      <ControlOwnershipSection />
      <PricingPreviewSection />
      <OpenSourceSection />
    </>
  )
}
