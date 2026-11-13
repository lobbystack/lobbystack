import type { FeaturePagesCopy } from "./types"

export const featurePagesEn: FeaturePagesCopy = {
  rules: {
    seo: {
      title: "AI Receptionist Rules and Quotes in Plain English | LobbyStack",
      description:
        "Train your AI receptionist in plain English. Tell LobbyStack what to ask, which prices to quote and when to transfer, and it follows your rules on every call.",
    },
    name: "Rules and quotes",
    hero: {
      title: "Train your receptionist in plain English",
      intro:
        "Tell LobbyStack what to ask, what to quote and when to hand off, the way you'd brief a new hire. It follows your rules on every call.",
    },
    facts: [
      "Rules written in your own words",
      "Fixed, starting and range prices",
      "You set which rule wins",
      "Speaks 70+ languages",
    ],
    benefits: {
      title: "Your way of doing business, on every call",
      items: [
        {
          title: "Write it the way you'd say it",
          body: "“If a caller says it's an emergency, transfer them to me.” That sentence is a finished rule. Type it, save it, and your receptionist follows it.",
        },
        {
          title: "Quote your real prices",
          body: "Give each service a fixed price, a starting price or a range. Your receptionist quotes what you entered and never makes up a number.",
        },
        {
          title: "Decide what happens when it's unsure",
          body: "Tell it to take a message, promise a callback or transfer the call. Your receptionist follows your fallback instead of guessing.",
        },
      ],
    },
    example: {
      eyebrow: "A real rule",
      title: "One sentence replaces a whole call tree",
      body: "Rules run in the order you set, so the ones that matter most win. Drag a rule to the top and it takes priority.",
      mock: {
        kind: "text",
        text: "If a caller asks what a water heater install costs, give our range of $1,800 to $3,200, ask for their address, and book an on-site estimate.",
      },
    },
    steps: {
      title: "Set up in one sitting",
      items: [
        {
          title: "Add your services and prices",
          body: "List what you sell, how long each job takes and what it costs.",
        },
        {
          title: "Write your rules",
          body: "One instruction per rule, in your own words. Templates cover transfers, callbacks, after-hours calls and pricing questions.",
        },
        {
          title: "Call it and listen",
          body: "Test from your browser, then change a rule the day your process changes.",
        },
      ],
    },
    faqTitle: "Questions about rules and quotes",
    faqs: [
      {
        question: "Do I need to build a call flow?",
        answer:
          "No. You write instructions in plain language and your receptionist follows them. LobbyStack has no flowchart builder.",
      },
      {
        question: "What if a caller asks something my rules don't cover?",
        answer:
          "Your receptionist answers from your business knowledge. When it can't, it follows the fallback you wrote: take a message or transfer the call.",
      },
      {
        question: "Can it quote prices?",
        answer:
          "Yes. Each service takes a fixed price, a starting price or a range, and your receptionist quotes what you entered. With no price set, it doesn't guess one.",
      },
      {
        question: "Can each agent have its own rules?",
        answer:
          "Yes. Each agent keeps its own rules, so an after-hours agent can act differently from your daytime one.",
      },
    ],
    closing: {
      titleLines: ["Brief it once.", "It handles every call."],
      body: "Write your first rule and hear it on a test call today.",
    },
  },
  "call-transfers": {
    seo: {
      title: "AI Receptionist Call Transfers to Your Team | LobbyStack",
      description:
        "LobbyStack answers every call, handles the routine ones and transfers urgent callers to your phone. Set transfer rules in plain language and stop screening calls.",
    },
    name: "Call transfers",
    hero: {
      title: "The calls that need you reach you. LobbyStack handles the rest.",
      intro:
        "LobbyStack answers first, handles the routine calls and transfers the urgent ones to your phone.",
    },
    facts: [
      "Transfer rules in plain language",
      "A transfer number for each employee",
      "Message taken when nobody picks up",
      "Your team can answer first",
    ],
    benefits: {
      title: "Stop screening your own calls",
      items: [
        {
          title: "Urgent calls ring your phone",
          body: "Write the rule once: a burst pipe, no heat, a caller asking for the owner. LobbyStack transfers those calls to the number you set.",
        },
        {
          title: "Callers reach the right person",
          body: "Give each employee a phone number. A caller who asks for Alex gets Alex.",
        },
        {
          title: "A missed transfer still gets captured",
          body: "When the transfer can't go through, your receptionist tells the caller, takes the message and alerts your team.",
        },
      ],
    },
    example: {
      eyebrow: "Staff answers first",
      title: "Pick up when you can. LobbyStack catches the rest.",
      body: "Your phone rings for the time you choose, and you press 1 to take the call. If nobody does, your receptionist answers, so no caller lands in voicemail.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Burst pipe", value: "Transferred to Alex" },
          { label: "Price question", value: "Answered" },
          { label: "Roof estimate", value: "Booked Thursday 9:00 AM" },
          { label: "Asked for the owner", value: "Message taken" },
        ],
      },
    },
    steps: {
      title: "Three steps to a quieter phone",
      items: [
        {
          title: "Set your transfer number",
          body: "Pick the phone that rings when a caller needs a person.",
        },
        {
          title: "Say which calls to transfer",
          body: "Write the rule in a sentence: who gets transferred, and when.",
        },
        {
          title: "Take the calls worth taking",
          body: "LobbyStack answers and books the routine calls without you.",
        },
      ],
    },
    faqTitle: "Questions about call transfers",
    faqs: [
      {
        question: "Which calls get transferred?",
        answer:
          "The ones your rules name, such as emergencies or callers who ask for a person. A caller who asks for an employee with a phone number goes to that employee.",
      },
      {
        question: "What happens if nobody answers the transfer?",
        answer:
          "Your receptionist tells the caller, offers to take a message and alerts your team, so the call still ends with a next step.",
      },
      {
        question: "Can my team answer before the AI does?",
        answer:
          "Yes, on Starter and Pro. Staff answers first rings your phone for 10 to 60 seconds. Press 1 to take the call, or let your receptionist answer.",
      },
      {
        question: "How many transfers do I get?",
        answer: "Starter includes 20 transfer attempts a month and Pro includes 100.",
      },
      {
        question: "Which countries can a transfer reach?",
        answer:
          "The United States, Canada, Puerto Rico, the United Kingdom, France, Germany, Spain, Italy, the Netherlands, Portugal, Mexico, Brazil, Israel, India, Japan, Australia, New Zealand and Serbia.",
      },
    ],
    closing: {
      titleLines: ["Take the calls that pay.", "Hand off the rest."],
      body: "Set your transfer number and let LobbyStack screen every call.",
    },
  },
  inbox: {
    seo: {
      title: "AI Receptionist Call Transcripts and Recordings | LobbyStack",
      description:
        "Every call LobbyStack answers lands in your Inbox with its outcome, a full transcript and the recording. See who called and what happens next in seconds.",
    },
    name: "Inbox",
    hero: {
      title: "Every call, written up before you ask",
      intro:
        "Each call lands in your Inbox with its outcome, transcript and recording. You know who called and what happens next without playing a voicemail.",
    },
    facts: [
      "A transcript of every call",
      "Recordings you can replay",
      "Follow-up tasks on each call",
      "Search across calls and contacts",
    ],
    benefits: {
      title: "Know what happened on every call",
      items: [
        {
          title: "Read a call in ten seconds",
          body: "The outcome sits at the top: appointment booked, message taken, transfer completed. Open the transcript when you want the detail.",
        },
        {
          title: "Never lose a callback",
          body: "When a caller leaves a message or asks for a callback, the task shows on the call. Mark it done once your team has followed up.",
        },
        {
          title: "Approve changes in a click",
          body: "A caller wants to cancel or move an appointment. Approve it from the Inbox, or offer another time.",
        },
      ],
    },
    example: {
      eyebrow: "One list",
      title: "Calls and texts in the same place",
      body: "Texts sent to your business number wait in the Inbox beside your calls, and you reply from the thread.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Sarah M. · Phone", value: "Appointment booked" },
          { label: "(555) 010-2244 · Phone", value: "Message taken" },
          { label: "Alex R. · SMS", value: "New text" },
          { label: "Dana K. · Phone", value: "Transferred" },
        ],
      },
    },
    steps: {
      title: "From ring to follow-up",
      items: [
        {
          title: "LobbyStack takes the call",
          body: "It answers, books or takes a message, by your rules.",
        },
        {
          title: "The call lands in your Inbox",
          body: "You get the outcome and the transcript, then the recording once the audio is processed.",
        },
        {
          title: "Your team follows up",
          body: "Call back, approve the request or mark the task done.",
        },
      ],
    },
    faqTitle: "Questions about the Inbox",
    faqs: [
      {
        question: "Does LobbyStack record calls?",
        answer:
          "LobbyStack saves a transcript of each call and can store the recording. Play it from the call's Recording tab.",
      },
      {
        question: "Can I search old calls?",
        answer: "Yes. Search covers contacts, calls and messages. Press Cmd+K, or Ctrl+K on Windows, in the dashboard.",
      },
      {
        question: "Do I have to open the Inbox to know someone called?",
        answer:
          "No. LobbyStack emails you each answered call with the caller, the time, the length and the summary. Paid plans add SMS notifications.",
      },
      {
        question: "Does the AI answer texts?",
        answer: "No. Texts sent to your business number wait in the Inbox for your team to answer.",
      },
    ],
    closing: {
      titleLines: ["Your calls, already written up."],
      body: "Start free and read your first call transcript today.",
    },
  },
  "sms-notifications": {
    seo: {
      title: "SMS Appointment Confirmations and Reminders | LobbyStack",
      description:
        "LobbyStack texts customers a confirmation when they book and a reminder 24 hours before, and alerts your team by SMS when a caller needs a callback.",
    },
    name: "SMS notifications",
    hero: {
      title: "Fewer no-shows and faster follow-ups",
      intro:
        "LobbyStack texts your customers a confirmation the moment they book and a reminder 24 hours before. It texts your team when a caller needs a callback.",
    },
    facts: [
      "Confirmation text at booking",
      "Reminder 24 hours before",
      "Team alerts by text or email",
      "No number to register",
    ],
    benefits: {
      title: "Texts that go out without you",
      items: [
        {
          title: "Customers show up",
          body: "Every booked caller who agrees gets a confirmation and a reminder the day before. Your receptionist asks permission on the call.",
        },
        {
          title: "Your team hears about it now",
          body: "A message that needs a callback, a failed transfer, a new text from a customer. LobbyStack alerts the people who can act on it.",
        },
        {
          title: "Compliant from the first text",
          body: "LobbyStack asks each customer for consent, honors STOP and HELP, and sends from a verified toll-free number. You register nothing.",
        },
      ],
    },
    example: {
      eyebrow: "What customers get",
      title: "Texts with your name on them",
      body: "Each appointment text opens with your business name, so customers know who is writing.",
      mock: {
        kind: "messages",
        messages: [
          "Northside Plumbing: Your water heater estimate is confirmed for May 24 at 2:00 PM.",
          "Northside Plumbing: Reminder, your water heater estimate is tomorrow at 2:00 PM.",
        ],
      },
    },
    steps: {
      title: "How the texts go out",
      items: [
        {
          title: "A caller books",
          body: "Your receptionist asks if it can text the confirmation.",
        },
        {
          title: "LobbyStack sends the texts",
          body: "The confirmation goes out right away and the reminder 24 hours before the appointment.",
        },
        {
          title: "Your team gets its alerts",
          body: "Choose email, SMS or both for each kind of alert.",
        },
      ],
    },
    faqTitle: "Questions about SMS notifications",
    faqs: [
      {
        question: "Do I need to register a number for texting?",
        answer:
          "No. On LobbyStack cloud, texts go out from a toll-free number that LobbyStack owns and has verified. A self-hosted deployment sends from its own Twilio number.",
      },
      {
        question: "Which countries can LobbyStack text?",
        answer: "The United States, Canada and Puerto Rico on LobbyStack cloud.",
      },
      {
        question: "Which plans include SMS?",
        answer:
          "SMS notifications are on Starter and Pro. Starter includes 50 SMS notification segments a month and Pro includes 200.",
      },
      {
        question: "Does the AI reply to texts?",
        answer:
          "No. LobbyStack sends confirmations, reminders and alerts. Texts your customers send wait in the Inbox for your team.",
      },
    ],
    closing: {
      titleLines: ["Booked means booked."],
      body: "Turn on SMS notifications and let LobbyStack send the confirmations.",
    },
  },
  integrations: {
    seo: {
      title: "AI Receptionist Integrations: Calendars, Zapier, Webhooks | LobbyStack",
      description:
        "Connect LobbyStack to Google Calendar, Cal.com or Calendly, and send every call, booking and message to your CRM with Zapier, webhooks or the REST API.",
    },
    name: "Integrations",
    hero: {
      title: "Plug LobbyStack into the tools you already run",
      intro:
        "Connect Google Calendar, Cal.com or Calendly and your receptionist books real openings. Zapier and webhooks push every call, booking and message into your CRM.",
    },
    facts: [
      "Google Calendar, Cal.com and Calendly",
      "Zapier triggers and actions",
      "Signed webhooks with retries",
      "REST API and MCP server",
    ],
    benefits: {
      title: "Your calendar and your CRM, kept current",
      items: [
        {
          title: "Booked on your real calendar",
          body: "LobbyStack reads your busy time and offers only the slots you have. The appointment lands on the calendar you picked.",
        },
        {
          title: "Zapier without code",
          body: "Send new calls to a spreadsheet, create contacts in your CRM or book an appointment from another app, with six triggers and six actions.",
        },
        {
          title: "Webhooks your developers will like",
          body: "Six events, signed with a secret, retried for about 23 hours, and resendable from a delivery log.",
        },
      ],
    },
    example: {
      eyebrow: "Events",
      title: "Every call and booking, sent where you need it",
      body: "Subscribe to the events you care about, and LobbyStack posts each one as it happens.",
      mock: {
        kind: "rows",
        rows: [
          { label: "call.completed", value: "A call ended" },
          { label: "appointment.booked", value: "An appointment was booked" },
          { label: "appointment.rescheduled", value: "An appointment moved" },
          { label: "appointment.cancelled", value: "An appointment was cancelled" },
          { label: "message.taken", value: "A message was taken" },
          { label: "contact.created", value: "A new contact appeared" },
        ],
      },
    },
    steps: {
      title: "Connected in three steps",
      items: [
        {
          title: "Connect your calendar",
          body: "Authorize Google Calendar, Cal.com or Calendly and pick where bookings go.",
        },
        {
          title: "Add Zapier or a webhook",
          body: "Paste your endpoint URL, choose the events and send a test.",
        },
        {
          title: "Watch the data arrive",
          body: "Each call, booking, message and new contact shows up in your tools.",
        },
      ],
    },
    faqTitle: "Questions about integrations",
    faqs: [
      {
        question: "Which calendars does LobbyStack book into?",
        answer:
          "Google Calendar, Cal.com and Calendly. Calendly needs its Standard plan or above, because Calendly blocks bookings from other apps on its Free plan.",
      },
      {
        question: "Does it work with my CRM?",
        answer:
          "Yes, through Zapier or webhooks. LobbyStack sends each call, booking, message and new contact, and your CRM takes it from there.",
      },
      {
        question: "Is there an API?",
        answer:
          "Yes. The REST API reads calls, contacts, appointments and messages, books appointments and manages webhooks. An MCP server connects AI assistants such as Claude and ChatGPT.",
      },
      {
        question: "What happens if my endpoint is down?",
        answer:
          "LobbyStack retries for about 23 hours, then turns the endpoint off and alerts your team. Resend the events you missed from the delivery log.",
      },
    ],
    closing: {
      titleLines: ["Connect it once.", "Every call updates everything."],
      body: "Start free, connect your calendar and take your first booked call.",
    },
  },
}
