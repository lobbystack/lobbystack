// Seeds demo businesses, one per industry, into an account that already signed up:
// a clinic, a restaurant and a barbershop, each with hours, services, staff, contacts,
// appointments (past and upcoming), knowledge, rules and receptionist settings.
//
//   pnpm seed:businesses [--email you@example.com] [--only clinic,restaurant,barbershop]
//
// Without --email it uses the only account in the database. A business whose slug exists
// is skipped, so a rerun adds what is missing and never duplicates. Appointments are written
// straight to the table, so seeding queues no texts, emails or calendar syncs.
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { eq, sql } from "drizzle-orm";

import { appointments, businesses as businessTable, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import {
  createAgentRule,
  createBusiness,
  createContact,
  createEmployee,
  createKnowledgeSnippet,
  createService,
  replaceBusinessHoursInTransaction,
  saveAgentSettingsInTransaction,
  updateBusiness,
} from "@lobbystack/domain";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "..", file));
  } catch {
    // The file is optional.
  }
}

type Window = { dayOfWeek: number; openMinutes: number; closeMinutes: number };
type ServiceSeed = { name: string; slug: string; minutes: number; description: string; price: { type: "fixed"; minor: number } | { type: "range"; minor: number; maxMinor: number } | { type: "in_person" } };
type StaffSeed = { name: string; services: string[]; hours: Window[]; timeOffInDays?: [number, number, string] };
type BusinessSeed = {
  key: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  currency: string;
  locale: "en";
  hours: Window[];
  closure: { month: number; day: number; reason: string };
  summary: string;
  greeting: string;
  tone: string;
  bookingPolicy: string;
  services: ServiceSeed[];
  staff: StaffSeed[];
  contacts: Array<{ name: string; email?: string }>;
  areaCode: string;
  notes: string[];
  internalNotes: string[];
  perStaffPerDay: [number, number];
  faqs: Array<{ title: string; content: string; tags: string[] }>;
  rules: Array<{ title: string; content: string }>;
};

const clock = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const windows = (days: number[], ranges: Array<[string, string]>): Window[] =>
  days.flatMap((dayOfWeek) => ranges.map(([open, close]) => ({ dayOfWeek, openMinutes: clock(open), closeMinutes: clock(close) })));

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

