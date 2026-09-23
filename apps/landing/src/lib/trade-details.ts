// Trade-specific content for the "by trade" solution pages: an annotated
// example call, how each kind of call gets handled, and the intake questions.
// Businesses and people in the example calls are fictional.

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
}

export const tradeDetails: Record<string, TradeDetails> = {
  "ai-receptionist-for-plumbers": {
    business: "Northside Plumbing",
    noun: "plumbing",
    scenario: "Tuesday, 11:42 p.m. A homeowner calls about a leak.",
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
        note: "Reads your shutoff instructions",
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
        note: "Collects the address and safety details",
      },
      {
        at: "0:36",
        speaker: "caller",
        text: "418 Maple Street. No, it's away from the lights.",
      },
      {
        at: "0:39",
        speaker: "lobbystack",
        text: "This counts as an emergency, so I'm connecting you to Dave, who's on call tonight. He'll have your address and what happened.",
        note: "Matches your emergency rule and transfers",
      },
    ],
    outcome:
      "Transferred to the on-call plumber at 0:47. The summary and recording are in the dashboard.",
    routing: [
      {
        call: "Burst pipe or active leak",
        action: "Transfers",
        detail: "Reads your shutoff steps, then connects your on-call plumber",
      },
      {
        call: "Sewage backup",
        action: "Transfers",
        detail:
          "Asks which fixtures are backing up, then connects your on-call plumber",
      },
      {
        call: "Clogged drain",
        action: "Books",
        detail:
          "Offers the next open slot and quotes your starting price if you set one",
      },
      {
        call: "Water heater replacement",
        action: "Books",
        detail: "Schedules an estimate visit instead of guessing a price",
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
  },

  "ai-receptionist-for-hvac": {
    business: "Summit Heating & Air",
    noun: "HVAC",
    scenario: "January, 6:15 a.m. A furnace stopped overnight.",
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
        note: "Asks the questions your urgency rule needs",
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
        note: "Runs the basic checks you approve",
      },
      {
        at: "0:29",
        speaker: "caller",
        text: "Thermostat's on heat. The breaker looks fine.",
      },
      {
        at: "0:32",
        speaker: "lobbystack",
        text: "Then this is an emergency under your rules. I'm connecting you to Maria, who's on call this morning, with what you've told me.",
        note: "Transfers with the details attached",
      },
    ],
    outcome:
      "Transferred to the on-call technician at 0:41. System type, indoor temperature, and occupants are saved with the call.",
    routing: [
      {
        call: "No heat below your temperature threshold",
        action: "Transfers",
        detail:
          "Checks the indoor temperature and who lives in the home, then connects your on-call tech",
      },
      {
        call: "No cooling during a heat advisory",
        action: "Transfers",
        detail: "Applies the same rule to AC failures in summer",
      },
      {
        call: "Thermostat or breaker question",
        action: "Answers",
        detail: "Walks the caller through the checks you approve",
      },
      {
        call: "Tune-up or maintenance visit",
        action: "Books",
        detail: "Books into open maintenance slots and texts a confirmation",
      },
      {
        call: "System replacement quote",
        action: "Books",
        detail:
          "Collects home size and system age, then books an estimate visit",
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
  },

  "ai-receptionist-for-electricians": {
    business: "Brightline Electric",
    noun: "electrical",
    scenario: "Saturday, 4:30 p.m. A homeowner smells burning near an outlet.",
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
        note: "Reads your safety script first",
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
        note: "Collects the address and home age",
      },
      {
        at: "0:28",
        speaker: "caller",
        text: "2210 Birch Road. It was built in the sixties.",
      },
      {
        at: "0:32",
        speaker: "lobbystack",
        text: "I'm connecting you to Sam, who's on call this weekend. He'll have your address and everything you've described.",
        note: "Transfers under your hazard rule",
      },
    ],
    outcome:
      "Transferred to the on-call electrician at 0:40. The hazard, the home's age, and the breaker status are saved with the call.",
    routing: [
      {
        call: "Burning smell, sparks, or a hot outlet",
        action: "Transfers",
        detail:
          "Reads your safety script, then connects your on-call electrician",
      },
      {
        call: "Whole-house power loss",
        action: "Books",
        detail:
          "Asks whether the neighbors have power first, and points grid outages to the utility",
      },
      {
        call: "Panel upgrade",
        action: "Books",
        detail: "Collects panel amperage and home age, then books an estimate",
      },
      {
        call: "EV charger install",
        action: "Books",
        detail:
          "Asks for the charger model and where the car parks, then books an estimate",
      },
      {
        call: "Commercial service request",
        action: "Transfers",
        detail: "Sends commercial calls to your estimator or office line",
      },
      {
        call: "Permit or licensing question",
        action: "Answers",
        detail: "Replies from the details you entered",
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
  },

  "ai-receptionist-for-garage-door-repair": {
    business: "Keystone Garage Doors",
    noun: "garage door",
    scenario: "Monday, 7:10 a.m. A garage door won't open with the car inside.",
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
        note: "Collects the door details",
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
      "Booked for 9:30 a.m. The caller got a confirmation text, and the spring issue is on the job.",
    routing: [
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
        call: "Door won't close at night",
        action: "Transfers",
        detail: "Sends security-risk calls to your on-call tech",
      },
      {
        call: "Door off its track",
        action: "Books",
        detail: "Collects the door type and books a repair visit",
      },
      {
        call: "Opener or remote not working",
        action: "Answers",
        detail:
          "Walks through the reset steps you approve, then books if needed",
      },
      {
        call: "New door quote",
        action: "Books",
        detail: "Collects size and style, then books an estimate visit",
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
  },

  "ai-receptionist-for-appliance-repair": {
    business: "Reliable Appliance Repair",
    noun: "appliance repair",
    scenario: "Thursday, 2:05 p.m. A refrigerator stopped cooling.",
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
        note: "Collects the brand and model number",
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
      "Booked for 10 a.m. tomorrow. The brand, model, and symptoms are attached to the appointment.",
    routing: [
      {
        call: "Refrigerator or freezer not cooling",
        action: "Books",
        detail: "Books the first open slot and flags the risk of food loss",
      },
      {
        call: "Washer leaking",
        action: "Books",
        detail:
          "Tells the caller to shut off the water supply, then books a visit",
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
        detail:
          "Collects the purchase date and warranty details for your office",
      },
      {
        call: "Parts status on an open job",
        action: "Takes a message",
        detail: "Saves the job details for your office to follow up",
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
  },

  "ai-receptionist-for-restoration-companies": {
    business: "ClearWater Restoration",
    noun: "restoration",
    scenario: "Sunday, 1:20 a.m. A basement is flooding after a storm.",
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
        note: "Collects the water source and insurance status",
      },
      {
        at: "0:27",
        speaker: "caller",
        text: "The storm, I think. Yes, we have insurance.",
      },
      {
        at: "0:30",
        speaker: "lobbystack",
        text: "I'm connecting you to Chris, who's on call tonight for water damage. He'll have your address and what you've told me.",
        note: "Transfers under your emergency rule",
      },
    ],
    outcome:
      "Transferred at 0:38. The water source, depth, and insurance status are saved with the call.",
    routing: [
      {
        call: "Active flooding or water coming in",
        action: "Transfers",
        detail: "Reads your safety script, then connects your on-call crew",
      },
      {
        call: "Sewage backup",
        action: "Transfers",
        detail: "Flags it as contaminated water for your crew",
      },
      {
        call: "Fire or smoke damage",
        action: "Transfers",
        detail:
          "Collects the extent of the damage and connects your on-call team",
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
        call: "Insurance adjuster calling",
        action: "Takes a message",
        detail: "Saves the claim number and adjuster's contact details",
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
  },

  "ai-receptionist-for-locksmiths": {
    business: "Anchor Lock & Key",
    noun: "locksmith",
    scenario: "Friday, 10:50 p.m. A driver is locked out of their car.",
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
        note: "Collects the vehicle and location",
      },
      {
        at: "0:20",
        speaker: "caller",
        text: "A 2019 Honda Civic, in the lot behind 5th and Main.",
      },
      {
        at: "0:25",
        speaker: "lobbystack",
        text: "Our after-hours lockout fee is $125, and you'll need your ID when the tech arrives. I'm connecting you to Jordan, who's on call, with your location.",
        note: "Quotes your fee, then transfers",
      },
    ],
    outcome:
      "Transferred to the on-call locksmith at 0:34. The vehicle and location are saved with the call.",
    routing: [
      {
        call: "Child or pet locked in a car",
        action: "Transfers",
        detail: "Tells the caller to call 911 and connects your on-call tech",
      },
      {
        call: "Home or car lockout",
        action: "Transfers",
        detail: "Quotes your lockout fee, then connects your on-call tech",
      },
      {
        call: "Lost car key or fob",
        action: "Books",
        detail: "Collects make, model, year, and VIN, then books a visit",
      },
      {
        call: "Rekey after a move",
        action: "Books",
        detail: "Books a daytime appointment",
      },
      {
        call: "Commercial lock installation",
        action: "Books",
        detail: "Collects the number of doors and books an estimate",
      },
      {
        call: "Price question",
        action: "Answers",
        detail: "Quotes the prices you set",
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
  },

  "after-hours-answering-service-for-contractors": {
    business: "Ridgeline Contracting",
    noun: "contractor",
    scenario:
      "Saturday, 9:05 p.m. A client calls about a leak from a renovation.",
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
        text: "I'm connecting you to the on-call project manager now, with what you've told me.",
        note: "Transfers under your after-hours rule",
      },
    ],
    outcome:
      "Transferred at 0:35. The project name and issue are saved for Monday's review.",
    routing: [
      {
        call: "Active leak or damage at a job site",
        action: "Transfers",
        detail: "Reads your safety steps, then connects your on-call manager",
      },
      {
        call: "Security problem at a site",
        action: "Transfers",
        detail: "Connects your on-call manager with the site address",
      },
      {
        call: "New project inquiry",
        action: "Books",
        detail: "Collects scope and budget, then books a consultation",
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
  },

  "roofing-answering-service": {
    business: "Peak Roofing",
    noun: "roofing",
    scenario: "The morning after a hailstorm.",
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
        note: "Checks your urgency rule",
      },
      { at: "0:14", speaker: "caller", text: "No, it's dry inside." },
      {
        at: "0:17",
        speaker: "lobbystack",
        text: "How old is the roof, and are you filing an insurance claim?",
        note: "Collects roof age and claim status",
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
      "Booked for Thursday at 1 p.m. Roof age, damage, and claim status are attached to the inspection.",
    routing: [
      {
        call: "Active leak",
        action: "Transfers",
        detail: "Connects your on-call crew so someone can tarp it tonight",
      },
      {
        call: "Storm or hail damage, no leak",
        action: "Books",
        detail: "Books the first open inspection slot",
      },
      {
        call: "Insurance or adjuster question",
        action: "Answers",
        detail: "Replies from the answers you write",
      },
      {
        call: "Replacement estimate",
        action: "Books",
        detail: "Collects roof age and material, then books an estimate",
      },
      {
        call: "Gutter or small repair",
        action: "Books",
        detail: "Books a repair visit",
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
  },

  "property-management-answering-service": {
    business: "Harbor Property Management",
    noun: "property management",
    scenario: "Wednesday, 2:10 a.m. A tenant reports water from the ceiling.",
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
        text: "Please turn that light off at the switch and stay clear of the water. This is on your emergency list, so I'm connecting you to the on-call maintenance tech now.",
        note: "Transfers under your emergency list",
      },
      { at: "0:30", speaker: "caller", text: "Thank you." },
    ],
    outcome:
      "Transferred at 0:34. The unit number and issue are logged for the office.",
    routing: [
      {
        call: "Leak, flood, no heat, or gas smell",
        action: "Transfers",
        detail: "Connects your on-call maintenance tech",
      },
      {
        call: "Lockout",
        action: "Transfers",
        detail: "Follows your lockout policy, including any fee",
      },
      {
        call: "Routine repair request",
        action: "Takes a message",
        detail: "Logs it for the morning maintenance queue",
      },
      {
        call: "Prospective tenant question",
        action: "Answers",
        detail: "Replies from the listing details you enter",
      },
      {
        call: "Showing request",
        action: "Books",
        detail:
          "Books into your leasing agent's calendar and texts a confirmation",
      },
      {
        call: "Rent or portal question",
        action: "Answers",
        detail: "Replies from your policies",
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
  },
}

export const tradeDetailsFor = (slug: string) => tradeDetails[slug]
