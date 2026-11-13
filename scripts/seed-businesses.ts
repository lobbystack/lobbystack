// Seeds a demo business into an account that already signed up. Each one has hours, services,
// staff, contacts, appointments (past and upcoming), knowledge, rules and agent settings.
//
//   pnpm seed:business <business...> --email you@example.com
//   pnpm seed:business all
//
// A business is named by its key, its slug or its name, or any unique part of them:
//   pnpm seed:business clinic "nail salon" dental
// Run without arguments to list them. --email is required. The script refuses to run unless the
// database is local (localhost, 127.0.0.1, ::1 or the postgres service) or its name ends in _test,
// and it never runs with NODE_ENV=production.
// A business the account already owns is skipped, so a rerun never duplicates. Appointments are
// written straight to the table, so seeding queues no texts, emails or calendar syncs.
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { eq, sql } from "drizzle-orm";

import { appointments, businesses as businessTable, createDatabaseClient, roleDatabaseUrl, users, withBusinessTransaction } from "@lobbystack/db";
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
  {
    key: "nails",
    name: "Blush & Polish Nail Studio",
    slug: "blush-and-polish-nail-studio",
    type: "nail salon",
    timezone: "America/Los_Angeles",
    currency: "USD",
    locale: "en",
    areaCode: "310",
    hours: [...windows([MON, TUE, WED, THU, FRI, SAT], [["10:00", "14:00"], ["14:30", "19:00"]]), ...windows([SUN], [["11:00", "17:00"]])],
    closure: { month: 1, day: 1, reason: "New Year's Day" },
    summary:
      "Blush & Polish Nail Studio is a clean, relaxed nail salon in Santa Monica offering manicures, pedicures, gel, dip powder and acrylic sets, and custom nail art. Four nail technicians work by appointment, and walk-ins are welcome when a technician is free.",
    greeting: "Thanks for calling Blush & Polish Nail Studio! I can book a manicure or pedicure, check prices, or tell you about walk-ins. What can I do for you?",
    tone: "Cheerful, warm and a little playful. Keep it short and easy to follow.",
    bookingPolicy: "Ask which service the caller wants and whether they need gel or acrylic removal, which adds 20 minutes. Book in 15-minute steps. Ask them to arrive 5 minutes early. After 15 minutes late, the visit may have to be shortened or rebooked.",
    services: [
      { name: "Classic Manicure", slug: "classic-manicure", minutes: 30, description: "Shaping, cuticle care, a hand massage and regular polish.", price: { type: "fixed", minor: 2800 } },
      { name: "Gel Manicure", slug: "gel-manicure", minutes: 45, description: "A manicure finished with long-wear gel color.", price: { type: "fixed", minor: 4500 } },
      { name: "Classic Pedicure", slug: "classic-pedicure", minutes: 45, description: "A foot soak, shaping, cuticle care, a callus smoothing and regular polish.", price: { type: "fixed", minor: 4200 } },
      { name: "Spa Pedicure", slug: "spa-pedicure", minutes: 60, description: "A classic pedicure with a scrub, a mask, hot towels and a longer massage.", price: { type: "fixed", minor: 6000 } },
      { name: "Acrylic Full Set", slug: "acrylic-full-set", minutes: 75, description: "A full set of acrylic nails. The price depends on length and shape.", price: { type: "range", minor: 6500, maxMinor: 8500 } },
      { name: "Acrylic Fill", slug: "acrylic-fill", minutes: 60, description: "A fill for growth on an acrylic set, within three weeks of the last visit.", price: { type: "fixed", minor: 5000 } },
      { name: "Dip Powder Manicure", slug: "dip-powder-manicure", minutes: 60, description: "A lightweight, long-wear dip powder color on natural nails.", price: { type: "fixed", minor: 5500 } },
      { name: "Nail Art Add-On", slug: "nail-art-add-on", minutes: 15, description: "Designs, chrome, French tips or charms added to any service. The price depends on the design.", price: { type: "range", minor: 1000, maxMinor: 4000 } },
      { name: "Gel or Acrylic Removal", slug: "gel-acrylic-removal", minutes: 20, description: "A gentle removal of gel, dip or acrylic, with a nail treatment.", price: { type: "fixed", minor: 1500 } },
      { name: "Mani + Pedi Combo", slug: "mani-pedi-combo", minutes: 90, description: "A gel manicure and a classic pedicure together.", price: { type: "fixed", minor: 8500 } },
    ],
    staff: [
      { name: "Linh Tran", services: ["Classic Manicure", "Gel Manicure", "Classic Pedicure", "Spa Pedicure", "Acrylic Full Set", "Acrylic Fill", "Dip Powder Manicure", "Nail Art Add-On", "Gel or Acrylic Removal", "Mani + Pedi Combo"], hours: [...windows([MON, TUE, WED, THU, FRI, SAT], [["10:00", "14:00"], ["14:30", "19:00"]])] },
      { name: "Maya Patel", services: ["Classic Manicure", "Gel Manicure", "Dip Powder Manicure", "Acrylic Full Set", "Acrylic Fill", "Nail Art Add-On", "Gel or Acrylic Removal"], hours: [...windows([TUE, WED, THU, FRI], [["10:00", "14:00"], ["14:30", "19:00"]]), ...windows([SUN], [["11:00", "17:00"]])], timeOffInDays: [8, 10, "Vacation"] },
      { name: "Chloe Nguyen", services: ["Classic Pedicure", "Spa Pedicure", "Classic Manicure", "Gel Manicure", "Mani + Pedi Combo", "Gel or Acrylic Removal"], hours: [...windows([MON, WED, THU, SAT], [["10:00", "14:00"], ["14:30", "19:00"]]), ...windows([SUN], [["11:00", "17:00"]])] },
      { name: "Jasmine Ortiz", services: ["Acrylic Full Set", "Acrylic Fill", "Dip Powder Manicure", "Gel Manicure", "Nail Art Add-On", "Gel or Acrylic Removal"], hours: [...windows([TUE, THU, FRI, SAT], [["11:00", "14:00"], ["14:30", "19:00"]])] },
    ],
    contacts: [
      { name: "Ashley Monroe", email: "ashley.monroe@example.com" }, { name: "Brianna Cole" }, { name: "Camila Reyes", email: "camila.reyes@example.com" },
      { name: "Destiny Powell" }, { name: "Emily Zhang", email: "emily.zhang@example.com" }, { name: "Fatima Rahman" },
      { name: "Gianna Russo", email: "gianna.russo@example.com" }, { name: "Hailey Brooks" }, { name: "Isabel Cortez", email: "isabel.cortez@example.com" },
      { name: "Jade Kimura" }, { name: "Kayla Thompson", email: "kayla.thompson@example.com" }, { name: "Lauren Whitfield" },
      { name: "Mia Santos", email: "mia.santos@example.com" }, { name: "Naomi Fischer" }, { name: "Olivia Hart", email: "olivia.hart@example.com" },
      { name: "Priya Desai" }, { name: "Quinn Delgado", email: "quinn.delgado@example.com" }, { name: "Rachel Stern" },
    ],
    notes: ["Same color as last time.", "Bringing a photo for the nail art.", "Needs her old gel removed first.", "Bridal party of four, same day.", "Prefers Linh.", "Short square shape, no length.", "Sensitive cuticles."],
    internalNotes: ["Regular, every three weeks.", "Allergic to a brand of acrylic monomer, use the hypoallergenic one.", "Always tips well, loves chrome.", "Birthday this month."],
    perStaffPerDay: [4, 7],
    faqs: [
      { title: "Do you take walk-ins?", content: "Yes, whenever a technician is free. Booked guests go first, so waits are longer on Fridays and Saturdays. Call ahead and we will tell you how busy it is.", tags: ["walk-ins"] },
      { title: "How much are your services?", content: "A classic manicure is $28, a gel manicure is $45, a classic pedicure is $42 and a spa pedicure is $60. An acrylic full set starts at $65. The mani and pedi combo is $85. Nail art starts at $10.", tags: ["pricing"] },
      { title: "What is your cancellation policy?", content: "Please cancel at least 24 hours ahead. Cancellations with less notice, and no-shows, are charged a $15 fee on the next visit.", tags: ["cancellation", "fees"] },
      { title: "How long do gel and acrylic nails last?", content: "Gel color usually lasts two to three weeks, dip powder three to four weeks, and acrylics need a fill every two to three weeks. Your technician will suggest a schedule.", tags: ["gel", "acrylic", "care"] },
      { title: "Do I need to remove my old nails first?", content: "If you have gel, dip or acrylic from another salon, we remove it before your new set. Removal takes about 20 minutes and costs $15. Tell us when you book so we leave enough time.", tags: ["removal"] },
      { title: "Is your salon clean and safe?", content: "Yes. We sterilize metal tools in a hospital-grade autoclave, use a fresh file and buffer for every guest, and clean the pedicure basins between guests. We do not use blades on calluses.", tags: ["sanitation", "safety"] },
      { title: "Can I bring a photo for nail art?", content: "Please do. Show it to your technician at the start, and we will tell you the price before we begin.", tags: ["nail art"] },
      { title: "Do you take groups, bridal parties and kids?", content: "Yes. For groups of four or more, we take the details and the studio manager confirms the booking. Kids 12 and under can have a classic manicure or pedicure for $20 with a parent present.", tags: ["groups", "kids"] },
      { title: "Where are you and can I park?", content: "We are at 1215 Montana Avenue in Santa Monica. There is free two-hour parking in the lot behind the building, and metered parking on the street.", tags: ["location", "parking"] },
      { title: "Do you sell gift cards?", content: "Yes, in any amount at the front desk or through our website. They do not expire.", tags: ["gift cards"] },
    ],
    rules: [
      { title: "Ask about removals and nail art", content: "Always ask whether the caller has existing gel, dip or acrylic that needs removal and whether they want nail art, because both add time." },
      { title: "No medical advice", content: "If a caller describes pain, swelling, a nail infection or a skin condition, do not advise them. Suggest they see a doctor first and offer to rebook once it clears." },
      { title: "Groups", content: "For parties of four or more, take the contact details and the date, and say the studio manager will confirm within one business day." },
      { title: "Technician requests", content: "Note a technician request, but never promise it. If they are booked, offer the next opening or another technician." },
      { title: "Late guests", content: "If a caller is running late, say the studio holds the spot for 15 minutes. After that, the service may be shortened or rebooked." },
    ],
  },
  {
    key: "bank",
    name: "Cedar Ridge Community Bank",
    slug: "cedar-ridge-community-bank",
    type: "bank",
    timezone: "America/Denver",
    currency: "USD",
    locale: "en",
    areaCode: "303",
    hours: [...windows([MON, TUE, WED, THU, FRI], [["09:00", "17:00"]]), ...windows([SAT], [["09:00", "12:00"]])],
    closure: { month: 12, day: 25, reason: "Christmas Day" },
    summary:
      "Cedar Ridge Community Bank is a locally owned bank in Denver with personal, small business and mortgage banking. The main branch has a drive-through, 24-hour ATM and safe deposit boxes. Customers book in-branch appointments with a personal banker, loan officer, business banker or financial advisor.",
    greeting: "Thank you for calling Cedar Ridge Community Bank. I can schedule a branch appointment and answer general questions. How can I help?",
    tone: "Professional, calm and reassuring. Be precise, never casual about money, and never rush.",
    bookingPolicy: "Ask what the caller needs and book with the right specialist. Appointments last 15 to 60 minutes. Ask callers to bring a government photo ID, and a list of documents for loan visits. Same-day visits are possible when someone is free.",
    services: [
      { name: "Open a New Account", slug: "open-a-new-account", minutes: 45, description: "Checking, savings, or both, with a personal banker.", price: { type: "in_person" } },
      { name: "Mortgage Consultation", slug: "mortgage-consultation", minutes: 60, description: "Home purchase and refinance options with a loan officer.", price: { type: "in_person" } },
      { name: "Personal & Auto Loan Consultation", slug: "personal-auto-loan-consultation", minutes: 45, description: "Options for a car, home project or other personal loan.", price: { type: "in_person" } },
      { name: "Small Business Banking Review", slug: "small-business-banking-review", minutes: 60, description: "Business accounts, lending and merchant services with a business banker.", price: { type: "in_person" } },
      { name: "Investment & Retirement Planning", slug: "investment-retirement-planning", minutes: 60, description: "A first conversation about IRAs, CDs and investing with a financial advisor.", price: { type: "in_person" } },
      { name: "Fraud & Dispute Assistance", slug: "fraud-dispute-assistance", minutes: 30, description: "Help with a suspicious charge, a lost card or a disputed transaction.", price: { type: "in_person" } },
      { name: "Safe Deposit Box Rental", slug: "safe-deposit-box-rental", minutes: 20, description: "Rent a box in three sizes and sign the access agreement.", price: { type: "in_person" } },
      { name: "Notary Service", slug: "notary-service", minutes: 15, description: "A notary signing. Free for customers, with a photo ID.", price: { type: "fixed", minor: 1000 } },
    ],
    staff: [
      { name: "Rachel Kim", services: ["Open a New Account", "Fraud & Dispute Assistance", "Safe Deposit Box Rental", "Notary Service"], hours: [...windows([MON, TUE, WED, THU, FRI], [["09:00", "12:30"], ["13:30", "17:00"]]), ...windows([SAT], [["09:00", "12:00"]])] },
      { name: "Tom Alvarez", services: ["Mortgage Consultation", "Personal & Auto Loan Consultation"], hours: [...windows([MON, TUE, WED, THU], [["09:00", "12:00"], ["13:00", "17:00"]]), ...windows([SAT], [["09:00", "12:00"]])] },
      { name: "Priya Shah", services: ["Small Business Banking Review", "Open a New Account", "Notary Service"], hours: [...windows([TUE, WED, THU, FRI], [["09:00", "12:00"], ["13:00", "17:00"]])], timeOffInDays: [9, 11, "Conference"] },
      { name: "Daniel Whitfield", services: ["Investment & Retirement Planning"], hours: [...windows([MON, WED, FRI], [["09:00", "12:00"], ["13:00", "16:30"]])] },
    ],
    contacts: [
      { name: "Walter Henderson", email: "walter.henderson@example.com" }, { name: "Maria Gutierrez" }, { name: "Kevin Brandt", email: "kevin.brandt@example.com" },
      { name: "Susan Albright" }, { name: "Omar Haddad", email: "omar.haddad@example.com" }, { name: "Linda Park" },
      { name: "Robert Castellano", email: "robert.castellano@example.com" }, { name: "Tanya Beckett" }, { name: "Greg Sorensen", email: "greg.sorensen@example.com" },
      { name: "Patricia Nguyen" }, { name: "Dennis Okafor", email: "dennis.okafor@example.com" }, { name: "Alicia Morales" },
      { name: "Frank Delaney", email: "frank.delaney@example.com" }, { name: "Joanne Whitaker" }, { name: "Victor Ramos", email: "victor.ramos@example.com" },
      { name: "Elaine Fischer" }, { name: "Harold Mendez", email: "harold.mendez@example.com" }, { name: "Christine Bauer" },
    ],
    notes: ["First home purchase.", "Bringing the business formation documents.", "Opening an account for a teenager.", "Lost debit card yesterday.", "Needs a notary for a vehicle title.", "Prefers a morning appointment."],
    internalNotes: ["Long-time customer, 15 years.", "Pre-approval letter was issued last month.", "Referred by a business customer.", "Hard of hearing, speak clearly."],
    perStaffPerDay: [3, 6],
    faqs: [
      { title: "What do I need to open an account?", content: "Bring a government photo ID, your Social Security number or ITIN, and proof of your address, such as a utility bill or lease. A minimum opening deposit of $25 is needed for checking.", tags: ["accounts", "documents"] },
      { title: "Are there monthly fees on checking?", content: "Everyday Checking has no monthly fee when you set up direct deposit or keep a $500 balance. Otherwise it is $8 a month. Student accounts have no monthly fee.", tags: ["fees", "checking"] },
      { title: "What should I bring to a mortgage appointment?", content: "Bring your last two pay stubs, two years of W-2s or tax returns, two months of bank statements and a photo ID. Self-employed borrowers bring two years of business returns. The loan officer reviews your options and does not need a credit check for the first meeting.", tags: ["mortgage", "documents"] },
      { title: "How do I report a lost or stolen card?", content: "Call our 24-hour card line at 1-800-555-0142 right away, and we will block the card. You can also visit a branch to get a replacement. Never share your card PIN with anyone, including the bank.", tags: ["cards", "fraud"] },
      { title: "What are the branch and drive-through hours?", content: "The lobby is open Monday to Friday from 9 a.m. to 5 p.m. and Saturday from 9 a.m. to noon. The drive-through is open an hour later on weekdays. The ATM is available 24 hours.", tags: ["hours", "drive-through"] },
      { title: "What documents does a business account need?", content: "Bring your formation documents, EIN confirmation, a business license if one applies, an operating agreement, and a photo ID for every owner with 25 percent or more.", tags: ["business", "documents"] },
      { title: "Do you offer safe deposit boxes?", content: "Yes, in small, medium and large, from $45 to $140 a year. You need a photo ID and a checking or savings account with us.", tags: ["safe deposit"] },
      { title: "When is the wire transfer cutoff?", content: "Outgoing domestic wires received by 3 p.m. Mountain time go out the same business day. Wires after that go the next business day.", tags: ["wires"] },
      { title: "Is notary service free?", content: "Yes for customers, and $10 for everyone else. The signer must be present with a valid photo ID, and the document must not be signed beforehand.", tags: ["notary"] },
      { title: "Where is the branch and where do I park?", content: "We are at 800 Cedar Street in downtown Denver, on the corner with 8th Street. A free customer lot is behind the building, and the light rail stops two blocks away.", tags: ["location", "parking"] },
    ],
    rules: [
      { title: "Never ask for sensitive details", content: "Never ask for or accept a full Social Security number, account number, card number, PIN, password or one-time code. Say the banker will handle verification in person." },
      { title: "Fraud and lost cards", content: "If a caller reports fraud or a lost card, give the 24-hour card line, 1-800-555-0142, first. Then offer a fraud assistance appointment." },
      { title: "No financial advice or rates", content: "Never recommend a product or say what is best for someone. Never quote an interest rate, since rates change. Offer an appointment with the right specialist." },
      { title: "Match the specialist", content: "Book mortgage and loan questions with a loan officer, business questions with the business banker, and investing questions with the financial advisor." },
      { title: "Documents", content: "Always tell callers to bring a government photo ID, and mention the documents for mortgage, loan and business appointments." },
    ],
  },
  {
    key: "dental",
    name: "Brightside Family Dental",
    slug: "brightside-family-dental",
    type: "dental office",
    timezone: "America/Phoenix",
    currency: "USD",
    locale: "en",
    areaCode: "602",
    hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "13:00"]])],
    closure: { month: 12, day: 24, reason: "Christmas Eve" },
    summary:
      "Brightside Family Dental is a family dental practice in Phoenix with two dentists and two hygienists. It treats adults and children with cleanings, exams, fillings, whitening and clear aligners, and keeps time open each day for dental emergencies. It accepts most major dental insurance plans.",
    greeting: "Thank you for calling Brightside Family Dental. I can book a visit, help with a dental emergency or answer questions about insurance. How can I help?",
    tone: "Kind, reassuring and unhurried. Many callers feel nervous about the dentist, so keep it gentle and clear.",
    bookingPolicy: "Ask whether the caller is a new patient and whether they have pain or a dental emergency. New patients book a 60-minute exam. Ask for their insurance provider name and tell them to arrive 15 minutes early to complete forms.",
    services: [
      { name: "New Patient Exam & X-rays", slug: "new-patient-exam-xrays", minutes: 60, description: "A full exam, X-rays, an oral cancer screening and a treatment plan.", price: { type: "fixed", minor: 14500 } },
      { name: "Routine Cleaning & Exam", slug: "routine-cleaning-exam", minutes: 60, description: "A hygienist cleaning followed by a dentist exam.", price: { type: "fixed", minor: 13500 } },
      { name: "Children's Cleaning (12 & under)", slug: "childrens-cleaning", minutes: 30, description: "A gentle cleaning, fluoride and an exam for children 12 and under.", price: { type: "fixed", minor: 8500 } },
      { name: "Same-Day Emergency Visit", slug: "same-day-emergency-visit", minutes: 30, description: "Toothaches, chipped or broken teeth, lost fillings and swelling. The price depends on the treatment.", price: { type: "range", minor: 9500, maxMinor: 18000 } },
      { name: "Filling", slug: "filling", minutes: 60, description: "A tooth-colored filling for a cavity. The price depends on the size and number of surfaces.", price: { type: "range", minor: 15000, maxMinor: 32000 } },
      { name: "Teeth Whitening", slug: "teeth-whitening", minutes: 60, description: "An in-office whitening treatment, usually several shades brighter in one visit.", price: { type: "fixed", minor: 32900 } },
      { name: "Root Canal & Crown Consultation", slug: "root-canal-crown-consultation", minutes: 30, description: "An exam and a clear estimate for a root canal or a crown.", price: { type: "fixed", minor: 7500 } },
      { name: "Clear Aligner Consultation", slug: "clear-aligner-consultation", minutes: 45, description: "A scan and a plan for straightening your teeth with clear aligners.", price: { type: "in_person" } },
      { name: "Wisdom Teeth Consultation", slug: "wisdom-teeth-consultation", minutes: 30, description: "An X-ray and a discussion of whether and when to remove wisdom teeth.", price: { type: "fixed", minor: 7500 } },
    ],
    staff: [
      { name: "Dr. Samantha Lee", services: ["New Patient Exam & X-rays", "Routine Cleaning & Exam", "Same-Day Emergency Visit", "Filling", "Root Canal & Crown Consultation", "Wisdom Teeth Consultation"], hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]])] },
      { name: "Dr. Raj Mehta", services: ["New Patient Exam & X-rays", "Routine Cleaning & Exam", "Same-Day Emergency Visit", "Filling", "Teeth Whitening", "Clear Aligner Consultation", "Root Canal & Crown Consultation"], hours: [...windows([TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "13:00"]])], timeOffInDays: [12, 14, "Dental conference"] },
      { name: "Karen Alvarez, RDH", services: ["Routine Cleaning & Exam", "Children's Cleaning (12 & under)", "Teeth Whitening"], hours: [...windows([MON, TUE, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "13:00"]])] },
      { name: "Tina Brooks, RDH", services: ["Routine Cleaning & Exam", "Children's Cleaning (12 & under)"], hours: [...windows([MON, WED, THU], [["08:00", "12:00"], ["13:00", "17:00"]]), ...windows([FRI], [["08:00", "13:00"]])] },
    ],
    contacts: [
      { name: "Megan Sullivan", email: "megan.sullivan@example.com" }, { name: "Carlos Ibarra" }, { name: "Natalie Cho", email: "natalie.cho@example.com" },
      { name: "Ethan Brooks" }, { name: "Valeria Moreno", email: "valeria.moreno@example.com" }, { name: "Jack Donnelly" },
      { name: "Aisha Rahman", email: "aisha.rahman@example.com" }, { name: "Tyler Wagner" }, { name: "Sophia Ricci", email: "sophia.ricci@example.com" },
      { name: "Daniel Okoye" }, { name: "Hannah Lindgren", email: "hannah.lindgren@example.com" }, { name: "Mateo Salazar" },
      { name: "Grace Whitman", email: "grace.whitman@example.com" }, { name: "Benjamin Tran" }, { name: "Chloe Peterson", email: "chloe.peterson@example.com" },
      { name: "Luis Herrera" }, { name: "Emma Kowalski", email: "emma.kowalski@example.com" }, { name: "Raymond Stone" },
    ],
    notes: ["Nervous about the dentist, please be gentle.", "Chipped a front tooth.", "Wants whitening before a wedding.", "New patient, insurance is Delta Dental.", "Bringing his daughter, age 7.", "Has a toothache for two days."],
    internalNotes: ["Dental anxiety, offer extra time.", "Overdue for X-rays.", "Allergic to latex, use nitrile gloves.", "Interested in clear aligners."],
    perStaffPerDay: [4, 8],
    faqs: [
      { title: "Are you accepting new patients?", content: "Yes. New patients book a 60-minute exam with X-rays. Arrive 15 minutes early, or fill out the forms online in advance.", tags: ["new patients"] },
      { title: "Which insurance plans do you accept?", content: "We are in network with most major plans, including Delta Dental, Cigna, MetLife, Aetna and Guardian. Coverage depends on your plan, so we check your benefits before your visit and tell you the cost.", tags: ["insurance"] },
      { title: "What if I don't have insurance?", content: "Our membership plan is $349 a year per adult and includes two cleanings, exams and X-rays, plus 20 percent off other treatment. We also accept CareCredit for payment plans.", tags: ["no insurance", "membership", "payment"] },
      { title: "Do you handle dental emergencies?", content: "Yes. We keep time open each day for emergencies such as severe pain, a broken or knocked-out tooth, or swelling. Call as early as you can and we will see you the same day when we can.", tags: ["emergency"] },
      { title: "What is your cancellation policy?", content: "Please give us 24 hours' notice to cancel or reschedule. Missed appointments without notice may be charged a $50 fee.", tags: ["cancellation", "fees"] },
      { title: "Do you see children?", content: "Yes, from the first tooth. We recommend a first visit by age one, and children's cleanings are quick, gentle and include fluoride.", tags: ["kids"] },
      { title: "I'm nervous about the dentist. What can you do?", content: "Tell us when you book. We can schedule extra time, explain each step, use numbing gel and take breaks. Nitrous oxide is available for a fee.", tags: ["anxiety", "sedation"] },
      { title: "How does teeth whitening work?", content: "We use an in-office treatment that takes about an hour and usually brightens teeth several shades. Some people feel temporary sensitivity. We check your teeth and gums first.", tags: ["whitening"] },
      { title: "How often should I get a cleaning?", content: "Most people should visit every six months. If you have gum disease or a higher risk of cavities, we may suggest every three or four months.", tags: ["cleaning"] },
      { title: "Where is the office and where do I park?", content: "We are at 4120 North Central Avenue in Phoenix, in the building with the green awning. Free parking is in the lot out front, and the building has a step-free entrance.", tags: ["location", "parking"] },
    ],
    rules: [
      { title: "Dental emergencies", content: "Ask if the caller has severe pain, swelling or a knocked-out tooth. For a knocked-out tooth, offer the earliest slot and tell them to keep it moist in milk. If they have swelling that affects their breathing or swallowing, or heavy bleeding, tell them to call 911 or go to the emergency room." },
      { title: "No diagnosis or medical advice", content: "Never diagnose a problem, recommend treatment or say whether a medication is safe. Offer an appointment, or a message for the dentist." },
      { title: "Insurance", content: "Ask for the insurance provider name, and say the office will verify benefits before the visit. Never promise what a plan covers or what the patient will pay." },
      { title: "New patients", content: "Book new patients for a 60-minute exam, ask them to arrive 15 minutes early, and mention the online forms." },
      { title: "Anxious patients", content: "If a caller says they are nervous, be gentle, say the team can schedule extra time, and note it on the appointment." },
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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

// Demo data belongs in a development database. Checks every connection the script opens.
function assertSafeDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production.");
  for (const role of ["lobbystack_app", "lobbystack_auth"] as const) {
    const url = new URL(roleDatabaseUrl(role));
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!LOCAL_HOSTS.has(url.hostname) && !database.endsWith("_test")) {
      throw new Error("Refusing to seed: the database is not local and its name does not end in _test.");
    }
  }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { email: { type: "string" } } });
  if (!positionals.length) {
    console.log("Usage: pnpm seed:business <business...> --email you@example.com\n       pnpm seed:business all\n\nBusinesses:");
    for (const business of businesses) console.log(`  ${business.key.padEnd(14)} ${business.name}`);
    return;
  }
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const chosen = new Set<BusinessSeed>();
  for (const argument of positionals) {
    if (squash(argument) === "all") {
      for (const business of businesses) chosen.add(business);
      continue;
    }
    const wanted = squash(argument);
    const exact = businesses.filter((business) => [business.key, business.slug, business.name].some((candidate) => squash(candidate) === wanted));
    const matches = exact.length ? exact : businesses.filter((business) => [business.key, business.slug, business.name].some((candidate) => squash(candidate).includes(wanted)));
    if (matches.length !== 1) {
      throw new Error(matches.length ? `"${argument}" matches ${matches.map((business) => business.name).join(", ")}. Be more specific.` : `No business matches "${argument}". Run pnpm seed:business to list them.`);
    }
    chosen.add(matches[0]!);
  }

  if (!values.email) throw new Error("Pass --email with the address of the account to seed into.");
  assertSafeDatabase();
  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  try {
    const [account] = await auth.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.normalizedEmail, values.email.trim().toLowerCase()))
      .limit(1);
    if (!account) throw new Error(`No account for ${values.email}.`);
    console.log(`Seeding into ${account.email}.`);
    for (const seed of businesses) {
      if (chosen.has(seed)) await seedBusiness(seed, account, { db: app.db }, businesses.indexOf(seed));
    }
  } finally {
    await Promise.all([auth.pool.end(), app.pool.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
