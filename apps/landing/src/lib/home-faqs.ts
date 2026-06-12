import type { FaqItem } from "@/lib/seo"
import type { Locale } from "@/i18n"

export const homeFaqs: FaqItem[] = [
  {
    question: "Can I customize my AI receptionist's greeting and tone?",
    answer:
      "Yes. LobbyStack lets you customize the greeting, tone, business instructions, and call handling rules so your AI receptionist sounds aligned with your brand.",
  },
  {
    question: "What happens when a caller asks something unusual?",
    answer:
      "You define the fallback behavior. LobbyStack can take a message, offer to connect the caller to your team, send a follow-up text, or schedule a callback.",
  },
  {
    question: "Can LobbyStack book appointments directly into my calendar?",
    answer:
      "Yes. LobbyStack can check availability, offer appointment times, book the appointment, and send confirmation details to the caller.",
  },
  {
    question: "Can the AI receptionist send a call summary to my phone?",
    answer:
      "Yes. You can receive an SMS or email summary after a call with the caller's details, reason for calling, outcome, and next step.",
  },
  {
    question: "What types of calls should still go to a human?",
    answer:
      "LobbyStack is a strong fit for routine questions, bookings, intake, and lead qualification. Complex negotiations, sensitive situations, urgent cases, and specialized troubleshooting can be transferred to your team.",
  },
]

export const homeFaqsFr: FaqItem[] = [
  {
    question:
      "Puis-je personnaliser l’accueil et le ton de ma réceptionniste IA ?",
    answer:
      "Oui. LobbyStack vous permet de personnaliser l’accueil, le ton, les consignes métier et les règles de traitement des appels afin que votre réceptionniste IA reste alignée avec votre marque.",
  },
  {
    question:
      "Que se passe-t-il si un appelant demande quelque chose d’inhabituel ?",
    answer:
      "Vous définissez le comportement de secours. LobbyStack peut prendre un message, proposer de joindre votre équipe, envoyer un SMS de suivi ou planifier un rappel.",
  },
  {
    question: "LobbyStack peut-il planifier directement dans mon calendrier ?",
    answer:
      "Oui. LobbyStack peut vérifier les disponibilités, proposer des créneaux, planifier le rendez‑vous et envoyer les détails de confirmation à l’appelant.",
  },
  {
    question: "La réceptionniste IA peut-elle m’envoyer un résumé d’appel ?",
    answer:
      "Oui. Vous pouvez recevoir un résumé par SMS ou courriel après l’appel avec les coordonnées de l’appelant, le motif, le résultat et la prochaine étape.",
  },
  {
    question: "Quels appels doivent encore revenir à une personne ?",
    answer:
      "LobbyStack convient très bien aux questions courantes, prises de rendez‑vous, collectes d’information et qualifications de prospects. Les négociations complexes, situations sensibles, cas urgents et dépannages spécialisés peuvent être transférés à votre équipe.",
  },
]

export const getHomeFaqs = (locale: Locale): FaqItem[] =>
  locale === "fr" ? homeFaqsFr : homeFaqs
