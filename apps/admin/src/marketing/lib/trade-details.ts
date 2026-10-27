// Trade-specific content for the English "by trade" solution pages: the
// hero's moment, an annotated example call, how each kind of call gets
// handled, the intake questions and the words inside each page's scenes.
// Businesses and people in the examples are fictional.

export type CallAction =
  | "Transfers"
  | "Books"
  | "Answers"
  | "Takes a message"
  | "Ends the call"

export type TradeDetails = {
  business: string
  // Used in headings: "What happens to each plumbing call"
  noun: string
  /** Who urgent calls ring: "on-call plumber". */
  onCall: string
  /** When the example call happens and what's wrong. */
  scenario: string
  call: Array<{
    at: string
    speaker: "caller" | "lobbystack"
    text: string
    note?: string
  }>
  outcome: string
  routing: Array<{ call: string; action: CallAction; detail: string }>
  intake: string[]
  /** The hero scene: one caller's problem and what LobbyStack did with it. */
  hero: {
    caller: string
    problem: string
    quote: string
    time: string
    outcome: string
    detail: string
    kind: "transfer" | "booking"
  }
  /** The centered heading over the example call, with the page's main keyword. */
  pitch: { title: string; intro: string }
  /** The text half of the example call's card. */
  callCard: { title: string; body: string }
  rules: { title: string; intro: string }
  /** The heading over the two feature cards, which hold the page's sections. */
  features: { title: string; intro: string }
  /** The first feature card's scene: a routine job booked into an open slot. */
  booking: { job: string; hours: [number, number, number]; picked: 0 | 1 | 2 }
  /** The second feature card's scene: a caller's question and the answer. */
  answer: { question: string; answer: string; source: string }
  intakeCopy: { title: string; body: string }
  /** What the example call saved, shown in the intake scene. */
  summary: Array<{ label: string; value: string }>
}

