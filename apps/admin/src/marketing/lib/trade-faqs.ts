import type { FaqItem } from "@/marketing/lib/seo"

export const plumberFaqs: FaqItem[] = [
  {
    question: "What does a plumbing answering service do?",
    answer:
      "It answers the calls you can't pick up and decides what happens next under your rules. LobbyStack transfers burst pipes and sewage backups to your on-call plumber, books drain and water heater visits into Google Calendar, and saves a summary, transcript, and recording of every call.",
  },
  {
    question: "Can an AI receptionist for plumbers tell callers how to shut off the water?",
    answer:
      "Yes. Add your shutoff steps to LobbyStack's knowledge base, and it reads them to callers who report an active leak. Then it transfers the call or books the visit under your rules. Place a test call to hear how it sounds.",
  },
  {
    question: "What happens if a caller smells gas?",
    answer:
      "LobbyStack reads the gas script you write, then transfers the call or takes a message under your rules. Your script might tell callers to leave the building and call the gas utility's emergency line.",
  },
  {
    question: "Can it quote drain cleaning or a service call fee?",
    answer:
      "Yes, if you give it the numbers. LobbyStack can quote an exact price, a starting price, or a range. You choose which services it quotes and which ones need an estimate visit, such as water heater replacements and repipes.",
  },
  {
    question: "What happens if my on-call plumber doesn't pick up?",
    answer:
      "The caller reaches your plumber's voicemail, if that phone has one. LobbyStack hands the call to your on-call number and leaves the line once it rings. If the transfer can't go through, LobbyStack tells the caller and offers to take a message, and your team can get a \"Live call transfer failed\" alert.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Have your carrier forward your current number to LobbyStack, either every call or only the ones you miss and the ones after hours.",
  },
  {
    question: "How is it different from a live answering service for plumbers?",
    answer:
      "A live service puts an operator on the line, who usually reads your script and takes a message. LobbyStack answers with AI, books jobs into your calendar during the call, and quotes the prices you set. A person handles unusual calls better, so LobbyStack transfers those to your team or takes a message.",
  },
  {
    question: "How much does a plumbing answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const hvacFaqs: FaqItem[] = [
  {
    question: "What does an HVAC answering service do?",
    answer:
      "It answers the calls your office misses and decides what happens next under your rules. LobbyStack transfers no-heat, no-AC, and gas-smell calls to your on-call tech, books tune-ups and estimate visits into Google Calendar, and saves a summary, transcript, and recording of each call.",
  },
  {
    question: "Can it answer only when my office is busy?",
    answer:
      "Yes, through your carrier's call forwarding. Forward calls when the line is busy or nobody picks up, forward them after you close, or forward every call. LobbyStack answers whatever reaches its number, so you might forward overflow in peak season and every call at night.",
  },
  {
    question: "How does it decide which no-heat or no-AC call is urgent?",
    answer:
      "You describe the rule in plain words, for example: no heat and the house is below 55°F, or an elderly person or infant lives there. LobbyStack asks the questions your rule needs and transfers matching calls to your on-call tech.",
  },
  {
    question: "What happens if my on-call tech doesn't pick up?",
    answer:
      "The caller reaches your tech's voicemail, if that phone has one. LobbyStack hands the call to your on-call number without briefing your tech, then leaves the line. If the transfer can't go through, LobbyStack tells the caller and offers to take a message, which reaches your inbox with an email alert, and your team can get a \"Live call transfer failed\" alert. If your plan can't cover another transfer attempt, it takes a message instead.",
  },
  {
    question: "Can an AI receptionist for HVAC answer callers who speak Spanish?",
    answer:
      "Yes. Each call opens in your default language: English, French, Spanish, Serbian, German, Brazilian Portuguese, Italian, or Dutch. If the caller asks to switch or speaks another language, LobbyStack answers in that language. It runs on OpenAI GPT-Live, which handles more than 70 languages, and your urgency rules stay the same in each one.",
  },
  {
    question: "What system details can it collect?",
    answer:
      "Whatever your techs ask for: system type, brand, approximate age, fuel type, thermostat reading, and the symptoms the caller describes. LobbyStack saves the answers with the call's transcript and recording. When it takes a message, your inbox gets the caller's name, callback number, and urgency. The Google Calendar event shows only the service and the caller's name.",
  },
  {
    question: "Does it work with ServiceTitan, Housecall Pro, or Jobber?",
    answer:
      "Not directly. Google Calendar is the only calendar LobbyStack connects to. It sends signed webhooks when a call ends, an appointment is booked, rescheduled, or cancelled, a message is taken, or a contact is created, and it has a REST API with scoped keys. Zapier connects through both. If you run your shop in Jobber or Housecall Pro, their own receptionists book jobs straight into that software, and LobbyStack can't.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Have your carrier forward your current number to LobbyStack, either every call or only overflow and after-hours calls. To port the number instead, contact the LobbyStack team. You can replace your LobbyStack number once from Settings > Phone number.",
  },
  {
    question: "Should I use an AI receptionist or a live HVAC answering service?",
    answer:
      "Choose a live service if you want a person on every call or a rotating on-call list, since LobbyStack transfers to one number. People also handle unusual calls better. At MAP Communications, a live answering service, agents follow the on-call roster you send and can schedule appointments. Its Pay As You Go plan costs $49 a month plus $1.37 a minute (checked October 9, 2026). LobbyStack's extra minutes cost $0.20 on Starter and $0.18 on Pro.",
  },
  {
    question: "Can I try it before I forward my line?",
    answer:
      "Yes. The Free plan gives you 30 voice minutes a month and a US or Canadian number free for 14 days, with no credit card. During those 14 days, the number answers real calls, and transfers go only to the mobile number you verified. Choose Starter or Pro to keep the number.",
  },
  {
    question: "How much does an HVAC answering service cost?",
    answer:
      "Prices as of October 2026: the Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. Billed annually, Starter is $288 a year and Pro $960. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const electricianFaqs: FaqItem[] = [
  {
    question: "What does an electrician answering service need to handle?",
    answer:
      "Two kinds of calls: hazards that need safety instructions and a fast transfer, and estimate requests that need the right questions. LobbyStack handles both with rules you write, and it books estimates into Google Calendar during the call.",
  },
  {
    question: "What does it say to someone reporting sparks or smoke?",
    answer:
      "It reads the safety script you write, such as shutting off the breaker if it's safe to reach, leaving the house, and calling 911 if there's fire. Then it transfers the call to your on-call electrician.",
  },
  {
    question: "Can it tell a utility outage apart from a problem in the house?",
    answer:
      "It asks the questions you'd ask: do the neighbors have power, has the utility posted an outage, did a breaker trip. You decide which answers lead to a booking and which ones point the caller to the utility.",
  },
  {
    question: "What does it ask about panel upgrades and EV chargers?",
    answer:
      "Whatever questions you choose, such as the panel amperage, the home's age, the charger or generator the caller wants, and whether they own the home. LobbyStack saves the answers with the call.",
  },
  {
    question: "How is an AI receptionist different from an electrician virtual receptionist?",
    answer:
      "A virtual receptionist is usually a remote person who answers during set hours. An AI receptionist for electricians, like LobbyStack, answers whenever your carrier forwards a call, follows the rules you write, and transfers to your on-call electrician when a call needs a person.",
  },
  {
    question: "Can it route commercial and residential calls differently?",
    answer:
      "Partly. LobbyStack can ask whether the property is commercial or residential, then book one kind and take a message for the other. Transfers go to one number, so it can't send commercial calls to a separate line.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Have your carrier forward your current number to LobbyStack, either every call or only the ones you miss and the ones after hours.",
  },
  {
    question: "How much does an electrician answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. Estimate calls run longer because of the extra questions, so check a month of usage before you pick a plan. Calls under 10 seconds or ended as spam don't count.",
  },
]

export const garageDoorFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for garage door companies?",
    answer:
      "It answers your calls while you're on a job or off the clock. LobbyStack asks what happened to the door, books repairs and estimates into Google Calendar, and transfers the calls your rules mark urgent, such as a door that won't close at night, to your on-call tech.",
  },
  {
    question: "What does it tell a caller with a broken spring?",
    answer:
      "The safety guidance you write, such as not lifting the door by hand, since the spring carries most of its weight. Then LobbyStack books the repair into your next open slot.",
  },
  {
    question: "Can it handle garage door calls after hours?",
    answer:
      "Yes. LobbyStack follows your rules at night too. A car stuck inside can get the first slot in the morning, and a door that won't close can ring your on-call tech. The caller's answers stay with the call in your dashboard.",
  },
  {
    question: "What can it ask garage door callers?",
    answer:
      "You choose the questions: what happened, whether the door is open or closed, single or double, the opener brand, and any gate code. LobbyStack saves the answers with the call.",
  },
  {
    question: "Can I use it as a garage door answering service for overflow only?",
    answer:
      "Yes. Have your carrier forward calls when your line is busy or nobody picks up, and keep answering the rest yourself. You can also forward every call after hours.",
  },
  {
    question: "Will I see what was said on each call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of each call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does it cost for a garage door company?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const applianceRepairFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for appliance repair?",
    answer:
      "It answers your shop's calls while your techs are on repairs. LobbyStack asks for the appliance, brand, model, and symptoms, quotes the fees you set, and books the visit into Google Calendar during the call.",
  },
  {
    question: "Can it check which brands I service?",
    answer:
      "Yes. List the brands you work on, and LobbyStack tells callers whether you service theirs. A caller with a brand you don't fix hears that before anyone books a visit.",
  },
  {
    question: "Can it quote my diagnostic fee?",
    answer:
      "Yes, if you give it the number. LobbyStack can quote an exact price, a starting price, or a range, and say how the diagnostic fee applies to the repair.",
  },
  {
    question: "What can it ask appliance callers?",
    answer:
      "You choose the questions: appliance type, brand, model number, symptoms, error codes, age, warranty status, and gas or electric. LobbyStack saves the answers with the call, so your tech can read them before the visit.",
  },
  {
    question: "Can it handle urgent calls, like a leaking washer?",
    answer:
      "Yes, under your rules. LobbyStack can read your shutoff advice to the caller and book the first open slot. If you add an on-call number, it can transfer the calls your rules mark urgent.",
  },
  {
    question: "Does it work as an appliance repair answering service on my current number?",
    answer:
      "Yes. Have your carrier forward your current number to LobbyStack, either every call or only the ones you miss and the ones after hours.",
  },
  {
    question: "How much does it cost for an appliance repair shop?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const restorationFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for restoration companies?",
    answer:
      "It answers your calls when your crew is on site or asleep. LobbyStack transfers active flooding, sewage, and fire damage to your on-call crew, books mold inspections and moisture checks into Google Calendar, and saves the water source and insurance details with each call.",
  },
  {
    question: "Can it work as a water damage answering service at night?",
    answer:
      "Yes. Forward your line after hours, or forward every call. LobbyStack reads your safety script, asks where the water is coming from and whether it's still coming in, and rings your on-call crew when the call matches your emergency rule.",
  },
  {
    question: "What does it collect for insurance claims?",
    answer:
      "Whatever you ask for, such as the carrier, the claim number if there is one, and whether the caller plans to file. When an adjuster calls, LobbyStack takes a message with the claim number and contact details.",
  },
  {
    question: "Will it book mold inspections and estimates?",
    answer:
      "Yes. LobbyStack asks about recent water events, offers your open slots, and books the inspection while the caller is on the phone. It texts a confirmation if the caller agrees.",
  },
  {
    question: "What happens if my on-call crew doesn't pick up?",
    answer:
      "The caller reaches that phone's voicemail, if it has one. LobbyStack hands the call to your on-call number and leaves the line once it rings. If the transfer can't go through, LobbyStack offers to take a message, and your team can get a \"Live call transfer failed\" alert.",
  },
  {
    question: "Will I see what was said on each call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of each call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does a restoration answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const locksmithFaqs: FaqItem[] = [
  {
    question: "What does a locksmith answering service do?",
    answer:
      "It answers your calls while you're on a job or off the clock. LobbyStack quotes your lockout fee, takes the car or address, and transfers lockouts to your on-call locksmith. Rekeys, key fobs, and installs get booked into Google Calendar.",
  },
  {
    question: "Can it quote my lockout fee?",
    answer:
      "Yes, if you give it the number. LobbyStack can quote an exact price, a starting price, or a range, and tell callers what ID or proof of ownership to have ready.",
  },
  {
    question: "What if a child or pet is locked in a car?",
    answer:
      "LobbyStack asks whether anyone is inside before anything else, then follows the rule you write. That rule might tell the caller to call 911 right away, then transfer the call to your on-call locksmith.",
  },
  {
    question: "What does it ask before it transfers a lockout?",
    answer:
      "The questions you choose, such as whether anyone is locked inside, the exact location, and the make, model, and year of the car. LobbyStack saves the answers with the call.",
  },
  {
    question: "Will an AI receptionist for locksmith services book daytime jobs?",
    answer:
      "Yes. LobbyStack offers your open slots for rekeys, key replacements, and lock installs, books the one the caller picks, and texts a confirmation if they agree.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Have your carrier forward your current number to LobbyStack, either every call or only the ones you miss and the ones after hours.",
  },
  {
    question: "How much does a locksmith answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const propertyManagementFaqs: FaqItem[] = [
  {
    question: "What does a property management answering service do?",
    answer:
      "It answers tenant and prospect calls when your office can't. LobbyStack transfers the emergencies on your list to your on-call maintenance tech, logs routine repairs for the morning, answers leasing questions, and books showings.",
  },
  {
    question: "Can it tell a maintenance emergency from a routine request?",
    answer:
      "Yes. You give LobbyStack your emergency list in plain words, such as flooding, no heat below a set temperature, a gas smell, or a lockout. It asks follow-up questions, transfers matching calls to your on-call tech, and logs the rest for your morning queue.",
  },
  {
    question: "Can it answer questions about my properties?",
    answer:
      "Yes. Add rent, deposits, pet policy, parking, and open units to LobbyStack's knowledge base. It answers from those details and takes a message for anything it can't answer.",
  },
  {
    question: "Can it book showings?",
    answer:
      "Yes. LobbyStack checks your leasing agent's Google Calendar, offers open times, books the showing, and texts a confirmation if the prospect agrees.",
  },
  {
    question: "Does it work as an answering service for landlords with a few units?",
    answer:
      "Yes. You pay for minutes, so a small portfolio can stay on Starter. Say your units bring 60 after-hours calls a month at 3 minutes each, which is an example. That's 180 minutes: Starter's $30 covers 150, and the other 30 cost $0.20 each, about $36 in all.",
  },
  {
    question: "Does it work with my existing office number?",
    answer:
      "Yes. Forward your office line to LobbyStack after hours or all day, and tenants keep calling the number they know.",
  },
  {
    question: "How much does a property management answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds or ended as spam don't count toward your minutes.",
  },
]

export const roofingFaqs: FaqItem[] = [
  {
    question: "What does a roofing answering service do after a storm?",
    answer:
      "It answers the calls your carrier forwards to it, asks for the address, the roof's age, and the damage the homeowner sees, and books inspections into your open slots. Active leaks go to your on-call crew, and questions for your office become messages.",
  },
  {
    question: "What does it do with an active leak?",
    answer:
      "It rings your on-call crew if your rules say so. LobbyStack can ask for the address and what's leaking first, then book everything without a leak for inspection.",
  },
  {
    question: "Can it answer insurance claim questions?",
    answer:
      "Yes, from the answers you write, such as whether you meet adjusters and which insurers you work with. LobbyStack flags anything outside your script for a callback.",
  },
  {
    question: "Will it quote roof repairs or replacements?",
    answer:
      "It books the inspection or estimate visit. You decide whether it quotes an inspection fee or a starting price for common repairs.",
  },
  {
    question: "How is an AI receptionist for roofers different from a live answering service?",
    answer:
      "A live service puts an operator on the line, who usually takes a message. LobbyStack books the inspection into your calendar during the call and answers insurance questions from your script. A person handles unusual calls better, so LobbyStack takes a message for anything outside your script.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward your current number to LobbyStack, or send it only the calls you miss and the ones after hours.",
  },
  {
    question: "How much does a roofing answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. Take a storm month with 200 calls at 4 minutes each, which is an example and not a forecast. That's 800 minutes, so Pro comes to $100 plus 300 extra minutes at $0.18, or $154. Calls under 10 seconds or ended as spam don't count.",
  },
]

export const contractorFaqs: FaqItem[] = [
  {
    question: "What is a contractor answering service?",
    answer:
      "It answers your line when the crew is off the clock or on another job. LobbyStack matches callers to their project, transfers job-site emergencies to your on-call manager, books consultations for new work, and saves everything else as messages for the morning.",
  },
  {
    question: "How does it decide which after-hours calls are emergencies?",
    answer:
      "You write the rule in plain words, such as active water damage, a safety hazard, or a heating failure in winter. LobbyStack asks the questions your rule needs and transfers matching calls to your on-call number. The rest wait for the morning.",
  },
  {
    question: "Can it tell current clients from new leads?",
    answer:
      "Yes. LobbyStack can ask whether the caller has a project with you and which one. Current clients get your project rules, and new leads get the scope, budget, and timeline questions.",
  },
  {
    question: "Can it book consultations for the next business day?",
    answer:
      "Yes. LobbyStack offers the open slots in your Google Calendar and books the consultation during the call, so new work is on the schedule when your team starts the day.",
  },
  {
    question: "What happens when a caller asks for a quote after hours?",
    answer:
      "LobbyStack asks for the scope of work, the location, and contact details, then books an estimate visit or takes a message for your office. It quotes only the prices you give it.",
  },
  {
    question: "Does an after-hours answering service for contractors filter spam?",
    answer:
      "LobbyStack can hang up on robocalls and sales pitches, and calls it ends as spam don't count toward your minutes. Your on-call phone rings only for the calls your rules send to it.",
  },
  {
    question: "How much does it cost for a contractor?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter costs $30 a month for 150 minutes, and Pro costs $100 a month for 500, with extra minutes at $0.20 and $0.18. No plan has a setup fee, and calls under 10 seconds don't count toward your minutes.",
  },
]
