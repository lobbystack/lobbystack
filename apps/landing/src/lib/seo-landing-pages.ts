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
      "Learn about LobbyStack, the open-source AI receptionist for small businesses that need call answering, appointment booking, routing, SMS, and follow-up.",
    eyebrow: "About",
    h1: "About LobbyStack",
    intro:
      "LobbyStack exists to help small businesses answer calls, book appointments, and follow up without giving up control of their phone workflow or customer data.",
    image: "/illustrations/value-network.webp",
    imageAlt:
      "LobbyStack open-source AI receptionist connecting callers, teams, and business workflows",
    proofPoints: [
      "Open-source AI receptionist for small businesses",
      "Built around call answering, booking, routing, SMS, and summaries",
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
          "Review the AGPL-3.0-only codebase, deployment model, and data boundaries on GitHub",
          "Start on LobbyStack Cloud and move to self-hosting when your team needs more control",
          "Avoid vendor lock-in for the receptionist layer that sits in front of every caller",
        ],
      },
      {
        title: "Who LobbyStack is for",
        body: "LobbyStack is built for owner-operators and small teams that live on inbound calls: home services, trades, clinics, salons, and local service businesses that cannot afford to miss ready-to-book callers.",
        points: [
          "Teams that miss calls while they are on jobs, in appointments, or closed for the day",
          "Operators who want booking and follow-up without a phone tree or IVR builder",
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
    title: "AI After-Hours Answering Service | LobbyStack",
    description:
      "LobbyStack is an AI after-hours answering service that books appointments, captures caller details, and routes urgent requests when your team is unavailable.",
    eyebrow: "After-hours answering",
    h1: "AI after-hours answering service for calls your team misses",
    intro:
      "LobbyStack gives callers a real answer at night, on weekends, during holidays, and any time your team is away from the phone.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack handling after-hours calls and routing urgent requests",
    proofPoints: [
      "Answers nights, weekends, holidays, and overflow periods",
      "Books appointments and captures caller details before morning",
      "Routes urgent calls to the right on-call person with context",
    ],
    sections: [
      {
        title: "Never miss a late-night emergency call again",
        body: "When a homeowner calls at 2 AM with a burst pipe or broken heater, they won't leave a message. They call the next company. LobbyStack answers on the first ring, screens for true emergencies, and dispatches your on-call technician.",
        points: [
          "Differentiates routine calls from true emergency leads",
          "Instantly notifies your on-call staff with complete context",
          "Ensures callers speak to an assistant instead of a dead-end voicemail",
        ],
      },
      {
        title: "Reclaim your evenings and weekends",
        body: "Stop living in fear of missing the next big job. LobbyStack filters out non-emergency quote requests and books standard consultations directly into your connected calendar while you sleep or enjoy dinner.",
        points: [
          "Collects caller name, service needs, and preferred scheduling window",
          "Schedules standard appointments into your calendar automatically",
          "Lets you unplug completely knowing every caller gets handled",
        ],
      },
      {
        title: "A reliable first line of defense",
        body: "Stop waking up to robocalls, sales pitches, and solicitor spam. LobbyStack screens out non-human callers and gathers rich details for real prospects, sending a neat summary to your dashboard for morning review.",
        points: [
          "Automatically filters telemarketers, spam, and robotic prompts",
          "Generates high-accuracy text transcripts and audio recordings",
          "Starts your workday with organized leads instead of chaotic voicemails",
        ],
      },
      {
        title: "Use rules that match your real on-call process",
        body: "Every business defines urgent differently. LobbyStack follows your escalation policy, asks the qualifying questions you choose, and only interrupts the right person when the call matches your rules.",
        points: [
          "Collects symptoms, location, contact details, and timing before escalation",
          "Transfers emergency calls with context instead of a cold handoff",
          "Keeps routine calls in the morning review queue",
        ],
      },
      {
        title: "Capture the calls that arrive outside buying hours",
        body: "Some of your best leads call after dinner, before work, or during weekend emergencies. LobbyStack gives them a useful response while competitors are still sending callers to voicemail.",
        points: [
          "Books standard consultations when your calendar has open windows",
          "Answers service-area and pricing questions from your knowledge base",
          "Sends summaries, recordings, transcripts, and next steps to your team",
        ],
      },
    ],
    faqs: afterHoursFaqs,
    faqHeading: "Questions about AI after-hours answering",
    relatedLinks: [
      { label: "AI phone answering", href: "/solutions/ai-phone-answering/" },
      { label: "Pricing", href: "/pricing/" },
      {
        label: "Missed-call calculator",
        href: "/missed-call-revenue-calculator/",
      },
    ],
    ctaHeading: "Stop losing overnight jobs to voicemail",
    ctaBody:
      "LobbyStack answers after-hours calls, books emergency appointments, and routes urgent requests so you wake up to scheduled work instead of missed opportunities.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-dental-offices",
    path: "/solutions/ai-receptionist-for-dental-offices/",
    title: "AI Receptionist for Dental Offices | LobbyStack",
    description:
      "LobbyStack is an AI receptionist for dental offices that answers patient calls, books appointments, handles recalls, and routes dental emergencies.",
    eyebrow: "Dental offices",
    h1: "AI receptionist for dental offices with busy front desks",
    intro:
      "LobbyStack helps dental teams answer new-patient calls, book appointments, handle routine questions, and route urgent issues without interrupting care.",
    image: "/illustrations/call-booking-summary.webp",
    imageAlt:
      "LobbyStack booking a patient appointment and summarizing the call",
    proofPoints: [
      "Books new-patient and routine appointments from phone calls",
      "Answers common questions about services, insurance, and policies",
      "Routes emergencies based on your practice rules",
    ],
    sections: [
      {
        title: "Focus entirely on the patient in the chair",
        body: "Your front-desk team shouldn't have to choose between greeting the patient in front of them and answering a ringing phone. LobbyStack picks up overflow calls seamlessly, keeping patient check-ins calm, focused, and deeply personal.",
        points: [
          "Eliminates phone interruption during in-office dental care",
          "Takes accurate messages and logs caller intent directly",
          "Provides a calm, distraction-free environment for clinical staff",
        ],
      },
      {
        title: "Schedule new patient visits around the clock",
        body: "Most prospective patients call when it's convenient for them, often during lunch hours or after work when your office is closed. LobbyStack qualifies their clinical needs, collects basic insurance info, and books their appointment instantly.",
        points: [
          "Answers new patient booking inquiries 24/7",
          "Syncs with your practice calendar to show real-time availability",
          "Sends instant text confirmations and intake instructions",
        ],
      },
      {
        title: "Alleviate desk anxiety and burnout",
        body: "Staff turnover in dental offices often stems from administrative overload. By letting LobbyStack filter out telemarketers, handle billing FAQs, and manage simple reschedules, your reception team gets the relief they need to do their best work.",
        points: [
          "Answers FAQs about office location, hours, parking, and forms",
          "Escalates complex clinical or insurance queries to human staff",
          "Maintains high-standard caller reception during peak morning rushes",
        ],
      },
      {
        title: "Route dental emergencies with the right context",
        body: "A patient calling about pain, swelling, trauma, or bleeding needs a different workflow than a routine cleaning request. LobbyStack follows your triage rules and sends the details your team needs before anyone picks up.",
        points: [
          "Asks approved intake questions for urgent dental situations",
          "Separates routine booking requests from emergency escalation",
          "Sends call summaries with patient contact details and stated symptoms",
        ],
      },
      {
        title: "Answer policy questions consistently",
        body: "Patients often call about forms, parking, insurance, office hours, appointment prep, and post-visit instructions. LobbyStack uses your practice knowledge base so callers get consistent answers without pulling staff away from care.",
        points: [
          "Keeps office policies, accepted plans, and intake instructions in one place",
          "Flags complex insurance or clinical questions for staff review",
          "Reduces repetitive calls that interrupt check-in and checkout",
        ],
      },
    ],
    faqs: dentalOfficesFaqs,
    faqHeading: "Questions about AI receptionists for dental offices",
    relatedLinks: [
      {
        label: "AI appointment scheduler",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Self-hosted AI receptionist",
        href: "/solutions/self-hosted-ai-receptionist/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Start booking patient calls that arrive during procedures",
    ctaBody:
      "LobbyStack answers new-patient inquiries, books appointments, and handles routine questions so your front desk can focus on the person in front of them.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-salons-and-spas",
    path: "/solutions/ai-receptionist-for-salons-and-spas/",
    title: "AI Receptionist for Salons and Spas | LobbyStack",
    description:
      "LobbyStack is an AI receptionist for salons and spas that answers booking calls, schedules appointments, handles reschedules, and answers service questions.",
    eyebrow: "Salons and spas",
    h1: "AI receptionist for salons and spas that keeps booking",
    intro:
      "LobbyStack answers calls for salons, spas, barbershops, and wellness studios so clients can book, reschedule, and get answers without waiting for the front desk.",
    image: "/illustrations/booking-flow.webp",
    imageAlt: "LobbyStack scheduling a salon or spa appointment from a call",
    proofPoints: [
      "Books appointments while stylists and providers are busy",
      "Answers questions about services, pricing, and availability",
      "Handles confirmations, reminders, cancellations, and reschedules",
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
        body: "Last-minute no-shows and cancellations eat directly into your salon margins. LobbyStack can communicate your booking guidelines, secure cards on file for deposits, and manage reschedules politely and consistently.",
        points: [
          "Communicates cancellation and reschedule policies during the call",
          "Saves deposits for high-value treatments on file securely",
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
          "Routes nuanced service questions to the right team member",
        ],
      },
      {
        title: "Keep revenue-sensitive policies consistent",
        body: "Deposits, cancellation windows, package rules, and same-day reschedules are easy to explain inconsistently when the desk is rushed. LobbyStack repeats the same approved policy every time.",
        points: [
          "Explains cancellation and no-show policies before confirming changes",
          "Uses your service menu, durations, provider rules, and booking limits",
          "Sends summaries so your team knows what was promised",
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
    title: "Self-Hosted AI Receptionist | LobbyStack",
    description:
      "LobbyStack is a self-hosted AI receptionist that teams can run for more control over call data, infrastructure, models, prompts, and integrations.",
    eyebrow: "Self-hosted",
    h1: "Self-hosted AI receptionist for infrastructure you control",
    intro:
      "LobbyStack is published under AGPL-3.0-only and includes a self-hosted path for teams that need to control deployment, provider accounts, access, and data retention.",
    image: "/illustrations/trust-controls.webp",
    imageAlt:
      "LobbyStack controls for a self-hosted AI receptionist deployment",
    proofPoints: [
      "Deploy on your own servers or cloud infrastructure",
      "Control call data, prompts, voice settings, and integrations",
      "Use the open-source codebase as the foundation for custom workflows",
    ],
    sections: [
      {
        title: "Control where application data is stored",
        body: "Self-hosting lets your team choose where recordings, transcripts, configurations, and customer details are stored. External telephony or model providers may still process data according to the accounts and services you configure.",
        points: [
          "Define access, retention, backup, and deletion policies in your environment",
          "Choose the infrastructure and provider accounts used by the deployment",
          "Review your own regulatory obligations before processing production calls",
        ],
      },
      {
        title: "Own your prompts, provider accounts, and call rules",
        body: "Configure the telephony and AI services supported by the repository, then adapt greeting scripts, intake questions, and routing rules in code or configuration.",
        points: [
          "Use supported telephony integrations with accounts you control",
          "Configure supported AI providers without surrendering deployment access",
          "Review and change greeting, intake, booking, and escalation behavior",
        ],
      },
      {
        title: "Understand the operating costs directly",
        body: "A self-hosted deployment replaces a managed software bill with infrastructure, carrier, model, monitoring, backup, and engineering costs that your team can measure and control.",
        points: [
          "Model carrier, model, storage, and infrastructure usage separately",
          "Account for engineering, security, updates, and incident response",
          "Compare total ownership cost with the managed cloud before choosing",
        ],
      },
      {
        title: "Adapt the call workflow to your product or client base",
        body: "Self-hosting gives technical teams room to change intake questions, routing rules, alerts, data retention, and downstream automations without waiting on a SaaS roadmap.",
        points: [
          "Customize prompts, tools, webhooks, and escalation logic",
          "Connect private CRMs, scheduling systems, and internal dashboards",
          "Use separate deployments for agencies, franchises, and regulated clients",
        ],
      },
      {
        title: "Keep operational control as call volume grows",
        body: "High-volume teams need predictable infrastructure, observability, and deployment control. LobbyStack gives engineers an open-source base they can monitor, scale, and secure like the rest of their stack.",
        points: [
          "Run in containers on your preferred cloud or private environment",
          "Review source code and deployment configuration before launch",
          "Own update timing, access policies, logs, and retention windows",
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
    ctaHeading: "Deploy LobbyStack on your own infrastructure",
    ctaBody:
      "Review the AGPL-3.0-only repository and deployment documentation, then evaluate the infrastructure, provider, security, and support responsibilities.",
    ctaPrimaryLabel: "Read deployment docs",
    ctaPrimaryHref: "/docs/api/",
    ctaSecondaryLabel: "View on GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  },

  // ── Trade-specific solution pages ──────────────────────────────

  {
    group: "solution",
    slug: "ai-receptionist-for-plumbers",
    path: "/solutions/ai-receptionist-for-plumbers/",
    title: "AI Receptionist for Plumbers | LobbyStack",
    description:
      "LobbyStack answers plumbing calls, qualifies urgent leaks and backups, books service visits, and routes after-hours emergencies to your on-call plumber.",
    eyebrow: "Plumbers",
    h1: "AI receptionist for plumbers that captures every emergency call",
    intro:
      "LobbyStack answers plumbing calls while you are under a sink, driving between sites, or off the clock. It collects job details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "LobbyStack answering a plumbing call and booking a service visit",
    proofPoints: [
      "Answers emergency and routine calls 24/7",
      "Collects issue type, location, severity, and scheduling preference",
      "Routes burst pipes and sewage backups to your on-call technician",
    ],
    sections: [
      {
        title: "Stop losing emergency calls to voicemail",
        body: "When a homeowner calls at midnight with water pouring through the ceiling, they will not leave a message. They call the next plumber in the search results. LobbyStack answers on the first ring, screens for true emergencies, and transfers the caller to your on-call tech with the details already collected.",
        points: [
          "Identifies emergency calls versus routine quote requests",
          "Transfers urgent calls with location, issue, and severity",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job",
        body: "You cannot answer the phone while you are under a sink or cutting pipe. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books standard service appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Every plumbing call is different. A clogged drain needs one crew; a slab leak needs another. LobbyStack asks the questions you choose: issue type, water shutoff status, property type, location, and urgency. Your team shows up prepared.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
        ],
      },
      {
        title: "Handle quote requests without pulling you off the job",
        body: "LobbyStack collects the scope of work, location, and urgency for estimate requests. It can schedule an estimate visit or route high-value jobs to your sales team. It does not guess prices.",
        points: [
          "Captures project scope and contact details",
          "Schedules estimate visits directly into your calendar",
          "Routes complex jobs to the right team member",
        ],
      },
      {
        title:
          "Start your morning with organized leads instead of chaotic voicemails",
        body: "LobbyStack filters out robocalls, sales pitches, and spam. Real prospects get a professional interaction and a structured summary waiting in your dashboard when you start the day.",
        points: [
          "Automatically screens out telemarketers and spam",
          "Generates transcripts and recordings for every real call",
          "Delivers organized summaries with caller details and next steps",
        ],
      },
    ],
    faqs: plumberFaqs,
    faqHeading: "Questions about AI receptionists for plumbers",
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
    ctaHeading: "Stop losing emergency plumbing calls to voicemail",
    ctaBody:
      "LobbyStack answers after-hours and on-the-job calls, books appointments, and routes emergencies with full context so you never miss a ready-to-book caller.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-hvac",
    path: "/solutions/ai-receptionist-for-hvac/",
    title: "AI Receptionist for HVAC Companies | LobbyStack",
    description:
      "LobbyStack answers HVAC calls, collects system details, books maintenance visits, and routes urgent no-heat or no-AC requests to your on-call technician.",
    eyebrow: "HVAC",
    h1: "AI receptionist for HVAC companies that captures every service call",
    intro:
      "LobbyStack answers HVAC calls while your technicians are on installs, driving between sites, or off the clock. It collects system details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt: "LobbyStack answering an HVAC service call and booking a visit",
    proofPoints: [
      "Answers emergency no-heat and no-AC calls 24/7",
      "Collects system type, brand, symptoms, and urgency",
      "Books maintenance and installation appointments directly",
    ],
    sections: [
      {
        title: "Never miss a no-heat or no-AC emergency",
        body: "When a homeowner calls during a heat wave because their AC died, or in a January deep freeze because the furnace stopped, they will not wait for voicemail. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call tech with the details already collected.",
        points: [
          "Identifies emergency heating and cooling calls",
          "Transfers urgent calls with system details and symptoms",
          "Sends routine maintenance requests to the morning queue",
        ],
      },
      {
        title: "Book maintenance visits while your team is on installs",
        body: "Installation days are long and your phone keeps ringing. LobbyStack checks your calendar, offers available maintenance slots, and books the appointment before the caller hangs up.",
        points: [
          "Checks real-time calendar availability",
          "Books seasonal maintenance and tune-up appointments",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect system details your technicians need",
        body: "HVAC calls need context: system type, brand and model, fuel type, thermostat status, and symptom description. LobbyStack asks the questions you choose so your team arrives prepared.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
        ],
      },
      {
        title: "Start your day with organized calls instead of voicemail chaos",
        body: "LobbyStack filters out spam and robocalls. Real prospects get a professional interaction and a structured summary waiting in your dashboard when you log in.",
        points: [
          "Automatically screens out telemarketers and spam",
          "Generates transcripts and recordings for every real call",
          "Delivers organized summaries with caller details and next steps",
        ],
      },
    ],
    faqs: hvacFaqs,
    faqHeading: "Questions about AI receptionists for HVAC companies",
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
    ctaHeading: "Stop losing HVAC service calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine HVAC calls, books appointments, and routes no-heat and no-AC emergencies with full context.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-electricians",
    path: "/solutions/ai-receptionist-for-electricians/",
    title: "AI Receptionist for Electricians | LobbyStack",
    description:
      "LobbyStack answers electrical calls, gathers issue and location details, books service visits, and routes sparking or outage emergencies to your on-call electrician.",
    eyebrow: "Electricians",
    h1: "AI receptionist for electricians that captures every service call",
    intro:
      "LobbyStack answers electrical calls while you are running wire, on a panel change, or off the clock. It collects issue details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "LobbyStack answering an electrical service call and booking a visit",
    proofPoints: [
      "Answers emergency and routine electrical calls 24/7",
      "Collects issue type, location, panel age, and safety status",
      "Routes sparking, outage, and hazard calls to your on-call tech",
    ],
    sections: [
      {
        title: "Never miss an emergency electrical call",
        body: "When a homeowner calls about sparking outlets, a burning smell, or a total power outage, they will not wait for voicemail. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call electrician with the details already collected.",
        points: [
          "Identifies emergency electrical calls versus routine requests",
          "Transfers urgent calls with issue description and safety status",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job site",
        body: "You cannot answer the phone while you are pulling cable or installing a panel. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books service and installation appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Electrical calls need context: issue type, circuit affected, panel age, property type, and safety status. LobbyStack asks the questions you choose so your team arrives prepared.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
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
        label: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing electrical service calls to voicemail",
    ctaBody:
      "LobbyStack answers emergency and routine electrical calls, books appointments, and routes urgent hazards with full context.",
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
      "LobbyStack answers garage door calls while you are replacing springs, installing openers, or off the clock. It collects issue details, books appointments, and routes emergencies with full context.",
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
        body: "When a homeowner calls because their car is trapped inside or the door is stuck open at night, they need help now. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call tech with the details already collected.",
        points: [
          "Identifies emergency calls versus routine service requests",
          "Transfers urgent calls with door type and safety details",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job",
        body: "You cannot answer the phone while you are under a torsion spring or installing an opener. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books repair and installation appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Garage door calls need context: door type, opener brand, spring type, and issue description. LobbyStack asks the questions you choose so your team arrives with the right parts.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
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
      "LobbyStack answers emergency and routine garage door calls, books appointments, and routes stuck-door emergencies with full context.",
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
      "LobbyStack answers appliance repair calls while you are diagnosing a dishwasher or replacing a compressor. It collects brand and model details, books appointments, and routes emergencies with full context.",
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
        body: "When a homeowner calls because their refrigerator stopped working or their washing machine is flooding, they will not wait for voicemail. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call tech with the details already collected.",
        points: [
          "Identifies emergency calls versus routine service requests",
          "Transfers urgent calls with appliance brand and model details",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a repair",
        body: "You cannot answer the phone while you are replacing a compressor or diagnosing a control board. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books repair and maintenance appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect brand and model details before dispatching",
        body: "Appliance repair calls need specific information: appliance type, brand, model number, purchase age, and issue description. LobbyStack asks the questions you choose so your team arrives with the right parts.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
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
      "LobbyStack answers emergency and routine appliance calls, books appointments, and routes urgent failures with full context.",
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
      "LobbyStack answers restoration calls while your crew is on site or off the clock. It collects damage details, books estimates, and routes emergencies with full context.",
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
        body: "When a property owner calls at 3 AM about flooding or smoke damage, they need mitigation now. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call team with the details already collected.",
        points: [
          "Identifies emergency mitigation calls versus routine estimate requests",
          "Transfers urgent calls with damage type, area, and source",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book estimate visits while your crew is on site",
        body: "You cannot answer the phone while you are extracting water or boarding up a property. LobbyStack checks your calendar, offers open slots, and books the estimate before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books estimate and consultation appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Restoration calls need context: damage type, affected area size, water source, timeline, and insurance status. LobbyStack asks the questions you choose so your team arrives prepared with the right equipment.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
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
      "LobbyStack answers emergency and routine restoration calls, books estimates, and routes urgent mitigation requests with full context.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-locksmiths",
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "AI Receptionist for Locksmiths | LobbyStack",
    description:
      "LobbyStack is an AI receptionist for locksmiths that answers emergency lockout calls, books service appointments, and routes urgent calls to your on-call technician.",
    eyebrow: "Locksmiths",
    h1: "AI receptionist for locksmiths that captures every emergency call",
    intro:
      "LobbyStack answers locksmith calls while you are on a rekey job, installing hardware, or off the clock. It collects lockout details, books appointments, and routes emergencies with full context.",
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
        body: "When someone is locked out of their home or car, they need help now. They will not leave a voicemail and wait. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call locksmith with the location and details already collected.",
        points: [
          "Identifies emergency lockout calls versus routine service requests",
          "Transfers urgent calls with location and lockout type",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book appointments while you are on a job",
        body: "You cannot answer the phone while you are rekeying locks or installing hardware. LobbyStack checks your calendar, offers open slots, and books the appointment before the caller moves on.",
        points: [
          "Checks real-time calendar availability",
          "Books rekey, installation, and service appointments directly",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Collect the details your team needs before dispatching",
        body: "Locksmith calls need context: lockout type, location, vehicle or property type, key situation, and urgency. LobbyStack asks the questions you choose so your team arrives prepared.",
        points: [
          "Asks your custom intake questions on every call",
          "Attaches answers to the booking summary",
          "Sends transcript and recording alongside the appointment details",
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
      "LobbyStack answers emergency and routine locksmith calls, books appointments, and routes urgent lockouts with full context.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  // ── Contractor after-hours page ─────────────────────────────────

  {
    group: "solution",
    slug: "after-hours-answering-service-for-contractors",
    path: "/solutions/after-hours-answering-service-for-contractors/",
    title: "After-Hours Answering Service for Contractors | LobbyStack",
    description:
      "LobbyStack answers contractor calls after hours, screens emergencies, books next-day visits, and routes urgent jobs to your on-call staff with context.",
    eyebrow: "Contractor after-hours",
    h1: "After-hours answering service for contractors that captures emergency jobs",
    intro:
      "LobbyStack answers contractor calls at night, on weekends, and during holidays. It screens for emergencies, books next-day appointments, and routes urgent requests to your on-call staff with full context.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack handling after-hours contractor calls and routing emergencies",
    proofPoints: [
      "Answers after-hours calls and screens for emergencies",
      "Books next-day appointments directly into your calendar",
      "Routes urgent calls to your on-call staff with context",
    ],
    sections: [
      {
        title: "Stop losing emergency jobs to voicemail",
        body: "When a homeowner calls at 10 PM with an urgent problem, they will not leave a message. They call the next contractor on the list. LobbyStack answers on the first ring, follows your escalation rules, and transfers the caller to your on-call person with the details already collected.",
        points: [
          "Differentiates emergency calls from routine quote requests",
          "Transfers urgent calls with issue, location, and contact details",
          "Sends routine requests to the morning review queue",
        ],
      },
      {
        title: "Book next-day appointments automatically",
        body: "After-hours callers often want to schedule service for the next business day. LobbyStack checks your calendar, offers available slots, and books the appointment. Your team starts the day with scheduled work already on the calendar.",
        points: [
          "Checks real-time calendar availability for next-day slots",
          "Books appointments directly into your calendar",
          "Sends confirmation and next steps to the caller and your team",
        ],
      },
      {
        title: "Filter out spam so you only wake up for real calls",
        body: "Not every after-hours call is worth interrupting your evening. LobbyStack screens out robocalls, telemarketers, and spam. Only genuine emergencies reach your on-call staff.",
        points: [
          "Automatically filters non-human callers",
          "Sends organized summaries for morning review",
          "Protects your personal time while covering the phone line",
        ],
      },
      {
        title: "Follow your real on-call process",
        body: "Every contractor defines urgent differently. LobbyStack asks the qualifying questions you choose: active water damage, safety hazard, heating failure, structural risk. It only interrupts the right person when the call matches your rules.",
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
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop losing after-hours contractor calls to voicemail",
    ctaBody:
      "LobbyStack answers after-hours calls, screens for emergencies, books next-day appointments, and routes urgent jobs to your on-call staff with full context.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  // ── Open-source AI receptionist page ────────────────────────────

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
      "Customize prompts, intake rules, escalation, and integrations",
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
          "Modify prompts, rules, and integrations without a vendor roadmap",
        body: "When your call workflow changes, you should not have to file a support ticket and wait. Because the code is open source, you can modify greeting scripts, intake questions, booking logic, escalation paths, and downstream integrations directly.",
        points: [
          "Change prompts and call flows on your schedule",
          "Add custom webhooks, CRM connections, and alert rules",
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
