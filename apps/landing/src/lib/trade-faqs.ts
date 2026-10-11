import type { FaqItem } from "@/lib/seo"

export const plumberFaqs: FaqItem[] = [
  {
    question: "Can it tell a caller how to shut off their water?",
    answer:
      "Yes. Add your shutoff instructions to LobbyStack's knowledge base. When a caller reports an active leak, LobbyStack reads those steps, then transfers the call or books the visit according to your rules.",
  },
  {
    question: "What happens if a caller smells gas?",
    answer:
      "You write the policy. A common one tells callers to leave the building and call the gas utility's emergency line. LobbyStack reads your script to the caller, then transfers the call or takes a message under your rules.",
  },
  {
    question: "Can it quote drain cleaning or a service call fee?",
    answer:
      "Yes, if you give it the numbers. LobbyStack can quote an exact price, a starting price, or a range. You choose which services it quotes and which ones need an estimate visit.",
  },
  {
    question: "Will it book water heater replacements?",
    answer:
      "It books the estimate or site visit. You decide whether it quotes a starting price for installs or hands the caller to your office.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward your current number to LobbyStack, or give it a separate line for after-hours and overflow calls.",
  },
  {
    question:
      "How is an AI answering service different from a live plumbing answering service?",
    answer:
      "A live service puts a human operator on the line, who usually reads a script and takes a message. LobbyStack answers with AI, so it takes several calls at once, books jobs into your calendar during the call, and quotes the prices you set. You can still transfer any call to someone on your team.",
  },
  {
    question: "How much does it cost for a plumbing business?",
    answer:
      "The Free plan includes 30 voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes. Spam calls and calls under 10 seconds don't count toward usage.",
  },
]

export const hvacFaqs: FaqItem[] = [
  {
    question: "Can it answer only when my office is overwhelmed?",
    answer:
      "Yes, through your carrier's call forwarding. Forward calls when your line is busy or nobody answers to cover overflow, forward them after you close for after-hours, or forward every call. LobbyStack answers whatever reaches its number. You might forward overflow in peak season and every call at night.",
  },
  {
    question: "How does it decide which no-heat or no-AC call is urgent?",
    answer:
      "You describe the rule in plain language, for example: no heat and the house is below 55°F, or an elderly person or infant lives there. LobbyStack asks the questions it needs to apply your rule and transfers matching calls to your on-call tech.",
  },
  {
    question: "What happens if my on-call tech doesn't pick up?",
    answer:
      "Transfers are blind: the receptionist hands the call to your on-call number without briefing your tech, then leaves the line. If your tech doesn't pick up, the caller reaches that phone's voicemail, if it has one. If the transfer can't go through, the receptionist tells the caller and offers to take a message, which reaches your inbox with an email alert. Your team can also get a \"Live call transfer failed\" alert. If your plan can't cover another transfer attempt, the receptionist takes a message instead.",
  },
  {
    question: "What system details can it collect?",
    answer:
      "Whatever your techs ask for: system type, brand, approximate age, fuel type, thermostat reading, and the symptoms the caller describes. LobbyStack saves the answers in the call's transcript and recording. When the receptionist takes a message, your inbox gets it with the caller's name, callback number, and urgency. The Google Calendar event shows only the service and the caller's name.",
  },
  {
    question: "Can it quote a tune-up or diagnostic fee?",
    answer:
      "Yes, if you give it the numbers. LobbyStack can state an exact price, a starting price, or a range. For full system replacements, it books an estimate visit instead.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Set your carrier to forward your current number to LobbyStack, either every call or only overflow and after-hours calls. To port the number instead, contact the LobbyStack team. You can replace your LobbyStack number once from Settings > Phone number.",
  },
  {
    question: "Should I use an AI receptionist or a live answering service?",
    answer:
      "People handle unusual calls better. At MAP Communications, a live answering service, agents follow the on-call roster you send and can schedule appointments. Its Pay As You Go plan costs $49 a month plus $1.37 a minute (checked October 9, 2026). LobbyStack's extra minutes cost $0.20 on Starter and $0.18 on Pro. It transfers to one number, though. Choose a live service if you want a person on every call or a rotating on-call list.",
  },
  {
    question: "Is an AI receptionist worth it for an HVAC company?",
    answer:
      "It's worth testing if peak season or nights send callers to voicemail. Enter your missed calls per week and average job value in LobbyStack's missed-call revenue calculator to estimate the revenue at risk. Then try the receptionist on the Free plan before you forward a line.",
  },
  {
    question: "Can I try it before I forward my line?",
    answer:
      "Yes. The Free plan gives you 30 browser voice minutes a month to test the receptionist from the dashboard. It needs no credit card, includes no telephone number, and doesn't expire. Phone calls, transfers, and texts start on Starter.",
  },
  {
    question: "How much does it cost for an HVAC company?",
    answer:
      "Prices as of October 2026: the Free plan includes 30 browser voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes, with extra minutes at $0.20 and $0.18. No plan has a setup fee. Calls under 10 seconds and calls the receptionist ends as spam don't count toward usage.",
  },
]

