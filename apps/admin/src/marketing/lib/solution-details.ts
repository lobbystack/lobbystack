// English-only content for the after-hours and dental solution pages: the
// example calls, what happens to each kind of call, and the links to trades.
// Businesses and callers in the examples are made up.

import type { CallAction, TradeDetails } from "@/marketing/lib/trade-details"

export const afterHoursRouting: Pick<TradeDetails, "noun" | "routing"> = {
  noun: "after-hours",
  routing: [
    {
      call: "An emergency your rules define, like no heat or an active leak",
      action: "Transfers",
      detail: "Collects the address and the problem, then rings your on-call number",
    },
    {
      call: "A new customer who wants an appointment",
      action: "Books",
      detail: "Offers open times from your Google Calendar and texts the caller a confirmation",
    },
    {
      call: "A customer who needs to reschedule",
      action: "Books",
      detail: "Finds the appointment, checks who's calling and moves it, if you turn on appointment changes",
    },
    {
      call: "A question about hours, prices or your service area",
      action: "Answers",
      detail: "Replies from the business details you entered",
    },
    {
      call: "A billing question or a request for a specific person",
      action: "Takes a message",
      detail: "Writes it up for your team to handle in the morning",
    },
    {
      call: "A robocall or sales pitch",
      action: "Ends the call",
      detail: "Hangs up, and the call doesn't count toward your minutes",
    },
  ],
}

/** What LobbyStack did on a call, drawn as a tile next to the call. */
export type CallOutcome = {
  kind: "booked" | "moved" | "answered" | "ended" | "transferred" | "message"
  title?: string
  detail?: string
  chip?: string
  /** Who took a transferred call. */
  person?: string
  /** A moved appointment's old and new times. */
  from?: string
  to?: string
  /** An answered question, and LobbyStack's reply. */
  question?: string
  answer?: string
}

export type TimelineCall = {
  at: string
  reason: string
  action: CallAction
  // The tile shows what LobbyStack did, and the summary says it in words.
  outcome: CallOutcome
  /** What LobbyStack did on the call, as a sentence under the tile. */
  summary: string
  imageAlt: string
}

export const nightCalls: TimelineCall[] = [
  {
    at: "6:12 p.m.",
    reason: "Furnace tune-up",
    action: "Books",
    outcome: { kind: "booked", title: "Appointment booked", detail: "Furnace tune-up", chip: "Thu 9:00 AM" },
    summary: "Offered open times and booked a furnace tune-up for Thursday at 9:00 a.m., then texted a confirmation.",
    imageAlt: "Appointment booked: furnace tune-up, Thursday at 9:00 AM",
  },
  {
    at: "8:25 p.m.",
    reason: "Do you come to Brookline?",
    action: "Answers",
    outcome: { kind: "answered", question: "Do you come to Brookline?", answer: "Yes, Brookline is in our service area." },
    summary: "Answered from the service area the owner entered: Brookline is covered.",
    imageAlt: "A caller asks if the business comes to Brookline, and LobbyStack replies that it does",
  },
  {
    at: "10:40 p.m.",
    reason: "Spam call",
    action: "Ends the call",
    outcome: { kind: "ended", title: "Spam call ended", detail: "No minutes used" },
    summary: "Recognized a robocall and hung up. The call used no minutes.",
    imageAlt: "Spam call ended with no minutes used",
  },
  {
    at: "1:18 a.m.",
    reason: "No heat, baby in the house",
    action: "Transfers",
    outcome: { kind: "transferred", title: "Transferred to Marco", detail: "On-call technician", person: "Marco Rossi", chip: "Connected" },
    summary: "Matched the no-heat rule, took the address and transferred the call to Marco, the on-call technician.",
    imageAlt: "An emergency no-heat call transferred to Marco, the on-call technician",
  },
  {
    at: "4:05 a.m.",
    reason: "Toilet running all night",
    action: "Books",
    outcome: { kind: "booked", title: "Appointment booked", detail: "Toilet repair", chip: "Today 10:00 AM" },
    summary: "Told the caller how to close the shutoff valve, then booked a repair for 10:00 a.m. the same day.",
    imageAlt: "Appointment booked: toilet repair, today at 10:00 AM",
  },
  {
    at: "7:30 a.m.",
    reason: "Question about an invoice",
    action: "Takes a message",
    outcome: { kind: "message", title: "Message for the office", detail: "Invoice question", chip: "Callback requested" },
    summary: "Took a message with the invoice number and a callback time for the office.",
    imageAlt: "A message for the office about an invoice question",
  },
]

