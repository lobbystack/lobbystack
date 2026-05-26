import type { FaqItem } from "@/lib/seo"

export const vsVirtualReceptionistFaqs: FaqItem[] = [
  {
    question: "What is the primary difference between an AI receptionist and a virtual receptionist?",
    answer:
      "The primary differences lie in technology, concurrency, and cost structure. An AI receptionist uses conversational artificial intelligence to answer calls instantly, engage in natural back-and-forth conversations, capture structured lead information, and book appointments directly into your CRM. A virtual receptionist is a human operator working remotely (often in a centralized call center) who reads from a static script to take messages. While humans provide natural empathy, they can only handle one call at a time. AI handles unlimited concurrent calls simultaneously, meaning your callers never experience busy signals, hold times, or unanswered rings.",
  },
  {
    question: "How do the cost models compare between AI and human answering services?",
    answer:
      "Human virtual receptionist services typically charge by the minute or require expensive tier-based monthly commitments. This means your bill can scale rapidly with your call volume, spam calls, and after-hours coverage. In contrast, LobbyStack charges a predictable monthly subscription fee with included voice minutes and overage rates that scale gradually. For businesses with frequent calls, an AI receptionist often creates more predictable budgeting than a human answering service.",
  },
  {
    question: "Can an AI receptionist handle complex scheduling rules?",
    answer:
      "Yes. LobbyStack integrates directly with major calendar systems (Google Calendar, Outlook, and scheduling platforms) and respects your specific business rules. You can configure the AI to book different appointment types (e.g., HVAC service calls vs. routine quotes), respect buffer times between appointments, enforce service area restrictions, and restrict bookings to certain hours. If an appointment requests a highly custom slot or requires manual coordination, the AI is trained to smoothly gather the caller's preferences, take a message, and tell them your team will call to confirm, avoiding booking conflicts.",
  },
  {
    question: "How does human handoff work if a call gets too complex for the AI?",
    answer:
      "LobbyStack is built with safe, context-rich transfers at its core. If a caller asks a highly technical question, presents an emergency that requires immediate human attention, or expresses frustration, the AI receptionist will automatically initiate a warm transfer to your team. Before the call connects, or immediately after, your team receives a structured notification with the caller's name, phone number, a detailed summary of what they've discussed so far, and the live transcript. This ensures you only handle high-value conversations and never lose the context of the call.",
  },
  {
    question: "Does an AI receptionist sound robotic or unnatural to business callers?",
    answer:
      "Not anymore. LobbyStack leverages modern text-to-speech and low-latency voice models that deliver natural voice characteristics, complete with pacing and inflection. The system is designed to keep conversation responsive and avoid awkward pauses. While callers will recognize the efficiency of an automated assistant if they ask, routine service inquiries, bookings, and intake calls can be handled with a professional tone and minimal friction.",
  },
  {
    question: "What is the typical setup time for an AI receptionist vs. a virtual receptionist service?",
    answer:
      "Setting up a virtual receptionist service can take days or weeks. It often requires drafting scripting documents, submitting them to the provider, waiting for their team to configure internal software, and training human operators. With LobbyStack, setup is self-serve: add your business details, sync your calendar, connect your phone number (or use one of our dedicated numbers), and your AI receptionist can begin answering with the business context you provide.",
  },
  {
    question: "Can LobbyStack block spam and robocalls to save my minutes?",
    answer:
      "Yes, absolutely. Human virtual receptionist services often charge you for every single second they spend answering spam calls, telemarketers, and wrong numbers. LobbyStack has smart spam filtering and automated screening built in. It identifies robocalls, dialer spam, and persistent unsolicited telemarketers, terminating the call before it counts against your voice minutes, saving you significant operational budget.",
  },
  {
    question: "Is LobbyStack compliant with privacy regulations like HIPAA?",
    answer:
      "LobbyStack is designed with enterprise-grade data security. Because we are an open-source platform, businesses in highly regulated fields (such as dental practices, medical clinics, and legal offices) have the unique option to self-host their deployment. This allows you to run LobbyStack entirely on your own private infrastructure, keeping 100% control over call recordings, transcriptions, patient details, and metadata, ensuring absolute compliance with HIPAA, GDPR, or specific local privacy mandates.",
  },
  {
    question: "Do callers prefer speaking with an AI or a virtual receptionist?",
    answer:
      "Callers prefer getting their problems solved immediately. While a friendly human virtual receptionist is pleasant, callers quickly become frustrated if that human cannot answer basic questions, cannot book an appointment directly, or has to place them on hold. Because LobbyStack has instant access to your business knowledge base, calendar availability, and service boundaries, it can actually solve the caller's problem, complete a booking, and send a confirmation text within a single 2-minute call, delivering a highly satisfying, friction-free experience.",
  },
]

