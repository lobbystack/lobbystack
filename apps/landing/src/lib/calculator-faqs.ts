import type { Locale } from "@/i18n"

export const calculatorFaqs = [
  {
    q: "What is a missed call revenue calculator?",
    a: "A missed call revenue calculator estimates how much booked work may be at risk when calls go unanswered. It takes your missed calls, filters for real job opportunities, applies your booking rate, and multiplies the result by your average job value.",
  },
  {
    q: "How accurate is this missed call calculator?",
    a: "It's highly accurate if you know your numbers. The formula doesn't use magic; it simply multiplies your actual missed calls by your historical conversion rates to show you exactly what you're leaving on the table.",
  },
  {
    q: "How much revenue can one missed call cost?",
    a: "It depends on the trade and the job. A missed landscaping maintenance inquiry may be worth months of repeat work, while a missed plumbing, HVAC, roofing, or electrical call may be worth a high-value repair or installation. Use your average job value for the most realistic estimate.",
  },
  {
    q: "Does this include after-hours calls?",
    a: "Yes. If your phone rings at night and you don't answer, that's a missed call. In emergency trades like plumbing or HVAC, after-hours calls often have a much higher average job value and booking rate than daytime calls.",
  },
  {
    q: "What should I use for 'Average job value'?",
    a: "Look at your last 30 days of revenue and divide it by the number of jobs completed. If you do both small service calls and massive installs, just use the blended average for a conservative estimate.",
  },
  {
    q: "What if I do not know my booking rate?",
    a: "Start with a conservative estimate and rerun the calculator with a second scenario. For example, compare a 25% booking rate with a 50% booking rate. The gap shows how sensitive your revenue is to answering and qualifying calls quickly.",
  },
  {
    q: "Should I include spam calls or vendor calls?",
    a: "No. Count them in your missed call total only if you lower the opportunity rate to account for them. The calculator is meant to estimate lost job revenue, so spam, vendors, wrong numbers, and non-buying calls should not be treated as real opportunities.",
  },
  {
    q: "Will an AI receptionist replace my office manager?",
    a: "No. LobbyStack is designed to handle the repetitive frontline work: answering basic questions, collecting intake details, and booking appointments. Your office manager can focus on complex dispatching, ordering parts, and customer service.",
  },
  {
    q: "Is this the same as an answering service ROI calculator?",
    a: "It is closely related. This calculator shows the revenue that may be at risk from missed calls. To think about ROI, compare that estimate with the monthly cost of an answering service or AI receptionist that can answer, qualify, and book more of those calls.",
  },
  {
    q: "Is the recovered revenue guaranteed?",
    a: "No. These are estimates for planning purposes. However, if an AI receptionist answers a call that would have otherwise gone to voicemail, and successfully books that lead, that is definitively recovered revenue.",
  },
]

export const calculatorFaqsFr = [
  {
    q: "Qu’est-ce qu’un calculateur de revenu d’appels manqués ?",
    a: "Un calculateur de revenu d’appels manqués estime les revenus qui peuvent être à risque lorsque des appels restent sans réponse. Il part de vos appels manqués, filtre les vraies occasions d’affaires, applique votre taux de réservation et multiplie par votre valeur moyenne.",
  },
  {
    q: "Quelle est la précision de ce calculateur ?",
    a: "Il est précis si vos entrées le sont. La formule multiplie vos appels manqués par vos taux de conversion habituels pour montrer ce que vous laissez potentiellement filer.",
  },
  {
    q: "Combien un seul appel manqué peut-il coûter ?",
    a: "Cela dépend du métier et du travail. Une demande d’entretien paysager peut valoir des mois de revenus récurrents, tandis qu’un appel de plomberie, CVC, toiture ou électricité peut représenter une réparation ou une installation importante.",
  },
  {
    q: "Est-ce que cela inclut les appels hors horaires ?",
    a: "Oui. Si le téléphone sonne le soir et que personne ne répond, c’est un appel manqué. Dans les métiers d’urgence, ces appels ont souvent une valeur moyenne plus élevée.",
  },
  {
    q: "Quelle valeur dois-je utiliser pour la valeur moyenne ?",
    a: "Prenez les revenus des 30 derniers jours et divisez-les par le nombre de travaux terminés. Si vous faites à la fois de petits appels de service et de grosses installations, utilisez une moyenne pondérée simple.",
  },
  {
    q: "Et si je ne connais pas mon taux de réservation ?",
    a: "Commencez avec une estimation prudente et relancez le calculateur avec un second scénario. Comparez par exemple 25 % et 50 % pour voir à quel point vos revenus dépendent de votre vitesse de réponse.",
  },
  {
    q: "Dois-je inclure les appels de spam ou fournisseurs ?",
    a: "Non, sauf si vous baissez le taux d’occasion d’affaires pour les compenser. Le calculateur estime le revenu de vrais travaux perdus, pas le bruit.",
  },
  {
    q: "Un réceptionniste IA remplace-t-il mon ou ma responsable de bureau ?",
    a: "Non. LobbyStack gère le travail répétitif de première ligne : questions courantes, détails d’accueil et prise de rendez‑vous. Votre équipe garde les cas complexes.",
  },
  {
    q: "Est-ce pareil qu’un calculateur de ROI pour service de réponse ?",
    a: "C’est proche. Ce calculateur montre le revenu à risque. Pour réfléchir au ROI, comparez ce montant au coût d’un service humain ou d’un réceptionniste IA.",
  },
  {
    q: "Le revenu récupéré est-il garanti ?",
    a: "Non. Ce sont des estimations pour vous aider à décider. Mais lorsqu’un réceptionniste IA répond à un appel qui serait allé en messagerie et réussit à réserver le prospect, c’est bien du revenu récupéré.",
  },
]

export const getCalculatorFaqs = (locale: Locale = "en") =>
  locale === "fr" ? calculatorFaqsFr : calculatorFaqs