const businesses: BusinessSeed[] = [
  {
    key: "clinic",
    name: "Maple Grove Family Clinic",
    slug: "maple-grove-family-clinic",
    type: "clinic",
    timezone: "America/Toronto",
    currency: "CAD",
    locale: "en",
    areaCode: "416",
    hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "12:00"], ["13:00", "15:00"]]), ...windows([SAT], [["09:00", "13:00"]])],
    closure: { month: 12, day: 25, reason: "Christmas Day" },
    summary:
      "Maple Grove Family Clinic is a family medicine practice in Toronto with two physicians, a nurse practitioner and a registered nurse. It sees adults and children for check-ups, same-day sick visits, chronic condition reviews, vaccinations and travel health. Patients book by phone or online, and the clinic accepts new patients on a waitlist.",
    greeting: "Thank you for calling Maple Grove Family Clinic. This is the clinic's virtual receptionist. How can I help you today?",
    tone: "Calm, warm and clear. Speak plainly, never rush a caller, and never give medical advice.",
    bookingPolicy: "Book new appointments at least one hour ahead. Same-day sick visits are offered first thing in the morning and after lunch. Ask the caller to arrive ten minutes early and bring their health card and a list of current medications.",
    services: [
      { name: "General Check-up", slug: "general-check-up", minutes: 30, description: "A routine visit with a physician for a new concern or a follow-up.", price: { type: "fixed", minor: 12000 } },
      { name: "Same-Day Sick Visit", slug: "same-day-sick-visit", minutes: 20, description: "Cold, flu, infections, rashes and other short-notice concerns.", price: { type: "fixed", minor: 8500 } },
      { name: "Annual Physical", slug: "annual-physical", minutes: 45, description: "A full yearly physical exam with bloodwork requisitions.", price: { type: "fixed", minor: 18000 } },
      { name: "Flu Shot", slug: "flu-shot", minutes: 15, description: "Seasonal influenza vaccine given by a nurse.", price: { type: "fixed", minor: 3500 } },
      { name: "Blood Pressure & Diabetes Review", slug: "blood-pressure-diabetes-review", minutes: 30, description: "A follow-up for blood pressure, blood sugar and medication changes.", price: { type: "fixed", minor: 9500 } },
      { name: "Well-Baby & Child Visit", slug: "well-baby-child-visit", minutes: 30, description: "Growth checks, development checks and routine childhood vaccines.", price: { type: "fixed", minor: 11000 } },
      { name: "Travel Vaccine Consultation", slug: "travel-vaccine-consultation", minutes: 30, description: "Travel health advice and the vaccines your destination needs. The price depends on the vaccines.", price: { type: "range", minor: 9000, maxMinor: 15000 } },
      { name: "Minor Procedure Consultation", slug: "minor-procedure-consultation", minutes: 30, description: "Skin tags, cysts, stitches and similar procedures. The price depends on the procedure.", price: { type: "in_person" } },
    ],
    staff: [
      { name: "Dr. Amira Haddad", services: ["General Check-up", "Same-Day Sick Visit", "Annual Physical", "Blood Pressure & Diabetes Review", "Well-Baby & Child Visit", "Minor Procedure Consultation"], hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]])] },
      { name: "Dr. Daniel Okafor", services: ["General Check-up", "Same-Day Sick Visit", "Annual Physical", "Blood Pressure & Diabetes Review", "Travel Vaccine Consultation"], hours: [...windows([TUE, WED, THU], [["09:00", "12:00"], ["13:00", "16:00"]]), ...windows([FRI], [["08:00", "12:00"], ["13:00", "15:00"]]), ...windows([SAT], [["09:00", "13:00"]])], timeOffInDays: [10, 11, "Medical conference"] },
      { name: "Hannah Whitfield, NP", services: ["General Check-up", "Same-Day Sick Visit", "Well-Baby & Child Visit", "Blood Pressure & Diabetes Review"], hours: [...windows([MON, WED], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "12:00"], ["13:00", "15:00"]])] },
      { name: "Priya Raman, RN", services: ["Flu Shot", "Travel Vaccine Consultation", "Blood Pressure & Diabetes Review", "Well-Baby & Child Visit"], hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "12:00"], ["13:00", "15:00"]]), ...windows([SAT], [["09:00", "13:00"]])] },
    ],
    contacts: [
      { name: "Olivia Bennett", email: "olivia.bennett@example.com" }, { name: "Marcus Chen", email: "marcus.chen@example.com" }, { name: "Sofia Rodriguez" },
      { name: "Liam O'Connor", email: "liam.oconnor@example.com" }, { name: "Aaliyah Brooks" }, { name: "Noah Singh", email: "noah.singh@example.com" },
      { name: "Emma Tremblay", email: "emma.tremblay@example.com" }, { name: "Jacob Levine" }, { name: "Mei Lin Wong", email: "meilin.wong@example.com" },
      { name: "Gabriel Fontaine" }, { name: "Chloe Anderson", email: "chloe.anderson@example.com" }, { name: "Arjun Mehta" },
      { name: "Isabelle Roy", email: "isabelle.roy@example.com" }, { name: "Samuel Adeyemi" }, { name: "Hannah Kowalski", email: "hannah.kowalski@example.com" },
      { name: "Ethan Park" },
    ],
    notes: ["Prefers a morning slot.", "Bring the latest bloodwork results.", "Please call if the doctor runs behind.", "Parent will bring the vaccination record.", "Needs a note for work.", "Follow-up from last month's visit."],
    internalNotes: ["Overdue for a physical.", "Called twice to confirm.", "Prefers a female provider.", "Interpreter requested: Mandarin."],
    perStaffPerDay: [3, 7],
    faqs: [
      { title: "Is the clinic accepting new patients?", content: "Yes. We accept new patients on a waitlist, and we call as spaces open up. Leave your name and number and the front desk will add you. Current patients can book visits right away.", tags: ["new patients"] },
      { title: "What should I bring to my visit?", content: "Bring your provincial health card, a photo ID, a list of the medications and supplements you take, and any recent test results. Arrive about ten minutes early so the front desk can update your file.", tags: ["visit", "preparation"] },
      { title: "What is your cancellation policy?", content: "Please cancel or reschedule at least 24 hours ahead so another patient can use the time. Missed visits without notice may be charged a $40 fee.", tags: ["cancellation", "fees"] },
      { title: "Do you offer same-day appointments?", content: "Yes. We keep a few same-day sick visits open each morning and after lunch. Call as early as you can. If no space is left, the receptionist can book the next available visit or suggest a walk-in clinic.", tags: ["same-day", "sick visit"] },
      { title: "Do you offer virtual visits?", content: "Yes, for follow-ups, medication reviews and test results. The physician decides whether a concern needs an in-person exam. Virtual visits are booked the same way as in-person ones.", tags: ["virtual", "telehealth"] },
      { title: "How much does a visit cost?", content: "Visits for patients covered by the provincial health plan are covered. Uninsured patients and services the plan does not cover are charged at the listed price: a check-up is $120, an annual physical is $180 and a flu shot is $35.", tags: ["pricing", "insurance"] },
      { title: "How do I get my test results?", content: "Results usually arrive within five to seven business days. The clinic calls you if a result needs action. Otherwise, ask for a results review at your next visit or book a virtual visit.", tags: ["results"] },
      { title: "How do I request a prescription refill?", content: "Ask your pharmacy to send a refill request, or call the clinic with the medication name and your pharmacy. Refills take up to two business days. Controlled medications need a visit.", tags: ["prescriptions"] },
      { title: "Where is the clinic and where can I park?", content: "The clinic is at 214 Maple Grove Road, Toronto, on the ground floor beside the pharmacy. Free parking is behind the building, and the 54 bus stops at the corner. The entrance is step-free.", tags: ["location", "parking"] },
    ],
    rules: [
      { title: "No medical advice", content: "Never diagnose, suggest treatments or interpret symptoms or test results. Offer to book a visit or take a message for the nurse." },
      { title: "Emergencies", content: "If a caller describes chest pain, trouble breathing, severe bleeding, stroke signs or thoughts of self-harm, tell them to hang up and call 911 now. Do not continue booking." },
      { title: "Health card numbers", content: "Never ask for a health card number, date of birth or diagnosis over the phone. The front desk collects these at check-in." },
      { title: "New patients", content: "Tell new patients the clinic keeps a waitlist. Take their name and phone number, and say the front desk will call as spaces open. Do not promise a date." },
      { title: "Prescription refills", content: "Take a message with the caller's name, phone number, the medication and their pharmacy. Say the clinic answers refill requests within two business days." },
    ],
  },
  {
    key: "restaurant",
    name: "Olive & Ember Kitchen",
    slug: "olive-and-ember-kitchen",
    type: "restaurant",
    timezone: "America/New_York",
    currency: "USD",
    locale: "en",
    areaCode: "718",
    hours: [...windows([TUE, WED, THU], [["16:30", "22:00"]]), ...windows([FRI, SAT], [["16:00", "23:00"]]), ...windows([SUN], [["11:00", "15:00"], ["16:00", "21:00"]])],
    closure: { month: 11, day: 26, reason: "Thanksgiving Day" },
    summary:
      "Olive & Ember Kitchen is a neighbourhood restaurant in Brooklyn serving wood-fired Mediterranean dishes, house-made pasta and a small natural wine list. It seats about 60 across the main dining room, a heated patio, a six-seat chef's counter and a private room for up to 14. Reservations are taken by phone and online, with Sunday brunch from 11 a.m.",
    greeting: "Thanks for calling Olive & Ember Kitchen. I can book a table, answer questions about the menu or tell you about private dining. How can I help?",
    tone: "Friendly and relaxed, like a good host. Short sentences, a little warmth, never pushy.",
    bookingPolicy: "Ask for the date, time, party size and any allergies. Tables are held for 15 minutes. Parties of 7 or more book the large party table and need a card on file. The chef's counter and tasting menu need 48 hours' notice.",
    services: [
      { name: "Table for 2", slug: "table-for-2", minutes: 90, description: "A table for two in the main dining room or on the patio.", price: { type: "in_person" } },
      { name: "Table for 4", slug: "table-for-4", minutes: 105, description: "A table for three or four guests.", price: { type: "in_person" } },
      { name: "Large Party (6-10 guests)", slug: "large-party", minutes: 120, description: "A long table for five to ten guests. A card is held and no deposit is charged.", price: { type: "in_person" } },
      { name: "Chef's Counter Tasting Menu", slug: "chefs-counter-tasting-menu", minutes: 120, description: "Seven courses at the chef's counter, with wine pairings available for $55 more. Vegetarian version on request.", price: { type: "fixed", minor: 9500 } },
      { name: "Private Dining Room (8-14 guests)", slug: "private-dining-room", minutes: 150, description: "Our private room with a set menu. The price per guest depends on the menu you choose.", price: { type: "range", minor: 6500, maxMinor: 9500 } },
      { name: "Sunday Brunch Table", slug: "sunday-brunch-table", minutes: 90, description: "A table for brunch on Sundays from 11 a.m. to 3 p.m.", price: { type: "in_person" } },
    ],
    staff: [
      { name: "Main Dining Room", services: ["Table for 2", "Table for 4", "Large Party (6-10 guests)", "Sunday Brunch Table"], hours: [...windows([TUE, WED, THU], [["16:30", "22:00"]]), ...windows([FRI, SAT], [["16:00", "23:00"]]), ...windows([SUN], [["11:00", "15:00"], ["16:00", "21:00"]])] },
      { name: "Heated Patio", services: ["Table for 2", "Table for 4", "Sunday Brunch Table"], hours: [...windows([THU], [["17:00", "22:00"]]), ...windows([FRI, SAT], [["16:00", "23:00"]]), ...windows([SUN], [["11:00", "15:00"], ["16:00", "20:00"]])] },
      { name: "Chef's Counter", services: ["Chef's Counter Tasting Menu"], hours: windows([WED, THU, FRI, SAT], [["17:00", "21:00"]]) },
      { name: "Private Room", services: ["Private Dining Room (8-14 guests)", "Large Party (6-10 guests)"], hours: [...windows([THU, FRI, SAT], [["17:30", "22:00"]]), ...windows([SUN], [["12:00", "15:00"], ["17:00", "21:00"]])] },
    ],
    contacts: [
      { name: "Camille Dubois", email: "camille.dubois@example.com" }, { name: "Jordan Whitaker" }, { name: "Priyanka Nair", email: "priyanka.nair@example.com" },
      { name: "Tomás Herrera" }, { name: "Elena Petrova", email: "elena.petrova@example.com" }, { name: "Ben Goldstein" },
      { name: "Nadia Haddad", email: "nadia.haddad@example.com" }, { name: "Owen Sullivan" }, { name: "Yuki Tanaka", email: "yuki.tanaka@example.com" },
      { name: "Danielle Foster" }, { name: "Rafael Costa", email: "rafael.costa@example.com" }, { name: "Grace Okonkwo" },
      { name: "Leo Marchetti", email: "leo.marchetti@example.com" }, { name: "Zoe Kim" }, { name: "Andre Williams", email: "andre.williams@example.com" },
      { name: "Sienna Rossi" }, { name: "Marcus Lee", email: "marcus.lee@example.com" }, { name: "Hana Yilmaz" },
    ],
    notes: ["Birthday dinner, a candle on dessert please.", "One guest is vegetarian.", "Peanut allergy in the party.", "Anniversary, a quiet table if possible.", "High chair needed.", "Running late, will call.", "Gluten-free guest."],
    internalNotes: ["Regular, loves the window table.", "Press guest, comp the dessert.", "Asked about the private room for a future event.", "Wine club member."],
    perStaffPerDay: [2, 5],
    faqs: [
      { title: "How do reservations work?", content: "We take reservations by phone and online up to 60 days ahead. We hold a table for 15 minutes after the booked time. A few tables are kept for walk-ins every night.", tags: ["reservations"] },
      { title: "Do you accommodate dietary needs and allergies?", content: "Yes. Many dishes are vegetarian, and we can make vegan and gluten-free versions of most. Tell us about any allergy when you book and again when you arrive. Our kitchen handles nuts, shellfish, gluten and dairy, so we cannot promise a trace-free meal.", tags: ["dietary", "allergies"] },
      { title: "What is the dress code?", content: "Smart casual. Dress comfortably. There is no jacket requirement.", tags: ["dress code"] },
      { title: "Is there parking?", content: "We have no lot. There is metered street parking on 7th Avenue and a public garage two blocks north. The F and G trains stop four minutes away.", tags: ["parking", "directions"] },
      { title: "Do you take large parties and private events?", content: "Parties of 6 to 10 sit at the long table in the main room. Our private room seats 8 to 14 with a set menu from $65 to $95 per guest. For events over 14, we take your details and our events manager calls within one business day.", tags: ["groups", "private dining"] },
      { title: "What is your cancellation policy?", content: "Please cancel at least 24 hours ahead. Tasting menu and private room bookings that cancel with less than 48 hours' notice are charged $50 per guest.", tags: ["cancellation", "fees"] },
      { title: "Do you serve brunch?", content: "Yes, every Sunday from 11 a.m. to 3 p.m., with shakshuka, ricotta pancakes, a wood-fired egg dish and a brunch cocktail list. Dinner service begins at 4 p.m.", tags: ["brunch"] },
      { title: "Can I bring my own wine?", content: "Yes. We charge a $25 corkage fee per bottle, and we limit it to two bottles per table. Please do not bring bottles from our wine list.", tags: ["wine", "corkage"] },
      { title: "Is the patio open in cold or wet weather?", content: "The patio is heated and covered, and it is open Thursday through Sunday. In heavy rain or wind we move guests inside when a table is free, and we call ahead when we can.", tags: ["patio", "weather"] },
      { title: "Do you offer takeout or gift cards?", content: "Takeout is available Tuesday through Saturday from 4:30 p.m. Gift cards are sold at the host stand and online, in any amount.", tags: ["takeout", "gift cards"] },
    ],
    rules: [
      { title: "Collect the booking details", content: "Always get the date, time, party size, a name and a phone number. Ask whether anyone has allergies or is celebrating something." },
      { title: "Allergies", content: "Write down every allergy, but never promise a meal is free of an allergen. Say the kitchen will go over it with the guest on arrival." },
      { title: "Large parties", content: "For 11 or more guests, take the contact details and say the events manager will call within one business day. Do not quote prices for events over 14 guests." },
      { title: "Specific tables", content: "Note a table request, such as a window table or the patio, but never promise it. Say the host will do their best." },
      { title: "Tasting menu notice", content: "The chef's counter and the tasting menu need 48 hours' notice. For shorter notice, offer a regular table." },
    ],
  },
  {
    key: "barbershop",
    name: "Northside Barber Co.",
    slug: "northside-barber-co",
    type: "barbershop",
    timezone: "America/Chicago",
    currency: "USD",
    locale: "en",
    areaCode: "312",
    hours: [...windows([TUE, WED, THU, FRI], [["09:00", "19:00"]]), ...windows([SAT], [["08:00", "17:00"]]), ...windows([SUN], [["10:00", "15:00"]])],
    closure: { month: 12, day: 25, reason: "Christmas Day" },
    summary:
      "Northside Barber Co. is a traditional barbershop in Chicago with three barbers. It cuts and fades hair, shapes beards and gives hot towel straight razor shaves. Customers book by phone or online, and walk-ins are welcome when a chair is free.",
    greeting: "Northside Barber Co., this is the shop's assistant. Want to book a chair, check a price or ask about walk-ins?",
    tone: "Easygoing and upbeat, with the feel of a neighbourhood shop. Keep it short and friendly.",
    bookingPolicy: "Ask which service and barber the caller wants. Book in 15-minute steps. Anyone more than 10 minutes late may be moved to a walk-in. Kids 12 and under need a parent or guardian.",
    services: [
      { name: "Classic Haircut", slug: "classic-haircut", minutes: 30, description: "A scissor and clipper cut finished with a neck shave and styling.", price: { type: "fixed", minor: 3500 } },
      { name: "Skin Fade", slug: "skin-fade", minutes: 45, description: "A detailed fade blended to the skin, with a line-up and styling.", price: { type: "fixed", minor: 4500 } },
      { name: "Beard Trim & Shape", slug: "beard-trim-shape", minutes: 20, description: "A trim and shape with a hot towel and beard oil.", price: { type: "fixed", minor: 2200 } },
      { name: "Haircut & Beard Combo", slug: "haircut-beard-combo", minutes: 60, description: "Any cut with a full beard trim, hot towel and styling.", price: { type: "fixed", minor: 6500 } },
      { name: "Hot Towel Straight Razor Shave", slug: "hot-towel-shave", minutes: 30, description: "A traditional straight razor shave with hot towels and pre-shave oil.", price: { type: "fixed", minor: 4000 } },
      { name: "Kids Cut (12 & under)", slug: "kids-cut", minutes: 25, description: "A cut for children 12 and under. A parent or guardian must stay.", price: { type: "fixed", minor: 2500 } },
      { name: "Senior Cut (65+)", slug: "senior-cut", minutes: 30, description: "A classic cut at a lower price for customers 65 and over.", price: { type: "fixed", minor: 2800 } },
      { name: "Color & Gray Blending", slug: "color-gray-blending", minutes: 60, description: "A natural gray blend or a full color. The price depends on hair length.", price: { type: "range", minor: 5500, maxMinor: 8500 } },
      { name: "Line-Up", slug: "line-up", minutes: 15, description: "A quick clean-up of the hairline, temples and neck.", price: { type: "fixed", minor: 1500 } },
    ],
    staff: [
      { name: "Marcus Bell", services: ["Classic Haircut", "Skin Fade", "Beard Trim & Shape", "Haircut & Beard Combo", "Hot Towel Straight Razor Shave", "Senior Cut (65+)", "Color & Gray Blending", "Line-Up"], hours: [...windows([TUE, WED, THU, FRI], [["09:00", "13:00"], ["13:30", "19:00"]]), ...windows([SAT], [["08:00", "12:30"], ["13:00", "17:00"]])] },
      { name: "Devon Carter", services: ["Classic Haircut", "Skin Fade", "Beard Trim & Shape", "Haircut & Beard Combo", "Kids Cut (12 & under)", "Line-Up"], hours: [...windows([WED, THU, FRI], [["10:00", "14:00"], ["14:30", "19:00"]]), ...windows([SAT], [["08:00", "12:30"], ["13:00", "17:00"]]), ...windows([SUN], [["10:00", "15:00"]])], timeOffInDays: [6, 7, "Family trip"] },
      { name: "Luis Ortega", services: ["Classic Haircut", "Skin Fade", "Beard Trim & Shape", "Haircut & Beard Combo", "Hot Towel Straight Razor Shave", "Kids Cut (12 & under)", "Senior Cut (65+)", "Line-Up"], hours: [...windows([TUE, THU, FRI], [["09:00", "13:00"], ["13:30", "18:00"]]), ...windows([SAT], [["09:00", "12:30"], ["13:00", "17:00"]]), ...windows([SUN], [["10:00", "15:00"]])] },
    ],
    contacts: [
      { name: "Tyrone Jackson", email: "tyrone.jackson@example.com" }, { name: "Mike Kowalczyk" }, { name: "Dante Alvarez", email: "dante.alvarez@example.com" },
      { name: "Chris Nguyen" }, { name: "Brandon Hughes", email: "brandon.hughes@example.com" }, { name: "Eli Rosenberg" },
      { name: "Jamal Washington", email: "jamal.washington@example.com" }, { name: "Pedro Gutierrez" }, { name: "Ryan O'Malley", email: "ryan.omalley@example.com" },
      { name: "Kevin Patel" }, { name: "Walter Jenkins" }, { name: "Darius Coleman", email: "darius.coleman@example.com" },
      { name: "Anthony Russo" }, { name: "Sam Okafor", email: "sam.okafor@example.com" }, { name: "George Papadakis" },
      { name: "Nico Baptiste" }, { name: "Josh Feldman", email: "josh.feldman@example.com" }, { name: "Andre Miller" },
    ],
    notes: ["Same cut as last time.", "Bringing his son, a kids cut after.", "Wants a #2 on the sides.", "Wedding on Saturday, wants a fresh shave.", "Prefers Marcus.", "Running a few minutes late."],
    internalNotes: ["Regular, every second Friday.", "Tips well, loves the straight razor.", "Sensitive skin, use the gentle oil.", "Asked about the gray blending."],
    perStaffPerDay: [5, 9],
    faqs: [
      { title: "Do you take walk-ins?", content: "Yes, whenever a chair is free. Booked customers go first, so the wait can be longer on Fridays and Saturdays. Call ahead and we will tell you how busy it is.", tags: ["walk-ins"] },
      { title: "How much is a haircut?", content: "A classic haircut is $35, a skin fade is $45, a kids cut is $25 and a senior cut is $28. A haircut and beard combo is $65. Tips are welcome and not included.", tags: ["pricing"] },
      { title: "What payment methods do you accept?", content: "We take cash, all major cards and tap to pay. There is an ATM next door.", tags: ["payment"] },
      { title: "What is your late and cancellation policy?", content: "Please cancel at least two hours ahead. If you are more than 10 minutes late, we may move you to the next open chair or to the walk-in line.", tags: ["cancellation", "late"] },
      { title: "Do you cut kids' hair?", content: "Yes. Kids 12 and under pay $25, and a parent or guardian stays during the cut. Devon and Luis do kids' cuts.", tags: ["kids"] },
      { title: "Can I book a specific barber?", content: "Yes. Marcus, Devon and Luis each have their own schedule, so tell us who you want. If they are booked, we suggest the next time they have open or another barber.", tags: ["barbers"] },
      { title: "Do you do beard trims and straight razor shaves?", content: "Yes. A beard trim and shape is $22, and a hot towel straight razor shave is $40. Marcus and Luis do the straight razor shaves.", tags: ["beard", "shave"] },
      { title: "Where are you and is there parking?", content: "We are at 1840 N. Clark Street, beside the coffee shop. There is metered street parking, a free 90-minute lot behind the building, and the Brown Line stops two blocks away.", tags: ["location", "parking"] },
      { title: "Do you sell products and gift cards?", content: "Yes. We sell pomade, beard oil, balm and combs, and gift cards in any amount at the front desk.", tags: ["products", "gift cards"] },
    ],
    rules: [
      { title: "Ask for the service and the barber", content: "Always find out which service the caller wants and whether they have a favourite barber before offering times." },
      { title: "Be honest about walk-ins", content: "Say walk-ins are welcome, and that booked customers go first. Never promise a wait time." },
      { title: "Kids", content: "Customers 12 and under need a parent or guardian to stay. Say so when booking a kids cut." },
      { title: "Prices", content: "Quote the listed price. For color and gray blending, say the price depends on hair length and is confirmed in the chair." },
      { title: "Late customers", content: "If a caller says they are running late, say 10 minutes is the limit. After that we may move them to the walk-in line." },
    ],
  },
];

