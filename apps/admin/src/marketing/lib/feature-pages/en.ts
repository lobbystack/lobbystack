import type { FeaturePagesCopy } from "./types"

export const featurePagesEn: FeaturePagesCopy = {
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
    sections: [
      {
        "title": "Each call lands with the right person",
        "body": "Set one number for the business and one for each employee. Your rules decide who gets which call.",
        "points": [
          "A default transfer number",
          "A number per employee",
          "Rules for who gets what"
        ]
      },
      {
        "title": "Callers reach you even when minutes run out",
        "body": "If your plan's minutes are used up, LobbyStack forwards calls to your transfer number, so nobody hits a dead line.",
        "points": [
          "Calls forward to your team",
          "Forwarded calls use no minutes",
          "Set your own spending cap"
        ]
      }
    ],
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
      {
        "question": "Does a call I answer myself use voice minutes?",
        "answer": "No. With Staff answers first, a call your team takes uses one transfer attempt and no voice minutes."
      },
    ],
    closing: {
      titleLines: ["Take the calls that pay.", "Hand off the rest."],
      body: "Set your transfer number and let LobbyStack screen every call.",
    },
  },
  knowledge: {
    "seo": {
      "title": "AI Receptionist Knowledge Base From Your Website | LobbyStack",
      "description": "Paste your website and upload your files. LobbyStack answers callers with your hours, prices and policies, and lists every question it couldn't answer."
    },
    "name": "Knowledge base",
    "hero": {
      "title": "Paste your website. Your receptionist knows your business.",
      "intro": "LobbyStack reads your site, your documents and your notes, then answers callers with your hours, prices and policies."
    },
    "facts": [
      "Imports your website",
      "PDF, Word, text and Markdown",
      "Up to 8,000 pages on Pro",
      "Lists what it couldn't answer"
    ],
    "benefits": {
      "title": "It answers the way your team would",
      "items": [
        {
          "title": "Learns from your website",
          "body": "Paste a URL and LobbyStack reads your public pages: services, hours, prices and FAQs."
        },
        {
          "title": "Reads your documents",
          "body": "Upload price lists, policies and intake forms as PDF or Word, up to 10 MB each."
        },
        {
          "title": "Tells you what it couldn't answer",
          "body": "Each question it had no answer for lands in a list, most asked first. Write the answer once and it uses it on the next calls."
        }
      ]
    },
    "example": {
      "eyebrow": "Unanswered questions",
      "title": "It gets smarter every week",
      "body": "Answer a question from the list and your receptionist stops missing it.",
      "mock": {
        "kind": "rows",
        "rows": [
          {
            "label": "Do you work on tankless heaters?",
            "value": "Asked 6 times"
          },
          {
            "label": "Is there parking?",
            "value": "Asked 4 times"
          },
          {
            "label": "Do you offer financing?",
            "value": "Asked 3 times"
          }
        ]
      }
    },
    "sections": [
      {
        "title": "The facts callers ask for most",
        "body": "Your receptionist answers from what you gave it and follows your fallback when it has nothing.",
        "points": [
          "Hours, location and parking",
          "Services, prices and policies",
          "Intake requirements and FAQs"
        ]
      },
      {
        "title": "One business, several agents",
        "body": "Share knowledge across every agent, or give one agent knowledge of its own.",
        "points": [
          "Shared business knowledge",
          "Entries for one agent",
          "Edit any entry in the dashboard"
        ]
      }
    ],
    "steps": {
      "title": "Ready in one sitting",
      "items": [
        {
          "title": "Import your website",
          "body": "Paste your homepage and LobbyStack reads the pages callers care about."
        },
        {
          "title": "Add what's missing",
          "body": "Upload documents or type short answers for hours, parking and policies."
        },
        {
          "title": "Answer the gaps",
          "body": "Check the unanswered questions and write each answer once."
        }
      ]
    },
    "faqTitle": "Questions about the knowledge base",
    "faqs": [
      {
        "question": "Which files can I upload?",
        "answer": "PDF, Word (DOCX), text and Markdown files, up to 10 MB each."
      },
      {
        "question": "How much can it hold?",
        "answer": "1 MB of text on Free, 5 MB on Starter and 20 MB on Pro, or about 400, 2,000 and 8,000 pages. The limit counts the extracted text, not the file size."
      },
      {
        "question": "What does it do when it doesn't know?",
        "answer": "It follows the fallback you wrote, such as taking a message, and saves the question under Unanswered Questions."
      },
      {
        "question": "Does it read my whole website?",
        "answer": "It reads public, caller-facing pages. It skips pages behind a login and pages such as checkout, cart, account, privacy and terms."
      },
      {
        "question": "How fast does a new answer apply?",
        "answer": "New calls use it shortly after you save."
      },
      {
        "question": "Can each agent know different things?",
        "answer": "Yes. Knowledge is shared across your agents by default, and you can give one agent entries of its own."
      }
    ],
    "closing": {
      "titleLines": [
        "Paste your website.",
        "Take your first call."
      ],
      "body": "Start free, import your site and call your receptionist from your browser."
    }
  },
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
    sections: [
      {
        "title": "One agent for days, another for nights",
        "body": "Each agent keeps its own rules, so your after-hours line takes messages while your daytime line books.",
        "points": [
          "Rules per agent",
          "Drag to set priority",
          "Templates to start from"
        ]
      },
      {
        "title": "Prices it never has to guess",
        "body": "Give each service a price type and your receptionist quotes it the same way on every call.",
        "points": [
          "Fixed price",
          "Starting price",
          "Price range"
        ]
      }
    ],
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
      {
        "question": "Can it book an estimate instead of quoting?",
        "answer": "Yes. Mark a service as priced in person and your receptionist books the visit without quoting a number."
      },
      {
        "question": "Do my rules work in other languages?",
        "answer": "Yes. Write them in your language and your receptionist follows them in each of the 70+ languages it speaks."
      },
    ],
    closing: {
      titleLines: ["Brief it once.", "It handles every call."],
      body: "Write your first rule and hear it on a test call today.",
    },
  },
  "voices-and-languages": {
    "seo": {
      "title": "AI Receptionist Voices in 70+ Languages | LobbyStack",
      "description": "Pick from 22 natural voices, write your own greeting and let your AI receptionist answer callers in 70+ languages, switching when the caller does."
    },
    "name": "Voices and languages",
    "hero": {
      "title": "Sounds like your business, in 70+ languages",
      "intro": "Pick from 22 voices, write your own greeting, and let your receptionist switch languages the moment a caller does."
    },
    "facts": [
      "22 voices to choose from",
      "Speaks 70+ languages",
      "Your own greeting",
      "Runs on OpenAI GPT-Live"
    ],
    "benefits": {
      "title": "The first impression is yours",
      "items": [
        {
          "title": "Pick the voice callers hear",
          "body": "Play each of the 22 voices in your language, then choose the one that fits your business."
        },
        {
          "title": "Greet callers your way",
          "body": "Write the opening line with your business name and what you can help with."
        },
        {
          "title": "Switch languages mid-call",
          "body": "A caller starts in Spanish or asks for French, and your receptionist answers in that language."
        }
      ]
    },
    "example": {
      "eyebrow": "Your greeting",
      "title": "The first line sets the tone",
      "body": "Keep it short and specific. Change it whenever you like, and new calls use it shortly after you save.",
      "mock": {
        "kind": "text",
        "text": "Thanks for calling Peak HVAC. Are you calling about service, scheduling or an urgent issue?"
      }
    },
    "sections": [
      {
        "title": "One number for every language your customers speak",
        "body": "LobbyStack speaks 70+ languages, Spanish and French included. Your rules and prices stay the same in each one.",
        "points": [
          "Switches when the caller does",
          "Same rules in each language",
          "No language add-on"
        ]
      },
      {
        "title": "A voice for each agent",
        "body": "Run a daytime agent and an after-hours agent, each with its own voice and greeting.",
        "points": [
          "Voice per agent",
          "Greeting per agent",
          "Test calls from your browser"
        ]
      }
    ],
    "steps": {
      "title": "Three steps to your voice",
      "items": [
        {
          "title": "Pick a voice",
          "body": "Play the samples and choose one."
        },
        {
          "title": "Write your greeting",
          "body": "One or two sentences callers hear first."
        },
        {
          "title": "Call it",
          "body": "Run a test call from your browser and listen."
        }
      ]
    },
    "faqTitle": "Questions about voices and languages",
    "faqs": [
      {
        "question": "How many voices are there?",
        "answer": "22, each with its own pitch and pace. You can play every one before you choose."
      },
      {
        "question": "Which languages does it speak?",
        "answer": "70+ languages, including English, French, Spanish and Serbian. It switches when a caller speaks another language or asks for one."
      },
      {
        "question": "Do other languages cost more?",
        "answer": "No. LobbyStack's pricing has no language add-on."
      },
      {
        "question": "Will it sound robotic?",
        "answer": "Call it and judge. The Free plan includes 30 voice minutes, and you can run a test call from your browser."
      },
      {
        "question": "Can I change the voice later?",
        "answer": "Yes. New calls use the new voice shortly after you save, and a call in progress keeps the one it started with."
      },
      {
        "question": "Can each agent have a different voice?",
        "answer": "Yes. Each agent has its own voice and greeting."
      }
    ],
    "closing": {
      "titleLines": [
        "Hear it before your callers do."
      ],
      "body": "Start free and run a test call from your browser."
    }
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
    sections: [
      {
        "title": "Find any call in seconds",
        "body": "Search contacts, calls and messages, or filter the list by channel and by agent.",
        "points": [
          "Search with Cmd+K",
          "Filter by phone or SMS",
          "Filter by agent"
        ]
      },
      {
        "title": "Every caller has a history",
        "body": "LobbyStack builds a contact for each caller, with their calls, texts and appointments in order.",
        "points": [
          "Activity timeline",
          "Appointments and status",
          "Block unwanted callers"
        ]
      }
    ],
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
      {
        "question": "Can my team reply to texts from the Inbox?",
        "answer": "Yes. Open the thread and send your reply. The AI doesn't answer texts, so each one waits for a person."
      },
      {
        "question": "Do calls my team answered show up?",
        "answer": "Yes. They appear as Answered by your team, without a transcript or recording."
      },
    ],
    closing: {
      titleLines: ["Your calls, already written up."],
      body: "Start free and read your first call transcript today.",
    },
  },
  notifications: {
    "seo": {
      "title": "Call Summaries by Email and SMS Notifications | LobbyStack",
      "description": "LobbyStack emails you a summary after each call, texts your team when a caller needs a callback, and texts customers a confirmation and a reminder."
    },
    "name": "Notifications",
    "hero": {
      "title": "Every call, summarized in your inbox",
      "intro": "LobbyStack emails you after each call and texts you when someone needs a callback. Your customers get their confirmation and a reminder by text."
    },
    "facts": [
      "Email summary of every call",
      "SMS alerts for your team",
      "Confirmation text at booking",
      "Reminder 24 hours before"
    ],
    "benefits": {
      "title": "You hear about it without checking",
      "items": [
        {
          "title": "A summary after every call",
          "body": "The caller, the time, the length and what they wanted, emailed with a link to the full call."
        },
        {
          "title": "A text when it's urgent",
          "body": "A message that needs a callback, a failed transfer, a new text from a customer. Pick which ones reach your phone."
        },
        {
          "title": "Customers show up",
          "body": "Every booked caller who agrees gets a confirmation and a reminder the day before. Your receptionist asks permission on the call."
        }
      ]
    },
    "example": {
      "eyebrow": "What customers get",
      "title": "Texts with your name on them",
      "body": "Each appointment text opens with your business name, so customers know who is writing.",
      "mock": {
        "kind": "messages",
        "messages": [
          "Northside Plumbing: Your water heater estimate is confirmed for May 24 at 2:00 PM.",
          "Northside Plumbing: Reminder, your water heater estimate is tomorrow at 2:00 PM."
        ]
      }
    },
    "sections": [
      {
        "title": "You choose what interrupts you",
        "body": "Turn each alert on or off, by email, by SMS or both.",
        "points": [
          "Call answered",
          "Callback needed",
          "Transfer failed"
        ]
      },
      {
        "title": "Compliant from the first text",
        "body": "LobbyStack asks each customer for consent on the call, honors STOP and HELP, and sends from a verified toll-free number.",
        "points": [
          "Consent recorded per number",
          "STOP and HELP handled",
          "No number to register"
        ]
      }
    ],
    "steps": {
      "title": "How it reaches you",
      "items": [
        {
          "title": "LobbyStack takes the call",
          "body": "It answers, books or takes a message, by your rules."
        },
        {
          "title": "You get the summary",
          "body": "An email for each call, and a text for the alerts you picked."
        },
        {
          "title": "Your customer gets a text",
          "body": "The confirmation goes out at booking and the reminder 24 hours before."
        }
      ]
    },
    "faqTitle": "Questions about notifications",
    "faqs": [
      {
        "question": "Can I turn off the email for every call?",
        "answer": "Yes. Uncheck Call answered in your notification settings and keep the alerts that need action."
      },
      {
        "question": "Which plans include SMS?",
        "answer": "SMS notifications are on Starter and Pro. Starter includes 50 SMS notification segments a month and Pro includes 200."
      },
      {
        "question": "Do I need to register a number for texting?",
        "answer": "No. On LobbyStack cloud, texts go out from a toll-free number that LobbyStack owns and has verified. A self-hosted deployment sends from its own Twilio number."
      },
      {
        "question": "Which countries can LobbyStack text?",
        "answer": "The United States, Canada and Puerto Rico on LobbyStack cloud."
      },
      {
        "question": "Do customers have to accept texts to book?",
        "answer": "No. A caller who declines still gets the appointment, without the texts."
      },
      {
        "question": "Does the AI reply to texts?",
        "answer": "No. LobbyStack sends confirmations, reminders and alerts. Texts your customers send wait in the Inbox for your team."
      }
    ],
    "closing": {
      "titleLines": [
        "Stop checking.",
        "Start getting told."
      ],
      "body": "Start free and get your first call summary by email today."
    }
  },
  analytics: {
    "seo": {
      "title": "AI Receptionist Analytics: Booked Value and Time Saved | LobbyStack",
      "description": "See what your AI receptionist earned you: the value of the jobs it booked, the hours it saved, how each call ended and how this week compares with last."
    },
    "name": "Analytics",
    "hero": {
      "title": "See what your receptionist earned you",
      "intro": "LobbyStack shows the value of the jobs it booked, the hours it saved you and how many calls it handled without your team."
    },
    "facts": [
      "Booked value, last 30 days",
      "Time saved on calls",
      "Calls handled without a transfer",
      "Week-over-week trends"
    ],
    "benefits": {
      "title": "Proof that the phone pays",
      "items": [
        {
          "title": "Booked value in dollars",
          "body": "LobbyStack adds up the price of each appointment it booked, so you see what the phone brought in."
        },
        {
          "title": "Hours back in your week",
          "body": "The talk time on calls your receptionist handled, shown in hours and minutes."
        },
        {
          "title": "How each call ended",
          "body": "See how many calls were completed, transferred or missed, and how that moved from last week."
        }
      ]
    },
    "example": {
      "eyebrow": "Your last 30 days",
      "title": "Three numbers on your home page",
      "body": "Open the dashboard and the result is the first thing you see.",
      "mock": {
        "kind": "rows",
        "rows": [
          {
            "label": "Booked value",
            "value": "$4,860"
          },
          {
            "label": "Time saved",
            "value": "11 h 20 min"
          },
          {
            "label": "Calls without transfer",
            "value": "86%"
          }
        ]
      }
    },
    "sections": [
      {
        "title": "Know when to add coverage",
        "body": "Weekly trends show when calls, bookings or call length climb, so you staff for it.",
        "points": [
          "Calls this week against last",
          "Average call length",
          "Appointments booked"
        ]
      },
      {
        "title": "Numbers you can trust",
        "body": "Booked value counts a starting price at its minimum and a price range at its low end, and it leaves out cancelled appointments.",
        "points": [
          "Cancelled appointments excluded",
          "Your team's own calls kept separate",
          "Pick your own dates"
        ]
      }
    ],
    "steps": {
      "title": "Where to look",
      "items": [
        {
          "title": "LobbyStack takes your calls",
          "body": "Each call and booking is counted as it happens."
        },
        {
          "title": "Open Home",
          "body": "Booked value, time saved and calls without transfer for the last 30 days."
        },
        {
          "title": "Open Analytics",
          "body": "Trends, call outcomes and channels for the dates you pick."
        }
      ]
    },
    "faqTitle": "Questions about analytics",
    "faqs": [
      {
        "question": "How is booked value calculated?",
        "answer": "It adds the price of each appointment your receptionist booked in the last 30 days. A fixed price counts in full, a starting price at its minimum and a range at its low end."
      },
      {
        "question": "What counts as time saved?",
        "answer": "The talk time on calls your receptionist handled."
      },
      {
        "question": "Does it count calls my team answered?",
        "answer": "No. Calls your team takes with Staff answers first stay out of the numbers. You'll find them in the Inbox."
      },
      {
        "question": "Which dates can I see?",
        "answer": "Home covers the last 30 days. Analytics covers the dates you pick."
      },
      {
        "question": "Are cancelled appointments counted?",
        "answer": "No. Booked value leaves them out, along with appointments your team booked in the dashboard or through the API."
      }
    ],
    "closing": {
      "titleLines": [
        "Know what the phone brings in."
      ],
      "body": "Start free and watch your first booked call show up."
    }
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
    sections: [
      {
        "title": "Three calendars, real availability",
        "body": "Your receptionist reads your busy time before it offers a slot, and writes the booking back.",
        "points": [
          "Google Calendar",
          "Cal.com",
          "Calendly"
        ]
      },
      {
        "title": "Build on it",
        "body": "The REST API and the MCP server give your developers and your AI assistant the same calls, contacts and bookings.",
        "points": [
          "REST API with API keys",
          "Signed webhooks",
          "MCP server for AI assistants"
        ]
      }
    ],
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
      {
        "question": "Are integrations on every plan?",
        "answer": "Yes. Zapier, webhooks and the MCP server are on every plan."
      },
      {
        "question": "Can it move or cancel an event on my calendar?",
        "answer": "Yes. When you allow appointment changes, LobbyStack updates the event on your calendar."
      },
    ],
    closing: {
      titleLines: ["Connect it once.", "Every call updates everything."],
      body: "Start free, connect your calendar and take your first booked call.",
    },
  },
}
