import { APP_SIGNUP_URL } from "@/lib/app-links"
import { getCopy, localizeHref, type Locale } from "@/i18n"
import { ArrowRight, Check, History, Pencil } from "lucide-react"

const homeSectionsCopy = {
  en: {
    extension: {
      heading: "Turn missed calls into booked work",
      body: "LobbyStack captures what callers need, books appointments when they are ready, and routes urgent calls with context.",
    },
    extensionCards: [
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
    ],
    connected: {
      imageAlt:
        "Business knowledge sources connected to LobbyStack answer routing",
      heading: "Answers from everything your business knows",
      body: "Import your website, PDFs, documents, spreadsheets, service lists, policies, and FAQs so LobbyStack can answer with the same context your team uses every day.",
    },
    quality: {
      heading: "AI receptionist for teams who care about response quality",
      body: "Cover the phone without giving up the details, judgment, and follow through that customers notice.",
      learnMoreLabel: "Explore AI phone answering",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
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
      ],
    },
    workflow: {
      heading: "Launch your AI receptionist in minutes",
      body: "Set up the receptionist once, then refine how it answers, books, routes, and summarizes as your business grows.",
      guideLabel: "Read the buyer guide",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
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
      ],
    },
    control: {
      heading: "Keep control of every call",
      body: "LobbyStack handles routine conversations, but your team decides what it knows, what it can do, and when the call should come back to a person.",
      imageAlt:
        "LobbyStack dashboard with call metrics, action required, upcoming appointments, and recent calls",
      cards: [
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
      ],
    },
    pricing: {
      heading: "Start free. Upgrade when calls grow.",
      body: "Try LobbyStack with included usage, then move to Starter or Pro when you are ready for production call coverage.",
      badge: "Most Popular",
      viewDetails: "View pricing details",
      note: "No credit card required to start.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 voice minutes, 10 alert SMS segments, 2 outbound call attempts, and all features.",
        },
        {
          name: "Starter",
          price: "$30/mo",
          description:
            "150 voice minutes, 50 alert SMS segments, 20 outbound call attempts, and email support.",
        },
        {
          name: "Pro",
          price: "$100/mo",
          description:
            "500 voice minutes, 200 alert SMS segments, 100 outbound call attempts, and priority email support.",
        },
        {
          name: "Enterprise",
          price: "Custom",
          description:
            "Higher volume, multiple numbers, multi-location routing, custom fallback rules, and self-hosting implementation support.",
        },
      ],
    },
    openSource: {
      heading: "Proudly open-source, self-hosted",
      body: "Host LobbyStack on your own server. Own your customer data and stay fully compliant with regulatory standards.",
      cta: "View on GitHub",
      solutionCta: "Open-source receptionist",
      selfHostedCta: "Self-hosting overview",
    },
    resources: {
      heading: "Learn more about AI receptionists",
      body: "Guides, calculators, and comparisons to help you evaluate call coverage before you go live.",
      links: [
        {
          label: "How to choose an AI receptionist",
          href: "/blog/how-to-choose-an-ai-receptionist/",
        },
        {
          label: "Missed call revenue calculator",
          href: "/missed-call-revenue-calculator/",
        },
        {
          label: "AI receptionist comparison",
          href: "/comparison/",
        },
        {
          label: "Open-source receptionist stack",
          href: "/blog/open-source-ai-receptionist-stack/",
        },
      ],
    },
  },
  fr: {
    extension: {
      heading: "Transformez les appels manqués en rendez‑vous",
      body: "LobbyStack comprend le besoin de l'appelant, réserve quand la personne est prête et transfère les urgences avec le bon contexte.",
    },
    extensionCards: [
      {
        title: "Transformez les appels sans réponse en rendez‑vous",
        description:
          "LobbyStack répond quand votre équipe ne peut pas décrocher, comprend le besoin de l’appelant et l’aide à réserver ou à demander un rappel.",
        cta: "Voir le fonctionnement",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-v4.webp",
        alt: "Appels manqués organisés dans un parcours de prise en charge LobbyStack",
      },
      {
        title: "Envoyez les bons appels à la bonne personne",
        description:
          "LobbyStack traite les appels courants, prend un message ou transfère les conversations urgentes avec les détails et le motif de l’appel.",
        cta: "Définir les règles",
        href: "#control",
        image: "/illustrations/calls-need-person.webp",
        alt: "Résumé d’appel LobbyStack avec transfert et contexte de rendez‑vous",
      },
    ],
    connected: {
      imageAlt:
        "Sources de connaissances métier connectées à la réception téléphonique LobbyStack",
      heading: "Des réponses fondées sur ce que votre entreprise sait déjà",
      body: "Importez votre site, vos PDF, documents, feuilles de calcul, services, politiques et FAQ pour que LobbyStack réponde avec le même contexte que votre équipe.",
    },
    quality: {
      heading:
        "Un réceptionniste IA pour les équipes qui tiennent à la qualité des réponses",
      body: "Couvrez le téléphone sans perdre les détails, le jugement et le suivi que vos clients remarquent.",
      learnMoreLabel: "Découvrir la réponse téléphonique IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Une réceptionniste qui décroche quand vous en avez besoin",
          description:
            "Laissez LobbyStack répondre à chaque appel, ou seulement prendre le relais quand votre équipe est occupée, fermée ou indisponible.",
          cta: "Réponse",
          image: "/illustrations/call-capture.webp",
          alt: "Illustration de prise d’appel LobbyStack",
        },
        {
          title: "Des rendez‑vous pris sans allers-retours",
          description:
            "Proposez des créneaux disponibles, confirmez les rendez‑vous et envoyez les informations de suivi sans échanges manuels.",
          cta: "Réservation",
          image: "/illustrations/booking-flow.webp",
          alt: "Illustration de la prise de rendez‑vous LobbyStack",
        },
        {
          title: "Transfert humain quand l’appel l’exige",
          description:
            "Transférez les appels urgents ou inhabituels vers une personne avec le motif, les coordonnées et le contexte de la conversation.",
          cta: "Transfert",
          image: "/illustrations/human-handoff.webp",
          alt: "Transfert LobbyStack d’un appel entrant vers un membre de l’équipe",
        },
      ],
    },
    workflow: {
      heading: "Lancez votre réceptionniste IA en quelques minutes",
      body: "Configurez-la une première fois, puis ajustez ses réponses, ses rendez‑vous, ses transferts et ses résumés au fil de votre croissance.",
      guideLabel: "Lire le guide d'achat",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Connectez votre téléphone",
          description:
            "Utilisez un nouveau numéro local ou transférez les appels depuis le numéro que vos clients composent déjà.",
        },
        {
          title: "Ajoutez vos connaissances",
          description:
            "Importez votre site, vos fichiers, vos services, vos FAQ, vos horaires, vos politiques et les détails que les appelants demandent souvent.",
        },
        {
          title: "Définissez les règles",
          description:
            "Décidez quand LobbyStack doit répondre, réserver, prendre un message ou passer l’appel à une personne.",
        },
        {
          title: "Passez en production",
          description:
            "LobbyStack commence à répondre, aider les clients et envoyer confirmations et résumés automatiquement.",
        },
      ],
    },
    control: {
      heading: "Gardez le contrôle de chaque appel",
      body: "LobbyStack gère les conversations courantes, mais votre équipe décide ce qu’il sait, ce qu’il peut faire et quand l’appel doit revenir à une personne.",
      imageAlt:
        "Tableau de bord LobbyStack avec indicateurs d’appels, actions requises, rendez‑vous à venir et appels récents",
      cards: [
        {
          title: "Contrôlez ce que votre réceptionniste IA peut dire",
          description:
            "Mettez à jour services, prix, politiques, FAQ et consignes dès que votre entreprise change, sans attendre un développeur.",
          icon: Pencil,
        },
        {
          title: "Revoyez chaque appel au même endroit",
          description:
            "Consultez enregistrements, transcriptions, résumés, appelants, rendez‑vous et prochaines étapes sans fouiller dans les messages vocaux.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading:
        "Commencez gratuitement. Passez au forfait supérieur quand les appels augmentent.",
      body: "Essayez LobbyStack avec l’usage inclus, puis passez à Starter ou Pro quand vous êtes prêt à couvrir vos appels en production.",
      badge: "Le plus populaire",
      viewDetails: "Voir le détail des tarifs",
      note: "Aucune carte bancaire requise pour commencer.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minutes vocales, 10 segments SMS d’alerte, 2 appels sortants et toutes les fonctionnalités.",
        },
        {
          name: "Starter",
          price: "$30/mois",
          description:
            "150 minutes vocales, 50 segments SMS d’alerte, 20 appels sortants et support par courriel.",
        },
        {
          name: "Pro",
          price: "$100/mois",
          description:
            "500 minutes vocales, 200 segments SMS d’alerte, 100 appels sortants et support prioritaire par courriel.",
        },
        {
          name: "Enterprise",
          price: "Sur mesure",
          description:
            "Volume supérieur, plusieurs numéros, routage multi-sites, règles de secours personnalisées et accompagnement pour l’auto-hébergement.",
        },
      ],
    },
    openSource: {
      heading: "Open source, prêt pour l'auto-hébergement",
      body: "Hébergez LobbyStack sur votre propre serveur. Gardez la maîtrise de vos données client et de vos exigences de conformité.",
      cta: "Voir sur GitHub",
      solutionCta: "Réceptionniste IA open source",
      selfHostedCta: "Aperçu de l'auto-hébergement",
    },
    resources: {
      heading: "En savoir plus sur les réceptionnistes IA",
      body: "Guides, calculateurs et comparatifs pour évaluer la couverture téléphonique avant la mise en production.",
      links: [
        {
          label: "Comment choisir un réceptionniste IA",
          href: "/blog/how-to-choose-an-ai-receptionist/",
        },
        {
          label: "Calculateur d'appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
        {
          label: "Comparaison de réceptionnistes IA",
          href: "/comparison/",
        },
        {
          label: "Pile open source pour réceptionniste IA",
          href: "/blog/open-source-ai-receptionist-stack/",
        },
      ],
    },
  },
}