export const vsVoicemailFaqs: FaqItem[] = [
  {
    question: "How does voicemail cost a business revenue compared to an AI receptionist?",
    answer:
      "Voicemail is a passive 'record-and-wait' system. Many small business callers who reach voicemail hang up without leaving a useful message, especially when they have an urgent need or found the business through local search. In service industries like plumbing, locksmithing, and HVAC, callers are often facing an immediate problem and will click the next listing in Google Business Profile or search results until someone answers. An AI receptionist improves capture by answering on the first ring, holding an active conversation, qualifying urgency, and booking directly into your calendar.",
  },
  {
    question: "Can an AI receptionist replace voicemail entirely for after-hours calls?",
    answer:
      "Yes, and for most businesses, after-hours is where the transition yields the highest ROI. Instead of callers leaving a message at 9:00 PM and waiting for you to follow up at 8:00 AM the next morning (by which time they may have already booked a competitor), LobbyStack answers, registers their issue, books their service call for the morning, and sends them an automated confirmation text. Your schedule is filled before you even open your laptop.",
  },
  {
    question: "What happens if a caller just wants to leave a brief message?",
    answer:
      "LobbyStack handles message-taking cleanly. If a caller chooses not to book an appointment or has a non-standard request, the AI receptionist acts as an organized message taker. It captures their name, verified phone number, best callback time, and a structured description of their request. It then transcribes the message and sends a notification to your team via email or SMS, presenting a clean dashboard entry with the full transcript and audio recording.",
  },
  {
    question: "Is an AI receptionist difficult for older callers to use?",
    answer:
      "Not at all. LobbyStack is designed to be conversational and completely natural. It does not force callers to navigate complex, frustrating press-button phone trees ('Press 1 for service, press 2 for billing...'). Instead, the AI greets the caller with a natural, professional voice and asks, 'How can I help you today?' Callers speak exactly as they would to a human receptionist, and the AI interprets their intent, answers their questions, and guides them through booking or message-taking effortlessly.",
  },
  {
    question: "How does the ROI of an AI receptionist compare to the cost of a free voicemail?",
    answer:
      "While voicemail is technically free, its opportunity cost can be high. If your average job value is $250, and voicemail causes just two callers a month to hang up and call a competitor, you are losing $500 in monthly revenue. LobbyStack starts with a free tier and offers premium plans that can cost less than a single lost job. Capturing even one additional caller per month can make the platform easy to justify.",
  },
  {
    question: "Can I use both voicemail and an AI receptionist together?",
    answer:
      "Yes. You do not have to fully decommission your voicemail. You can configure LobbyStack to handle specific types of calls (such as service bookings, emergency screening, and after-hours coverage) while routing other paths (like direct team-member extensions or known personal callers) to a standard voicemail inbox. LobbyStack integrates flexibly with your existing business phone setup.",
  },
  {
    question: "How does LobbyStack prevent fake or spam bookings from cluttering my calendar?",
    answer:
      "LobbyStack includes strict verification and qualification steps. Before booking an appointment, the AI receptionist qualifies the lead by verifying their location (to ensure they are within your service area), confirming their contact details, and validating their intent. We can also configure a double-opt-in confirmation code via SMS to ensure the caller is using a valid, reachable mobile number before the appointment is finalized on your schedule.",
  },
  {
    question: "How do I know what happened on a call without listening to the entire recording?",
    answer:
      "LobbyStack saves you hours of review time by automatically generating highly accurate, bulleted call summaries. Immediately after a call ends, you receive a notification with a 2-sentence overview, list of key actions (like a booked appointment or urgent transfer), and structured caller details. You can view the full transcript in seconds if you need specific details, or listen to the high-quality recording directly from your dashboard.",
  },
  {
    question: "Does LobbyStack work on weekends and holidays?",
    answer:
      "Yes, 100%. LobbyStack operates 24 hours a day, 7 days a week, 365 days a year with zero downtime. It never calls in sick, never takes a holiday, and can handle dozens of calls at the exact same moment on Christmas Eve just as easily as a quiet Tuesday morning, giving you complete peace of mind that your business is always open.",
  },
]
