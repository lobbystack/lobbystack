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
import {
  vsVirtualReceptionistFaqs,
  vsVoicemailFaqs,
} from "@/lib/comparison-faqs"

export type SeoLandingPageGroup = "company" | "solution" | "comparison"

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
  testimonial?: {
    quote: string
    author: string
    role: string
    trustBadge?: string
  }
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
    ],
    faqs: [],
    relatedLinks: [
      { label: "Features", href: "/features/" },
      { label: "Pricing", href: "/pricing/" },
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
    testimonial: {
      quote:
        "We used to lose at least two emergency calls a week to voicemail. Now LobbyStack books them while we sleep. Our revenue is up 30%.",
      author: "Mike Chen",
      role: "Owner, Apex Plumbing",
    },
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
    testimonial: {
      quote:
        "Our front desk used to juggle three phones during morning rush. Now LobbyStack handles overflow and new-patient booking. The team is calmer and our no-show rate dropped.",
      author: "Dr. Sarah Jenkins",
      role: "Bright Smile Dental",
      trustBadge: "Self-hosting available for HIPAA workflows",
    },
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
    testimonial: {
      quote:
        "We were losing 5-6 bookings a day because stylists couldn't answer while coloring. Now LobbyStack books them automatically. Our books are full two weeks out.",
      author: "Amara Okafor",
      role: "Owner, The Color Room",
    },
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
      "LobbyStack is open source and self-hosted ready for teams that need data control, custom deployment, white-labeling, or regulated workflows.",
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
        title: "Absolute data sovereignty and privacy control",
        body: "For businesses in regulated industries or agencies handling proprietary client workflows, data privacy is non-negotiable. Self-hosting with LobbyStack means call recordings, transcripts, and customer details never leave your secure database.",
        points: [
          "Supports deployments designed around GDPR, HIPAA, and data residency requirements",
          "Complete, private ownership of call transcripts and audio recordings",
          "Supports secure deployment on private clouds or on-premise hardware",
        ],
      },
      {
        title: "Own your prompts, models, and trunks",
        body: "Don't get locked into rigid platform constraints. Configure your own SIP trunks, select which LLMs process each call, and iterate your prompt routing rules without limit or developer gates.",
        points: [
          "Connect Twilio, Telnyx, or private SIP trunks directly",
          "Choose your models: GPT-4, Claude, or local private Llama models",
          "Tweak greeting scripts, intake rules, and escalation paths instantly",
        ],
      },
      {
        title: "Eliminate expensive vendor per-minute markups",
        body: "Traditional AI answering platforms charge heavy per-minute markups that scale unsustainably as your business grows. Self-hosting removes middleman fees, letting you pay raw carrier and API costs directly.",
        points: [
          "Saves up to 80% on long-term high-volume voice minutes",
          "Perfect for agency resellers managing multi-tenant client setups",
          "Unlocks unlimited scale without monthly platform retainer fees",
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
      "Get the open-source AI receptionist running on your servers with full control over data, models, and integrations. No vendor lock-in. No per-minute markups.",
    ctaPrimaryLabel: "Read deployment docs",
    ctaPrimaryHref: "/docs/api/",
    ctaSecondaryLabel: "View on GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
    testimonial: {
      quote:
        "We needed a receptionist that stayed inside our VPC. LobbyStack self-hosted in under an hour. The code is clean, the docs are solid, and we own every byte of call data.",
      author: "David Chen",
      role: "Platform Engineer, SecureHealth",
      trustBadge: "Private deployment",
    },
  },

  // ── Trade-specific solution pages ──────────────────────────────

  {
    group: "solution",
    slug: "ai-receptionist-for-plumbers",
    path: "/solutions/ai-receptionist-for-plumbers/",
    title: "AI Receptionist for Plumbers | LobbyStack",
    description:
      "LobbyStack is an AI receptionist for plumbers that answers emergency calls, books service appointments, and routes after-hours bursts and backups to your on-call technician.",
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
        title: "Start your morning with organized leads instead of chaotic voicemails",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an AI receptionist for HVAC companies that answers emergency no-heat and no-AC calls, books maintenance appointments, and routes urgent calls to your on-call technician.",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an AI receptionist for electricians that answers emergency calls, books service appointments, and routes sparking and outage emergencies to your on-call technician.",
    eyebrow: "Electricians",
    h1: "AI receptionist for electricians that captures every service call",
    intro:
      "LobbyStack answers electrical calls while you are running wire, on a panel change, or off the clock. It collects issue details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt: "LobbyStack answering an electrical service call and booking a visit",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an AI receptionist for garage door repair companies that answers emergency calls, books service appointments, and routes stuck-door emergencies to your on-call technician.",
    eyebrow: "Garage door repair",
    h1: "AI receptionist for garage door repair that captures every call",
    intro:
      "LobbyStack answers garage door calls while you are replacing springs, installing openers, or off the clock. It collects issue details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt: "LobbyStack answering a garage door repair call and booking a visit",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an AI receptionist for appliance repair companies that answers emergency calls, books service appointments, and collects brand and model details before dispatching.",
    eyebrow: "Appliance repair",
    h1: "AI receptionist for appliance repair that captures every call",
    intro:
      "LobbyStack answers appliance repair calls while you are diagnosing a dishwasher or replacing a compressor. It collects brand and model details, books appointments, and routes emergencies with full context.",
    image: "/illustrations/missed-calls.webp",
    imageAlt: "LobbyStack answering an appliance repair call and booking a visit",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an AI receptionist for restoration companies that answers emergency water and fire damage calls, books estimates, and routes urgent mitigation requests to your on-call team.",
    eyebrow: "Restoration",
    h1: "AI receptionist for restoration companies that captures every emergency",
    intro:
      "LobbyStack answers restoration calls while your crew is on site or off the clock. It collects damage details, books estimates, and routes emergencies with full context.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt: "LobbyStack answering a restoration emergency call and routing it",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
    imageAlt: "LobbyStack answering a locksmith call and booking a service visit",
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
      { label: "Home services", href: "/solutions/ai-receptionist-for-home-services/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
      "LobbyStack is an after-hours answering service for contractors that screens emergency calls, books next-day appointments, and routes urgent jobs to your on-call staff when your team is off the clock.",
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
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
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
    imageAlt: "LobbyStack open-source AI receptionist code and deployment controls",
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
        title: "Modify prompts, rules, and integrations without a vendor roadmap",
        body: "When your call workflow changes, you should not have to file a support ticket and wait. Because the code is open source, you can modify greeting scripts, intake questions, booking logic, escalation paths, and downstream integrations directly.",
        points: [
          "Change prompts and call flows on your schedule",
          "Add custom webhooks, CRM connections, and alert rules",
          "Fork the codebase for agency or multi-tenant deployments",
        ],
      },
      {
        title: "Deploy on infrastructure you control",
        body: "Self-hosting with LobbyStack means call recordings, transcripts, and customer details never leave your infrastructure. Connect your own SIP trunks, choose your own models, and set your own retention policies.",
        points: [
          "Run in containers on your preferred cloud or private environment",
          "Choose GPT-4, Claude, or local private Llama models",
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
      { label: "Self-hosted deployment", href: "/solutions/self-hosted-ai-receptionist/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      { label: "API docs", href: "/docs/api/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Inspect, customize, and deploy an AI receptionist you can verify",
    ctaBody:
      "LobbyStack is open source so you can audit the call logic, modify the workflow, and deploy on your own infrastructure. No black box. No vendor lock-in.",
    ctaPrimaryLabel: "View on GitHub",
    ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
    ctaSecondaryLabel: "Read deployment docs",
    ctaSecondaryHref: "/docs/api/",
  },

  // ── Comparison pages ────────────────────────────────────────────

  {
    group: "comparison",
    slug: "ai-receptionist-vs-virtual-receptionist",
    path: "/compare/ai-receptionist-vs-virtual-receptionist/",
    title: "AI Receptionist vs Virtual Receptionist | LobbyStack",
    description:
      "An in-depth, side-by-side comparison of AI receptionists vs human virtual receptionist services. Analyze differences in cost, concurrency, booking capabilities, warm transfers, and caller experience.",
    eyebrow: "Comparison",
    h1: "AI receptionist vs virtual receptionist: which fits your business?",
    intro:
      "When your phone rings, every unanswered call is a lost booking. Both an AI receptionist and a traditional virtual receptionist service aim to solve this problem by providing a live response. However, they rely on completely different operational models, cost structures, and technologies. Understanding the fundamental trade-offs between human virtual answering services and modern conversational AI is critical to choosing the approach that secures the highest booking rates at the lowest operating cost.",
    image: "/illustrations/value-network.webp",
    imageAlt: "Comparison of AI receptionist and virtual receptionist call handling",
    proofPoints: [
      "AI handles unlimited concurrent calls; human services handle one at a time",
      "AI charges a predictable flat monthly rate; humans charge by the active minute",
      "AI answers instantly 24/7; human services often require hold times during spikes",
    ],
    sections: [
      {
        title: "How they answer calls: concurrency vs. single-agent limits",
        body: "The most significant operational difference between conversational AI and human answering services is concurrency. Traditional virtual receptionists are remote human agents working in a call center, typically reading from a rigid, pre-scripted workflow. If three customers call your business simultaneously, two must wait on hold or get routed to secondary operators who may not know your business well. A modern AI receptionist like LobbyStack is powered by high-performance conversational models that answer unlimited calls at the exact same moment. Every single caller gets an immediate, responsive, and personalized conversation with zero wait times, hold music, or busy signals.",
        points: [
          "AI: Infinite concurrency handles massive call spikes with zero performance degradation",
          "Human: Limited to a single caller per agent, introducing hold times during busy hours",
          "Knowledge: AI has instant, perfect access to your entire business database and policies",
        ],
      },
      {
        title: "Cost comparison: flat monthly rates vs. unpredictable per-minute billing",
        body: "Traditional virtual receptionist services often charge on a per-minute basis or require tiered monthly commitments that rise with usage. This model can make your monthly expenses highly volatile and penalize your business for growth. If a caller takes five minutes to explain a simple issue, or if telemarketers and spam robocalls slip through, you may be billed for every second. LobbyStack operates on a highly predictable subscription model with generous voice minutes included. Furthermore, LobbyStack includes intelligent spam filters that block automated robocalls and telemarketers before they ever pick up, ensuring your active minutes are spent primarily on genuine, high-value customer leads.",
        points: [
          "AI: Predictable budgeting with flat monthly subscriptions and low, transparent overages",
          "Human: High per-minute fees that penalize long inquiries, wrong numbers, and spam calls",
          "Filter: Built-in screening blocks robocalls automatically to preserve your minute limits",
        ],
      },
      {
        title: "When to choose an AI receptionist: speed, consistency, and booking",
        body: "An AI receptionist is the optimal choice for businesses where the majority of incoming calls follow a predictable pattern. If your callers are primarily asking about your services, requesting pricing, confirming your operating hours, or trying to book an appointment, LobbyStack excels. Because the AI is integrated directly with your scheduling software (like Google Calendar, Outlook, or booking CRMs), it can instantly offer available slots, enforce your business policies (such as booking buffers and travel times), and complete appointments on the spot. For local service operators, home contractors, spas, and clinics, this immediate resolution converts ready-to-buy leads faster than a human operator taking a manual callback message.",
        points: [
          "High Volume: Your business receives dozens of routine inquiries and scheduling requests daily",
          "Immediate Booking: Callers are calendar-scheduled and texted confirmations within 2 minutes",
          "Always On: Seamless 24/7/365 coverage for nights, weekends, holidays, and busy lunch hours",
        ],
      },
      {
        title: "When to choose a virtual receptionist: high-touch nuance and manual judgment",
        body: "A human virtual receptionist may be preferred if your business handles highly sensitive, emotionally charged, or non-standard calls that require deep empathy and flexible human judgment. For example, a specialized medical practice handling complex clinical intake, a family law firm dealing with emotional client crises, or a boutique consultancy where every conversation is highly bespoke will benefit from a trained human voice. However, these services require continuous script updates, are subject to call-center staff turnover, and cannot immediately book complex scheduling slots without substantial training overhead and back-and-forth communication.",
        points: [
          "Empathy: Non-standard calls that demand deep emotional support and personalized warmth",
          "Bespoke: Callers expect specialized, non-routine consultations rather than standard scheduling",
          "Empathy First: Ideal for clinical counseling, specialized legal consults, or high-end concierge services",
        ],
      },
      {
        title: "A middle path: how LobbyStack combines AI with human handoff",
        body: "LobbyStack believes you should not have to compromise between the cost-efficiency of AI and the safety of human oversight. Our platform is built around 'warm transfers' and smart escalation rules. The AI receptionist handles routine inquiries, captures lead details, and processes standard calendar bookings. However, if a caller presents an emergency (like a burst pipe for a plumber or an acute dental issue), asks a highly specific question, or asks to speak with a manager, LobbyStack instantly routes the call to your team. Along with the live call transfer, you receive an automated summary and a real-time transcript, ensuring you step in only when human expertise is highly valuable.",
        points: [
          "Warm Handoff: Routine calls are automated, while high-stakes opportunities are sent to your phone",
          "Live Context: Your team receives a text/email summary with the transcript before picking up",
          "Optimal ROI: Drastically reduces front-desk burnout while capturing every high-value opportunity",
        ],
      },
    ],
    faqs: vsVirtualReceptionistFaqs,
    faqHeading: "Questions about AI receptionists vs virtual receptionists",
    relatedLinks: [
      { label: "AI phone answering", href: "/solutions/ai-phone-answering/" },
      { label: "AI receptionist vs voicemail", href: "/compare/ai-receptionist-vs-voicemail/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Get the efficiency of AI with safe human handoff",
    ctaBody:
      "LobbyStack handles routine call volume, answers FAQs, and schedules appointments 24/7, while routing urgent escalations to your team with live summaries.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "comparison",
    slug: "ai-receptionist-vs-voicemail",
    path: "/compare/ai-receptionist-vs-voicemail/",
    title: "AI Receptionist vs Voicemail | LobbyStack",
    description:
      "Compare modern AI receptionists vs traditional business voicemail. Learn how voicemail causes caller drop-offs and lost bookings, and how AI recovers missed revenue.",
    eyebrow: "Comparison",
    h1: "AI receptionist vs voicemail: which captures more revenue?",
    intro:
      "Traditional business voicemail is a passive 'record-and-wait' system. When a caller reaches an answering machine, they are asked to wait, hang up, and hope for a callback. An AI receptionist, on the other hand, is an active conversational partner that answers instantly, resolves queries, and books appointments on the spot. For local service companies, retail clinics, and appointment-based businesses, the difference between voicemail and AI is the difference between losing a hot lead to a competitor and securing a confirmed customer.",
    image: "/illustrations/missed-calls.webp",
    imageAlt: "Comparison of AI receptionist and voicemail call handling",
    proofPoints: [
      "AI holds the call and books the lead; voicemail asks the caller to wait",
      "AI answers instantly on the first ring; voicemail forces callers through long rings",
      "AI qualifies leads and screens emergencies; voicemail collects unstructured audio",
    ],
    sections: [
      {
        title: "Caller experience: immediate active resolution vs. passive record-and-wait",
        body: "The core difference between these two systems lies in consumer psychology and direct engagement. When a customer reaches a traditional voicemail box, they hear a generic, static greeting and are forced to leave an unstructured message. They receive no feedback, no confirmation of when you will return their call, and no immediate support. An AI receptionist like LobbyStack welcomes the caller with a natural, professional voice, answers their specific questions about your services, gathers their intake details (like zip code, issue severity, and contact info), and calendars their appointment. The entire interaction is structured, immediate, and leaves the caller with a booked slot and an instant SMS confirmation.",
        points: [
          "AI: Greets on the first ring, answers questions, qualifies urgency, and schedules in real time",
          "Voicemail: Forces the caller through long rings and leaves them waiting indefinitely for a response",
          "Engagement: Callers receive immediate, satisfying resolution rather than a dead-end message box",
        ],
      },
      {
        title: "The hang-up problem: how voicemail leaks ready-to-book leads",
        body: "In today's fast-paced, digital-first marketplace, convenience is the ultimate competitive advantage. Many ready-to-book callers who reach a business's voicemail will hang up without leaving a message, especially when the need is urgent or they found you through local search. Instead of waiting, they press the back button on Google or Apple Maps and click the very next listing. If your business depends on organic local search, local services ads (LSAs), or pay-per-click advertising, sending calls to voicemail means you may be paying to generate leads for your direct competitors. An AI receptionist acts as a safety net, capturing and scheduling these high-intent buyers before they can navigate away.",
        points: [
          "Drop-off: Many ready-to-buy leads hang up when routed to voicemail",
          "Competitors: Callers who reach voicemail will call the next local business in search results",
          "Retention: Keeping callers on the line secures their commitment and stops the search process",
        ],
      },
      {
        title: "When voicemail is adequate: low-stakes calls and pre-existing relationships",
        body: "Voicemail remains a perfectly adequate, cost-effective tool for low-stakes or internal communications where immediate response times do not impact revenue. If your incoming calls are primarily from known vendors, colleagues, existing business partners, or internal staff, speed is rarely a critical factor. These callers have established relationships with your team and are highly likely to leave a detailed message and patiently await your response. However, if your phone line is your primary engine for new customer acquisition and lead capture, relying on voicemail is a massive, ongoing drain on your bottom line.",
        points: [
          "Low Urgency: Ideal for non-revenue-generating calls, vendor relations, and internal team coordination",
          "Established: Known clients who have deep trust and are comfortable waiting for a callback",
          "Constraint: Safe when business growth is not dependent on capturing new phone inquiries",
        ],
      },
      {
        title: "The financial ROI: calculating how AI receptionists pay for themselves",
        body: "While traditional voicemail is virtually free, its hidden opportunity cost can be high. If your average job or booking value is $300, and your voicemail causes just three callers a month to hang up and book a competitor, your business is losing $900 in monthly revenue. By replacing voicemail with LobbyStack, those missed calls can become booked appointments. LobbyStack's free tier handles initial testing at zero cost, and premium plans can be covered by a single saved job.",
        points: [
          "Lost Revenue: Voicemail drop-offs represent thousands of dollars in lost annual earnings",
          "Immediate ROI: Converting even one additional lead per month covers the platform's cost for months",
          "Efficiency: Drastically lowers your average cost-per-acquisition (CPA) on marketing campaigns",
        ],
      },
      {
        title: "Pragmatic transition: using AI overflow and after-hours scheduling",
        body: "Migrating from traditional voicemail to a conversational AI receptionist does not have to be an all-or-nothing decision. You do not need to replace your entire phone system overnight. Many businesses start by deploying LobbyStack as an after-hours answering service or an overflow handler during the day. If your team is in a meeting, driving to a job site, or helping an in-person customer, the call silently rolls over to LobbyStack after two rings. The AI handles the booking or qualifies the lead, and your team receives a structured summary, allowing you to focus on your work without missing a single dollar.",
        points: [
          "After-Hours: Capture valuable evening and weekend leads while your office is closed",
          "Overflow: AI steps in only when your lines are busy or rings go unanswered for too long",
          "Paced Growth: Test the conversational flow and scheduling success on our free plan first",
        ],
      },
    ],
    faqs: vsVoicemailFaqs,
    faqHeading: "Questions about AI receptionists vs voicemail",
    relatedLinks: [
      { label: "AI receptionist vs virtual receptionist", href: "/compare/ai-receptionist-vs-virtual-receptionist/" },
      { label: "After-hours answering", href: "/solutions/after-hours-answering-service/" },
      { label: "Missed-call calculator", href: "/missed-call-revenue-calculator/" },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Stop sending high-intent buyers to voicemail",
    ctaBody:
      "LobbyStack greets callers, answers their specific questions, qualifies lead status, and books them directly to your calendar 24/7.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "Calculate missed revenue",
    ctaSecondaryHref: "/missed-call-revenue-calculator/",
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
