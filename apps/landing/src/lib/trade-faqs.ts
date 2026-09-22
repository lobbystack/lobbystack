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
      "You write the policy. A common one tells callers to leave the building and call the gas utility's emergency line. LobbyStack follows your script and notifies your team.",
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
      "Yes. You can set LobbyStack to answer every call, or only when your team is busy, closed, or unavailable. You might run overflow mode in peak season and full coverage after hours.",
  },
  {
    question: "How does it decide which no-heat or no-AC call is urgent?",
    answer:
      "You describe the rule in plain language, for example: no heat and the house is below 55°F, or an elderly person or infant lives there. LobbyStack asks the questions it needs to apply your rule and transfers matching calls to your on-call tech.",
  },
  {
    question: "What system details can it collect?",
    answer:
      "Whatever your techs ask for: system type, brand, approximate age, fuel type, thermostat reading, and the symptoms the caller describes. The details appear in the call summary and on the booking.",
  },
  {
    question: "Can it quote a tune-up or diagnostic fee?",
    answer:
      "Yes, if you give it the numbers. LobbyStack can state an exact price, a starting price, or a range. For full system replacements, it books an estimate visit instead.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward your current number to LobbyStack, or point only your overflow and after-hours calls at it.",
  },
  {
    question: "Should I use an AI or a live HVAC answering service?",
    answer:
      "It depends on which calls you want a person to take. LobbyStack fits when you want calls booked into your calendar during the call and overflow handled without a busy signal. You can run it on overflow only and keep your office on the calls you want to answer yourself.",
  },
  {
    question: "How much does it cost for an HVAC company?",
    answer:
      "The Free plan includes 30 voice minutes. Starter is $30 a month for 150 minutes, and Pro is $100 a month for 500 minutes, with extra minutes at $0.20 and $0.18. Spam calls and calls under 10 seconds don't count toward usage.",
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
      "You choose the questions. Common ones cover panel amperage, the home's age, the charger or generator the caller wants, and whether they own the home. LobbyStack attaches the answers to the estimate booking.",
  },
  {
    question: "Can it route commercial and residential calls differently?",
    answer:
      "Yes. LobbyStack can ask whether the property is commercial or residential and send commercial calls to your estimator or office line.",
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
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports a car trapped inside or a door stuck open at night, it transfers them to your on-call tech with the details already collected.",
  },
  {
    question: "Will it book appointments while I am on a job?",
    answer:
      "Yes. While you are replacing springs or installing openers, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask garage door callers?",
    answer:
      "You choose the questions: door type, opener brand, issue symptoms, door size, spring type, and anything else your team needs before dispatching. Answers are attached to the booking summary.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. After every call, LobbyStack sends a summary with the caller details, issue description, appointment time, transcript, and recording. You review it from the dashboard or via email and SMS alerts.",
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
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports a refrigerator that stopped working or a washing machine flooding, it transfers them to your on-call tech with the details already collected.",
  },
  {
    question: "Will it book appointments while I am on a repair?",
    answer:
      "Yes. While you are diagnosing a dishwasher or replacing a compressor, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask appliance callers?",
    answer:
      "You choose the questions: appliance type, brand, model number, issue symptoms, purchase age, and anything else your team needs before scheduling a visit. Answers are attached to the booking summary.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. After every call, LobbyStack sends a summary with the caller details, appliance description, appointment time, transcript, and recording. You review it from the dashboard or via email and SMS alerts.",
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
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller reports water damage, smoke damage, or mold, it transfers them to your on-call team with the details already collected. Routine estimate requests go to the morning queue.",
  },
  {
    question: "Will it book estimate visits while my team is on site?",
    answer:
      "Yes. While your crew is mitigating damage or reconstructing, LobbyStack checks your calendar, offers open slots, and books the estimate before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask restoration callers?",
    answer:
      "You choose the questions: damage type, affected area size, water source, timeline, insurance status, and anything else your team needs before dispatching. Answers are attached to the booking summary.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. After every call, LobbyStack sends a summary with the caller details, damage description, appointment time, transcript, and recording. You review it from the dashboard or via email and SMS alerts.",
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
      "Yes. LobbyStack answers after-hours calls and follows your escalation rules. If a caller is locked out of their home or car, it transfers them to your on-call locksmith with the location and details already collected.",
  },
  {
    question: "Will it book appointments while I am on a job?",
    answer:
      "Yes. While you are rekeying locks or installing hardware, LobbyStack checks your calendar, offers open slots, and books the appointment before the caller hangs up.",
  },
  {
    question: "What intake questions can it ask locksmith callers?",
    answer:
      "You choose the questions: lockout type, location, vehicle or property type, key situation, urgency, and anything else your team needs before dispatching. Answers are attached to the booking summary.",
  },
  {
    question: "Does it work with my existing business number?",
    answer:
      "Yes. Forward calls from the number your customers already know, or use a dedicated LobbyStack line for overflow and after-hours coverage.",
  },
  {
    question: "Will I see what was discussed on every call?",
    answer:
      "Yes. After every call, LobbyStack sends a summary with the caller details, lockout description, appointment time, transcript, and recording. You review it from the dashboard or via email and SMS alerts.",
  },
  {
    question: "How much does it cost for a locksmith business?",
    answer:
      "LobbyStack has a free plan with included voice minutes and paid plans for higher call volume. Most locksmith shops start on the free plan and upgrade as call volume grows. See the pricing page for current rates.",
  },
]
