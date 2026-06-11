import type { FaqItem } from "@/lib/seo"
import type { Locale } from "@/i18n"

export const pricingFaqs: FaqItem[] = [
  {
    question: "How does LobbyStack paid pricing work?",
    answer:
      "Starter is $30/month or $288/year and includes 150 voice minutes each month. Pro is $100/month or $960/year and includes 500 voice minutes each month. Starter voice overage is $0.20/minute, Pro voice overage is $0.18/minute, and alert SMS/outbound call overages are $0.02 per unit.",
  },
  {
    question: "Do spam calls or very short calls count toward usage?",
    answer:
      "No. LobbyStack excludes spam calls and calls under 10 seconds from usage, so wrong numbers, robocalls, instant hang-ups, and pocket dials do not count against your included voice minutes or paid-plan overages.",
  },
  {
    question: "Can I switch plans or cancel anytime?",
    answer:
      "Yes. You can upgrade, downgrade, or cancel your plan from billing settings. When you downgrade, you keep your current plan until the end of the billing period. There are no cancellation fees.",
  },
  {
    question: "Can I use LobbyStack for free?",
    answer:
      "Yes. The Free tier lets you try LobbyStack without a monthly subscription. It includes 30 voice minutes, 2 outbound call attempts, 10 alert SMS segments, appointment booking, summaries, and call history.",
  },
  {
    question: "What AI receptionist features are available today?",
    answer:
      "LobbyStack can answer calls, capture caller details, answer business questions from your knowledge base, qualify leads, book appointments, route urgent callers, send summaries by email, and support recordings, transcripts, Google Calendar, Outlook, and multilingual conversations.",
  },
]

export const pricingFaqsFr: FaqItem[] = [
  {
    question: "Comment fonctionnent les forfaits payants LobbyStack ?",
    answer:
      "Starter coute 30 $/mois ou 288 $/an et inclut 150 minutes vocales chaque mois. Pro coute 100 $/mois ou 960 $/an et inclut 500 minutes vocales. Les depassements vocaux sont de 0,20 $/min en Starter et 0,18 $/min en Pro; les SMS d'alerte et appels sortants supplementaires sont factures 0,02 $ par unite.",
  },
  {
    question: "Les appels spam ou tres courts comptent-ils dans l'usage ?",
    answer:
      "Non. LobbyStack exclut les appels spam et les appels de moins de 10 secondes de l'usage, afin que les mauvais numeros, robocalls, raccrochages instantanes et appels accidentels ne consomment pas vos minutes incluses.",
  },
  {
    question: "Puis-je changer de forfait ou annuler a tout moment ?",
    answer:
      "Oui. Vous pouvez mettre a niveau, retrograder ou annuler depuis les reglages de facturation. En cas de retrogradation, votre forfait actuel reste actif jusqu'a la fin de la periode. Il n'y a pas de frais d'annulation.",
  },
  {
    question: "Puis-je utiliser LobbyStack gratuitement ?",
    answer:
      "Oui. Le forfait Free vous permet d'essayer LobbyStack sans abonnement mensuel. Il inclut 30 minutes vocales, 2 tentatives d'appels sortants, 10 segments SMS d'alerte, la prise de rendez-vous, les resumes et l'historique des appels.",
  },
  {
    question:
      "Quelles fonctionnalites de receptionniste IA sont disponibles aujourd'hui ?",
    answer:
      "LobbyStack peut repondre aux appels, capturer les details de l'appelant, repondre aux questions depuis votre base de connaissances, qualifier les prospects, reserver des rendez-vous, router les urgences, envoyer des resumes par courriel et prendre en charge enregistrements, transcriptions, Google Calendar, Outlook et conversations multilingues.",
  },
]

export const getPricingFaqs = (locale: Locale): FaqItem[] =>
  locale === "fr" ? pricingFaqsFr : pricingFaqs