export const tradeDetails: Record<string, TradeDetails> = {
  "ai-receptionist-for-plumbers": {
    business: "Northside Plumbing",
    noun: "plumbing",
    onCall: "on-call plumber",
    scenario: "Tuesday, 11:42 p.m. A homeowner calls about water coming through the ceiling.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Thanks for calling Northside Plumbing. What's going on?",
      },
      {
        at: "0:04",
        speaker: "caller",
        text: "There's water coming through my kitchen ceiling. I think a pipe burst upstairs.",
      },
      {
        at: "0:09",
        speaker: "lobbystack",
        text: "Let's stop the water first. Your main shutoff is usually near the water meter or where the line enters the house. Can you get to it?",
        note: "Reads your shutoff steps",
      },
      {
        at: "0:21",
        speaker: "caller",
        text: "It's in the basement. Okay, it's off now.",
      },
      {
        at: "0:24",
        speaker: "lobbystack",
        text: "Good. What's the address, and is the water near any outlets or light fixtures?",
        note: "Takes the address and checks for wiring",
      },
      {
        at: "0:36",
        speaker: "caller",
        text: "418 Maple Street. No, it's away from the lights.",
      },
      {
        at: "0:39",
        speaker: "lobbystack",
        text: "This counts as an emergency, so I'm connecting you to our on-call plumber now.",
        note: "Matches your emergency rule and transfers",
      },
    ],
    outcome:
      "Transferred to the on-call plumber at 0:47. The summary and recording are in the dashboard.",
    routing: [
      {
        call: "Burst pipe or active leak",
        action: "Transfers",
        detail: "Reads your shutoff steps, then rings your on-call plumber",
      },
      {
        call: "Sewage backup",
        action: "Transfers",
        detail: "Asks which drains are backing up, then rings your on-call plumber",
      },
      {
        call: "Clogged drain",
        action: "Books",
        detail: "Offers the next open slot and quotes your starting price, if you set one",
      },
      {
        call: "Water heater replacement",
        action: "Books",
        detail: "Books an estimate visit instead of guessing a price",
      },
      {
        call: "Service area or hours question",
        action: "Answers",
        detail: "Replies from the details you entered",
      },
      {
        call: "Robocall or sales pitch",
        action: "Ends the call",
        detail: "Hangs up, and the call doesn't count toward your minutes",
      },
    ],
    intake: [
      "What's leaking or backed up, and where in the house",
      "Whether water is still running, and if it's clean or sewage",
      "Whether the main water valve is off",
      "The address and property type: house, condo, or commercial",
      "The best callback number",
      "When someone will be home for a visit",
    ],
    hero: {
      caller: "Dana Whitfield",
      problem: "Burst pipe",
      quote: "Water's coming through my kitchen ceiling.",
      time: "Tue 11:42 p.m.",
      outcome: "Transferred to the on-call plumber",
      detail: "Matches your emergency rule",
      kind: "transfer",
    },
    pitch: {
      title: "A plumbing answering service that gets the water shut off before you pick up",
      intro:
        "A homeowner with water on the kitchen floor needs the shutoff valve before they need you. Read one call to a fictional plumbing company, from the greeting to the transfer.",
    },
    callCard: {
      title: "A burst pipe, on your plumber's phone in 47 seconds",
      body: "The caller shut off the main and gave the address before LobbyStack rang the on-call plumber. The address and every answer stay with the call in your dashboard.",
    },
    rules: {
      title: "Your rules decide where each plumbing call goes",
      intro: "You write each rule in plain words. This is one example setup for a plumbing company.",
    },
    features: {
      title: "An answering service for plumbers that books the routine work",
      intro:
        "Most calls aren't emergencies. LobbyStack books the drain and water heater jobs and answers the questions you'd answer yourself.",
    },
    booking: { job: "Clogged kitchen drain", hours: [9, 13, 15], picked: 1 },
    answer: {
      question: "Do you work on tankless water heaters?",
      answer: "Yes. I can book an estimate visit so a plumber can look at it.",
      source: "From your services list",
    },
    intakeCopy: {
      title: "Know what's leaking before you get there",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Problem", value: "Burst pipe, kitchen ceiling" },
      { label: "Main shutoff", value: "Off" },
      { label: "Near wiring", value: "No" },
      { label: "Address", value: "418 Maple Street" },
    ],
  },

  "ai-receptionist-for-hvac": {
    business: "Summit Heating & Air",
    noun: "HVAC",
    onCall: "on-call tech",
    scenario: "January, 6:15 a.m. The furnace quit overnight, and an 84-year-old lives in the house.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Summit Heating and Air, how can I help?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "Our furnace stopped sometime overnight. It's 58 degrees in the house.",
      },
      {
        at: "0:08",
        speaker: "lobbystack",
        text: "Is anyone in the home elderly, an infant, or someone with a medical condition?",
        note: "Asks what your no-heat rule needs",
      },
      {
        at: "0:14",
        speaker: "caller",
        text: "My mom lives with us. She's 84.",
      },
      {
        at: "0:18",
        speaker: "lobbystack",
        text: "Thanks. Is the thermostat set to heat, and have you checked the breaker for the furnace?",
        note: "Runs the checks you approved",
      },
      {
        at: "0:29",
        speaker: "caller",
        text: "Thermostat's on heat. The breaker looks fine.",
      },
      {
        at: "0:32",
        speaker: "lobbystack",
        text: "Then this counts as an emergency under your rules. I'm connecting you to our on-call technician now.",
        note: "Transfers to your on-call tech",
      },
    ],
    outcome:
      "Transferred to the on-call tech at 0:41. The transcript, recording, and summary are saved with the call.",
    routing: [
      {
        call: "No heat below your temperature threshold",
        action: "Transfers",
        detail: "Checks the indoor temperature and who lives in the home, then rings your on-call tech",
      },
      {
        call: "No cooling in a heat wave",
        action: "Transfers",
        detail: "Applies the same temperature and household rule to AC failures",
      },
      {
        call: "Gas smell or CO alarm",
        action: "Transfers",
        detail: "Reads your safety steps and rings your on-call tech right away",
      },
      {
        call: "Thermostat or breaker question",
        action: "Answers",
        detail: "Walks the caller through the checks you approve",
      },
      {
        call: "Caller speaks Spanish or another language",
        action: "Answers",
        detail: "Switches to the caller's language and keeps your urgency rules",
      },
      {
        call: "Tune-up or maintenance visit",
        action: "Books",
        detail: "Books an open maintenance slot and texts a confirmation if the caller agrees",
      },
      {
        call: "System replacement quote",
        action: "Books",
        detail: "Asks for the home size and system age, then books an estimate visit",
      },
      {
        call: "Warranty or billing question",
        action: "Takes a message",
        detail: "Saves the details for your office to call back",
      },
    ],
    intake: [
      "System type: furnace, heat pump, boiler, or central AC",
      "The system's approximate age and brand",
      "The indoor temperature right now",
      "Who lives in the home, including infants, elderly people, or medical needs",
      "The thermostat setting and breaker status",
      "The address and the best time for a visit",
    ],
    hero: {
      caller: "Priya Nair",
      problem: "No heat, 58°F inside",
      quote: "Our furnace stopped sometime overnight.",
      time: "Mon 6:15 a.m.",
      outcome: "Transferred to the on-call tech",
      detail: "Matches your no-heat rule",
      kind: "transfer",
    },
    pitch: {
      title: "An HVAC answering service that asks who's home before it transfers",
      intro:
        "Your rule can depend on the indoor temperature and who lives in the home. Read one call to a fictional HVAC company where both mattered.",
    },
    callCard: {
      title: "No heat with an 84-year-old at home, transferred in 41 seconds",
      body: "LobbyStack asked who lives in the house, ran the thermostat and breaker checks you approved, then rang the on-call tech.",
    },
    rules: {
      title: "Your rules decide where each HVAC call goes",
      intro: "You write each rule in plain words. This is one example setup for an HVAC company.",
    },
    features: {
      title: "An AI receptionist for HVAC that books tune-ups and estimates",
      intro:
        "In peak season your office can't call everyone back. LobbyStack books maintenance and replacement estimates while the caller is still on the phone.",
    },
    booking: { job: "Furnace tune-up", hours: [8, 10, 14], picked: 2 },
    answer: {
      question: "¿Pueden revisar mi aire acondicionado mañana?",
      answer: "Sí. Tengo un horario libre mañana a las 10. ¿Se lo reservo?",
      source: "Switched to Spanish",
    },
    intakeCopy: {
      title: "Know the system and the indoor temperature before you roll a truck",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "System", value: "Gas furnace" },
      { label: "Indoor temp", value: "58°F" },
      { label: "At home", value: "Parent, 84" },
      { label: "Breaker", value: "On" },
    ],
  },

  "ai-receptionist-for-electricians": {
    business: "Brightline Electric",
    noun: "electrical",
    onCall: "on-call electrician",
    scenario: "Saturday, 4:30 p.m. A bedroom outlet smells like burning and feels warm.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Brightline Electric, what can I help with?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "There's a burning smell coming from an outlet in my bedroom, and it's warm to the touch.",
      },
      {
        at: "0:08",
        speaker: "lobbystack",
        text: "If you can reach the breaker panel safely, turn off the breaker for that room. If you see smoke or flames, leave the house and call 911.",
        note: "Reads your safety script",
      },
      {
        at: "0:18",
        speaker: "caller",
        text: "Okay, I flipped the breaker. No smoke.",
      },
      {
        at: "0:21",
        speaker: "lobbystack",
        text: "Good. What's the address, and roughly how old is the house?",
        note: "Takes the address and the home's age",
      },
      {
        at: "0:28",
        speaker: "caller",
        text: "2210 Birch Road. It was built in the sixties.",
      },
      {
        at: "0:32",
        speaker: "lobbystack",
        text: "I'm connecting you to our on-call electrician now.",
        note: "Transfers under your hazard rule",
      },
    ],
    outcome:
      "Transferred to the on-call electrician at 0:40. The hazard, the home's age, and the breaker status are saved with the call.",
    routing: [
      {
        call: "Burning smell, sparks, or a hot outlet",
        action: "Transfers",
        detail: "Reads your safety script, then rings your on-call electrician",
      },
      {
        call: "Whole-house power loss",
        action: "Books",
        detail: "Asks whether the neighbors have power first and points grid outages to the utility",
      },
      {
        call: "Panel upgrade",
        action: "Books",
        detail: "Asks for the panel amperage and the home's age, then books an estimate",
      },
      {
        call: "EV charger install",
        action: "Books",
        detail: "Asks for the charger model and where the car parks, then books an estimate",
      },
      {
        call: "Permit or licensing question",
        action: "Answers",
        detail: "Replies from the details you entered",
      },
      {
        call: "Commercial service request",
        action: "Takes a message",
        detail: "Writes up the job for your estimator to call back",
      },
    ],
    intake: [
      "What the caller sees, smells, or hears",
      "Whether a breaker has tripped",
      "The home's age and panel amperage",
      "Whether the neighbors have power",
      "The charger model or generator size for installs",
      "Owner or renter, and the address",
    ],
    hero: {
      caller: "Marcus Bell",
      problem: "Hot outlet, burning smell",
      quote: "It's warm to the touch.",
      time: "Sat 4:30 p.m.",
      outcome: "Transferred to the on-call electrician",
      detail: "Matches your hazard rule",
      kind: "transfer",
    },
    pitch: {
      title: "An electrician answering service that reads your safety script first",
      intro:
        "A caller with a hot outlet needs to hear your safety script before anything else. Read one hazard call to a fictional electrical contractor, from the burning smell to the transfer.",
    },
    callCard: {
      title: "A hot outlet, breaker off, electrician on the line in 40 seconds",
      body: "LobbyStack read the safety script, confirmed the breaker was off, took the address and the home's age, then rang the on-call electrician.",
    },
    rules: {
      title: "Your rules decide where each electrical call goes",
      intro: "You write each rule in plain words. This is one example setup for an electrical contractor.",
    },
    features: {
      title: "An AI receptionist for electricians that fills your estimate calendar",
      intro:
        "Panel upgrades, EV chargers, and generators are the bigger jobs, and those callers shop around. LobbyStack books the estimate before they dial the next electrician.",
    },
    booking: { job: "EV charger estimate", hours: [9, 11, 15], picked: 0 },
    answer: {
      question: "The whole house just lost power.",
      answer: "Do your neighbors have power? If they don't, it's an outage on the utility's side.",
      source: "From your outage questions",
    },
    intakeCopy: {
      title: "Know the panel size and the home's age before the estimate",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Problem", value: "Hot outlet, burning smell" },
      { label: "Breaker", value: "Off" },
      { label: "Home built", value: "1960s" },
      { label: "Address", value: "2210 Birch Road" },
    ],
  },

  "ai-receptionist-for-garage-door-repair": {
    business: "Keystone Garage Doors",
    noun: "garage door",
    onCall: "on-call tech",
    scenario: "Monday, 7:10 a.m. The garage door won't open, and the car is inside.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Keystone Garage Doors, how can I help?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "My garage door won't open and my car's stuck inside. I heard a loud bang last night.",
      },
      {
        at: "0:09",
        speaker: "lobbystack",
        text: "A loud bang usually means a broken spring. Please don't lift the door by hand, since the spring carries most of its weight. Is the door closed right now?",
        note: "Reads your safety guidance",
      },
      { at: "0:20", speaker: "caller", text: "Yes, it's closed." },
      {
        at: "0:23",
        speaker: "lobbystack",
        text: "What's the address, and is it a single or double door?",
        note: "Takes the door details",
      },
      {
        at: "0:31",
        speaker: "caller",
        text: "33 Oak Lane. It's a double door.",
      },
      {
        at: "0:34",
        speaker: "lobbystack",
        text: "The first opening today is 9:30 a.m. Should I book it?",
        note: "Books the first open same-day slot",
      },
      { at: "0:39", speaker: "caller", text: "Yes, please." },
    ],
    outcome:
      "Booked for 9:30 a.m. The caller got a confirmation text, and the broken spring is noted on the job.",
    routing: [
      {
        call: "Door won't close at night",
        action: "Transfers",
        detail: "Treats it as a security risk and rings your on-call tech",
      },
      {
        call: "Door stuck closed with a car inside",
        action: "Books",
        detail: "Books the first open same-day slot",
      },
      {
        call: "Broken spring or cable",
        action: "Books",
        detail: "Tells the caller not to lift the door, then books a repair",
      },
      {
        call: "Door off its track",
        action: "Books",
        detail: "Asks for the door type and books a repair visit",
      },
      {
        call: "New door quote",
        action: "Books",
        detail: "Asks for the size and style, then books an estimate visit",
      },
      {
        call: "Opener or remote not working",
        action: "Answers",
        detail: "Walks through the reset steps you approve, then books if they don't work",
      },
      {
        call: "Warranty or billing question",
        action: "Takes a message",
        detail: "Saves the details for your office to call back",
      },
    ],
    intake: [
      "What happened: a noise, a stuck door, or a door off its track",
      "Whether the door is open or closed right now",
      "Single or double door, and the material",
      "The opener brand and age",
      "Whether a car or person is stuck inside",
      "The address and any gate code",
    ],
    hero: {
      caller: "Tom Alvarez",
      problem: "Broken spring, car inside",
      quote: "I heard a loud bang last night.",
      time: "Mon 7:10 a.m.",
      outcome: "Booked for 9:30 a.m. today",
      detail: "First open same-day slot",
      kind: "booking",
    },
    pitch: {
      title: "What an AI receptionist for garage door companies says about a broken spring",
      intro:
        "A stuck door with the car inside can't wait for a callback. Read one call to a fictional garage door company, from the bang to the booking.",
    },
    callCard: {
      title: "A broken spring, booked for 9:30 the same morning",
      body: "LobbyStack told the caller not to lift the door, took the address and door size, and booked the first open slot. The caller got a confirmation text.",
    },
    rules: {
      title: "Your rules decide where each garage door call goes",
      intro: "You write each rule in plain words. This is one example setup for a garage door company.",
    },
    features: {
      title: "A garage door answering service for the routine calls too",
      intro:
        "Openers, remotes, and new-door quotes make up most of your calls. LobbyStack books them and answers from the details you enter.",
    },
    booking: { job: "New door estimate", hours: [10, 13, 16], picked: 1 },
    answer: {
      question: "My remote stopped working. Can I fix it myself?",
      answer: "Try the reset steps on the back of the opener. If it still won't pair, I can book a visit.",
      source: "From your reset steps",
    },
    intakeCopy: {
      title: "Know the door size and opener brand before you arrive",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Problem", value: "Broken spring" },
      { label: "Door", value: "Double, closed" },
      { label: "Car inside", value: "Yes" },
      { label: "Address", value: "33 Oak Lane" },
    ],
  },

  "ai-receptionist-for-appliance-repair": {
    business: "Reliable Appliance Repair",
    noun: "appliance repair",
    onCall: "on-call tech",
    scenario: "Thursday, 2:05 p.m. A refrigerator stopped cooling, and the freezer is thawing.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Reliable Appliance Repair, what can I help with?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "My fridge stopped cooling. Everything in the freezer is starting to thaw.",
      },
      {
        at: "0:08",
        speaker: "lobbystack",
        text: "What's the brand and model? It's usually on a sticker inside the door.",
        note: "Asks for the brand and model number",
      },
      {
        at: "0:15",
        speaker: "caller",
        text: "It's a Samsung. The model starts with RF28.",
      },
      {
        at: "0:19",
        speaker: "lobbystack",
        text: "We service Samsung refrigerators. Is it still under warranty?",
        note: "Checks the brands you service",
      },
      {
        at: "0:25",
        speaker: "caller",
        text: "No, it's about seven years old.",
      },
      {
        at: "0:28",
        speaker: "lobbystack",
        text: "Our diagnostic visit is $89, and it goes toward the repair if you go ahead. I can book you tomorrow at 10 a.m.",
        note: "Quotes the fee you set and books",
      },
      { at: "0:37", speaker: "caller", text: "That works." },
    ],
    outcome:
      "Booked for 10 a.m. tomorrow. The brand, model, and symptoms are saved with the call.",
    routing: [
      {
        call: "Refrigerator or freezer not cooling",
        action: "Books",
        detail: "Books the first open slot and notes the risk of food loss",
      },
      {
        call: "Washer leaking",
        action: "Books",
        detail: "Books a visit and can tell the caller to shut off the water supply",
      },
      {
        call: "Brand you don't service",
        action: "Answers",
        detail: "Tells the caller which brands you work on",
      },
      {
        call: "Diagnostic fee question",
        action: "Answers",
        detail: "Quotes the fee you set and how it applies to the repair",
      },
      {
        call: "Warranty repair",
        action: "Takes a message",
        detail: "Takes the purchase date and warranty details for your office",
      },
      {
        call: "Parts status on an open job",
        action: "Takes a message",
        detail: "Saves the job details for your office to follow up",
      },
      {
        call: "Robocall or sales pitch",
        action: "Ends the call",
        detail: "Hangs up, and the call doesn't count toward your minutes",
      },
    ],
    intake: [
      "Appliance type, brand, and model number",
      "Symptoms and any error codes",
      "The appliance's age and warranty status",
      "Whether water is leaking",
      "Gas or electric, for ranges and dryers",
      "The address and a two-hour arrival window",
    ],
    hero: {
      caller: "Linda Park",
      problem: "Fridge not cooling",
      quote: "Everything in the freezer is thawing.",
      time: "Thu 2:05 p.m.",
      outcome: "Booked for 10 a.m. tomorrow",
      detail: "Diagnostic fee quoted",
      kind: "booking",
    },
    pitch: {
      title: "An AI receptionist for appliance repair that checks the brand before it books",
      intro:
        "Your tech needs the brand and model before the visit. Read one call to a fictional appliance repair shop, from the symptom to the booking.",
    },
    callCard: {
      title: "A warm fridge, booked for 10 a.m. tomorrow",
      body: "LobbyStack took the brand and model, checked that the shop services Samsung, quoted the diagnostic fee, and booked the visit.",
    },
    rules: {
      title: "Your rules decide where each appliance repair call goes",
      intro: "You write each rule in plain words. This is one example setup for an appliance repair shop.",
    },
    features: {
      title: "An appliance repair answering service that books while you're on a repair",
      intro:
        "Callers want to know what the visit costs and whether you fix their brand. LobbyStack answers both from your details, then books.",
    },
    booking: { job: "Washer leak repair", hours: [9, 12, 15], picked: 2 },
    answer: {
      question: "Do you fix Bosch dishwashers?",
      answer: "Yes, we service Bosch. The diagnostic visit is $89, and it goes toward the repair.",
      source: "From your brands and fees",
    },
    intakeCopy: {
      title: "Know the brand, model, and error code before the visit",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Appliance", value: "Samsung fridge, RF28" },
      { label: "Symptom", value: "Not cooling" },
      { label: "Age", value: "About 7 years" },
      { label: "Warranty", value: "Expired" },
    ],
  },

  "ai-receptionist-for-restoration-companies": {
    business: "ClearWater Restoration",
    noun: "restoration",
    onCall: "on-call crew",
    scenario: "Sunday, 1:20 a.m. Storm water is coming into a basement.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "ClearWater Restoration, what's happening?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "My basement's flooding. There's about two inches of water and it's still coming in.",
      },
      {
        at: "0:09",
        speaker: "lobbystack",
        text: "Is the water near any outlets or appliances? If it is, stay out of the basement.",
        note: "Reads your safety script",
      },
      {
        at: "0:15",
        speaker: "caller",
        text: "It's near the furnace. We're upstairs.",
      },
      {
        at: "0:18",
        speaker: "lobbystack",
        text: "Good. Is the water from the storm, a pipe, or a sewer backup? And will you file an insurance claim?",
        note: "Asks for the water source and insurance",
      },
      {
        at: "0:27",
        speaker: "caller",
        text: "The storm, I think. Yes, we have insurance.",
      },
      {
        at: "0:30",
        speaker: "lobbystack",
        text: "I'm connecting you to our on-call water damage crew now.",
        note: "Transfers under your emergency rule",
      },
    ],
    outcome:
      "Transferred at 0:38. The water source, depth, and insurance status are saved with the call.",
    routing: [
      {
        call: "Active flooding or water coming in",
        action: "Transfers",
        detail: "Reads your safety script, then rings your on-call crew",
      },
      {
        call: "Sewage backup",
        action: "Transfers",
        detail: "Asks where the backup is, then rings your on-call crew",
      },
      {
        call: "Fire or smoke damage",
        action: "Transfers",
        detail: "Asks how much of the home is damaged, then rings your on-call team",
      },
      {
        call: "Mold inspection",
        action: "Books",
        detail: "Asks about recent water events, then books an inspection",
      },
      {
        call: "Old water stain",
        action: "Books",
        detail: "Books a moisture check during business hours",
      },
      {
        call: "Insurance or billing question",
        action: "Answers",
        detail: "Replies from the details you entered",
      },
      {
        call: "Insurance adjuster calling",
        action: "Takes a message",
        detail: "Saves the claim number and the adjuster's contact details",
      },
    ],
    intake: [
      "The water source: storm, pipe, appliance, or sewer",
      "How deep the water is and how many rooms it covers",
      "Whether water is still coming in",
      "Electrical hazards near the water",
      "The insurance carrier and claim number, if there is one",
      "The address and property type",
    ],
    hero: {
      caller: "Kevin Doyle",
      problem: "Basement flooding",
      quote: "There's two inches of water and it's still coming in.",
      time: "Sun 1:20 a.m.",
      outcome: "Transferred to the on-call crew",
      detail: "Matches your emergency rule",
      kind: "transfer",
    },
    pitch: {
      title: "An AI receptionist for restoration that takes the claim details before it transfers",
      intro:
        "Active water can't wait until morning. An old stain can. Read one flood call to a fictional restoration company.",
    },
    callCard: {
      title: "A flooding basement, transferred in 38 seconds",
      body: "LobbyStack told the family to stay out of the basement, asked for the water source and insurance status, then rang the on-call crew.",
    },
    rules: {
      title: "Your rules decide where each restoration call goes",
      intro: "You write each rule in plain words. This is one example setup for a restoration company.",
    },
    features: {
      title: "A restoration answering service that books the inspections",
      intro:
        "Mold checks, moisture readings, and adjuster calls fill the rest of your phone log. LobbyStack books them and keeps the claim details with each call.",
    },
    booking: { job: "Mold inspection", hours: [9, 11, 14], picked: 1 },
    answer: {
      question: "Do you bill my insurance directly?",
      answer: "Yes, we bill most carriers directly. Can I take your claim number?",
      source: "From your billing details",
    },
    intakeCopy: {
      title: "Know the water source and the claim number before your crew rolls",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Water source", value: "Storm" },
      { label: "Depth", value: "About 2 inches" },
      { label: "Still coming in", value: "Yes" },
      { label: "Insurance", value: "Will file a claim" },
    ],
  },

  "ai-receptionist-for-locksmiths": {
    business: "Anchor Lock & Key",
    noun: "locksmith",
    onCall: "on-call locksmith",
    scenario: "Friday, 10:50 p.m. A driver locked the keys in the car downtown.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Anchor Lock and Key, how can I help?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "I locked my keys in my car. I'm in a parking lot downtown.",
      },
      {
        at: "0:07",
        speaker: "lobbystack",
        text: "Is anyone, or any pet, locked inside the car?",
        note: "Checks your emergency condition first",
      },
      { at: "0:11", speaker: "caller", text: "No, just the keys." },
      {
        at: "0:14",
        speaker: "lobbystack",
        text: "What's the make, model, and year, and where exactly are you parked?",
        note: "Takes the vehicle and location",
      },
      {
        at: "0:20",
        speaker: "caller",
        text: "A 2019 Honda Civic, in the lot behind 5th and Main.",
      },
      {
        at: "0:25",
        speaker: "lobbystack",
        text: "Our after-hours lockout fee is $125, and you'll need your ID when the tech arrives. I'm connecting you to our on-call locksmith now.",
        note: "Quotes your fee, then transfers",
      },
    ],
    outcome:
      "Transferred to the on-call locksmith at 0:34. The vehicle and location are saved with the call.",
    routing: [
      {
        call: "Child or pet locked in a car",
        action: "Transfers",
        detail: "Tells the caller to call 911, then rings your on-call locksmith",
      },
      {
        call: "Home or car lockout",
        action: "Transfers",
        detail: "Quotes your lockout fee, then rings your on-call locksmith",
      },
      {
        call: "Lost car key or fob",
        action: "Books",
        detail: "Asks for the make, model, year, and VIN, then books a visit",
      },
      {
        call: "Rekey after a move",
        action: "Books",
        detail: "Books a daytime appointment",
      },
      {
        call: "Commercial lock installation",
        action: "Books",
        detail: "Asks how many doors, then books an estimate",
      },
      {
        call: "Price question",
        action: "Answers",
        detail: "Quotes the prices you set",
      },
      {
        call: "Question about an invoice",
        action: "Takes a message",
        detail: "Saves it for your office to call back",
      },
    ],
    intake: [
      "Lockout, rekey, key replacement, or installation",
      "The exact location or address",
      "Make, model, and year for vehicles",
      "Whether anyone is locked inside",
      "How the caller will show ID or proof of ownership",
      "The best callback number",
    ],
    hero: {
      caller: "Jordan Lee",
      problem: "Car lockout",
      quote: "My keys are locked in the car.",
      time: "Fri 10:50 p.m.",
      outcome: "Transferred to the on-call locksmith",
      detail: "Lockout fee quoted first",
      kind: "transfer",
    },
    pitch: {
      title: "A locksmith answering service that checks nobody is locked inside first",
      intro:
        "Lockout callers want a price and someone on the way. Read one call to a fictional locksmith, from the parking lot to the transfer.",
    },
    callCard: {
      title: "A car lockout, fee quoted and transferred in 34 seconds",
      body: "LobbyStack checked that nobody was locked inside, took the car and the location, quoted the after-hours fee, and rang the on-call locksmith.",
    },
    rules: {
      title: "Your rules decide where each locksmith call goes",
      intro: "You write each rule in plain words. This is one example setup for a locksmith.",
    },
    features: {
      title: "An AI receptionist for locksmith services that books rekeys and key fobs",
      intro:
        "Callers ask the price first, then want a time. LobbyStack quotes the prices you set and books the visit during the call.",
    },
    booking: { job: "Rekey after a move", hours: [9, 12, 16], picked: 0 },
    answer: {
      question: "How much is a car lockout tonight?",
      answer: "Our after-hours lockout fee is $125. Should I send a locksmith?",
      source: "From your price list",
    },
    intakeCopy: {
      title: "Know the car and the exact spot before you drive out",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Lockout", value: "Car, keys inside" },
      { label: "Vehicle", value: "2019 Honda Civic" },
      { label: "Anyone inside", value: "No" },
      { label: "Location", value: "Lot behind 5th and Main" },
    ],
  },

  "after-hours-answering-service-for-contractors": {
    business: "Ridgeline Contracting",
    noun: "contractor",
    onCall: "on-call manager",
    scenario: "Saturday, 9:05 p.m. A renovation client sees water dripping into the kitchen.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Ridgeline Contracting, after-hours line. How can I help?",
      },
      {
        at: "0:04",
        speaker: "caller",
        text: "You're redoing our bathroom, and water's dripping into the kitchen below.",
      },
      {
        at: "0:09",
        speaker: "lobbystack",
        text: "Can you shut off the water to that bathroom, or the main valve?",
        note: "Reads your safety steps",
      },
      { at: "0:15", speaker: "caller", text: "I turned off the main." },
      {
        at: "0:18",
        speaker: "lobbystack",
        text: "Thanks. Which project is this, and who's your project manager?",
        note: "Matches the caller to the job",
      },
      {
        at: "0:24",
        speaker: "caller",
        text: "The Henderson job on Cedar Drive. Mike's our manager.",
      },
      {
        at: "0:28",
        speaker: "lobbystack",
        text: "I'm connecting you to the on-call project manager now.",
        note: "Transfers under your after-hours rule",
      },
    ],
    outcome:
      "Transferred at 0:35. The project name and the issue are saved for Monday's review.",
    routing: [
      {
        call: "Active leak or damage at a job site",
        action: "Transfers",
        detail: "Reads your safety steps, then rings your on-call manager",
      },
      {
        call: "Security problem at a site",
        action: "Transfers",
        detail: "Takes the site address, then rings your on-call manager",
      },
      {
        call: "New project inquiry",
        action: "Books",
        detail: "Asks for the scope and budget, then books a consultation",
      },
      {
        call: "Schedule question from a current client",
        action: "Takes a message",
        detail: "Saves it for the project manager's morning list",
      },
      {
        call: "Subcontractor or supplier call",
        action: "Takes a message",
        detail: "Records who called and what they need",
      },
      {
        call: "Robocall or sales pitch",
        action: "Ends the call",
        detail: "Hangs up, and the call doesn't count toward your minutes",
      },
    ],
    intake: [
      "New inquiry or existing project",
      "The project name or address",
      "What happened, and whether it's getting worse",
      "Scope and budget range for new work",
      "The timeline the client has in mind",
      "The best callback number",
    ],
    hero: {
      caller: "Ellen Henderson",
      problem: "Leak from a bathroom remodel",
      quote: "Water's dripping into the kitchen below.",
      time: "Sat 9:05 p.m.",
      outcome: "Transferred to the on-call manager",
      detail: "Matched to the Henderson job",
      kind: "transfer",
    },
    pitch: {
      title: "A contractor answering service that knows which project is calling",
      intro:
        "After hours, current clients and new leads call the same number. Read one call to a fictional contractor from a client in the middle of a renovation.",
    },
    callCard: {
      title: "A job-site leak, matched to its project and transferred in 35 seconds",
      body: "LobbyStack had the client shut off the main, asked which project and manager, then rang the on-call project manager.",
    },
    rules: {
      title: "Your rules decide where each after-hours call goes",
      intro: "You write each rule in plain words. This is one example setup for a remodeling contractor.",
    },
    features: {
      title: "An after-hours answering service for contractors that books new work",
      intro:
        "New project inquiries call at night too. LobbyStack asks for the scope and budget and books the consultation before they call someone else.",
    },
    booking: { job: "Kitchen remodel consultation", hours: [9, 13, 16], picked: 1 },
    answer: {
      question: "When is the tile going in on our job?",
      answer: "I'll pass that to your project manager for the morning.",
      source: "Saved for the morning list",
    },
    intakeCopy: {
      title: "Know which project called and what went wrong",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Project", value: "Henderson, Cedar Drive" },
      { label: "Issue", value: "Leak into the kitchen" },
      { label: "Main valve", value: "Off" },
      { label: "Manager", value: "Mike" },
    ],
  },

  "roofing-answering-service": {
    business: "Peak Roofing",
    noun: "roofing",
    onCall: "on-call crew",
    scenario: "The morning after a hailstorm. A homeowner wants an inspection before the adjuster visits.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Peak Roofing, how can I help?",
      },
      {
        at: "0:03",
        speaker: "caller",
        text: "Last night's hail dented our gutters, and I think some shingles are gone. Can someone look before the adjuster comes?",
      },
      {
        at: "0:10",
        speaker: "lobbystack",
        text: "Is water getting into the house anywhere right now?",
        note: "Checks your leak rule first",
      },
      { at: "0:14", speaker: "caller", text: "No, it's dry inside." },
      {
        at: "0:17",
        speaker: "lobbystack",
        text: "How old is the roof, and are you filing an insurance claim?",
        note: "Asks for the roof's age and claim status",
      },
      {
        at: "0:24",
        speaker: "caller",
        text: "About twelve years. Yes, we're filing.",
      },
      {
        at: "0:28",
        speaker: "lobbystack",
        text: "We meet adjusters on site. The first inspection opening is Thursday at 1 p.m. Should I book it?",
        note: "Answers from your script and books",
      },
      { at: "0:35", speaker: "caller", text: "Yes, please." },
    ],
    outcome:
      "Booked for Thursday at 1 p.m. The roof's age, the damage, and the claim status are saved with the call.",
    routing: [
      {
        call: "Active leak",
        action: "Transfers",
        detail: "Rings your on-call crew so someone can tarp it tonight",
      },
      {
        call: "Storm or hail damage, no leak",
        action: "Books",
        detail: "Books the first open inspection slot",
      },
      {
        call: "Replacement estimate",
        action: "Books",
        detail: "Asks for the roof's age and material, then books an estimate",
      },
      {
        call: "Gutter or small repair",
        action: "Books",
        detail: "Books a repair visit",
      },
      {
        call: "Insurance or adjuster question",
        action: "Answers",
        detail: "Replies from the answers you write",
      },
      {
        call: "Update on an existing job",
        action: "Takes a message",
        detail: "Saves it for your office to call back",
      },
    ],
    intake: [
      "Active leak or damage only",
      "The roof's age and material",
      "The storm date and visible damage",
      "Insurance claim status and adjuster date",
      "The address and number of stories",
      "The best time for an inspection",
    ],
    hero: {
      caller: "Rachel Moore",
      problem: "Hail damage, no leak",
      quote: "Can someone look before the adjuster comes?",
      time: "Day after the storm",
      outcome: "Inspection booked, Thu 1 p.m.",
      detail: "Roof age and claim status saved",
      kind: "booking",
    },
    pitch: {
      title: "A roofing answering service that checks for leaks before it books",
      intro:
        "Read one call to a fictional roofer the morning after a hailstorm, from the dented gutters to the booked inspection.",
    },
    callCard: {
      title: "Hail damage, inspection booked for Thursday at 1 p.m.",
      body: "LobbyStack checked for a leak, asked for the roof's age and claim status, answered the adjuster question from the script, and booked the inspection.",
    },
    rules: {
      title: "Your rules decide where each roofing call goes",
      intro: "You write each rule in plain words. This is one example setup for a roofing company.",
    },
    features: {
      title: "An AI receptionist for roofers that answers the insurance questions",
      intro:
        "Homeowners ask whether you meet adjusters and which insurers you work with. Write the answers once, and LobbyStack gives them on every call.",
    },
    booking: { job: "Storm damage inspection", hours: [9, 11, 13], picked: 2 },
    answer: {
      question: "Will you meet the adjuster on site?",
      answer: "Yes, we meet adjusters on site. Do you have the visit date yet?",
      source: "From your insurance script",
    },
    intakeCopy: {
      title: "Know the roof's age and the claim status before you climb",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Damage", value: "Gutters and shingles" },
      { label: "Leak", value: "None" },
      { label: "Roof age", value: "About 12 years" },
      { label: "Claim", value: "Filing" },
    ],
  },

  "property-management-answering-service": {
    business: "Harbor Property Management",
    noun: "property management",
    onCall: "on-call maintenance tech",
    scenario: "Wednesday, 2:10 a.m. A tenant reports water dripping around a bathroom light.",
    call: [
      {
        at: "0:00",
        speaker: "lobbystack",
        text: "Harbor Property Management, after-hours line. Are you a current resident?",
        note: "Separates residents from prospects",
      },
      {
        at: "0:04",
        speaker: "caller",
        text: "Yes, unit 4B at 120 Elm. Water's dripping from my bathroom ceiling.",
      },
      {
        at: "0:09",
        speaker: "lobbystack",
        text: "Is it a slow drip or a steady flow, and is it near a light fixture?",
        note: "Asks the questions on your emergency list",
      },
      {
        at: "0:15",
        speaker: "caller",
        text: "It's steady, and it's coming around the light.",
      },
      {
        at: "0:19",
        speaker: "lobbystack",
        text: "Please turn that light off at the switch and stay clear of the water. Can you do that now?",
        note: "Reads your safety step",
      },
      { at: "0:24", speaker: "caller", text: "Okay, it's off." },
      {
        at: "0:26",
        speaker: "lobbystack",
        text: "Thank you. This is on your emergency list, so I'm connecting you to the on-call maintenance tech now.",
        note: "Transfers under your emergency list",
      },
    ],
    outcome:
      "Transferred at 0:34. The unit number and the issue are saved for the office.",
    routing: [
      {
        call: "Leak, flood, no heat, or gas smell",
        action: "Transfers",
        detail: "Rings your on-call maintenance tech",
      },
      {
        call: "Lockout",
        action: "Transfers",
        detail: "Follows your lockout policy, including any fee",
      },
      {
        call: "Showing request",
        action: "Books",
        detail: "Books into your leasing agent's calendar and texts a confirmation",
      },
      {
        call: "Prospective tenant question",
        action: "Answers",
        detail: "Replies from the listing details you enter",
      },
      {
        call: "Rent or portal question",
        action: "Answers",
        detail: "Replies from your policies",
      },
      {
        call: "Routine repair request",
        action: "Takes a message",
        detail: "Logs it for the morning maintenance queue",
      },
    ],
    intake: [
      "Current resident, owner, or prospect",
      "The property and unit number",
      "What's happening, and whether it's getting worse",
      "Whether water, gas, or electricity is involved",
      "The best callback number",
      "Permission to enter the unit",
    ],
    hero: {
      caller: "Sam Okafor",
      problem: "Leak around a light fixture",
      quote: "Unit 4B. Water's dripping from the ceiling.",
      time: "Wed 2:10 a.m.",
      outcome: "Transferred to on-call maintenance",
      detail: "On your emergency list",
      kind: "transfer",
    },
    pitch: {
      title: "A 2 a.m. leak call to a property management answering service",
      intro:
        "Tenants and prospects call the same number at all hours. Read one call to a fictional property manager, from the greeting to the transfer.",
    },
    callCard: {
      title: "A ceiling leak in unit 4B, transferred in 34 seconds",
      body: "LobbyStack confirmed the caller lives there, asked how fast the water was coming, told them to switch off the light, and rang on-call maintenance.",
    },
    rules: {
      title: "Your rules decide where each tenant and prospect call goes",
      intro: "You write each rule in plain words. This is one example setup for a property manager.",
    },
    features: {
      title: "An answering service for landlords that books showings too",
      intro:
        "Prospects call about pets, parking, and open units. LobbyStack answers from your listing details and books the showing.",
    },
    booking: { job: "Showing, 2-bed at 120 Elm", hours: [10, 12, 17], picked: 2 },
    answer: {
      question: "Do you allow dogs in the 2-bedroom?",
      answer: "Yes, with a pet deposit. Would you like to book a showing?",
      source: "From your listing details",
    },
    intakeCopy: {
      title: "Know the unit and the problem before anyone calls back",
      body: "You choose what LobbyStack asks. Each answer goes into the call summary, next to the transcript and recording.",
    },
    summary: [
      { label: "Caller", value: "Resident, unit 4B" },
      { label: "Issue", value: "Steady leak by a light" },
      { label: "Light", value: "Switched off" },
      { label: "Property", value: "120 Elm" },
    ],
  },
}