// A small deterministic generator, so a rerun makes the same history.
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function offsetMinutes(timezone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(at));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return (Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second")) - Math.floor(at / 1000) * 1000) / 60_000;
}

/** The instant a wall-clock time falls on in a zone. */
function zoned(timezone: string, year: number, month: number, day: number, minutes: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const first = guess - offsetMinutes(timezone, guess) * 60_000;
  return new Date(guess - offsetMinutes(timezone, first) * 60_000);
}

function localToday(timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function isUniqueViolation(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return [error, cause].some((value) => typeof value === "object" && value !== null && "code" in value && (value as { code: unknown }).code === "23505");
}

type Database = ReturnType<typeof createDatabaseClient>["db"];

/** Slugs are unique across the database, so a second account's copy takes the account's name as a suffix. */
const accountSlug = (email: string) => email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function seedBusiness(seed: BusinessSeed, account: { id: string; email: string }, context: { db: Database }, index: number) {
  const userId = account.id;
  // A rerun skips what this account already owns, whatever slug it ended up with.
  const owned = await withBusinessTransaction(context.db, { userId, actorType: "operator" }, async (tx) => {
    const rows = await tx.execute<{ name: string; role: string }>(sql`select name, role from app.list_user_businesses(${userId})`);
    return rows.rows.filter((row) => row.role === "business_owner" && row.name === seed.name);
  });
  if (owned.length) {
    console.log(`${seed.name}: already in ${account.email}, skipped.`);
    return;
  }
  let businessId: string | undefined;
  for (const slug of [seed.slug, `${seed.slug}-${accountSlug(account.email)}`]) {
    try {
      ({ businessId } = await createBusiness(context, { userId, name: seed.name, slug, timezone: seed.timezone, businessType: seed.type, defaultLocale: seed.locale }));
      break;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (!businessId) throw new Error(`${seed.name}: both slugs are taken by other businesses.`);
  await updateBusiness(context, { userId, businessId, currency: seed.currency } as Parameters<typeof updateBusiness>[1]);

  const today = localToday(seed.timezone);
  const christmasYear = new Date(Date.UTC(today.year, seed.closure.month - 1, seed.closure.day + 1)).getTime() < Date.UTC(today.year, today.month - 1, today.day) ? today.year + 1 : today.year;
  const closureStart = `${christmasYear}-${String(seed.closure.month).padStart(2, "0")}-${String(seed.closure.day).padStart(2, "0")}`;
  const closureEnd = isoDay(new Date(Date.UTC(christmasYear, seed.closure.month - 1, seed.closure.day + 1)));
  await withBusinessTransaction(context.db, { userId, businessId, actorType: "operator" }, async (tx) => {
    await replaceBusinessHoursInTransaction(tx, { businessId, hours: seed.hours, closures: [{ startsAt: `${closureStart}T00:00`, endsAt: `${closureEnd}T00:00`, reason: seed.closure.reason }] });
    // A seeded business is already set up, so the dashboard opens instead of the onboarding steps.
    await tx.update(businessTable).set({ onboardingStage: "complete", updatedAt: new Date() }).where(eq(businessTable.id, businessId));
    await saveAgentSettingsInTransaction(tx, { businessId, businessName: seed.name, patch: { summary: seed.summary, greeting: seed.greeting, tone: seed.tone, bookingPolicy: seed.bookingPolicy } });
  });

  const serviceIds = new Map<string, { id: string; minutes: number }>();
  for (const service of seed.services) {
    const id = await createService(context, {
      userId,
      businessId,
      name: service.name,
      slug: service.slug,
      durationMinutes: service.minutes,
      description: service.description,
      priceType: service.price.type,
      ...(service.price.type === "fixed" ? { priceMinor: service.price.minor } : {}),
      ...(service.price.type === "range" ? { priceMinor: service.price.minor, priceMaxMinor: service.price.maxMinor } : {}),
    });
    serviceIds.set(service.name, { id, minutes: service.minutes });
  }

  const staffRows: Array<{ id: string; seed: StaffSeed; offDays: Set<string> }> = [];
  for (const member of seed.staff) {
    const offDays = new Set<string>();
    const timeOff = member.timeOffInDays
      ? (() => {
          const [from, to, name] = member.timeOffInDays;
          const start = new Date(Date.UTC(today.year, today.month - 1, today.day + from));
          const end = new Date(Date.UTC(today.year, today.month - 1, today.day + to));
          for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) offDays.add(isoDay(day));
          return [{ startsOn: isoDay(start), endsOn: isoDay(end), name }];
        })()
      : [];
    const employee = await createEmployee(context, {
      userId,
      businessId,
      name: member.name,
      phone: null,
      serviceIds: member.services.map((name) => serviceIds.get(name)!.id),
      hours: member.hours,
      timeOff,
    });
    staffRows.push({ id: employee.id, seed: member, offDays });
  }

  const contactRows: Array<{ id: string }> = [];
  for (const [position, contact] of seed.contacts.entries()) {
    const phone = `+1${seed.areaCode}555${String(100 + position).padStart(4, "0")}`;
    const { contactId } = await createContact(context, { userId, businessId, name: contact.name, phone, ...(contact.email ? { email: contact.email } : {}) });
    contactRows.push({ id: contactId });
  }

  for (const faq of seed.faqs) await createKnowledgeSnippet(context, { userId, businessId, title: faq.title, content: faq.content, tags: faq.tags });
  for (const rule of seed.rules) await createAgentRule(context, { userId, businessId, title: rule.title, content: rule.content });

  // Appointments: three weeks back and two weeks ahead, inside each staff member's hours.
  const random = seededRandom(7_000 + index);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const now = Date.now();
  const rows: Array<typeof appointments.$inferInsert> = [];
  for (let offset = -21; offset <= 14; offset++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const day = isoDay(date);
    const weekday = date.getUTCDay();
    if (day === closureStart) continue;
    for (const member of staffRows) {
      if (member.offDays.has(day)) continue;
      const shifts = member.seed.hours.filter((window) => window.dayOfWeek === weekday);
      if (!shifts.length) continue;
      const taken: Array<[number, number]> = [];
      const target = Math.round(seed.perStaffPerDay[0] + random() * (seed.perStaffPerDay[1] - seed.perStaffPerDay[0]));
      for (let attempt = 0; attempt < target * 6 && taken.length < target; attempt++) {
        const shift = pick(shifts);
        const service = serviceIds.get(pick(member.seed.services))!;
        const slots = Math.floor((shift.closeMinutes - shift.openMinutes - service.minutes) / 15);
        if (slots < 0) continue;
        const start = shift.openMinutes + Math.floor(random() * (slots + 1)) * 15;
        const end = start + service.minutes;
        if (taken.some(([from, to]) => start < to && end > from)) continue;
        taken.push([start, end]);
        const startsAt = zoned(seed.timezone, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), start);
        const endsAt = new Date(startsAt.getTime() + service.minutes * 60_000);
        const past = endsAt.getTime() < now;
        const status = past ? (random() < 0.86 ? "completed" : "canceled") : random() < 0.94 ? "confirmed" : "canceled";
        rows.push({
          businessId,
          contactId: pick(contactRows).id,
          staffId: member.id,
          serviceId: service.id,
          startsAt,
          endsAt,
          timezone: seed.timezone,
          status,
          sourceChannel: pick(["voice", "voice", "voice", "web_chat", "dashboard"]),
          calendarSyncState: "not_required",
          notes: random() < 0.22 ? pick(seed.notes) : null,
          internalNotes: random() < 0.1 ? pick(seed.internalNotes) : null,
          createdAt: new Date(Math.min(now, startsAt.getTime() - (1 + Math.floor(random() * 10)) * 86_400_000)),
        });
      }
    }
  }
  await withBusinessTransaction(context.db, { userId, businessId, actorType: "system" }, async (tx) => {
    for (let at = 0; at < rows.length; at += 100) await tx.insert(appointments).values(rows.slice(at, at + 100));
  });

  console.log(`${seed.name}: ${seed.services.length} services, ${seed.staff.length} staff, ${seed.contacts.length} contacts, ${rows.length} appointments, ${seed.faqs.length} FAQs, ${seed.rules.length} rules.`);
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, only: { type: "string" } } });
  const only = values.only ? values.only.split(",").map((key) => key.trim()) : null;
  const unknown = only?.filter((key) => !businesses.some((business) => business.key === key));
  if (unknown?.length) throw new Error(`Unknown --only value: ${unknown.join(", ")}. Use ${businesses.map((business) => business.key).join(", ")}.`);

  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  try {
    const accounts = await auth.db.select({ id: users.id, email: users.email, normalizedEmail: users.normalizedEmail }).from(users);
    const account = values.email
      ? accounts.find((candidate) => candidate.normalizedEmail === values.email!.trim().toLowerCase())
      : accounts.length === 1 ? accounts[0] : undefined;
    if (!account) {
      throw new Error(values.email ? `No account for ${values.email}.` : `Pass --email. Accounts: ${accounts.map((candidate) => candidate.email).join(", ") || "none"}.`);
    }
    console.log(`Seeding into ${account.email}.`);
    for (const [index, seed] of businesses.entries()) {
      if (only && !only.includes(seed.key)) continue;
      await seedBusiness(seed, account, { db: app.db }, index);
    }
  } finally {
    await Promise.all([auth.pool.end(), app.pool.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