export const afterHoursIndustries = [
  {
    href: "/solutions/ai-receptionist-for-hvac/",
    title: "HVAC",
    detail: "No-heat and no-cooling calls at night",
  },
  {
    href: "/solutions/ai-receptionist-for-plumbers/",
    title: "Plumbing",
    detail: "Leaks and sewer backups after you close",
  },
  {
    href: "/solutions/property-management-answering-service/",
    title: "Property management",
    detail: "Tenant maintenance requests overnight",
  },
  {
    href: "/solutions/ai-receptionist-for-dental-offices/",
    title: "Dental offices",
    detail: "Patients in pain on a weekend",
  },
  {
    href: "/solutions/after-hours-answering-service-for-contractors/",
    title: "Contractors",
    detail: "Job-site problems after the crew leaves",
  },
  {
    href: "/solutions/roofing-answering-service/",
    title: "Roofing",
    detail: "Leak calls during a storm",
  },
  {
    href: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Locksmiths",
    detail: "Lockouts at 2 a.m.",
  },
  {
    href: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Restoration",
    detail: "Flooding and fire calls at any hour",
  },
]

/** The three ways to forward your number, for the after-hours page. */
export const coverageModes = [
  {
    title: "After hours",
    body: "Your team answers while you're open, and LobbyStack takes over when you close.",
    setting: "Turn on call forwarding when you close",
  },
  {
    title: "Overflow",
    body: "Your phone rings first. LobbyStack picks up only the calls your team misses.",
    setting: "Forward calls when busy or unanswered",
  },
  {
    title: "Every call",
    body: "LobbyStack answers first and sends your team the calls that need a person.",
    setting: "Forward all calls",
  },
]

export const dentalCalls: TimelineCall[] = [
  {
    at: "7:10 a.m.",
    reason: "Cracked a tooth last night",
    action: "Books",
    outcome: { kind: "booked", title: "Emergency visit booked", detail: "Cracked tooth", chip: "Today 8:30 AM" },
    summary: "Asked the practice's triage questions and booked the 8:30 a.m. emergency slot.",
    imageAlt: "Emergency visit booked for a cracked tooth today at 8:30",
  },
  {
    at: "9:45 a.m.",
    reason: "Is my insurance accepted?",
    action: "Answers",
    outcome: { kind: "answered", question: "Is my insurance accepted?", answer: "Yes, your plan is in network." },
    summary: "Answered from the list of accepted plans the practice entered.",
    imageAlt: "A patient asks about insurance, and LobbyStack replies that the plan is in network",
  },
  {
    at: "12:20 p.m.",
    reason: "New patient, needs a cleaning",
    action: "Books",
    outcome: { kind: "booked", title: "New patient booked", detail: "Exam and cleaning", chip: "Tue 10:00 AM" },
    summary: "Took the patient's insurance carrier and booked an exam and cleaning for Tuesday at 10:00 a.m.",
    imageAlt: "New patient exam and cleaning booked for Tuesday at 10:00",
  },
  {
    at: "3:05 p.m.",
    reason: "Needs to move an appointment",
    action: "Books",
    outcome: { kind: "moved", title: "Cleaning moved", from: "Wed 9:00", to: "Fri 2:00" },
    summary: "Checked the number the visit was booked with and moved the cleaning from Wednesday to Friday.",
    imageAlt: "A cleaning moved from Wednesday at 9:00 to Friday at 2:00",
  },
  {
    at: "6:40 p.m.",
    reason: "Swelling after an extraction",
    action: "Transfers",
    outcome: { kind: "transferred", title: "Transferred to Dr. Patel", detail: "On-call dentist", person: "Anika Patel", chip: "Connected" },
    summary: "Matched the swelling rule after close and transferred the call to Dr. Patel, the on-call dentist.",
    imageAlt: "An after-hours call about swelling transferred to Dr. Patel, the on-call dentist",
  },
  {
    at: "9:15 p.m.",
    reason: "Question about a bill",
    action: "Takes a message",
    outcome: { kind: "message", title: "Message for the front desk", detail: "Billing question", chip: "Callback requested" },
    summary: "Took a message for the front desk to return in the morning.",
    imageAlt: "A message for the front desk about a billing question",
  },
]

export const dentalDetails: Pick<TradeDetails, "noun" | "routing" | "intake"> = {
  noun: "dental",
  routing: [
    {
      call: "A toothache or cracked tooth during office hours",
      action: "Books",
      detail: "Offers your next emergency slot and books it",
    },
    {
      call: "Swelling, fever or trauma after hours",
      action: "Transfers",
      detail: "Asks your triage questions, then rings your on-call dentist",
    },
    {
      call: "A new patient",
      action: "Books",
      detail: "Collects their insurance and reason for the visit, then books an exam",
    },
    {
      call: "A patient who needs to reschedule",
      action: "Books",
      detail: "Moves the visit if you've turned on appointment changes, or files a request for your team",
    },
    {
      call: "A question about insurance, hours or parking",
      action: "Answers",
      detail: "Replies from the plans and policies you entered",
    },
    {
      call: "A billing question",
      action: "Takes a message",
      detail: "Writes it up for your front desk",
    },
  ],
  intake: [
    "Whether they're a new or existing patient",
    "What's bothering them, and since when",
    "Pain level, swelling, bleeding or fever",
    "Their insurance carrier and plan",
    "The days and times that work for them",
    "The best callback number",
  ],
}
