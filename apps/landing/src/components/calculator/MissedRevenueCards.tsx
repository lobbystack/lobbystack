import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Locale } from "@/i18n"

const copy = {
  en: {
    heading: "Why contractors miss revenue",
    reasons: [
      {
        title: "On the Job Site",
        description:
          "When you're under a house, up on a roof, or operating machinery, you simply can't safely or professionally answer the phone.",
      },
      {
        title: "Talking to a Customer",
        description:
          "Taking a call while speaking with a homeowner face-to-face is rude and costs trust. But ignoring the phone loses the new lead.",
      },
      {
        title: "Driving Between Jobs",
        description:
          "If your hands are on the wheel, you can't write down a name, address, and job details. Customers hate repeating themselves later.",
      },
      {
        title: "After Hours & Weekends",
        description:
          "Emergencies happen 24/7. If a pipe bursts at 9 PM and you don't answer, they immediately call the next plumber on Google.",
      },
    ],
  },
  fr: {
    heading: "Pourquoi les entrepreneurs perdent du revenu",
    reasons: [
      {
        title: "Sur le chantier",
        description:
          "Quand vous etes sous une maison, sur un toit ou avec des outils, vous ne pouvez pas repondre au telephone de facon sure et professionnelle.",
      },
      {
        title: "Avec un client",
        description:
          "Prendre un appel devant un client nuit a la confiance. Ignorer l'appel peut toutefois perdre un nouveau prospect.",
      },
      {
        title: "Entre deux travaux",
        description:
          "Si vous conduisez, vous ne pouvez pas noter correctement le nom, l'adresse et les details du travail.",
      },
      {
        title: "Apres les heures et fins de semaine",
        description:
          "Les urgences arrivent 24/7. Si un tuyau eclate le soir et que vous ne repondez pas, le client appelle le prochain resultat.",
      },
    ],
  },
} satisfies Record<Locale, { heading: string; reasons: Array<{ title: string; description: string }> }>

export function MissedRevenueCards({ locale = "en" }: { locale?: Locale }) {
  const t = copy[locale]

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold tracking-tight text-foreground">
        {t.heading}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {t.reasons.map((reason) => (
          <Card key={reason.title}>
            <CardHeader>
              <CardTitle>{reason.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {reason.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