type LocalizedProps = {
  locale?: Locale
}

export function ProductExtensionSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale]

  return (
    <section className="px-0 pt-0 pb-12 md:pb-16 lg:pb-20" id="missed-calls">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 max-w-3xl">
          <h2 className="section-heading">{sectionCopy.extension.heading}</h2>
          <p className="section-intro mt-4">{sectionCopy.extension.body}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {sectionCopy.extensionCards.map((card) => (
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
                <h3 className="card-heading">{card.title}</h3>
                <p className="body-copy mt-5">{card.description}</p>
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

function ConnectedReceptionistSection({ locale = "en" }: LocalizedProps) {
  const copy = getCopy(locale)
  const sectionCopy = homeSectionsCopy[locale].connected

  return (
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid overflow-hidden rounded-[1.35rem] border border-border/70 bg-background lg:grid-cols-[1.18fr_0.82fr]">
          <div className="min-h-[360px] overflow-hidden border-b border-border/70 bg-muted md:min-h-[460px] lg:border-r lg:border-b-0">
            <img
              src="/illustrations/business-knowledge.webp"
              alt={sectionCopy.imageAlt}
              width={1200}
              height={800}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16">
            <h2 className="section-heading">{sectionCopy.heading}</h2>
            <p className="section-intro">{sectionCopy.body}</p>
            <div className="mt-8">
              <a
                href={APP_SIGNUP_URL}
                data-ph-signup-cta
                data-ph-capture-attribute-section="how_it_works"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={APP_SIGNUP_URL}
                className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                {copy.common.tryFree}
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function QualityToolsSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].quality

  return (
    <section className="section-spacing" id="phone-tools">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
          <p className="mt-4">
            <a
              href={localizeHref(locale, sectionCopy.learnMoreHref)}
              className="text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              {sectionCopy.learnMoreLabel}
              <ArrowRight className="ml-1 inline size-3.5" />
            </a>
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-16 md:gap-24">
          {sectionCopy.toolCards.map((card, index) => (
            <article
              key={card.title}
              className={`flex flex-col items-center gap-8 md:gap-12 lg:gap-16 ${
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
                <span className="eyebrow-label mb-4 block">{card.cta}</span>
                <h3 className="card-heading md:text-3xl">{card.title}</h3>
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

function WorkflowSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].workflow

  return (
    <section className="section-spacing" id="workflow">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
          <p className="mt-4">
            <a
              href={localizeHref(locale, sectionCopy.guideHref)}
              className="text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              {sectionCopy.guideLabel}
              <ArrowRight className="ml-1 inline size-3.5" />
            </a>
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 border-y border-border/70 md:grid-cols-2 lg:grid-cols-4">
          {sectionCopy.steps.map((step, index) => (
            <article
              key={step.title}
              className="border-b border-border/70 py-8 last:border-b-0 md:px-8 lg:border-b-0 lg:border-l lg:first:border-l-0 md:[&:nth-child(2n)]:border-l lg:[&:nth-child(2n)]:border-l"
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

function ControlOwnershipSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].control

  return (
    <section className="section-spacing" id="control">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro mx-auto">{sectionCopy.body}</p>
        </div>

        <div className="mt-14 overflow-hidden rounded-[1.35rem] border border-border/70 bg-background">
          <img
            src="/screenshots/dashboard.webp"
            alt={sectionCopy.imageAlt}
            width={1600}
            height={1000}
            className="w-full"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {sectionCopy.cards.map((card) => {
            const Icon = card.icon
            return (
              <article
                key={card.title}
                className="flex min-h-[260px] flex-col rounded-[1.35rem] border border-border/70 bg-background p-8 md:p-10"
              >
                <div className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm">
                  <Icon
                    className="size-5 text-foreground/80"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-8">
                  <h3 className="card-heading">{card.title}</h3>
                  <p className="body-copy mt-5">{card.description}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function PricingPreviewSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].pricing

  return (
    <section className="section-spacing" id="pricing-preview">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {sectionCopy.plans.map((plan) => {
            const isPro = plan.name === "Pro"
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
                    <h3 className="card-heading">{plan.name}</h3>
                    {isPro && (
                      <span className="inline-flex rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                        {sectionCopy.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                    {plan.price}
                  </p>
                  <p className="body-copy mt-5">{plan.description}</p>
                  <Check
                    className={`mt-6 size-5 ${isPro ? "text-foreground" : "text-foreground/70"}`}
                    aria-hidden="true"
                  />
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={localizeHref(locale, "/pricing/")}
            data-ph-capture-attribute-section="pricing_preview"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {sectionCopy.viewDetails}
            <ArrowRight className="size-4" />
          </a>
          <p className="text-sm text-muted-foreground">{sectionCopy.note}</p>
        </div>
      </div>
    </section>
  )
}

function OpenSourceSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].openSource

  return (
    <section className="section-spacing" id="open-source">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro mx-auto">{sectionCopy.body}</p>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
          <a
            href="https://github.com/lobbystack/lobbystack"
            target="_blank"
            rel="noopener noreferrer"
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_github"
            data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {sectionCopy.cta}
            <ArrowRight className="size-4" />
          </a>
          <a
            href={localizeHref(locale, "/solutions/open-source-ai-receptionist/")}
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_open_source_solution"
            data-ph-capture-attribute-destination="/solutions/open-source-ai-receptionist/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {sectionCopy.solutionCta}
            <ArrowRight className="size-4" />
          </a>
          <a
            href={localizeHref(locale, "/solutions/self-hosted-ai-receptionist/")}
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_self_hosted_solution"
            data-ph-capture-attribute-destination="/solutions/self-hosted-ai-receptionist/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {sectionCopy.selfHostedCta}
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

function HomeResourcesSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].resources

  return (
    <section className="section-spacing border-t border-border/70" id="resources">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {sectionCopy.links.map((link) => (
            <li key={link.href}>
              <a
                href={localizeHref(locale, link.href)}
                className="flex items-center justify-between rounded-[1.35rem] border border-border/70 bg-background px-6 py-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {link.label}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function LandingPageAdditions({ locale = "en" }: LocalizedProps) {
  return (
    <>
      <ConnectedReceptionistSection locale={locale} />
      <QualityToolsSection locale={locale} />
      <WorkflowSection locale={locale} />
      <ControlOwnershipSection locale={locale} />
      <PricingPreviewSection locale={locale} />
      <OpenSourceSection locale={locale} />
      <HomeResourcesSection locale={locale} />
    </>
  )
}
