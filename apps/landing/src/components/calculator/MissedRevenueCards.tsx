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
    heading: "Pourquoi les entrepreneurs perdent des revenus",
    reasons: [
      {
        title: "Sur le chantier",
        description:
          "Quand vous êtes sous une maison, sur un toit ou avec des outils, vous ne pouvez pas répondre au téléphone de façon sûre et professionnelle.",
      },
      {
        title: "Avec un client",
        description:
          "Prendre un appel devant un client nuit à la confiance. L’ignorer peut toutefois vous faire perdre un nouveau prospect.",
      },
      {
        title: "Entre deux travaux",
        description:
          "Si vous conduisez, vous ne pouvez pas noter correctement le nom, l’adresse et les détails du travail.",
      },
      {
        title: "Hors horaires et fins de semaine",
        description:
          "Les urgences arrivent 24/7. Si un tuyau éclate le soir et que vous ne répondez pas, le client appelle le prochain résultat.",
      },
    ],
  },
  es: {
    heading: "Por qué los contratistas pierden ingresos",
    reasons: [
      {
        title: "En la obra",
        description:
          "Cuando está debajo de una casa, sobre un tejado o manejando maquinaria, no puede contestar el teléfono de forma segura ni profesional.",
      },
      {
        title: "Hablando con un cliente",
        description:
          "Atender una llamada mientras habla en persona con un propietario es descortés y resta confianza. Pero si ignora el teléfono, pierde al nuevo cliente potencial.",
      },
      {
        title: "Conduciendo entre trabajos",
        description:
          "Con las manos en el volante no puede anotar un nombre, una dirección y los detalles del trabajo. A los clientes no les gusta repetirlo todo después.",
      },
      {
        title: "Fuera de horario y fines de semana",
        description:
          "Las emergencias ocurren a cualquier hora. Si una tubería revienta a las 21:00 y no contesta, llamarán enseguida al siguiente plomero que encuentren en Google.",
      },
    ],
  },
  sr: {
    heading: "Zašto izvođači radova gube prihod",
    reasons: [
      {
        title: "Na terenu",
        description:
          "Kada ste ispod kuće, na krovu ili radite sa mašinama, ne možete bezbedno i profesionalno da se javite na telefon.",
      },
      {
        title: "U razgovoru sa klijentom",
        description:
          "Javljanje na telefon dok razgovarate sa vlasnikom kuće licem u lice je nepristojno i narušava poverenje. Ali ako ignorišete telefon, gubite novog potencijalnog klijenta.",
      },
      {
        title: "U vožnji između poslova",
        description:
          "Dok su Vam ruke na volanu, ne možete da zapišete ime, adresu i detalje posla. Klijenti ne vole da kasnije sve ponavljaju.",
      },
      {
        title: "Van radnog vremena i vikendom",
        description:
          "Hitni slučajevi se dešavaju 24/7. Ako cev pukne u 21 čas, a Vi se ne javite, klijent odmah zove sledećeg vodoinstalatera koga nađe na Google-u.",
      },
    ],
  },
} satisfies Record<
  Locale,
  { heading: string; reasons: Array<{ title: string; description: string }> }
>

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
