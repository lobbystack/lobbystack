import { absoluteUrl } from "@/marketing/lib/seo"
import { afterHoursFaqs } from "@/marketing/lib/after-hours-faqs"
import { dentalOfficesFaqs } from "@/marketing/lib/dental-offices-faqs"
import { salonsSpasFaqs } from "@/marketing/lib/salons-spas-faqs"
import { selfHostedFaqs } from "@/marketing/lib/self-hosted-faqs"
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
  contractorFaqs,
} from "@/marketing/lib/trade-faqs"
import { openSourceReceptionistFaqs } from "@/marketing/lib/open-source-receptionist-faqs"
import { tradeMarkdownAfterSections, tradeMarkdownBeforeSections } from "@/marketing/lib/trade-markdown"
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
  /** Small print under the hero buttons, when the layout's default doesn't fit the page. */
  heroFootnote?: string
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
    title: "About LobbyStack | Open-Source AI Receptionist",
    description:
      "An open-source AI receptionist for small businesses. LobbyStack answers your calls, books appointments and transfers callers, on our cloud or your server.",
    eyebrow: "About",
    h1: "LobbyStack is an open-source AI receptionist for small businesses",
    intro:
      "We built LobbyStack for owners who miss calls while they're with a customer. It answers your phone, books appointments into Google Calendar and passes callers to your team when they need a person. The code is public under the MIT License, so you can use our cloud or run it on your own server.",
    image: "/illustrations/value-network.webp",
    imageAlt: "The LobbyStack code on GitHub, running on LobbyStack Cloud or on your own server",
    proofPoints: [
      "MIT-licensed code on GitHub",
      "Runs on LobbyStack Cloud or your own server",
      "Calls, bookings, transfers and summaries in one dashboard",
    ],
    sections: [
      {
        title: "We built it for the calls you can't pick up",
        body: "The phone rings during a haircut, a cleaning or a job across town. Voicemail books nobody, so the caller tries the next business on the list. We built LobbyStack to answer those calls, book what it can and send you the rest with the details written down.",
        points: [
          "Answers while you're with a customer, closed or out on a job",
          "Books into Google Calendar and texts a confirmation to clients who agree",
          "Transfers urgent calls by your rules and takes a message on the rest",
        ],
      },
      {
        title: "You can read how it decides what to do on a call",
        body: "Your receptionist talks to your customers, reads your calendar and decides when to wake you up. You should be able to check how it makes those choices. All of LobbyStack is on GitHub under the MIT License, for anyone to read, run or change.",
        points: [
          "Read the prompts, tools and call handling yourself",
          "Start on LobbyStack Cloud and move to your own server later",
          "Fork it and change it to fit how your business works",
        ],
      },
      {
        title: "Built for businesses that book by phone",
        body: "We build for owners and small teams who get their work by phone: salons and spas, dental offices, plumbers and other trades, property managers. Agencies can also resell LobbyStack to their clients under their own brand.",
        points: [
          "Owners who miss calls during appointments or on job sites",
          "Businesses that want callers booked during the call, without a phone menu",
          "Agencies that want to offer an AI receptionist under their own brand",
        ],
      },
      {
        title: "You decide what it says, books and transfers",
        body: "You write the rules in plain words: what the receptionist can tell callers, what it can book and when it puts a call through to you. On LobbyStack Cloud, we run the hosting, monitoring and updates. On your own server, you run the same code.",
        points: [
          "Add your website, documents, services and hours as its knowledge",
          "Review each call's summary, transcript and outcome in the dashboard",
          "Read the docs or email support@lobbystack.com when you need help",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Features", href: "/features/" },
      { label: "Public documentation", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Try LobbyStack on your own calls",
    ctaBody: "Start on the free plan with 30 voice minutes and no card, or read the code on GitHub first.",
    ctaSecondaryLabel: "Read the code on GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  },
]

export const solutionPages: SeoLandingPage[] = [
  {
    group: "solution",
    slug: "after-hours-answering-service",
    path: "/solutions/after-hours-answering-service/",
    title: "AI After-Hours Answering Service | LobbyStack",
    description:
      "An after-hours answering service that books routine calls into Google Calendar and rings your on-call phone for emergencies. Free plan, then $30 a month.",
    eyebrow: "After-hours answering",
    h1: "An AI after-hours answering service that only wakes you for emergencies",
    intro:
      "At 1 a.m., a caller with no heat dials whoever picks up first. LobbyStack answers your business number on nights, weekends and holidays. It rings your on-call phone for the emergencies your rules name and books routine calls into Google Calendar.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "LobbyStack answering after-hours calls and transferring an emergency to the on-call phone",
    proofPoints: [
      "Answers on your current number after you close",
      "Transfers emergencies to your on-call phone",
      "Free plan with 30 minutes, then $30 a month for 150",
    ],
    sections: [
      {
        title: "Emergencies reach your on-call phone",
        body: "You write what counts as urgent, such as no heat below a set temperature, water that won't stop or a tenant locked out. LobbyStack asks the questions your rule needs, then transfers the call to your on-call number. The address and the problem stay in the call's transcript.",
        points: [
          "It can read out your safety steps, such as where to shut off the water",
          "If the transfer doesn't connect, it offers to take a message and can alert your team",
        ],
      },
      {
        title: "Routine callers book their own appointments",
        body: "A caller who wants a tune-up or a quote hears open times from your Google Calendar and picks one. They get a text confirmation, and you see the booking when you open your calendar in the morning.",
        points: [
          "Moves or cancels appointments, if you turn on appointment changes",
          "Answers questions about hours, service area and prices from your details",
        ],
      },
      {
        title: "Start the morning knowing who called overnight",
        body: "The dashboard holds a one-line summary, a transcript and a recording for each call. You see who called and what they need before you return a single call.",
        points: [
          "The caller's name, number and reason for calling",
          "Spam calls and calls under 10 seconds use no minutes",
        ],
      },
      {
        title: "What an after-hours answering service costs",
        body: "Live answering services usually bill by the minute or by the call, and some add holiday fees. LobbyStack charges a monthly plan with minutes included, and a minute at 3 a.m. on a holiday costs the same as any other. Say you get 40 after-hours calls a month at about 3 minutes each. That's 120 minutes, which fits in Starter for $30.",
        points: [
          "Free: 30 voice minutes and a US or Canadian number for 14 days, without a card",
          "Starter: $30 a month for 150 minutes, then $0.20 a minute",
          "Pro: $100 a month for 500 minutes, then $0.18 a minute",
        ],
      },
    ],
    faqs: afterHoursFaqs,
    faqHeading: "Questions about after-hours answering services",
    relatedLinks: [
      { label: "AI phone answering service", href: "/solutions/ai-phone-answering/" },
      {
        label: "After-hours answering for contractors",
        href: "/solutions/after-hours-answering-service-for-contractors/",
      },
      {
        label: "What an answering service costs",
        href: "/blog/how-much-does-an-answering-service-cost/",
      },
      {
        label: "Missed-call calculator",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Let LobbyStack take tonight's calls",
    ctaBody:
      "Write your emergency rules, forward your number when you close and call it yourself. The free plan includes 30 minutes.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-dental-offices",
    path: "/solutions/ai-receptionist-for-dental-offices/",
    title: "Dental AI Receptionist and Answering Service | LobbyStack",
    description:
      "A dental AI receptionist that answers when your front desk is busy or closed, books patients in Google Calendar and transfers emergencies. From $30/month.",
    eyebrow: "Dental offices",
    h1: "A dental AI receptionist that books patients while your front desk is busy",
    intro:
      "Patients call during check-in, at lunch and after you close, and those calls go to voicemail. LobbyStack answers your practice's line, books new patients and cleanings into Google Calendar and transfers dental emergencies to your on-call number. Paid plans start at $30 a month.",
    image: "/illustrations/call-booking-summary.webp",
    imageAlt:
      "LobbyStack booking a new patient's exam and texting a confirmation",
    proofPoints: [
      "Books into Google Calendar and texts a reminder the day before",
      "Transfers after-hours emergencies to your on-call number",
      "Talks with patients in 70+ languages, including Spanish",
    ],
    sections: [
      {
        title: "Your front desk stays with the patient in front of them",
        body: "The phone rings during check-in, and LobbyStack takes the new-patient, insurance and scheduling calls. It books routine visits, answers questions about accepted plans, parking and forms, and writes up anything else for your team to handle between patients.",
        points: [
          "Answers when the line is busy, after close or on every call, depending on how you forward it",
          "Saves a recording, a transcript and a one-line summary of each call",
        ],
      },
      {
        title: "New patients book on the first call",
        body: "LobbyStack collects the patient's insurance carrier and reason for the visit, offers open times inside your opening hours and books the exam in Google Calendar. If you'd rather confirm each visit yourself, set it to save the preferred time as a request for your team. Patients who agree get a confirmation text and a reminder the day before. On LobbyStack Cloud, texts go to US and Canadian numbers.",
        points: [
          "Books for the practice, or for each dentist and hygienist",
          "Patients can move or cancel from the number they booked with, if you turn on appointment changes",
        ],
      },
      {
        title: "Dental emergencies follow your rules",
        body: "You decide what counts as an emergency, such as swelling, fever, a knocked-out tooth or bleeding that won't stop. LobbyStack asks those questions, then books the soonest open slot or transfers the call to your on-call number. Put the care instructions you want patients to hear in your rules, in your own words.",
        points: [
          "Transfers go to one number per practice, so forward it to whoever is covering",
          "If a transfer doesn't connect, it offers to take a message and can alert your team",
        ],
      },
      {
        title: "Patients talk in their own language",
        body: "Each call opens in your practice's default language: English, French, Spanish, Serbian, German, Brazilian Portuguese, Italian or Dutch. When a patient speaks another language or asks for one, the receptionist switches. It runs on OpenAI GPT-Live, which handles 70+ languages.",
        points: [
          "Your dashboard and emails come in English, French, Spanish or Serbian",
          "Confirmation and reminder texts go out in your default language",
        ],
      },
      {
        title: "What a dental AI receptionist costs",
        body: "No plan has a setup fee, and prices are in US dollars. LobbyStack counts usage by the second, and calls under 10 seconds or ended as spam don't count. Annual billing costs 20% less, which brings Starter to $24 a month and Pro to $80. Dental-specific receptionists that publish prices ran from $299 to $1,199 a month when we checked their websites on October 27, 2026.",
        points: [
          "Free: 30 voice minutes and a US or Canadian number for 14 days, without a card",
          "Starter: $30 a month for 150 minutes and one number, then $0.20 a minute",
          "Pro: $100 a month for 500 minutes, then $0.18 a minute",
        ],
      },
      {
        title: "When a dental-specific receptionist fits better",
        body: "LobbyStack books into Google Calendar only, so your team copies new bookings into Dentrix, Open Dental or Eaglesoft. It makes no HIPAA claim, doesn't verify insurance eligibility and runs no recall campaigns. If you need any of those, pick a dental vendor. We read each claim below on the vendor's own website on October 27, 2026.",
        points: [
          "Bookings written into your practice software: Dentina names 11 systems it writes bookings back to",
          "A receptionist tied to your practice software: Peerlogic names 8 systems it integrates with",
          "Automated recalls: Dentina sells outbound recall campaigns, and Viva AI includes recall and reactivation outreach in its plans",
        ],
      },
    ],
    faqs: dentalOfficesFaqs,
    faqHeading: "Questions about dental AI receptionists",
    relatedLinks: [
      {
        label: "After-hours answering service",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "AI appointment setter",
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
    ctaHeading: "Book the patients who call during lunch",
    ctaBody:
      "Add your accepted plans, hours and emergency rules, then call your number to test it. The free plan includes 30 minutes.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "ai-receptionist-for-salons-and-spas",
    path: "/solutions/ai-receptionist-for-salons-and-spas/",
    title: "AI Receptionist for Salons and Spas | LobbyStack",
    description:
      "An AI receptionist for salons and spas that answers mid-color, books the stylist each client asks for and quotes prices from your service menu.",
    eyebrow: "Salons and spas",
    h1: "An AI receptionist for salons that books while your hands are busy",
    intro:
      "The phone rings while you're mid-color or mid-massage, and LobbyStack picks up. It books the stylist the client asks for into Google Calendar and answers from your service menu, so the call ends with an appointment on your books.",
    image: "/illustrations/booking-flow.webp",
    imageAlt: "A stylist's day in LobbyStack, with a balayage booked by phone into an open slot",
    proofPoints: [
      "Books into Google Calendar by service length and stylist hours",
      "Texts a confirmation and a 24-hour reminder to clients who agree",
      "Moves and cancels appointments after it finds the client's booking",
    ],
    sections: [
      {
        title: "Book the stylist your client asks for",
        body: "Add each stylist, colorist and therapist with the services they do and the hours they work. A client who asks for someone by name hears that person's open times. If that person is off, LobbyStack says when they're back and offers another day or another stylist.",
        points: [
          "Finds a gap long enough for the service, so a 150-minute balayage gets 150 minutes",
          "Skips days off and hours outside each person's schedule",
          "Puts the call through to a stylist's phone when the client asks to talk to them",
        ],
      },
      {
        title: "Move and cancel appointments on the call",
        body: "A client calls to push Saturday's cut to Thursday. LobbyStack finds the booking from their phone number, name and appointment time, reads the change back and updates your calendar once the client confirms. You can also require a texted code or a keypad PIN first.",
        points: [
          "Tells clients your cancellation policy when you add it to your notes",
          "Passes the request to your team when it can't match the booking",
          "Texts a cancellation confirmation to clients who agreed to texts",
        ],
      },
      {
        title: "A salon answering service that knows your menu",
        body: "Give each service a length and a price: fixed, a starting price, a range or priced in person. LobbyStack quotes what you entered and won't guess a price you left blank. Add your website and policy PDFs too, and it answers questions about patch tests, parking or gift cards.",
        points: [
          "Gives the same answers on calls, in your website chat and in Instagram messages",
          "Takes a message for your team when your notes don't cover a question",
        ],
      },
      {
        title: "Book the clients who call after you close",
        body: "A client remembers at 9 p.m. that her roots need doing. LobbyStack answers then the way it answers at noon and books into the times you've opened. You'll find each call in your dashboard the next morning, with a summary, a transcript and what happened.",
        points: [
          "Sends you an email or text alert for the calls your team should return",
          "Switches to the caller's language, from more than 70",
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
    ctaHeading: "Keep booking while you're with a client",
    ctaBody:
      "Start free with 30 voice minutes. Add your services, stylists and hours, then book yourself a test appointment from your browser.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },
  {
    group: "solution",
    slug: "self-hosted-ai-receptionist",
    path: "/solutions/self-hosted-ai-receptionist/",
    title: "Self-Hosted AI Receptionist, Open Source | LobbyStack",
    description:
      "Run LobbyStack, an open-source self-hosted AI receptionist, on your server with Docker Compose or Railway. Call recordings and transcripts stay with you.",
    eyebrow: "Self-hosted",
    h1: "A self-hosted AI receptionist that keeps call records on your server",
    intro:
      "A hosted AI receptionist keeps your callers' recordings on someone else's servers. LobbyStack answers your calls, books appointments and takes messages from a server you run, and saves every recording, transcript and contact there.",
    image: "/illustrations/trust-controls.webp",
    imageAlt:
      "LobbyStack running as a self-hosted AI receptionist on your own server",
    proofPoints: [
      "Runs on one server with 2 vCPU and 4 GB of RAM",
      "Docker Compose or the Railway template",
      "Your own Twilio and OpenAI accounts",
    ],
    sections: [
      {
        title: "Docker Compose on one server",
        body: "One docker-compose.yml runs the dashboard, the worker, PostgreSQL, Redis and Caddy on a single machine. A script fills in every password and secret, so you add only your domain, OpenAI key and Twilio credentials.",
        points: [],
      },
      {
        title: "The Railway template",
        body: "Railway creates the services, the databases and a storage bucket, and generates every secret. You paste in your OpenAI key and Twilio credentials. Browser test calls work as soon as the deploy finishes.",
        points: [],
      },
      {
        title: "Your call records stay on your server",
        body: "Recordings, transcripts, contacts and settings sit in the PostgreSQL database and storage you run, and you choose how to back them up. Twilio and OpenAI still process the live call audio under your accounts, so check their terms for your use.",
        points: [
          "Separate database roles and row-level security for each service",
          "Recordings on a local volume or any S3-compatible bucket",
          "Traces, metrics and logs sent to any OTLP-compatible backend",
        ],
      },
      {
        title: "Change the code to fit your calls",
        body: "You get the same TypeScript monorepo that runs LobbyStack Cloud. Edit the receptionist's instructions in packages/agent-core, or add a tool that connects it to software your team already uses.",
        points: [
          "Point chat and embeddings at any OpenAI-compatible endpoint",
          "Voice calls run on OpenAI GPT-Live with your key",
        ],
      },
    ],
    faqs: selfHostedFaqs,
    faqHeading: "Questions about self-hosted AI receptionists",
    relatedLinks: [
      { label: "Open-source AI receptionist", href: "/solutions/open-source-ai-receptionist/" },
      { label: "Self-hosting guide", href: "https://docs.lobbystack.com/self-hosting/overview" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      { label: "Self-hosted pricing", href: "/pricing/self-hosted/" },
      { label: "White Label", href: "/white-label/" },
    ],
    ctaHeading: "Run LobbyStack on your own server",
    ctaBody:
      "The self-hosting guide lists the services, provider accounts and backups you'll look after. The Docker Compose guide takes you through a one-server install.",
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
    title: "Plumbing Answering Service with AI, 24/7 | LobbyStack",
    description:
      "An AI plumbing answering service that reads callers your shutoff steps, books drain jobs, and transfers burst pipes to your on-call plumber. Free plan.",
    eyebrow: "Plumbers",
    h1: "Plumbing answering service that wakes you only for the burst pipe",
    intro:
      "A caller with water coming through the ceiling won't wait until morning for a callback. LobbyStack reads them your shutoff steps and rings your on-call plumber, and it books drain and water heater jobs into Google Calendar.",
    image: "/illustrations/missed-calls-v3.webp",
    imageAlt:
      "A burst-pipe call transferred by LobbyStack to a plumbing company's on-call plumber",
    proofPoints: [
      "Reads your shutoff steps to callers with an active leak",
      "Transfers burst pipes and sewage backups to your on-call plumber",
      "Quotes the drain and dispatch prices you set",
    ],
    sections: [
      {
        title: "Books drain jobs while you're under a sink",
        body: "LobbyStack offers the open slots in your Google Calendar, books the one the caller picks, and texts a confirmation if they agree. For water heater replacements and repipes, it books an estimate visit instead of guessing a price.",
        points: [],
      },
      {
        title: "Tells callers your service area, hours, and starting prices",
        body: "Add your service area, hours, services, and starting prices once. LobbyStack answers callers from them and quotes only the prices you list.",
        points: [],
      },
    ],
    faqs: plumberFaqs,
    faqHeading: "Questions about plumbing answering services",
    relatedLinks: [
      {
        label: "Compare plumbing answering services",
        href: "/blog/best-plumbing-answering-services/",
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
    ],
    ctaHeading: "Put LobbyStack on tonight's on-call shift",
    ctaBody:
      "Start on the Free plan, add your shutoff steps, and forward your after-hours line once your test calls go the way you want.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-hvac",
    path: "/solutions/ai-receptionist-for-hvac/",
    title: "HVAC Answering Service & AI Receptionist, 24/7 | LobbyStack",
    description:
      "An HVAC answering service that sends no-heat and no-AC emergencies to your on-call tech and books tune-ups during the call. Free plan, then $30 a month.",
    eyebrow: "HVAC",
    h1: "HVAC answering service that puts no-heat calls through to your on-call tech",
    intro:
      "In a cold snap, a family with no heat calls the next company when your line is busy. LobbyStack sends urgent no-heat and no-AC calls to your on-call tech under rules you write, and books tune-ups and estimates into Google Calendar during the call.",
    image: "/illustrations/human-handoff.webp",
    imageAlt:
      "A no-heat call transferred by LobbyStack to an HVAC company's on-call tech",
    proofPoints: [
      "Transfers no-heat, no-AC, and gas-smell calls to your on-call tech",
      "Books tune-ups and replacement estimates into Google Calendar",
      "Switches to the caller's language, including Spanish",
    ],
    sections: [
      {
        title: "Asks the system questions, then books the visit",
        body: "LobbyStack asks for the system type, its age, and the home's size, then books the visit into Google Calendar while the caller is on the phone. If you'd rather approve each visit, request mode saves the caller's preferred time for your team to confirm.",
        points: [],
      },
      {
        title: "Answers in the caller's language",
        body: "Each call opens in your default language. When a caller speaks Spanish or another language, LobbyStack switches to it and keeps your urgency rules and booking settings.",
        points: [],
      },
    ],
    faqs: hvacFaqs,
    faqHeading: "Questions about HVAC answering services",
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
    ctaHeading: "Write your no-heat rule before the first cold snap",
    ctaBody:
      "Start on the Free plan, test a no-heat call and a tune-up, then forward your overflow line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-electricians",
    path: "/solutions/ai-receptionist-for-electricians/",
    title: "Electrician Answering Service with AI | LobbyStack",
    description:
      "An AI electrician answering service that reads your safety script for sparks and burning smells, then books panel upgrade and EV charger estimates.",
    eyebrow: "Electricians",
    h1: "Electrician answering service that books panel upgrades and rings you for hazards",
    intro:
      "One caller smells burning at an outlet. The next wants an EV charger quote, and you're in an attic for both. LobbyStack reads the first caller your safety script and rings your on-call electrician, and it books the second an estimate visit.",
    image: "/illustrations/call-routing-team.webp",
    imageAlt:
      "A hazard call transferred by LobbyStack to an electrical contractor's on-call electrician",
    proofPoints: [
      "Reads your safety script for sparks, smoke, and burning smells",
      "Transfers hazard calls to your on-call electrician",
      "Books panel upgrade, EV charger, and generator estimates",
    ],
    sections: [
      {
        title: "Books estimates with the panel amperage on file",
        body: "LobbyStack asks for the panel amperage, the home's age, and the charger or generator the caller wants, then books the estimate visit into Google Calendar during the call.",
        points: [],
      },
      {
        title: "Checks for a utility outage before you roll a truck",
        body: "A caller with no power might have a tripped main or a downed line on the street. LobbyStack asks whether the neighbors have power, points grid outages to the utility, and books a visit for problems on the house side.",
        points: [],
      },
    ],
    faqs: electricianFaqs,
    faqHeading: "Questions about electrician answering services",
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
    ctaHeading: "Book the next panel upgrade while you're on a job",
    ctaBody:
      "Write your hazard script and estimate questions on the Free plan, then forward your line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-garage-door-repair",
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "AI Receptionist for Garage Door Companies, 24/7 | LobbyStack",
    description:
      "An AI receptionist for garage door companies that books broken-spring repairs into your calendar and sends doors stuck open at night to your on-call tech.",
    eyebrow: "Garage door repair",
    h1: "AI receptionist for garage door companies that books the broken spring",
    intro:
      "A homeowner hears a bang with the car stuck inside, and they'll book whichever company picks up. LobbyStack tells them not to lift the door, takes the address and door size, and books your first open slot. A door that won't close at night rings your on-call tech.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "A broken-spring call booked by LobbyStack into a garage door company's first open slot",
    proofPoints: [
      "Books same-day repairs into your Google Calendar",
      "Reads your safety guidance for broken springs and cables",
      "Transfers doors stuck open at night to your on-call tech",
    ],
    sections: [
      {
        title: "Books new-door quotes and opener repairs",
        body: "LobbyStack asks for the door size, style, and opener brand, offers your open slots, and books the visit. The caller gets a confirmation text if they agree.",
        points: [],
      },
      {
        title: "Walks callers through the fixes you approve",
        body: "For a dead remote or an opener that won't respond, LobbyStack reads the reset steps you write. If they don't work, it books a visit.",
        points: [],
      },
    ],
    faqs: garageDoorFaqs,
    faqHeading: "Questions about AI receptionists for garage door companies",
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
    ctaHeading: "Book the next broken spring while you're on a ladder",
    ctaBody:
      "Add your safety guidance and open hours on the Free plan, place a test call, then forward your line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-appliance-repair",
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "AI Receptionist for Appliance Repair Companies | LobbyStack",
    description:
      "An AI receptionist for appliance repair. LobbyStack takes the brand, model, and symptoms, quotes your diagnostic fee, and books the visit during the call.",
    eyebrow: "Appliance repair",
    h1: "AI receptionist for appliance repair that books the visit with the model number",
    intro:
      "Your tech needs the brand, model, and symptoms before the visit. LobbyStack asks for them, checks that you service the brand, quotes your diagnostic fee, and books the slot while you're on another repair.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "A refrigerator repair call booked by LobbyStack with the brand and model attached",
    proofPoints: [
      "Asks for the appliance, brand, model, and symptoms",
      "Quotes the diagnostic fee you set",
      "Books visits into your Google Calendar during the call",
    ],
    sections: [
      {
        title: "Books the repair while the caller is on the phone",
        body: "LobbyStack asks for the appliance, brand, model, and symptoms, then books a slot in Google Calendar. Your tech can read the answers in the call summary before the visit.",
        points: [],
      },
      {
        title: "Answers the brand and fee questions",
        body: "Callers ask whether you fix their brand and what the diagnostic costs. LobbyStack answers from the brands and fees you enter.",
        points: [],
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
    ctaHeading: "Book tomorrow's repairs while you're on today's",
    ctaBody:
      "Add your brands and diagnostic fee on the Free plan, place a test call, then forward your line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-restoration-companies",
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "AI Receptionist for Restoration Companies, 24/7 | LobbyStack",
    description:
      "An AI receptionist for restoration companies that sends active flooding to your on-call crew, saves claim details, and books mold inspections.",
    eyebrow: "Restoration",
    h1: "AI receptionist for restoration companies that gets the 1 a.m. flood call to your crew",
    intro:
      "Storm water is coming into a basement, and the family is upstairs. LobbyStack reads your safety script, asks where the water is coming from and whether they'll file a claim, and rings your on-call crew. It books old stains and mold checks into a daytime slot.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "A basement flooding call transferred by LobbyStack to a restoration company's on-call crew",
    proofPoints: [
      "Transfers active flooding, sewage, and fire damage to your on-call crew",
      "Saves the water source, depth, and insurance details with each call",
      "Books mold inspections and moisture checks into your calendar",
    ],
    sections: [
      {
        title: "Books mold checks for business hours",
        body: "A caller with an old stain or a musty smell can wait for business hours. LobbyStack asks about recent water events and books the inspection into your Google Calendar.",
        points: [],
      },
      {
        title: "Keeps the insurance details with the call",
        body: "LobbyStack asks for the carrier and claim number when there is one and answers billing questions from the details you enter. Adjuster calls become messages with the claim number attached.",
        points: [],
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
    ctaHeading: "Get the next flood call to your crew",
    ctaBody:
      "Write your emergency rule and safety script on the Free plan, test a flood call, then forward your after-hours line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "ai-receptionist-for-locksmiths",
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Locksmith Answering Service with AI, 24/7 | LobbyStack",
    description:
      "An AI locksmith answering service. LobbyStack quotes your lockout fee, takes the car and location, and transfers lockouts to your on-call locksmith.",
    eyebrow: "Locksmiths",
    h1: "Locksmith answering service that quotes your lockout fee and puts the caller through",
    intro:
      "A driver is stuck in a parking lot at 11 p.m. with the keys inside. LobbyStack checks that nobody is locked in, takes the car and the location, quotes your after-hours fee, and rings your on-call locksmith. It books rekeys and key fobs for the daytime.",
    image: "/illustrations/missed-calls.webp",
    imageAlt:
      "A car lockout call transferred by LobbyStack to a locksmith's on-call tech",
    proofPoints: [
      "Quotes your lockout fee before it transfers",
      "Transfers home and car lockouts to your on-call locksmith",
      "Books rekeys, key fobs, and lock installs",
    ],
    sections: [
      {
        title: "Books the jobs that can wait until morning",
        body: "LobbyStack asks for the make, model, and year for car keys, or the number of doors for an install, then books a daytime visit into your Google Calendar.",
        points: [],
      },
      {
        title: "Quotes the prices you set",
        body: "Callers ask what a lockout or a rekey costs before anything else. LobbyStack quotes the prices you list and tells callers what ID to have ready.",
        points: [],
      },
    ],
    faqs: locksmithFaqs,
    faqHeading: "Questions about locksmith answering services",
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
    ctaHeading: "Send tonight's lockouts to your on-call locksmith",
    ctaBody:
      "Add your lockout fee and ID rules on the Free plan, test a lockout call, then forward your line.",
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
      "An after-hours contractor answering service that matches callers to their project, transfers job-site emergencies, and books consultations.",
    eyebrow: "Contractor after-hours",
    h1: "Contractor answering service that covers your line after the crew goes home",
    intro:
      "A client in the middle of a remodel calls at 9 p.m. about water in the kitchen. LobbyStack has them shut off the main, asks which project it is, and rings your on-call manager. When a new lead calls, it books a consultation.",
    image: "/illustrations/calls-need-person.webp",
    imageAlt:
      "A job-site leak call transferred by LobbyStack to a contractor's on-call project manager",
    proofPoints: [
      "Matches current clients to their project",
      "Transfers job-site emergencies to your on-call manager",
      "Books consultations for new work into your calendar",
    ],
    sections: [
      {
        title: "Asks new leads about scope and budget, then books",
        body: "A new lead calling at 9 p.m. gets the questions you'd ask about scope, budget, and timeline. LobbyStack books the consultation into your Google Calendar before they call the next contractor.",
        points: [],
      },
      {
        title: "Saves client questions for the morning",
        body: "Schedule questions from current clients and calls from subs and suppliers become messages with who called and what they need. Your project managers read them in the morning instead of at dinner.",
        points: [],
      },
    ],
    faqs: contractorFaqs,
    faqHeading: "Questions about contractor answering services",
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
      {
        label: "Compare answering services for contractors",
        href: "/blog/best-answering-services-for-contractors/",
      },
      { label: "Pricing", href: "/pricing/" },
    ],
    ctaHeading: "Cover your after-hours line this weekend",
    ctaBody:
      "Write your job-site emergency rule on the Free plan, test a call from a client and one from a new lead, then forward your line.",
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
      "An AI property management answering service that sends after-hours leaks and lockouts to your on-call tech, logs routine repairs, and books showings.",
    eyebrow: "Property management",
    h1: "Property management answering service that sorts 2 a.m. emergencies from routine repairs",
    intro:
      "Tenants call at 2 a.m. about a leak, a lockout, or no heat. Prospects call at lunch about pets and parking. LobbyStack sends the emergencies on your list to your on-call maintenance tech, logs the rest for the morning, and books showings for your leasing agent.",
    image: "/illustrations/business-knowledge.webp",
    imageAlt:
      "A tenant's leak call transferred by LobbyStack to a property manager's on-call maintenance tech",
    proofPoints: [
      "Transfers the emergencies on your list to on-call maintenance",
      "Logs routine repair requests for the morning",
      "Answers leasing questions and books showings",
    ],
    sections: [
      {
        title: "Books showings for your leasing agent",
        body: "When a prospect wants to see a unit, LobbyStack books the showing into your leasing agent's Google Calendar and texts a confirmation if they agree.",
        points: [],
      },
      {
        title: "Answers leasing and rent questions",
        body: "Add rent, deposits, pet policy, parking, and open units. LobbyStack answers from those details, so a tenant asking when rent is due at 11 p.m. doesn't wake your maintenance tech.",
        points: [],
      },
    ],
    faqs: propertyManagementFaqs,
    faqHeading: "Questions about property management answering services",
    relatedLinks: [
      {
        label: "Compare property management answering services",
        href: "/blog/best-property-management-answering-services/",
      },
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
    ctaHeading: "Keep your on-call phone for real emergencies",
    ctaBody:
      "Load your emergency list on the Free plan, test a leak call and a showing request, then forward your after-hours line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "roofing-answering-service",
    path: "/solutions/roofing-answering-service/",
    title: "Roofing Answering Service with AI | LobbyStack",
    description:
      "An AI roofing answering service that books storm inspections before the adjuster visit, answers insurance questions, and transfers active leaks.",
    eyebrow: "Roofing",
    h1: "Roofing answering service that books storm inspections before the adjuster comes",
    intro:
      "The morning after a hailstorm, your phone rings faster than your crew can climb ladders. LobbyStack checks each caller for a leak, asks for the roof's age and claim status, and books the inspection into Google Calendar. Active leaks ring your on-call crew.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "A hail damage call booked by LobbyStack into a roofer's next open inspection slot",
    proofPoints: [
      "Books storm inspections into your Google Calendar",
      "Answers insurance and adjuster questions from your script",
      "Transfers active leaks to your on-call crew",
    ],
    sections: [
      {
        title: "Books the inspections after a storm",
        body: "Hail and wind bring weeks of calls in a few days. LobbyStack takes the address, the roof's age, and the damage the homeowner sees, then books the next open inspection.",
        points: [],
      },
      {
        title: "Gives each caller the insurance answers you wrote",
        body: "Write your answers about adjusters, insurers, and inspection fees once. LobbyStack gives them on each call and takes a message for anything outside your script.",
        points: [],
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
    ctaHeading: "Set up your storm calls before the next hail",
    ctaBody:
      "Write your leak rule and insurance answers on the Free plan, test an inspection call, then forward your overflow line.",
    ctaPrimaryLabel: "Try for free",
    ctaSecondaryLabel: "View pricing",
  },

  {
    group: "solution",
    slug: "open-source-ai-receptionist",
    path: "/solutions/open-source-ai-receptionist/",
    title: "Open-Source AI Receptionist, MIT Licensed | LobbyStack",
    description:
      "LobbyStack is an open-source AI receptionist under the MIT License. Read how it handles a call, change it, and host it yourself or on LobbyStack Cloud.",
    eyebrow: "Open source",
    h1: "An open-source AI receptionist you can audit, change and host yourself",
    intro:
      "Before an AI answers your phone, you'll want to know what it tells callers and where their recordings go. LobbyStack answers calls, books appointments and transfers callers to your team, and its full code is on GitHub under the MIT License for you to check.",
    image: "/illustrations/trust-controls.webp",
    imageAlt:
      "The LobbyStack repository on GitHub under the MIT License",
    proofPoints: [
      "Full TypeScript source on GitHub",
      "Host it yourself or on LobbyStack Cloud",
      "Self-hosted calls use your Twilio and OpenAI accounts",
    ],
    sections: [
      {
        title: "Read how it handles a call",
        body: "The receptionist's instructions and tools sit in packages/agent-core. Open them on GitHub to see how it finds openings, books an appointment, takes a message and decides to transfer a caller.",
        points: [
          "Which caller details it saves",
          "Where recordings and transcripts are stored",
          "Every change, in the public Git history",
        ],
      },
      {
        title: "Change the prompts and rules",
        body: "Fork the repository and edit the greeting, the intake questions or the transfer rules. The MIT License lets you keep your changes private or share them.",
        points: [
          "Add a tool that reaches your own software",
          "Deploy your fork once it passes your tests",
        ],
      },
      {
        title: "Run it on your own server",
        body: "The Docker Compose setup runs the dashboard, the worker, PostgreSQL and Redis on one machine. Calls go through your own Twilio and OpenAI accounts, and recordings, transcripts and contacts stay on your server.",
        points: [
          "Docker Compose on one server, or the Railway template",
          "Starts at 2 vCPU and 4 GB of RAM",
          "You choose when to upgrade",
        ],
      },
      {
        title: "Or let LobbyStack host it",
        body: "LobbyStack Cloud runs the same open-source code for you, with voice minutes in each plan. Start on the free plan and test the receptionist in your browser before you forward a number.",
        points: [
          "Free plan with 30 voice minutes and a 14-day trial number",
          "Hosting, updates and backups handled for you",
          "Starter at $30 a month with 150 minutes",
        ],
      },
    ],
    faqs: openSourceReceptionistFaqs,
    faqHeading: "Questions about open-source AI receptionists",
    relatedLinks: [
      {
        label: "Self-hosted AI receptionist",
        href: "/solutions/self-hosted-ai-receptionist/",
      },
      { label: "How the open-source stack fits together", href: "/blog/open-source-ai-receptionist-stack/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      { label: "Pricing", href: "/pricing/" },
      { label: "White Label", href: "/white-label/" },
    ],
    ctaHeading: "Read the code, then pick where it runs",
    ctaBody:
      "Start with the repository on GitHub. Host LobbyStack on your own server, or try it free on LobbyStack Cloud.",
    ctaPrimaryLabel: "View the code on GitHub",
    ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
    ctaSecondaryLabel: "Read the self-hosting guide",
    ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
  },
]

export const seoLandingPages = [...companyPages, ...solutionPages]

export const seoLandingPageByPath = (path: string) => {
  const normalized = path.endsWith("/") ? path : `${path}/`
  return seoLandingPages.find((page) => page.path === normalized)
}

// markdownResponse writes the front matter, so the body starts at the heading.
export const landingPageMarkdown = (page: SeoLandingPage) => `# ${page.h1}

${page.intro}

## Highlights

${page.proofPoints.map((point) => `- ${point}`).join("\n")}

${tradeMarkdownBeforeSections(page.slug)}${page.sections
  .map((section) =>
    [`## ${section.title}`, section.body, section.points.map((point) => `- ${point}`).join("\n")]
      .filter(Boolean)
      .join("\n\n")
  )
  .join("\n\n")}${tradeMarkdownAfterSections(page.slug, page.faqs, page.faqHeading)}

## Related Resources

${page.relatedLinks
  .map((link) => `- [${link.label}](${absoluteUrl(link.href)})`)
  .join("\n")}
`
