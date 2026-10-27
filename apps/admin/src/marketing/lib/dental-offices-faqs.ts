import type { FaqItem } from "@/marketing/lib/seo"

export const dentalOfficesFaqs: FaqItem[] = [
  {
    question: "What is a dental AI receptionist?",
    answer:
      "A dental AI receptionist is a voice AI that answers a practice's phone. It books appointments, answers questions about hours and accepted insurance, takes messages and transfers emergencies to a person. Practices use one for overflow, lunch and after-hours calls, or for every call. LobbyStack books into Google Calendar. Some dental-specific products write bookings into practice management software instead.",
  },
  {
    question: "How much does an AI dental receptionist cost?",
    answer:
      "LobbyStack costs $30 a month on Starter or $100 a month on Pro, with no setup fee. Starter includes 150 minutes, then $0.20 a minute. Pro includes 500 minutes, then $0.18 a minute, so 1,000 minutes a month on Pro costs $190. Calls under 10 seconds and calls ended as spam don't count. Dental-specific receptionists that published prices ran from $299 a month per location, billed annually (Dentina), to $1,199 a month (Viva AI) when we checked on October 27, 2026.",
  },
  {
    question: "Is LobbyStack HIPAA compliant?",
    answer:
      "LobbyStack makes no HIPAA claim. For each call it saves the recording, a transcript, a one-line summary, the caller's number and the name they give, and any appointment it booked. Paid plans keep recordings and transcripts for 90 days and messages for 365 days. Free keeps them for 30 days. Self-hosting keeps LobbyStack's copy of that data on your own servers, but Twilio and OpenAI still process the call audio. Check with your compliance officer before patients call.",
  },
  {
    question: "Can it book directly into Dentrix or Open Dental?",
    answer:
      "No. LobbyStack books into Google Calendar and doesn't connect to Dentrix, Open Dental, Eaglesoft or other practice management software, so your team copies new bookings over. Signed webhooks and the REST API can send booking and call data to Zapier or your own tools. If you need bookings written into your PMS, Dentina names 11 systems it writes bookings back to, and Peerlogic names 8 it integrates with (checked October 27, 2026).",
  },
  {
    question: "How does it handle a dental emergency call?",
    answer:
      "It asks the triage questions you approve, such as pain level, swelling, trauma or bleeding, then follows your transfer rule. You choose when it transfers: for urgent calls, when the caller asks, always, only during business hours, or never. It transfers to one on-call number. If the transfer doesn't connect, it tells the patient and offers to take a message, and your team can get a \"Live call transfer failed\" alert.",
  },
  {
    question: "Can it verify dental insurance?",
    answer:
      "No. It collects the patient's carrier and plan, and answers questions from the accepted plans you add to your knowledge base. It doesn't check eligibility or benefits with the insurer, so your team verifies coverage before the visit.",
  },
  {
    question: "Can it book new patient appointments?",
    answer:
      "Yes. It collects the new patient's name, phone number, insurance carrier, reason for the visit and preferred time, then books an open slot in Google Calendar within your opening hours. You can also have it save the preferred time as a request for your team to confirm. If the patient agrees, it texts a confirmation and a reminder 24 hours before. On LobbyStack Cloud, texts reach US and Canadian numbers.",
  },
  {
    question: "Which languages can patients speak?",
    answer:
      "Each call opens in your practice's default language: English, French, Spanish, Serbian, German, Brazilian Portuguese, Italian or Dutch. The receptionist switches when a patient speaks another language or asks for one. It runs on OpenAI GPT-Live, which handles 70+ languages, and LobbyStack's pricing lists no language add-on.",
  },
  {
    question: "Does it answer at lunch, after hours and on weekends?",
    answer:
      "Yes, for the calls you forward to it. Set your carrier to forward busy or unanswered calls for overflow and lunch, calls after close for nights and weekends, or every call. You keep your practice number. Starter and Pro also include one number in the US, Canada, the UK, Australia or New Zealand.",
  },
  {
    question: "Can patients reschedule or cancel by phone?",
    answer:
      "Yes, once you turn on appointment changes, which are off by default. Patients call from the number they booked with, and you can require a texted one-time code first. If changes are off, or the patient calls from another number, the receptionist files a request and the appointment stays until your team changes it.",
  },
  {
    question: "Does an AI receptionist replace my dental receptionist?",
    answer:
      "No. LobbyStack covers the phone: it answers, books, handles routine questions, takes messages and transfers urgent calls. Check-in, payments, insurance verification, entering bookings into your PMS and replies to patient texts stay with your staff. It doesn't run recall campaigns, and the only outgoing calls it places are transfers.",
  },
]
