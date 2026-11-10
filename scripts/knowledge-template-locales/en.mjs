// Template text for one language. Every locale file has the same shape as this one;
// scripts/knowledge-template.test.ts fails when a count or a hint differs.
export default {
  title: "Knowledge template",
  intro: [
    "Fill in what applies to your business and leave the rest blank. Upload this file in Knowledge, under Add knowledge. Your receptionist reads your answers and ignores grey notes like this one.",
    "Write full sentences that name the subject: \"A 60-minute massage costs $90\", not \"$90\". Give numbers with units, and dates for anything that expires. Skip tables, images and \"see our website\". Type the content here.",
  ],
  sections: {
    about: {
      title: "About the business",
      hint: "Say who you are in plain words. Callers hear this when they ask what you do.",
      prompts: [
        "Business name",
        "What does your business do, and who is it for?",
        "Which cities or areas do you serve?",
        "How long have you been in business, and what do customers say sets you apart?",
        "Which languages does your team speak?",
        "How can customers reach you besides calling (email, website, social media)?",
      ],
    },
    location: {
      title: "Location and access",
      hint: "Hours and closures live in your dashboard. Add the details callers ask about on top of them.",
      prompts: [
        "What is your full address, and which landmarks or cross streets help people find you?",
        "Where can customers park, and what does it cost?",
        "Is the location accessible (step-free entry, elevator, accessible restroom)?",
        "Do you have more than one location? Give the address of each.",
        "Do you travel to customers? Name the areas and any travel fee.",
      ],
    },
    services: {
      title: "Services in detail",
      hint: "Your service list lives in your dashboard. Describe each service here. Start every answer with the service name so it still makes sense on its own. Copy the block for each extra service.",
      prompts: [
        "Service name",
        "What it includes",
        "How long it takes",
        "Price, or price range",
        "Who it suits, and who it does not",
        "What to prepare or bring",
        "What happens afterward",
      ],
    },
    pricing: {
      title: "Pricing and payment",
      prompts: [
        "Which payment methods do you accept?",
        "Do you charge deposits or booking fees? State the amount and when it is due.",
        "Do you give quotes or free estimates? How does a customer get one?",
        "Which insurance plans, memberships or financing options do you accept?",
        "Which discounts, packages or promotions are running? Include end dates.",
      ],
    },
    booking: {
      title: "Booking and scheduling",
      prompts: [
        "How do new customers book, and what should they have ready?",
        "How far ahead should customers book, and how soon is the next opening usually?",
        "Do you accept walk-ins or same-day requests?",
        "What is your cancellation and rescheduling policy? State the notice you need and any fee.",
        "What happens when a customer arrives late or does not show up?",
        "Can customers bring children, guests or pets?",
        "Do you take group, recurring or after-hours bookings?",
      ],
    },
    policies: {
      title: "Policies",
      prompts: [
        "What is your refund, return or guarantee policy?",
        "Which ID, age or eligibility requirements apply?",
        "Which health, safety or conduct rules do customers need to know?",
      ],
    },
    team: {
      title: "Team",
      hint: "Your team members live in your dashboard. Add what callers ask for by name or by need.",
      prompts: [
        "Who should callers ask for in specific situations? Example: for bridal bookings, ask for Maria.",
        "Which team members have specialties or certifications customers ask about?",
      ],
    },
    urgent: {
      title: "Urgent and after-hours situations",
      prompts: [
        "What counts as urgent or an emergency, and what should callers do first?",
        "What should the receptionist tell callers who ring after hours?",
      ],
    },
    limits: {
      title: "Limits and hand-offs",
      hint: "Tell the receptionist where to stop. Name the topic and the reason.",
      prompts: [
        "Which requests must go to a person? Example: complaints, billing disputes, legal or medical questions.",
        "What must the receptionist never promise or quote? Example: exact prices over the phone, guaranteed results.",
        "What do you need to know from a caller before you can help (name, address, vehicle, order number)?",
        "How should the receptionist treat sales and vendor calls?",
      ],
    },
    terms: {
      title: "Names, terms and pronunciations",
      prompts: [
        "Which business, team or product names are hard to pronounce? Spell out how to say each one.",
        "Which industry terms or abbreviations do customers use, and what do they mean?",
        "Which other businesses or brands do customers mix up with yours?",
      ],
    },
    news: {
      title: "Current news",
      hint: "Remove each item once it is out of date.",
      prompts: [
        "What has changed lately or is about to change (new services, construction, seasonal changes, wait times)? Include dates.",
      ],
    },
    faq: {
      title: "Frequently asked questions",
      hint: "Write the 10 questions callers ask most, then answer each in full sentences. Delete the pairs you do not use.",
    },
  },
};
