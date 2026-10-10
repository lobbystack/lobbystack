import { absoluteUrl } from "@/lib/seo"
import { afterHoursFaqs } from "@/lib/after-hours-faqs"
import { dentalOfficesFaqs } from "@/lib/dental-offices-faqs"
import { salonsSpasFaqs } from "@/lib/salons-spas-faqs"
import { selfHostedFaqs } from "@/lib/self-hosted-faqs"
import {
  plumberFaqs,
  hvacFaqs,
  electricianFaqs,
  garageDoorFaqs,
  applianceRepairFaqs,
  restorationFaqs,
  locksmithFaqs,
  propertyManagementFaqs,
  roofingFaqs,
} from "@/lib/trade-faqs"
import { contractorAfterHoursFaqs } from "@/lib/contractor-after-hours-faqs"
import { openSourceReceptionistFaqs } from "@/lib/open-source-receptionist-faqs"
export type SeoLandingPageGroup = "company" | "solution"

export type SeoLandingPage = {
  group: SeoLandingPageGroup
  slug: string
  path: string
  title: string
  description: string
  eyebrow: string
  h1: string
  intro: string
  image: string
  imageAlt: string
  proofPoints: string[]
  sections: Array<{
    title: string
    body: string
    points: string[]
  }>
  faqs: Array<{
    question: string
    answer: string
  }>
  faqHeading?: string
  relatedLinks: Array<{
    label: string
    href: string
  }>
  ctaHeading?: string
  ctaBody?: string
  ctaPrimaryLabel?: string
  ctaPrimaryHref?: string
  ctaSecondaryLabel?: string
  ctaSecondaryHref?: string
}

