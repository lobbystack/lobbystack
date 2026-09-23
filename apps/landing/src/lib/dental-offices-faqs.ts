import type { FaqItem } from "@/lib/seo"

export const dentalOfficesFaqs: FaqItem[] = [
  {
    question: "What is an AI dental answering service?",
    answer:
      "An AI dental answering service answers your practice’s phone, books appointments, answers insurance and policy questions, and routes emergencies. It picks up when the front desk is busy or closed, so patients reach someone instead of voicemail.",
  },
  {
    question: "Can it book new patient appointments?",
    answer:
      "Yes. LobbyStack can collect a new patient's contact information, insurance details, reason for the visit, and preferred time, then book the appointment directly into your calendar and send a confirmation text.",
  },
  {
    question: "Does it work after hours and on weekends?",
    answer:
      "Yes. LobbyStack answers calls at night, on weekends, and during lunch breaks. It can book appointments, take messages, or transfer true dental emergencies to your on-call dentist based on rules you set.",
  },
  {
    question: "Can it handle insurance questions?",
    answer:
      "Yes. You can add the insurance plans you accept, coverage policies, and pre-qualification questions to LobbyStack's knowledge base. It answers routine questions and flags complex cases for your team.",
  },
  {
    question: "What happens when a patient has a dental emergency?",
    answer:
      "You define what counts as an emergency. LobbyStack can ask about pain level, swelling, trauma, or bleeding, then transfer the call to your emergency line or take a detailed message with context.",
  },
  {
    question: "Can it send appointment reminders?",
    answer:
      "Yes. LobbyStack texts a reminder 24 hours before each appointment it books, if the patient agreed to texts. It doesn't run recall campaigns for patients who are due for a cleaning.",
  },
  {
    question: "Is patient data handled securely?",
    answer:
      "For each call, LobbyStack saves the recording, a transcript, a summary, the caller's name and number, and any appointment it booked. It also keeps text messages with patients and the documents you upload to its knowledge base. On LobbyStack Cloud, that data lives on our servers, and recordings are deleted after 90 days. Twilio and OpenAI also process the call audio while the call is live. If your practice is covered by HIPAA, you can self-host LobbyStack so the data stays on your own servers. Check the setup with your compliance officer before you take patient calls.",
  },
  {
    question: "Will it integrate with my practice management software?",
    answer:
      "Not directly. LobbyStack books into Google Calendar and doesn't connect to practice management software like Dentrix or Open Dental, so your team copies new bookings into your PMS.",
  },
  {
    question: "Can it reschedule or cancel appointments?",
    answer:
      "Yes. LobbyStack can handle simple rescheduling and cancellations when your rules allow it. Complex changes, especially same-day swaps, can be routed to your front desk with the patient's details attached.",
  },
  {
    question: "How much does it cost for a dental practice?",
    answer:
      "The free plan includes 30 voice minutes for testing, without a phone number. Starter costs $30 a month for 150 minutes and a dedicated number, and Pro costs $100 a month for 500 minutes. Spam calls and calls under 10 seconds don't count.",
  },
]
