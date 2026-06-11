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
    q: "Qu'est-ce qu'un calculateur de revenu d'appels manques ?",
    a: "Un calculateur de revenu d'appels manques estime le travail reserve qui peut etre a risque quand des appels restent sans reponse. Il part de vos appels manques, filtre les vraies opportunites, applique votre taux de reservation et multiplie par votre valeur moyenne.",
  },
  {
    q: "Quelle est la precision de ce calculateur ?",
    a: "Il est precis si vos entrees le sont. La formule multiplie vos appels manques par vos taux de conversion historiques pour montrer ce que vous laissez potentiellement sur la table.",
  },
  {
    q: "Combien un seul appel manque peut-il couter ?",
    a: "Cela depend du metier et du travail. Une demande d'entretien paysager peut valoir des mois de revenu recurrent, tandis qu'un appel de plomberie, CVC, toiture ou electricite peut representer une reparation ou installation importante.",
  },
  {
    q: "Est-ce que cela inclut les appels apres les heures ?",
    a: "Oui. Si le telephone sonne le soir et que personne ne repond, c'est un appel manque. Dans les metiers d'urgence, ces appels ont souvent une valeur moyenne plus elevee.",
  },
  {
    q: "Quelle valeur dois-je utiliser pour la valeur moyenne ?",
    a: "Prenez les revenus des 30 derniers jours et divisez-les par le nombre de travaux termines. Si vous faites de petits appels de service et de grosses installations, utilisez une moyenne melangee.",
  },
  {
    q: "Et si je ne connais pas mon taux de reservation ?",
    a: "Commencez avec une estimation prudente et relancez le calculateur avec un second scenario. Comparez par exemple 25 % et 50 % pour voir la sensibilite de votre revenu.",
  },
  {
    q: "Dois-je inclure les appels de spam ou fournisseurs ?",
    a: "Non, sauf si vous baissez le taux d'opportunite pour les compenser. Le calculateur estime le revenu de vrais travaux perdus, pas le bruit.",
  },
  {
    q: "Une receptionniste IA remplace-t-elle mon ou ma responsable de bureau ?",
    a: "Non. LobbyStack gere le travail repetitif de premiere ligne : questions courantes, details d'accueil et reservation. Votre equipe garde les cas complexes.",
  },
  {
    q: "Est-ce pareil qu'un calculateur de ROI de service de reponse ?",
    a: "C'est proche. Ce calculateur montre le revenu a risque. Pour penser au ROI, comparez ce montant avec le cout d'un service humain ou d'une receptionniste IA.",
  },
  {
    q: "Le revenu recupere est-il garanti ?",
    a: "Non. Ce sont des estimations de planification. Mais lorsqu'une receptionniste IA repond a un appel qui serait alle en messagerie et reserve le prospect, c'est bien du revenu recupere.",
  },
]

export const getCalculatorFaqs = (locale: Locale = "en") =>
  locale === "fr" ? calculatorFaqsFr : calculatorFaqs
