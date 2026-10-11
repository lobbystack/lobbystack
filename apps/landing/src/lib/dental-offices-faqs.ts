import type { FaqItem } from "@/lib/seo"

export const dentalOfficesFaqs: FaqItem[] = [
  {
    question: "What is a dental AI receptionist?",
    answer:
      "A dental AI receptionist is a voice AI that answers a practice's phone. It books appointments, answers questions about hours and accepted insurance, takes messages, and transfers emergencies to a person. Practices use one for overflow, lunch, and after-hours calls, or to answer every call. Some dental-specific products also write bookings into practice management software. LobbyStack books into Google Calendar instead.",
  },
  {
    question: "How much does an AI receptionist cost for a dental office?",
    answer:
      "LobbyStack costs $30 a month on Starter or $100 a month on Pro, with no setup fee. Starter includes 150 minutes, then $0.20 a minute. Pro includes 500 minutes, then $0.18 a minute, so 1,000 minutes a month on Pro costs $190 ($100 plus 500 extra minutes at $0.18). Calls under 10 seconds and calls the receptionist ends as spam don't count. Dental-specific receptionists that published prices ran from $299 a month per location, billed annually (Dentina), to $1,199 a month (Viva AI) when we checked on October 9, 2026.",
  },
  {
    question: "Is LobbyStack HIPAA compliant?",
    answer:
      "LobbyStack makes no HIPAA claim. For each call, it saves the recording, a transcript, a one-line summary, the caller's number and the name they give, and any appointment it booked. Paid plans keep recordings and transcripts for 90 days and messages for 365 days. Free keeps them for 30 days. Self-hosting keeps LobbyStack's copy of that data on your own servers. Twilio and OpenAI still process the call audio, and LobbyStack copies each recording from OpenAI, so check with your compliance officer before patients call.",
  },
  {
    question: "Can it book directly into Dentrix or Open Dental?",
    answer:
      "Not directly. LobbyStack books into Google Calendar and doesn't connect to Dentrix, Open Dental, Eaglesoft, or other practice management software. Your team copies new bookings into your PMS. Signed webhooks and the REST API can send booking and call data to Zapier or your own tools. If you need bookings written into your PMS, Dentina names 11 systems it writes bookings back to, and Peerlogic names 8 it integrates with (checked October 9, 2026).",
  },
  {
    question: "How does it handle a dental emergency call?",
    answer:
      "LobbyStack asks the triage questions you approve, such as pain level, swelling, trauma, or bleeding, then follows your transfer rule. You choose when it transfers: for urgent calls, when the caller asks, always, only during business hours, or never. It transfers to one on-call number. Without one, it takes a message. If the transfer doesn't connect, the receptionist tells the patient and offers to take a message. Your team can also get a 'Live call transfer failed' alert.",
  },
  {
    question: "Can it verify dental insurance?",
    answer:
      "No. LobbyStack collects the patient's carrier and plan, and answers questions from the accepted plans and insurance policies you add to your knowledge base. It doesn't check eligibility or benefits with the insurer, so your team verifies coverage before the visit.",
  },
  {
    question: "Which languages can patients speak?",
    answer:
      "Patients can talk to the receptionist in 70+ languages, including Spanish and Serbian. Each call opens in your practice's default language, English or French. The receptionist then answers in the patient's language. It runs on OpenAI GPT-Live and switches when a patient asks or starts speaking another language. LobbyStack's pricing lists no language add-on. The dashboard and emails come in English, French, Spanish, or Serbian. Confirmation and reminder texts go out in your default language, or in Spanish or Serbian for a patient whose language you save through the API.",
  },
  {
    question: "Can it book new patient appointments?",
    answer:
      "Yes. LobbyStack collects a new patient's name, phone number, insurance carrier, reason for the visit, and preferred time, then books an open slot in Google Calendar within your opening hours. You can also set it to take the preferred time as a request for your team to confirm, or to take a message. If the patient agrees, it texts a confirmation and a reminder 24 hours before the visit. On LobbyStack Cloud, texts reach US and Canadian numbers only.",
  },
  {
    question: "Does it answer after hours, at lunch, and on weekends?",
    answer:
      "Yes, for the calls you forward to it. Set your phone carrier to forward busy or unanswered calls for overflow and lunch, calls after close for nights and weekends, or every call. You keep your practice number when you forward it. To port the number instead, contact the LobbyStack team. Starter and Pro include one number in the US, Canada, the UK, or Australia.",
  },
  {
    question: "Can patients reschedule or cancel by phone?",
    answer:
      "Yes, if you turn on appointment changes. Patients can then move or cancel an appointment by calling from the number they booked with, and you can require a one-time text code first. Appointment changes are off by default. If they're off, or the patient calls from another number, the receptionist files a request, and the appointment stays booked until your team changes it.",
  },
  {
    question: "Can it send reminders or run recalls?",
    answer:
      "LobbyStack texts reminders for the appointments it books, but it doesn't run recall campaigns. If a patient agrees on the call, it texts a confirmation and a reminder 24 hours before the visit, to US and Canadian numbers only. It doesn't contact patients who are due for a cleaning, and the only outgoing calls it places are transfers. Dentina sells outbound recall campaigns, and Viva AI includes recall outreach from its $899 Platinum plan (checked October 9, 2026).",
  },
  {
    question: "Does an AI receptionist replace my dental receptionist?",
    answer:
      "No. LobbyStack covers the phone: it answers, books, handles routine questions, takes messages, and transfers urgent calls. Check-in, payments, insurance verification, entering bookings into your PMS, and replies to patient texts stay with your staff. LobbyStack saves patient texts and alerts your team, but the AI doesn't reply to them. Forward the calls your front desk can't get to, or forward every call.",
  },
]