export const electricianFaqs: FaqItem[] = [
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
      "You choose the questions. Common ones cover panel amperage, the home's age, the charger or generator the caller wants, and whether they own the home. LobbyStack saves the answers in the call's transcript.",
  },
  {
    question: "Can it route commercial and residential calls differently?",
    answer:
      "Partly. LobbyStack can ask whether the property is commercial or residential, then book one kind and take a message for the other. Transfers go to one number, so it can't send commercial calls to a separate line.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward your current number to LobbyStack, or use a separate line for after-hours and overflow calls.",
  },
  {
    question: "What does an electrician answering service need to handle?",
    answer:
      "Two kinds of calls: hazards that need safety instructions and a fast transfer, and estimate requests that need the right intake questions. LobbyStack handles both with rules you write and books estimates into your calendar during the call.",
  },
  {
    question: "How much does it cost for an electrical contractor?",
    answer:
      "The Free plan includes 30 voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes. Spam calls and calls under 10 seconds don't count toward usage.",
  },
]

export const garageDoorFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for garage door repair companies?",
    answer:
      "An AI receptionist for garage door repair answers incoming calls, collects issue details, books service appointments, and routes urgent calls like stuck doors or broken springs to your on-call technician.",
  },
  {
    question: "Can it handle emergency garage door calls after hours?",
    answer:
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports a car trapped inside or a door stuck open at night, it transfers them to your on-call tech. The answers it collected stay in the call's transcript.",
  },
  {
    question: "Will it book appointments while I am on a job?",
    answer:
      "Yes. While you are replacing springs or installing openers, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask garage door callers?",
    answer:
      "You choose the questions: door type, opener brand, issue symptoms, door size, spring type, and anything else your team needs before dispatching. LobbyStack saves the answers in the call's transcript.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of every call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does it cost for a garage door repair business?",
    answer:
      "LobbyStack has a free plan with included voice minutes and paid plans for higher call volume. Most garage door repair shops start on the free plan and upgrade as call volume grows. See the pricing page for current rates.",
  },
]

export const applianceRepairFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for appliance repair companies?",
    answer:
      "An AI receptionist for appliance repair answers incoming calls, collects brand and model details, books service appointments, and routes urgent calls like refrigerator failures to your on-call technician.",
  },
  {
    question: "Can it handle urgent appliance calls after hours?",
    answer:
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports a refrigerator that stopped working or a washing machine flooding, it transfers them to your on-call tech. The answers it collected stay in the call's transcript.",
  },
  {
    question: "Will it book appointments while I am on a repair?",
    answer:
      "Yes. While you are diagnosing a dishwasher or replacing a compressor, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask appliance callers?",
    answer:
      "You choose the questions: appliance type, brand, model number, issue symptoms, purchase age, and anything else your team needs before scheduling a visit. LobbyStack saves the answers in the call's transcript.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of every call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does it cost for an appliance repair business?",
    answer:
      "LobbyStack has a free plan with included voice minutes and paid plans for higher call volume. Most appliance repair shops start on the free plan and upgrade as call volume grows. See the pricing page for current rates.",
  },
]

