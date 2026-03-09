import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

export const demoSnapshot: BusinessContextSnapshot = {
  businessId: "demo-clinic",
  version: "seed-v1",
  generatedAt: new Date("2026-03-08T00:00:00.000Z").toISOString(),
  displayName: "Maple Family Clinic",
  timezone: "America/Toronto",
  businessType: "clinic",
  greeting: "Thank you for calling Maple Family Clinic.",
  voiceInstructions:
    "Answer politely, keep medical responses administrative only, and transfer urgent issues.",
  smsInstructions:
    "Reply clearly in short SMS messages. Ask one question at a time when booking.",
  summary:
    "A family clinic offering checkups, follow-ups, and vaccine appointments.",
  bookingPolicy: "Do not book same-day appointments after 4pm local time.",
  knowledgeDigest:
    "Front desk handles scheduling, referrals, and administrative questions. Parking is behind the building and urgent medical issues should be transferred.",
  transferPolicy: {
    mode: "on_urgent",
    transferNumber: "+14165551234",
  },
  hours: [
    { dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 2, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 3, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 4, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    { dayOfWeek: 5, openMinutes: 9 * 60, closeMinutes: 16 * 60 },
  ],
  closures: [],
  services: [
    { id: "svc-checkup", name: "General Checkup", durationMinutes: 30 },
    { id: "svc-vaccine", name: "Vaccination Visit", durationMinutes: 15 },
  ],
  priorityFaqs: [
    {
      id: "faq-1",
      title: "Parking",
      content: "Parking is available behind the building.",
      tags: ["parking"],
      priority: 10,
    },
  ],
  contactChannels: {
    phoneNumber: "+14165550000",
    smsNumber: "+14165550000",
    email: "frontdesk@mapleclinic.example",
  },
};