export const companyPages: SeoLandingPage[] = [
  {
    group: "company",
    slug: "about",
    path: "/about/",
    title: "About LobbyStack - Open-Source AI Receptionist",
    description:
      "Learn about LobbyStack, the open-source AI receptionist for small businesses that need call answering, appointment booking, and call transfers.",
    eyebrow: "About",
    h1: "About LobbyStack",
    intro:
      "LobbyStack exists to help small businesses answer calls and book appointments without giving up control of their phone workflow or customer data.",
    image: "/illustrations/value-network.webp",
    imageAlt:
      "LobbyStack open-source AI receptionist connecting callers, teams, and business workflows",
    proofPoints: [
      "Open-source AI receptionist for small businesses",
      "Built around call answering, booking, transfers, and call summaries",
      "Designed for managed cloud use and self-hosted implementation support",
    ],
    sections: [
      {
        title: "Why LobbyStack exists",
        body: "Most small businesses do not lose customers because they do not care. They lose them because the phone rings while the team is already helping someone else.",
        points: [
          "Make every important call visible",
          "Turn routine questions into handled workflows",
          "Keep humans in control for sensitive or high-value calls",
        ],
      },
      {
        title: "Why we built it open source",
        body: "Phone workflows sit on top of customer data, booking rules, and escalation policies. Teams should be able to inspect how those decisions are made instead of trusting a black box.",
        points: [
          "Review the MIT-licensed codebase, deployment model, and data boundaries on GitHub",
          "Start on LobbyStack Cloud and move to self-hosting when your team needs more control",
          "Avoid vendor lock-in for the receptionist layer that sits in front of every caller",
        ],
      },
      {
        title: "Who LobbyStack is for",
        body: "LobbyStack is built for owner-operators and small teams that live on inbound calls: home services, trades, clinics, salons, and local service businesses that cannot afford to miss ready-to-book callers.",
        points: [
          "Teams that miss calls while they are on jobs, in appointments, or closed for the day",
          "Operators who want phone booking without a phone tree or IVR builder",
          "Businesses that need after-hours coverage without hiring another full-time receptionist",
        ],
      },
      {
        title: "How support and security work",
        body: "LobbyStack Cloud handles hosting, monitoring, and product updates. Self-hosted customers run the same open-source stack on infrastructure they control. In both cases, you define what the receptionist can say, book, and escalate.",
        points: [
          "Configure allowed answers, booking rules, and transfer paths in plain language",
          "Review call summaries, transcripts, and outcomes in one operator dashboard",
          "Use public documentation or contact support@lobbystack.com when you need implementation help",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Features", href: "/features/" },
      { label: "Public documentation", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
  },
]

export const solutionPages: SeoLandingPage[] = [
  {
    group: "solution",
    slug: "after-hours-answering-service",
    path: "/solutions/after-hours-answering-service/",
    title: "After-Hours Answering Service with AI | LobbyStack",
    description:
      "LobbyStack answers your business calls after hours, books appointments into your calendar, and transfers emergencies to your on-call number. Free plan, then $30 a month.",
    eyebrow: "After-hours answering",
    h1: "AI after-hours answering service for small businesses",
    intro:
      "LobbyStack answers your business phone at night, on weekends, and on holidays. It books routine jobs into your calendar and transfers emergencies to your on-call number. In the morning, you'll find a summary of every call in the dashboard.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack handling after-hours calls and routing urgent requests",
    proofPoints: [
      "Answers nights, weekends, and holidays on your current number",
      "Transfers emergencies to your on-call phone",
      "Free plan with 30 minutes, then $30 a month for 150",
    ],
    sections: [
      {
        title: "Emergencies reach your on-call phone",
        body: "You write what counts as urgent: no heat below a set temperature, water that won't stop, a tenant locked out. LobbyStack asks the questions your rule needs, then transfers the call to your on-call number. The address and problem it collected stay in the call's transcript. Anything that can wait gets a summary in your dashboard for the morning.",
        points: [
          "Transfers to the on-call number you set",
          "Reads your safety steps first, like where to shut off the water",
          "If a transfer doesn't connect, offers to take a message and can alert your team",
        ],
      },
      {
        title: "Routine callers book their own appointments",
        body: "When a caller wants a quote or a regular visit, LobbyStack offers open times from your Google Calendar and books the one they pick. The caller gets a text confirmation, and you see the booking when you open your calendar.",
        points: [
          "Books into Google Calendar during the call",
          "Moves or cancels appointments after checking who's calling",
          "Answers hours, service area, and pricing questions from your details",
        ],
      },
      {
        title: "You start the morning with every call written up",
        body: "Each call gets a summary, a transcript, and a recording in the dashboard, so you can see who called overnight and what they need before you return a single call. LobbyStack hangs up on spam, and those calls don't use your minutes.",
        points: [
          "A summary with the caller's name, number, and reason for calling",
          "The recording and full transcript of each call",
          "No minutes used for spam or calls under 10 seconds",
        ],
      },
    ],
    faqs: afterHoursFaqs,
    faqHeading: "Questions about AI after-hours answering",
    relatedLinks: [
      { label: "AI phone answering", href: "/solutions/ai-phone-answering/" },
      {
        label: "What an answering service costs",
        href: "/blog/how-much-does-an-answering-service-cost/",
      },
      { label: "Pricing", href: "/pricing/" },
      {
        label: "Missed-call calculator",
        href: "/missed-call-revenue-calculator/",
      },
    ],
    ctaHeading: "Stop sending night calls to voicemail",
    ctaBody:
      "Set your emergency rules, forward your number when you close, and place a test call tonight. The free plan includes 30 minutes.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-dental-offices",
    path: "/solutions/ai-receptionist-for-dental-offices/",
    title: "Dental AI Receptionist and Answering Service | LobbyStack",
    description:
      "LobbyStack, a dental AI receptionist, answers when the front desk is busy or closed, books into Google Calendar, and transfers emergencies. From $30 a month.",
    eyebrow: "Dental offices",
    h1: "AI dental receptionist and dental answering service",
    intro:
      "A dental AI receptionist answers your practice's phone when the front desk is busy, at lunch, or closed. LobbyStack books new patients and cleanings into Google Calendar, answers questions about accepted insurance and office policies from what you enter, and transfers emergencies to your on-call number. Paid plans start at $30 a month, with no setup fee.",
    image: "/illustrations/call-booking-summary.webp",
    imageAlt:
      "LobbyStack booking a patient appointment and summarizing the call",
    proofPoints: [
      "Books into Google Calendar and can text a confirmation and a reminder the day before",
      "Transfers after-hours emergencies to your on-call number",
      "Opens in English or French, then talks with patients in 70+ languages, including Spanish and Serbian",
    ],
    sections: [
      {
        title: "Your front desk stays with the patient in front of them",
        body: "The phone rings during check-in, and LobbyStack picks up the new-patient, insurance, and scheduling calls. It books routine visits and answers questions about accepted plans and parking from what you've entered. It writes up anything else for your team to handle between patients.",
        points: [
          "Answers when your line is busy, after you close, or on every call, depending on how you forward your number",
          "Answers questions about hours, parking, forms, and accepted plans",
          "Saves a recording, transcript, and one-line summary of each call",
        ],
      },
      {
        title: "New patients book on the first call",
        body: "New patients call at lunch and after work too. LobbyStack collects their insurance and reason for the visit, offers times that are free in your Google Calendar during your opening hours, then books the exam. If you'd rather confirm each visit yourself, set it to save the patient's preferred time as a request for your team, or to take a message. Patients who agree get a confirmation text and a reminder the day before. On LobbyStack Cloud, texts go to US and Canadian numbers only.",
        points: [
          "Books into Google Calendar during the call, for the practice or for each dentist and hygienist",
          "Texts a confirmation and a reminder 24 hours before, if the patient agrees",
          "If you turn on appointment changes, patients can move or cancel from the number they booked with",
        ],
      },
      {
        title: "Dental emergencies follow your rules",
        body: "You decide what counts as an emergency: swelling, fever, a knocked-out tooth, or bleeding that won't stop. LobbyStack asks those questions, then books the soonest open slot or transfers the call to your on-call number, depending on the rules you set. Put the care instructions you want patients to hear in your rules, in your own words. Transfers go to one number per practice, so when the on-call dentist changes, update that number or forward it to whoever is covering.",
        points: [
          "Asks the triage questions you approve",
          "Transfers urgent calls to your on-call number under the transfer rule you choose",
          "If a transfer doesn't connect, offers to take a message and can alert your team",
        ],
      },
      {
        title: "Patients talk in their own language",
        body: "Each call opens in your practice's default language, English or French. From there, the receptionist answers in the patient's language. It runs on OpenAI GPT-Live, which handles 70+ languages, including Spanish and Serbian. A patient who starts in Spanish, or asks for Serbian, hears the rest of the call in that language. Your dashboard and emails come in English, French, Spanish, or Serbian. Confirmation and reminder texts go out in your default language, or in Spanish or Serbian for a patient whose language you save through the API.",
        points: [
          "Opens each call in your default language, English or French",
          "Switches when a patient asks or starts speaking another language",
          "Sends confirmation and reminder texts in your default language",
        ],
      },
      {
        title: "What a dental AI receptionist costs",
        body: "LobbyStack has no setup fee on any plan, and prices are in US dollars. Annual billing costs 20% less, so Starter comes to $24 a month and Pro to $80. LobbyStack counts usage by the second. Calls under 10 seconds and calls the receptionist ends as spam don't count. Overage has no cap until an owner or admin sets one. For comparison, we checked dental-specific receptionists on their own websites on October 9, 2026. Those that publish prices ran from $299 to $1,199 a month. Dentina starts at $299 a month per location, billed annually, with unlimited calls. Viva AI runs from $349 to $1,199 a month, with usage counted in credits. Peerlogic Premium costs $699 a month and includes its phone system.",
        points: [
          "Starter: $30 a month for 150 minutes and one phone number, then $0.20 a minute",
          "Pro: $100 a month for 500 minutes, then $0.18 a minute. At 1,000 minutes a month, you pay $190 ($100 plus 500 extra minutes at $0.18)",
          "Free: 30 browser voice minutes a month for testing, without a card or a phone number",
        ],
      },
      {
        title: "When a dental-specific receptionist fits better",
        body: "LobbyStack books into Google Calendar only, so your team copies new bookings into Dentrix, Open Dental, or Eaglesoft. The REST API and signed webhooks for six events, such as appointment booked and message taken, can send call data to Zapier and other tools. LobbyStack makes no HIPAA claim, doesn't verify insurance eligibility, and runs no recall campaigns. It suits practices that book in Google Calendar or don't mind re-keying, and that want calls answered when the front desk is busy, at lunch, and after close. It transfers emergencies and talks with patients in their own language. If you need PMS write-back or recall campaigns, a dental vendor is the better pick. We read each claim below on the vendor's own site on October 9, 2026.",
        points: [
          "You need bookings written into Dentrix, Open Dental, or Eaglesoft: Dentina names 11 practice systems it writes bookings back to",
          "You want a receptionist tied to your practice software: Peerlogic names 8 systems it integrates with",
          "You need automated recalls: Dentina sells outbound recall campaigns (price on request), and Viva AI includes recall outreach from its $899 Platinum plan",
        ],
      },
    ],
    faqs: dentalOfficesFaqs,
    faqHeading: "Questions about AI dental receptionists",
    relatedLinks: [
      {
        label: "After-hours answering service",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "AI appointment scheduler",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Self-hosted AI receptionist",
        href: "/solutions/self-hosted-ai-receptionist/",
      },
      {
        label: "What an answering service costs",
        href: "/blog/how-much-does-an-answering-service-cost/",
      },
      {
        label: "AI receptionist vs. virtual receptionist",
        href: "/blog/ai-receptionist-vs-virtual-receptionist/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop sending new patients to voicemail",
    ctaBody:
      "Add your accepted plans, hours, and emergency rules, then place a test call. The free plan includes 30 minutes.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-salons-and-spas",
    path: "/solutions/ai-receptionist-for-salons-and-spas/",
    title: "Salon and Spa Answering Service with AI | LobbyStack",
    description:
      "LobbyStack is an AI answering service for salons and spas that answers booking calls, schedules appointments, handles reschedules, and answers service questions.",
    eyebrow: "Salons and spas",
    h1: "Salon and spa answering service that keeps booking",
    intro:
      "LobbyStack answers calls for salons, spas, barbershops, and wellness studios so clients can book, reschedule, and get answers without waiting for the front desk.",
    image: "/illustrations/booking-flow.webp",
    imageAlt: "LobbyStack scheduling a salon or spa appointment from a call",
    proofPoints: [
      "Books appointments while stylists and providers are busy",
      "Answers questions about services, pricing, and availability",
      "Handles cancellations and reschedules after checking who's calling",
    ],
    sections: [
      {
        title: "Keep booking when your hands are busy",
        body: "Stylists and massage therapists shouldn't have to pause treatments, wash color off their hands, or interrupt their creative flow to answer booking calls. LobbyStack answers on the first ring, checking your exact stylist availability.",
        points: [
          "Ensures zero double-bookings or overlapping scheduling slots",
          "Confirms stylist preferences, service durations, and client contact info",
          "Keeps your staff focused on high-craft treatments and blowouts",
        ],
      },
      {
        title: "Politely enforce cancellation policies",
        body: "Last-minute no-shows and cancellations eat directly into your salon margins. LobbyStack explains your booking guidelines and handles reschedules the same way on every call.",
        points: [
          "Communicates cancellation and reschedule policies during the call",
          "Allows clients to self-manage scheduling changes within allowed windows",
        ],
      },
      {
        title: "Keep service questions consistent and accurate",
        body: "Whether a client is asking about single-process color duration, balayage pricing, or patch-test requirements, LobbyStack retrieves precise answers from your custom guidelines, eliminating front-desk guessing games.",
        points: [
          "Answers complex questions about services, packages, and stylists",
          "Routes specialized service requests directly to the right technician",
          "Keeps front-desk messaging aligned with your brand standards",
        ],
      },
      {
        title: "Protect chair time without ignoring the phone",
        body: "Every ringing phone competes with the client already in the chair. LobbyStack handles routine booking and service questions so stylists, estheticians, massage therapists, and barbers can stay present during appointments.",
        points: [
          "Collects service type, preferred provider, timing, and client contact details",
          "Confirms appointment windows before the caller hangs up",
          "Takes a message for your team on nuanced service questions",
        ],
      },
      {
        title: "Keep revenue-sensitive policies consistent",
        body: "Deposits, cancellation windows, package rules, and same-day reschedules are easy to explain inconsistently when the desk is rushed. LobbyStack repeats the same approved policy every time.",
        points: [
          "Explains cancellation and no-show policies before confirming changes",
          "Uses your service menu, durations, provider rules, and booking limits",
          "Saves a summary of each call so your team knows what was promised",
        ],
      },
    ],
    faqs: salonsSpasFaqs,
    faqHeading: "Questions about AI receptionists for salons and spas",
    relatedLinks: [
      {
        label: "AI appointment scheduler",
        href: "/solutions/ai-appointment-scheduler/",
      },
      { label: "AI phone answering", href: "/solutions/ai-phone-answering/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Book clients while your hands are in their hair",
    ctaBody:
      "LobbyStack answers booking calls, handles reschedules, and answers service questions so your stylists never have to pause a treatment to pick up the phone.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "self-hosted-ai-receptionist",
    path: "/solutions/self-hosted-ai-receptionist/",
    title: "Self-Hosted AI Receptionist, Open Source | LobbyStack",
    description:
      "Run LobbyStack, an open-source AI receptionist, on your own servers with Docker Compose. Keep call recordings, transcripts, and customer data in your own PostgreSQL database.",
    eyebrow: "Self-hosted",
    h1: "Self-hosted AI receptionist that runs on your own servers",
    intro:
      "MIT-licensed and built to run with Docker Compose. Recordings, transcripts, and customer records stay in your own database, and calls run on your own Twilio and OpenAI accounts.",
    image: "/illustrations/trust-controls.webp",
    imageAlt:
      "LobbyStack controls for a self-hosted AI receptionist deployment",
    proofPoints: [
      "MIT License with no license fee",
      "Deploys with Docker Compose or the Railway template",
      "Runs the same code as LobbyStack Cloud",
    ],
    sections: [
      {
        title: "Choose where call data lives",
        body: "Recordings, transcripts, contacts, and settings stay in the PostgreSQL database and storage you run. You set the retention, backup, and deletion rules. Twilio and OpenAI still process live call audio under your accounts, so review their terms for your use case.",
        points: [
          "Separate database roles and row-level security for each service",
          "Recordings on a local volume or any S3-compatible bucket",
          "Backups and restores on your schedule",
        ],
      },
      {
        title: "Change the code to fit your workflow",
        body: "You get the TypeScript monorepo that runs LobbyStack Cloud. Edit the prompts, intake questions, and call rules, or connect LobbyStack to internal systems your team already uses.",
        points: [
          "System prompts live in the packages/agent-core workspace",
          "Point chat and embeddings at any OpenAI-compatible endpoint",
          "Pin a release and upgrade after you've tested it",
        ],
      },
      {
        title: "Know what you'll pay before you deploy",
        body: "LobbyStack charges no license fee for self-hosting. You pay your hosting provider, Twilio for numbers and call minutes, and OpenAI for Realtime usage, each on your own account. Count the hours your team will spend on updates, backups, and monitoring before you compare it with a Cloud plan.",
        points: [
          "Twilio and OpenAI bill you directly",
          "No per-seat or per-minute fee from LobbyStack",
          "Cloud plans start free if you'd rather not run servers",
        ],
      },
    ],
    faqs: selfHostedFaqs,
    faqHeading: "Questions about self-hosted AI receptionists",
    relatedLinks: [
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      { label: "API docs", href: "/docs/api/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Deploy LobbyStack on your own servers",
    ctaBody:
      "The self-hosting guide covers the services, provider accounts, and backups you'll run. The Docker Compose guide walks through a single-server deployment.",
    ctaPrimaryLabel: "Read the self-hosting guide",
    ctaPrimaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    ctaSecondaryLabel: "View on GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  },

  // ── Trade-specific solution pages ──────────────────────────────

  {
    group: "solution",
    slug: "ai-receptionist-for-plumbers",
    path: "/solutions/ai-receptionist-for-plumbers/",
    title: "24/7 Plumbing Answering Service with AI | LobbyStack",
    description:
      "LobbyStack is an AI plumbing answering service. It tells callers how to shut off the water, quotes your drain and dispatch fees, and routes burst pipes to your on-call plumber.",
    eyebrow: "Plumbers",
    h1: "Plumbing answering service that handles the midnight burst pipe",
    intro:
      "A caller with water coming through the ceiling needs two things: someone to tell them where the main shutoff is, and a plumber on the way. LobbyStack does both on the first ring, then books the drain and water heater jobs into your calendar.",
    image: "/illustrations/missed-calls-v3.webp",
    imageAlt:
      "Diagram of a missed plumbing call routed through LobbyStack to a booked appointment",
    proofPoints: [
      "Reads your shutoff and safety instructions to callers with an active leak",
      "Quotes the prices you set for drain cleaning, dispatch, and after-hours visits",
      "Transfers burst pipes and sewage backups to your on-call plumber",
    ],
    sections: [
      {
        title: "Give panicked callers something to do while help is coming",
        body: "You load your own instructions into LobbyStack: where to find the main shutoff, when to turn off the water heater, and what to do if they smell gas. The assistant reads those steps to the caller, collects the address, and transfers the call to your on-call number.",
        points: [
          "Reads the safety steps you approve",
          "Saves the address and problem in the call's transcript, then transfers the call",
        ],
      },
      {
        title: "Answer the price question before the caller hangs up",
        body: "Plenty of callers want a number before they book. Give LobbyStack yours, such as a starting price for drain cleaning or a flat after-hours dispatch fee, and it quotes them. For repipes, sewer lines, and water heater replacements, it books an estimate visit instead of guessing.",
        points: [
          "Quotes exact prices, starting prices, or ranges you set",
          "Books estimate visits for large jobs",
        ],
      },
      {
        title: "Separate the sewage backup from the dripping faucet",
        body: "You decide which problems count as urgent: active leaks, sewage, no water at all. LobbyStack asks the follow-up questions a dispatcher would ask. Is water still running? Is it clean or sewage? Which floor? Urgent calls ring your on-call phone, and the faucet gets Tuesday's first open slot.",
        points: [
          "Asks whether water is still running and whether it is clean or sewage",
          "Routes urgent calls to your on-call phone",
          "Books routine repairs into your next open slot",
        ],
      },
      {
        title: "What after-hours coverage costs",
        body: "At 3 minutes per call, the Free plan's 30 voice minutes cover about 10 calls, enough to test LobbyStack on your after-hours line. Starter covers about 50 calls for $30 a month. Past that, Starter charges $0.20 per extra minute, so one more 3-minute call costs $0.60.",
        points: [
          "Spam calls and calls under 10 seconds don't count toward usage",
          "Switch plans as your call volume changes",
        ],
      },
    ],
    faqs: plumberFaqs,
    faqHeading: "Questions about AI receptionists for plumbers",
    relatedLinks: [
      {
        label: "After-hours answering for contractors",
        href: "/solutions/after-hours-answering-service-for-contractors/",
      },
      {
        label: "Missed-call revenue calculator",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Cover tonight's on-call shift",
    ctaBody:
      "Start on the Free plan, load your shutoff instructions, and forward your after-hours line when you're ready.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-hvac",
    path: "/solutions/ai-receptionist-for-hvac/",
    title: "HVAC AI Receptionist & 24/7 Answering Service | LobbyStack",
    description:
      "An HVAC AI receptionist from $30 a month, with no setup fee. LobbyStack transfers no-heat emergencies to your on-call tech and books tune-ups during the call.",
    eyebrow: "HVAC",
    h1: "HVAC AI receptionist and 24/7 answering service",
    intro:
      "An HVAC AI receptionist answers the calls your office misses. LobbyStack transfers no-heat and no-AC emergencies to your on-call tech under rules you write, and books tune-ups and estimate visits into Google Calendar during the call. Starter costs $30 a month for 150 voice minutes. No plan has a setup fee.",
    image: "/illustrations/human-handoff.webp",
    imageAlt:
      "An urgent no-heat call routed to an HVAC company's on-call technician",
    proofPoints: [
      "Answers the calls your carrier forwards: busy, unanswered, after hours, or all of them",
      "Transfers no-heat, no-AC, and gas-smell calls to your on-call tech under your rules",
      "Answers callers in their own language, with 70+ languages on GPT-Live",
    ],
    sections: [
      {
        title: "What does an HVAC AI receptionist do during a heat wave?",
        body: "Your phones go quiet in April, then ring nonstop the first hot week of June, when every AC in town fails at once. Tell your carrier to forward calls when your line is busy or nobody picks up, or forward all of them. LobbyStack answers whatever reaches its number. Plans set no limit on how many calls it answers at once, and those calls share one pool of minutes. It asks each caller for the system type, symptoms, and address, then books the next open slot or takes a message for your office.",
        points: [
          "Answers the calls your forwarding rule sends: busy, unanswered, or all",
          "Plans set no limit on how many calls it answers at once",
          "Books the next open slot or leaves your office a message with the caller's details",
        ],
      },
      {
        title:
          "How does it tell a no-heat emergency from a thermostat question?",
        body: "You write the urgency rules in plain language, based on symptoms, indoor temperature, and who lives in the home. A caller with a dead furnace in January and an infant in the house gets your on-call tech. A caller whose thermostat is set to cool gets a quick answer from troubleshooting steps you approve, like checking the breaker or the filter. For a gas smell or a CO alarm, you write the safety steps, such as leaving the house and calling the gas utility's emergency line or 911. The receptionist reads them to the caller before it transfers. Transfers go to one number. If you haven't set a transfer number, the receptionist takes a message. If the transfer can't go through, it tells the caller and offers to take a message, and your team can get a \"Live call transfer failed\" alert. Once your tech's phone starts ringing, the receptionist leaves the call. If your tech doesn't pick up, the caller reaches that phone's voicemail, if it has one.",
        points: [
          "Escalates on symptoms, indoor temperature, and who lives in the home",
          "Treats gas smells and CO alarms as urgent and transfers right away",
          "Offers to take a message if the transfer can't go through",
        ],
      },
      {
        title: "Can it book replacement estimates before the lead goes cold?",
        body: "Yes. A homeowner pricing a new system will wait a day for your callback. Two weeks into peak season, your callbacks run later than that, and they sign with someone else. LobbyStack asks for the home size, system age, and fuel type, then books the estimate visit from your opening hours while the caller is on the phone. Connect Google Calendar and it skips your busy times and adds the visit as an event. If the caller agrees, LobbyStack texts a confirmation and a reminder 24 hours before the visit, to US and Canadian numbers only. If you'd rather approve each visit, switch to request mode: the receptionist takes the caller's preferred time, and your team confirms it.",
        points: [
          "Collects home size, system age, and fuel type",
          "Books estimate visits into Google Calendar while the caller is on the line",
          "Texts a confirmation and a 24-hour reminder when the caller agrees",
        ],
      },
      {
        title: "How much does an HVAC AI receptionist cost?",
        body: "Prices as of October 2026: Starter costs $30 a month for 150 voice minutes, and Pro costs $100 a month for 500. If your average call runs 3 minutes (our assumption), Starter covers about 50 calls and Pro about 165. Now take a busy July with 300 calls, also our assumption. That's 900 minutes. Pro costs $100 plus 400 extra minutes at $0.18, or $172. Starter costs $30 plus 750 extra minutes at $0.20, or $180. The two plans cost the same at 500 minutes, and Pro costs less above that. LobbyStack counts usage by the second, so a 90-second call uses 1.5 minutes. Billed annually, Starter costs $288 a year ($24 a month) and Pro $960 ($80 a month).",
        points: [
          "No setup fee on any plan",
          "Calls under 10 seconds and calls the receptionist ends as spam don't count toward your minutes",
          "Owners and admins can set a monthly overage cap under Settings > Plan. There's none by default, and new calls get a busy signal once you reach it",
        ],
      },
      {
        title: "Can it answer callers who speak Spanish or another language?",
        body: "Yes. Each call opens in your default language, English or French. If the caller asks to switch or speaks another language, the receptionist answers in that language. It runs on OpenAI GPT-Live, which handles 70+ languages, including Spanish and Serbian. LobbyStack sends confirmation and reminder texts in your default language. If you save a contact's language as Spanish or Serbian through the API, that contact gets them in that language. The pricing page lists no language add-on.",
        points: [
          "Opens in English or French, then follows the caller's language",
          "70+ languages on GPT-Live, including Spanish",
          "Your urgency rules and booking settings stay the same in every language",
        ],
      },
      {
        title: "Does it work with ServiceTitan, Housecall Pro, or Jobber?",
        body: "Not directly. LobbyStack has no integration with ServiceTitan, Housecall Pro, or Jobber, and Google Calendar is the only calendar it connects to. It sends signed webhooks for six events: call completed, appointment booked, appointment rescheduled, appointment cancelled, message taken, and contact created. It also has a REST API with scoped keys, and Zapier connects through the webhooks and the API. An MCP server lets Claude or ChatGPT read your calls and book appointments. If you already run your shop in Jobber or Housecall Pro, their built-in receptionists book jobs into that software. LobbyStack can't. Jobber Receptionist costs $29 a month for 30 conversations ($0.79 each after) on top of a Jobber plan. Housecall Pro sells CSR AI as a paid add-on with no published price. We checked both on October 9, 2026.",
        points: [
          "Books into Google Calendar",
          "Sends call and booking data out through webhooks and the REST API",
          "Connects Zapier through webhooks and the API",
        ],
      },
    ],
    faqs: hvacFaqs,
    faqHeading: "Questions about HVAC AI receptionists",
    relatedLinks: [
      {
        label: "Compare HVAC answering services",
        href: "/blog/best-hvac-answering-services/",
      },
      {
        label: "After-hours answering for contractors",
        href: "/solutions/after-hours-answering-service-for-contractors/",
      },
      {
        label: "Missed-call revenue calculator",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Pricing", href: "/pricing/" },
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
    ],
    ctaHeading: "Be ready for the first cold snap",
    ctaBody:
      "Start on the Free plan, write your no-heat rules, and forward your overflow line when you're ready.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-electricians",
    path: "/solutions/ai-receptionist-for-electricians/",
    title: "Electrician Answering Service with AI | LobbyStack",
    description:
      "LobbyStack is an AI answering service for electricians. It reads your safety instructions for sparks and burning smells and books panel upgrade, EV charger, and generator estimates.",
    eyebrow: "Electricians",
    h1: "Electrician answering service that screens hazards and books estimates",
    intro:
      "Your calls come in two kinds. One caller has a sparking outlet and needs safety instructions right now. The next wants a panel upgrade, an EV charger, or a standby generator and needs an estimate visit. LobbyStack handles both while you're on a job.",
    image: "/illustrations/call-routing-team.webp",
    imageAlt:
      "An incoming electrical call next to three team members",
    proofPoints: [
      "Reads your safety script for sparks, smoke, and burning smells",
      "Books estimate visits for panel upgrades, EV chargers, and generators",
      "Transfers hazard calls to your on-call electrician",
    ],
    sections: [
      {
        title: "Put your safety instructions first",
        body: "When someone reports smoke or a burning smell, LobbyStack reads the instructions you wrote: shut off the breaker if it's safe to reach, leave the house, call 911 if there's fire. Then it asks for the address and what the caller saw, and transfers the call to your on-call electrician.",
        points: [
          "Uses your wording for hazard calls",
          "Transfers hazards to your on-call electrician",
          "Logs each hazard call in the dashboard for follow-up",
        ],
      },
      {
        title: "Check for a utility outage before you roll a truck",
        body: "A caller with no power might have a tripped main, or they might be one of 400 homes on a downed line. LobbyStack can ask whether the neighbors have power and whether the utility has posted an outage. Grid problems get pointed to the utility. House problems get a booking.",
        points: [
          "Asks whether neighbors have power",
          "Books a service visit for problems on the house side",
        ],
      },
      {
        title: "Turn EV charger and panel calls into scheduled estimates",
        body: "Panel upgrades, EV chargers, and standby generators are your larger tickets, and callers shop around. LobbyStack collects the panel amperage, the home's age, the charger or generator they want, and whether they own the home. It books the estimate visit before the caller dials the next electrician.",
        points: [
          "Collects panel size, home age, and equipment details",
          "Books estimate visits during the call",
        ],
      },
      {
        title: "What estimate-heavy call volume costs",
        body: "Estimate calls run longer because of the extra questions. At 5 minutes per call, Pro's 500 voice minutes cover about 100 calls for $100 a month, and Starter's 150 minutes cover about 30 calls for $30. Use the Free plan's 30 minutes to test your hazard script before you forward live calls.",
        points: [
          "Pro charges $0.18 per extra minute",
          "Spam calls and calls under 10 seconds don't count toward usage",
        ],
      },
    ],
    faqs: electricianFaqs,
    faqHeading: "Questions about AI receptionists for electricians",
    relatedLinks: [
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Missed-call revenue calculator",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Book more panel and EV charger estimates",
    ctaBody:
      "Write your hazard script, set your estimate questions, and forward your line when you're ready.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-garage-door-repair",
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "AI Receptionist for Garage Door Repair | LobbyStack",
    description:
      "LobbyStack answers garage-door calls, gathers equipment details, books repairs, and routes urgent stuck-door or broken-spring requests to your technician.",
    eyebrow: "Garage door repair",
    h1: "AI receptionist for garage door repair that captures every call",
    intro:
      "LobbyStack answers garage door calls while you are replacing springs, installing openers, or off the clock. It collects issue details, books appointments, and transfers emergencies to your on-call number.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "LobbyStack answering a garage door repair call and booking a visit",
    proofPoints: [
      "Answers emergency and routine garage door calls 24/7",
      "Collects door type, opener brand, and issue symptoms",
      "Routes stuck-door and broken-spring emergencies to your on-call tech",
    ],
    sections: [
      {
        title: "Never miss a stuck-door emergency",
        body: "When a homeowner calls because their car is trapped inside or the door is stuck open at night, they need help now. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call tech.",
        points: [
          "Identifies emergency calls versus routine service requests",
          "Asks about door type and safety, then transfers urgent calls",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job",
        body: "You cannot answer the phone while you are under a torsion spring or installing an opener. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books repair and installation appointments directly",
          "Texts the caller a confirmation and adds the visit to your calendar",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Garage door calls need context: door type, opener brand, spring type, and issue description. LobbyStack asks the questions you choose so your team arrives with the right parts.",
        points: [
          "Asks your custom intake questions on every call",
          "Saves the answers in the call's transcript",
          "Saves the transcript and recording in your dashboard",
        ],
      },
    ],
    faqs: garageDoorFaqs,
    faqHeading: "Questions about AI receptionists for garage door repair",
    relatedLinks: [
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing garage door repair calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine garage door calls, books appointments, and transfers stuck-door emergencies to your on-call tech.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-appliance-repair",
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "AI Receptionist for Appliance Repair | LobbyStack",
    description:
      "LobbyStack answers appliance-repair calls, collects appliance, brand, model, and symptom details, then books an appropriate service visit.",
    eyebrow: "Appliance repair",
    h1: "AI receptionist for appliance repair that captures every call",
    intro:
      "LobbyStack answers appliance repair calls while you are diagnosing a dishwasher or replacing a compressor. It collects brand and model details, books appointments, and transfers emergencies to your on-call number.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "LobbyStack answering an appliance repair call and booking a visit",
    proofPoints: [
      "Answers emergency and routine appliance calls 24/7",
      "Collects appliance type, brand, model number, and symptoms",
      "Routes refrigerator failures and flooding emergencies to your on-call tech",
    ],
    sections: [
      {
        title: "Never miss an urgent appliance failure",
        body: "When a homeowner calls because their refrigerator stopped working or their washing machine is flooding, they will not wait for voicemail. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call tech.",
        points: [
          "Identifies emergency calls versus routine service requests",
          "Asks for the brand and model, then transfers urgent calls",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a repair",
        body: "You cannot answer the phone while you are replacing a compressor or diagnosing a control board. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books repair and maintenance appointments directly",
          "Texts the caller a confirmation and adds the visit to your calendar",
        ],
      },
      {
        title: "Collect brand and model details before dispatching",
        body: "Appliance repair calls need specific information: appliance type, brand, model number, purchase age, and issue description. LobbyStack asks the questions you choose so your team arrives with the right parts.",
        points: [
          "Asks your custom intake questions on every call",
          "Saves the answers in the call's transcript",
          "Saves the transcript and recording in your dashboard",
        ],
      },
    ],
    faqs: applianceRepairFaqs,
    faqHeading: "Questions about AI receptionists for appliance repair",
    relatedLinks: [
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing appliance repair calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine appliance calls, books appointments, and transfers urgent failures to your on-call tech.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-restoration-companies",
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "AI Receptionist for Restoration Companies | LobbyStack",
    description:
      "LobbyStack qualifies water, fire, and mold damage calls, books restoration estimates, and routes urgent mitigation requests to your on-call team.",
    eyebrow: "Restoration",
    h1: "AI receptionist for restoration companies that captures every emergency",
    intro:
      "LobbyStack answers restoration calls while your crew is on site or off the clock. It collects damage details, books estimates, and transfers emergencies to your on-call number.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack answering a restoration emergency call and routing it",
    proofPoints: [
      "Answers emergency water and fire damage calls 24/7",
      "Collects damage type, affected area, water source, and insurance status",
      "Routes urgent mitigation requests to your on-call team",
    ],
    sections: [
      {
        title: "Never miss a water or fire damage emergency",
        body: "When a property owner calls at 3 AM about flooding or smoke damage, they need mitigation now. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call team.",
        points: [
          "Identifies emergency mitigation calls versus routine estimate requests",
          "Asks about damage type, area, and source, then transfers urgent calls",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book estimate visits while your crew is on site",
        body: "You cannot answer the phone while you are extracting water or boarding up a property. LobbyStack checks your calendar, offers open slots, and books the estimate before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books estimate and consultation appointments directly",
          "Texts the caller a confirmation and adds the visit to your calendar",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Restoration calls need context: damage type, affected area size, water source, timeline, and insurance status. LobbyStack asks the questions you choose so your team arrives prepared with the right equipment.",
        points: [
          "Asks your custom intake questions on every call",
          "Saves the answers in the call's transcript",
          "Saves the transcript and recording in your dashboard",
        ],
      },
    ],
    faqs: restorationFaqs,
    faqHeading: "Questions about AI receptionists for restoration companies",
    relatedLinks: [
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing restoration emergency calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine restoration calls, books estimates, and transfers urgent mitigation requests to your on-call team.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-locksmiths",
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "AI Receptionist for Locksmiths | LobbyStack",
    description:
      "An AI receptionist for locksmiths that answers emergency lockout calls, books service appointments, and routes urgent calls to your on-call technician.",
    eyebrow: "Locksmiths",
    h1: "AI receptionist for locksmiths that captures every emergency call",
    intro:
      "LobbyStack answers locksmith calls while you are on a rekey job, installing hardware, or off the clock. It collects lockout details, books appointments, and transfers emergencies to your on-call number.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "LobbyStack answering a locksmith call and booking a service visit",
    proofPoints: [
      "Answers emergency lockout and routine calls 24/7",
      "Collects lockout type, location, and vehicle or property details",
      "Routes urgent lockout calls to your on-call technician",
    ],
    sections: [
      {
        title: "Never miss an emergency lockout call",
        body: "When someone is locked out of their home or car, they need help now. They will not leave a voicemail and wait. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call locksmith.",
        points: [
          "Identifies emergency lockout calls versus routine service requests",
          "Asks for the location and lockout type, then transfers urgent calls",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job",
        body: "You cannot answer the phone while you are rekeying locks or installing hardware. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books rekey, installation, and service appointments directly",
          "Texts the caller a confirmation and adds the visit to your calendar",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Locksmith calls need context: lockout type, location, vehicle or property type, key situation, and urgency. LobbyStack asks the questions you choose so your team arrives prepared.",
        points: [
          "Asks your custom intake questions on every call",
          "Saves the answers in the call's transcript",
          "Saves the transcript and recording in your dashboard",
        ],
      },
    ],
    faqs: locksmithFaqs,
    faqHeading: "Questions about AI receptionists for locksmiths",
    relatedLinks: [
      {
        label: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing lockout calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine locksmith calls, books appointments, and transfers urgent lockouts to your on-call locksmith.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  // ── Contractor after-hours page ─────────────────────────────────

  {
    group: "solution",
    slug: "after-hours-answering-service-for-contractors",
    path: "/solutions/after-hours-answering-service-for-contractors/",
    title: "Contractor Answering Service for After-Hours Calls | LobbyStack",
    description:
      "LobbyStack is an after-hours contractor answering service. It screens emergencies, books next-day visits, and transfers urgent jobs to your on-call number.",
    eyebrow: "Contractor after-hours",
    h1: "Contractor answering service for after-hours emergency jobs",
    intro:
      "LobbyStack answers contractor calls at night, on weekends, and during holidays. It screens for emergencies, books next-day appointments, and transfers urgent requests to your on-call number.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack handling after-hours contractor calls and routing emergencies",
    proofPoints: [
      "Answers after-hours calls and screens for emergencies",
      "Books next-day appointments directly into your calendar",
      "Transfers urgent calls to your on-call number",
    ],
    sections: [
      {
        title: "Stop losing emergency jobs to voicemail",
        body: "When a homeowner calls at 10 PM with an urgent problem, they will not leave a message. They call the next contractor on the list. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call person.",
        points: [
          "Differentiates emergency calls from routine quote requests",
          "Collects the issue, location, and contact details, then transfers urgent calls",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book next-day appointments automatically",
        body: "After-hours callers often want to schedule service for the next business day. LobbyStack checks your calendar, offers available slots, and books the appointment. Your team starts the day with scheduled work already on the calendar.",
        points: [
          "Checks real-time calendar availability for next-day slots",
          "Books appointments directly into your calendar",
          "Texts the caller a confirmation and adds the visit to your calendar",
        ],
      },
      {
        title: "Filter out spam so you only wake up for real calls",
        body: "Not every after-hours call is worth interrupting your evening. LobbyStack screens out robocalls, telemarketers, and spam. Only genuine emergencies reach your on-call staff.",
        points: [
          "Automatically filters non-human callers",
          "Saves a summary of each call for morning review",
          "Protects your personal time while covering the phone line",
        ],
      },
      {
        title: "Follow your real on-call process",
        body: "Every contractor defines urgent differently. LobbyStack asks the qualifying questions you choose: active water damage, safety hazard, heating failure, structural risk. It only rings your on-call number when the call matches your rules.",
        points: [
          "Uses your custom escalation rules on every call",
          "Collects symptoms, location, and timing before transferring",
          "Keeps routine calls in the morning queue",
        ],
      },
    ],
    faqs: contractorAfterHoursFaqs,
    faqHeading: "Questions about after-hours answering for contractors",
    relatedLinks: [
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Plumbers", href: "/solutions/ai-receptionist-for-plumbers/" },
      { label: "HVAC", href: "/solutions/ai-receptionist-for-hvac/" },
      {
        label: "Compare HVAC answering services",
        href: "/blog/best-hvac-answering-services/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing after-hours contractor calls to voicemail",
    ctaBody:
      "LobbyStack answers after-hours calls, screens for emergencies, books next-day appointments, and transfers urgent jobs to your on-call number.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  // ── Open-source AI receptionist page ────────────────────────────

  {
    group: "solution",
    slug: "property-management-answering-service",
    path: "/solutions/property-management-answering-service/",
    title: "Property Management Answering Service with AI | LobbyStack",
    description:
      "LobbyStack is an AI answering service for property managers. It sorts after-hours maintenance emergencies, answers leasing questions, and books showings.",
    eyebrow: "Property management",
    h1: "Property management answering service for after-hours maintenance calls",
    intro:
      "Tenants call at 2 a.m. about a leak, a lockout, or no heat. Prospects call at lunch asking about pets and parking. LobbyStack answers both, sends real emergencies to your on-call maintenance tech, and books showings for your leasing team.",
    image: "/illustrations/business-knowledge.webp",
    imageAlt:
      "LobbyStack knowledge sources including FAQs, policies, and business hours, ready to answer tenant calls",
    proofPoints: [
      "Sorts maintenance emergencies from requests that can wait until morning",
      "Answers leasing questions from the policies you enter",
      "Transfers leaks, floods, and gas smells to your on-call maintenance tech",
    ],
    sections: [
      {
        title: "Triage maintenance calls with your emergency list",
        body: "You probably keep a written list already: flooding, no heat in winter, a gas smell, a lockout, a sewer backup. Load it into LobbyStack. It asks the tenant for the unit number and what they see, transfers emergencies to your on-call tech, and logs the dripping faucet for the morning.",
        points: [
          "Collects the unit number, callback number, and a description of the problem",
          "Transfers emergencies to your on-call maintenance tech",
          "Logs routine requests for your morning queue",
        ],
      },
      {
        title: "Answer leasing questions and book showings",
        body: "Prospects ask about rent, deposits, pet policy, parking, and which units are open. Add those details to LobbyStack's knowledge base and it answers from them. When a prospect wants to see a unit, it books the showing into your leasing agent's calendar and texts the confirmation.",
        points: [
          "Answers from the property details you enter",
          "Books showings and sends confirmation texts",
        ],
      },
      {
        title: "Keep routine questions off your on-call phone",
        body: "A tenant asking when rent is due at 11 p.m. shouldn't wake your maintenance tech. LobbyStack answers rent, office-hours, and portal questions from your policies and saves a summary of the call, so your on-call phone rings for the emergencies on your list.",
        points: [
          "Answers rent, office-hours, and portal questions",
          "Saves a summary and transcript of each call in the dashboard",
        ],
      },
      {
        title: "What after-hours coverage costs",
        body: "Say your properties generate 60 after-hours calls a month at 3 minutes each. That's 180 minutes. Starter includes 150 minutes for $30 a month, and the other 30 minutes cost $0.20 each, so you pay about $36. Pro includes 500 minutes for $100 if your portfolio grows.",
        points: [
          "Spam calls and calls under 10 seconds don't count toward usage",
          "The Free plan includes 30 voice minutes for testing",
        ],
      },
    ],
    faqs: propertyManagementFaqs,
    faqHeading: "Questions about property management answering services",
    relatedLinks: [
      {
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "AI appointment scheduler",
        href: "/solutions/ai-appointment-scheduler/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Answer tenants after hours",
    ctaBody:
      "Load your emergency list, forward your after-hours line, and test LobbyStack on the Free plan.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "roofing-answering-service",
    path: "/solutions/roofing-answering-service/",
    title: "Roofing Answering Service with AI | LobbyStack",
    description:
      "LobbyStack is an AI answering service for roofers. It handles storm-surge calls, sends active leaks to your on-call crew, and books inspections and estimates.",
    eyebrow: "Roofing",
    h1: "Roofing answering service that keeps up after a storm",
    intro:
      "After a hailstorm, homeowners call all day wanting an inspection before the adjuster shows up. LobbyStack answers those calls at the same time, books inspections into your calendar, and sends active leaks to your crew.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "Call routing that rings your team first and hands the call to LobbyStack when nobody is available",
    proofPoints: [
      "Plans set no limit on how many storm calls it answers at once",
      "Books inspections and estimates into your calendar",
      "Transfers active leaks to your on-call crew",
    ],
    sections: [
      {
        title: "Handle the week after a storm",
        body: "Hail and wind can bring a month of calls in two days. Plans set no limit on how many calls LobbyStack answers at once, and new calls get a busy signal only if you set a monthly overage cap and reach it. It collects the address, the roof's age, and the damage the homeowner sees, and books the first open inspection slot. Your office starts the day with a list of booked inspections.",
        points: [
          "Answers simultaneous calls",
          "Collects the address, roof age, and visible damage",
          "Books inspections into open slots",
        ],
      },
      {
        title: "Send active leaks to your crew",
        body: "Water coming through a ceiling needs a tarp tonight. You define what counts as urgent, and LobbyStack asks for the address and what the homeowner sees, then transfers those calls to your on-call crew. A few missing shingles with no leak get an inspection booking.",
        points: [
          "Asks for the address, then transfers active leaks to your crew",
          "Books non-urgent damage for inspection",
        ],
      },
      {
        title: "Answer insurance claim questions from your script",
        body: "Homeowners ask whether you work with their insurer, whether you'll meet the adjuster, and what an inspection costs. Write your answers once. LobbyStack gives them on the call and flags anything outside your script for your office to call back.",
        points: [
          "Answers the insurance and inspection questions you approve",
          "Flags unusual questions for a callback",
        ],
      },
      {
        title: "What storm season costs",
        body: "Say a roofing call with intake questions runs 4 minutes. After a big storm, 200 calls in a month adds up to 800 minutes. Pro includes 500 minutes for $100, and the other 300 cost $0.18 each, so that month comes to $154. A quiet month stays at $100.",
        points: [
          "Spam calls and calls under 10 seconds don't count toward usage",
          "The Free plan includes 30 voice minutes for testing",
        ],
      },
    ],
    faqs: roofingFaqs,
    faqHeading: "Questions about roofing answering services",
    relatedLinks: [
      {
        label: "Contractor answering service",
        href: "/solutions/after-hours-answering-service-for-contractors/",
      },
      {
        label: "Missed-call revenue calculator",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Be ready for the next storm",
    ctaBody:
      "Set up LobbyStack before storm season so it takes the overflow when your lines fill up.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "open-source-ai-receptionist",
    path: "/solutions/open-source-ai-receptionist/",
    title: "Open-Source AI Receptionist | LobbyStack",
    description:
      "LobbyStack is an open-source AI receptionist you can audit, customize, and self-host. Inspect call handling, modify prompts, and run it on your infrastructure.",
    eyebrow: "Open source",
    h1: "Open-source AI receptionist you can audit, customize, and self-host",
    intro:
      "LobbyStack is open source so your team can inspect how calls are handled, modify prompts and routing, and deploy on infrastructure you control. No black-box call logic. No vendor lock-in.",
    image: "/illustrations/trust-controls.webp",
    imageAlt:
      "LobbyStack open-source AI receptionist code and deployment controls",
    proofPoints: [
      "Source code publicly available for audit and modification",
      "Customize prompts, intake rules, and escalation",
      "Self-host on your servers or use the managed cloud",
    ],
    sections: [
      {
        title: "Audit the call handling logic yourself",
        body: "Closed-source AI receptionist platforms keep their routing decisions, prompt structure, and data pipelines private. You cannot verify how calls are handled or what data is retained. LobbyStack publishes the source code so you can inspect every decision point before trusting it with your callers.",
        points: [
          "Review how intake questions, routing, and escalation work",
          "Verify data handling, retention, and privacy controls",
          "Understand exactly what happens on each call type",
        ],
      },
      {
        title:
          "Modify prompts and rules without a vendor roadmap",
        body: "When your call workflow changes, you should not have to file a support ticket and wait. Because the code is open source, you can modify greeting scripts, intake questions, booking logic, and escalation paths yourself.",
        points: [
          "Change prompts and call flows on your schedule",
          "Fork the codebase for agency or multi-tenant deployments",
        ],
      },
      {
        title: "Deploy on infrastructure you control",
        body: "Self-hosting places application storage, access, logs, and retention under your control. Configured telephony and AI providers may still process call data under their own terms.",
        points: [
          "Run in containers on your preferred cloud or private environment",
          "Configure the telephony and AI providers supported by the repository",
          "Own update timing, access policies, logs, and retention windows",
        ],
      },
      {
        title: "Use the managed cloud or self-host on your terms",
        body: "Open source does not mean you have to manage infrastructure yourself. LobbyStack offers a managed cloud with included voice minutes and support. When you need more control, the same open-source codebase is ready for self-hosted deployment.",
        points: [
          "Start on the managed cloud and self-host when requirements change",
          "Migrate between cloud and self-hosted without losing your configuration",
          "Use both: cloud for standard lines, self-hosted for regulated workflows",
        ],
      },
    ],
    faqs: openSourceReceptionistFaqs,
    faqHeading: "Questions about open-source AI receptionists",
    relatedLinks: [
      {
        label: "Self-hosted deployment",
        href: "/solutions/self-hosted-ai-receptionist/",
      },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      { label: "API docs", href: "/docs/api/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading:
      "Inspect, customize, and deploy an AI receptionist you can verify",
    ctaBody:
      "LobbyStack is open source so you can audit the call logic, modify the workflow, and deploy on your own infrastructure. No black box. No vendor lock-in.",
    ctaPrimaryLabel: "View on GitHub",
    ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
    ctaSecondaryLabel: "Read deployment docs",
    ctaSecondaryHref: "/docs/api/",
  },
]

export const seoLandingPages = [...companyPages, ...solutionPages]

export const seoLandingPageByPath = (path: string) => {
  const normalized = path.endsWith("/") ? path : `${path}/`
  return seoLandingPages.find((page) => page.path === normalized)
}

export const landingPageMarkdown = (page: SeoLandingPage) => `---
title: ${page.title}
description: ${page.description}
url: ${absoluteUrl(page.path)}
---

# ${page.h1}

${page.intro}

## Highlights

${page.proofPoints.map((point) => `- ${point}`).join("\n")}

${page.sections
  .map(
    (section) => `## ${section.title}

${section.body}

${section.points.map((point) => `- ${point}`).join("\n")}`
  )
  .join("\n\n")}

## Related Resources

${page.relatedLinks
  .map((link) => `- [${link.label}](${absoluteUrl(link.href)})`)
  .join("\n")}
`