export const tradeDetailsFor = (slug: string) => tradeDetails[slug]

/** The order the call-rule cards follow; each page shows the four its rules use. */
export const callActionOrder: CallAction[] = ["Transfers", "Books", "Answers", "Takes a message", "Ends the call"]

/** Each action a trade's rules use, with its rules, in card order. */
export function routingGroups(details: Pick<TradeDetails, "routing">) {
  return callActionOrder
    .map((action) => ({ action, rows: details.routing.filter((row) => row.action === action) }))
    .filter((group) => group.rows.length > 0)
}

/** "an HVAC business", "an electrical business", "a plumbing business" */
export function tradeArticle(noun: string) {
  return /^(?:[aeiou]|HVAC)/i.test(noun) ? "an" : "a"
}

/** The note under the example call saying the business and caller are made up. */
export function exampleCallFootnote(details: Pick<TradeDetails, "business" | "noun">) {
  return `${details.business} and the caller are fictional. The rules show one way ${tradeArticle(details.noun)} ${details.noun} business can set things up.`
}

/** The heading of a call-rule card, on the page and in its Markdown twin. */
export function callActionTitle(action: CallAction, details: Pick<TradeDetails, "onCall">) {
  switch (action) {
    case "Transfers":
      return `Rings your ${details.onCall}`
    case "Books":
      return "Books a visit"
    case "Answers":
      return "Answers from your details"
    case "Takes a message":
      return "Takes a message"
    case "Ends the call":
      return "Hangs up on spam"
  }
}

/**
 * The example call's lines drawn in its scene: the caller's first line, then
 * the last three steps LobbyStack took after it.
 */
export function sceneLines(details: Pick<TradeDetails, "call">) {
  const opening = details.call.findIndex((line) => line.speaker === "caller")
  const steps = details.call.slice(opening + 1).filter((line) => line.note)
  return [details.call[opening], ...steps.slice(-3)].filter((line) => line !== undefined)
}