export const restorationFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for restoration companies?",
    answer:
      "An AI receptionist for restoration companies answers incoming calls, collects damage details and urgency, books estimate appointments, and routes emergency calls like flood or fire damage to your on-call team.",
  },
  {
    question: "Can it handle emergency restoration calls after hours?",
    answer:
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports water damage, smoke damage, or mold, it transfers them to your on-call team. The answers it collected stay in the call's transcript. Routine estimate requests go to the morning queue.",
  },
  {
    question: "Will it book estimate visits while my team is on site?",
    answer:
      "Yes. While your crew is mitigating damage or reconstructing, LobbyStack checks your calendar, offers open slots, and books the estimate before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask restoration callers?",
    answer:
      "You choose the questions: damage type, affected area size, water source, timeline, insurance status, and anything else your team needs before dispatching. LobbyStack saves the answers in the call's transcript.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of every call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does it cost for a restoration business?",
    answer:
      "LobbyStack has a free plan with included voice minutes and paid plans for higher call volume. Most restoration companies start on the free plan and upgrade as call volume grows. See the pricing page for current rates.",
  },
]

export const locksmithFaqs: FaqItem[] = [
  {
    question: "What is an AI receptionist for locksmiths?",
    answer:
      "An AI receptionist for locksmiths answers incoming calls, collects lockout details and location, books service appointments, and routes emergency lockout calls to your on-call technician.",
  },
  {
    question: "Can it handle emergency lockout calls after hours?",
    answer:
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller is locked out of their home or car, it transfers them to your on-call locksmith. The location and answers it collected stay in the call's transcript.",
  },
  {
    question: "Will it book appointments while I am on a job?",
    answer:
      "Yes. While you are rekeying locks or installing hardware, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask locksmith callers?",
    answer:
      "You choose the questions: lockout type, location, vehicle or property type, key situation, urgency, and anything else your team needs before dispatching. LobbyStack saves the answers in the call's transcript.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. LobbyStack saves a summary, transcript, and recording of every call in your dashboard. When it takes a message, your team gets an email alert, or a text alert if you turn those on.",
  },
  {
    question: "How much does it cost for a locksmith business?",
    answer:
      "LobbyStack has a free plan with included voice minutes and paid plans for higher call volume. Most locksmith shops start on the free plan and upgrade as call volume grows. See the pricing page for current rates.",
  },
]

export const propertyManagementFaqs: FaqItem[] = [
  {
    question: "Can it tell a maintenance emergency from a routine request?",
    answer:
      "Yes. You give LobbyStack your emergency list in plain language, such as flooding, no heat below a set temperature, a gas smell, or a lockout. It asks follow-up questions, transfers matching calls to your on-call tech, and sends the rest to your morning queue.",
  },
  {
    question: "Can it answer questions about my properties?",
    answer:
      "Yes. Add details like rent, deposits, pet policy, parking, and open units to LobbyStack's knowledge base. It answers from those details and flags anything it can't answer for your office.",
  },
  {
    question: "Can it book showings?",
    answer:
      "Yes. LobbyStack checks your leasing agent's calendar, offers open times, books the showing, and sends a confirmation text.",
  },
  {
    question: "Does it work with my existing office number?",
    answer:
      "Yes. Forward your office line to LobbyStack after hours or all day, and tenants keep calling the number they know.",
  },
  {
    question: "How much does a property management answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes. Spam calls and calls under 10 seconds don't count toward usage.",
  },
]

export const roofingFaqs: FaqItem[] = [
  {
    question: "Can it handle a surge of calls after a storm?",
    answer:
      "Yes. Plans don't limit how many calls LobbyStack answers at once. New calls get a busy signal only if an owner or admin sets a monthly overage cap and you reach it. It books inspections into your open slots and queues the rest for your office.",
  },
  {
    question: "What does it do with an active leak?",
    answer:
      "It follows your rules. A common setup asks for the address and what's leaking, transfers active leaks to your on-call crew, and books everything else for inspection.",
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
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward your current number to LobbyStack, or send only overflow and after-hours calls to it.",
  },
  {
    question: "How much does a roofing answering service cost?",
    answer:
      "LobbyStack's Free plan includes 30 voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes, with extra minutes at $0.20 and $0.18. Spam calls and calls under 10 seconds don't count toward usage.",
  },
]
