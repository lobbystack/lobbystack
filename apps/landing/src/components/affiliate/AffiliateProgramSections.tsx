import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { localizeHref, type Locale } from "@/i18n"
import { APP_AFFILIATE_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Check,
  Gift,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"

const AFFILIATE_DOCS_URL =
  "https://docs.lobbystack.com/billing/affiliate-program"

const copy = {
  en: {
    hero: {
      headingPrefix: "Become a",
      headingAccent: "LobbyStack",
      headingSuffix: "affiliate",
      subhead:
        "Refer businesses to LobbyStack hosted plans and earn 20% of their payments for 12 months. Referrals save 5% when they sign up through your link.",
      cta: "Join the program",
    },
    benefits: {
      heading: "What you'll get",
      items: [
        {
          title: "20% for 12 months",
          description:
            "You earn 20% on each hosted plan payment during the customer's first year. The commission repeats monthly while they stay subscribed.",
          icon: TrendingUp,
        },
        {
          title: "5% off for referrals",
          description:
            "Referrals get 5% off hosted LobbyStack plans at signup.",
          icon: Gift,
        },
        {
          title: "Simple payouts",
          description:
            "We hold commissions for 30 days. Balances of $100 or more get paid monthly through PayPal.",
          icon: Wallet,
        },
      ],
    },
    details: {
      howItWorks: {
        heading: "How it works",
        steps: [
          <>
            Log in and open <strong>Affiliate Program</strong> in your dashboard
            sidebar (Manage → Affiliate Program).
          </>,
          <>
            Add your <strong>PayPal email</strong> in affiliate settings for
            payouts.
          </>,
          "Share your referral link in newsletters, websites, videos, and direct recommendations.",
          "Watch clicks, referrals, pending commissions, and payouts in your dashboard.",
        ],
      },
      whoShouldApply: {
        heading: "Who should apply",
        items: [
          <>
            <strong>Marketing agencies</strong> helping local businesses capture
            leads from phone calls
          </>,
          <>
            <strong>Web designers and SEO consultants</strong> with small-business
            clients who miss calls
          </>,
          <>
            <strong>Business and automation consultants</strong> improving
            operations and lead capture
          </>,
          <>
            <strong>Creators and newsletter writers</strong> covering AI tools,
            local business growth, or missed-call recovery
          </>,
        ],
      },
    },
    guidelines: {
      heading: "Guidelines",
      items: [
        {
          title: "Keep it honest",
          description:
            "Describe LobbyStack accurately. Recommend it for missed calls, after-hours coverage, booking, and routing problems you have actually seen.",
        },
        {
          title: "Disclose compensation",
          description:
            "Tell your audience when you earn commission from a referral.",
        },
        {
          title: "No paid search on our trademarks",
          description:
            "Do not bid on LobbyStack trademarks or confusingly similar terms in paid search ads.",
        },
        {
          title: "No spam or abuse",
          description:
            "No fake reviews, misleading claims, self-referrals, coupon abuse, fake traffic, or pretending to be LobbyStack.",
        },
        {
          title: "Termination rights",
          descriptionPrefix: "Attribution, holds, refunds, and payout rules are in our",
          termsLabel: "Terms of Service",
          descriptionSuffix: "LobbyStack can change or pause the program at any time.",
        },
      ],
      footerPrefix: "Questions? Email",
      footerMiddle: "or read the",
      footerDocsLabel: "affiliate program docs",
    },
  },
  fr: {
    hero: {
      headingPrefix: "Devenez affilié",
      headingAccent: "LobbyStack",
      headingSuffix: "",
      subhead:
        "Parrainez des entreprises vers les forfaits hébergés LobbyStack et touchez 20 % de leurs paiements pendant 12 mois. Les parrainages obtiennent 5 % de rabais lorsqu'ils s'inscrivent via votre lien.",
      cta: "Rejoindre le programme",
    },
    benefits: {
      heading: "Ce que vous obtenez",
      items: [
        {
          title: "20 % pendant 12 mois",
          description:
            "Vous touchez 20 % sur chaque paiement de forfait hébergé pendant la première année du client. La commission se renouvelle chaque mois tant qu'il reste abonné.",
          icon: TrendingUp,
        },
        {
          title: "5 % de rabais pour les parrainages",
          description:
            "Les parrainages obtiennent 5 % de rabais sur les forfaits hébergés LobbyStack à l'inscription.",
          icon: Gift,
        },
        {
          title: "Paiements simples",
          description:
            "Nous retenons chaque commission 30 jours. Les soldes de 100 $ ou plus sont payés chaque mois via PayPal.",
          icon: Wallet,
        },
      ],
    },
    details: {
      howItWorks: {
        heading: "Comment ça marche",
        steps: [
          <>
            Connectez-vous et ouvrez <strong>Programme d'affiliation</strong> dans
            la barre latérale (Gérer → Programme d'affiliation).
          </>,
          <>
            Ajoutez votre <strong>adresse e-mail PayPal</strong> dans les
            paramètres d'affiliation pour les paiements.
          </>,
          "Partagez votre lien de parrainage dans vos newsletters, sites web, vidéos et recommandations directes.",
          "Suivez les clics, les parrainages, les commissions en attente et les paiements dans votre tableau de bord.",
        ],
      },
      whoShouldApply: {
        heading: "Qui devrait postuler",
        items: [
          <>
            <strong>Agences marketing</strong> aidant les entreprises locales à
            capturer des prospects par téléphone
          </>,
          <>
            <strong>Web designers et consultants SEO</strong> avec des clients PME
            qui manquent des appels
          </>,
          <>
            <strong>Consultants en affaires et en automatisation</strong>{" "}
            améliorant les opérations et la capture de prospects
          </>,
          <>
            <strong>Créateurs et rédacteurs de newsletters</strong> couvrant les
            outils IA, la croissance des entreprises locales ou la récupération
            d'appels manqués
          </>,
        ],
      },
    },
    guidelines: {
      heading: "Directives",
      items: [
        {
          title: "Restez honnête",
          description:
            "Décrivez LobbyStack avec précision. Recommandez-le pour les appels manqués, la couverture hors horaires, la réservation et le routage que vous avez vus sur le terrain.",
        },
        {
          title: "Divulguez votre rémunération",
          description:
            "Dites à votre audience quand vous touchez une commission sur un parrainage.",
        },
        {
          title: "Pas de recherche payante sur nos marques",
          description:
            "N'enchérissez pas sur les marques LobbyStack ou des termes similaires pouvant prêter à confusion dans les annonces de recherche payante.",
        },
        {
          title: "Pas de spam ni d'abus",
          description:
            "Pas de faux avis, d'allégations trompeuses, d'auto-parrainage, d'abus de coupons, de trafic artificiel ni d'usurpation de LobbyStack.",
        },
        {
          title: "Droit de résiliation",
          descriptionPrefix: "L'attribution, les retenues, les remboursements et les règles de paiement sont dans nos",
          termsLabel: "Conditions d'utilisation",
          descriptionSuffix: "LobbyStack peut modifier ou suspendre le programme à tout moment.",
        },
      ],
      footerPrefix: "Des questions ? Écrivez à",
      footerMiddle: "ou consultez la",
      footerDocsLabel: "documentation du programme d'affiliation",
    },
  },
} satisfies Record<
  Locale,
  {
    hero: {
      headingPrefix: string
      headingAccent: string
      headingSuffix: string
      subhead: string
      cta: string
    }
    benefits: {
      heading: string
      items: Array<{
        title: string
        description: string
        icon: LucideIcon
      }>
    }
    details: {
      howItWorks: {
        heading: string
        steps: Array<string | React.ReactNode>
      }
      whoShouldApply: {
        heading: string
        items: Array<React.ReactNode>
      }
    }
    guidelines: {
      heading: string
      items: Array<
        | {
            title: string
            description: string
          }
        | {
            title: string
            descriptionPrefix: string
            termsLabel: string
            descriptionSuffix: string
          }
      >
      footerPrefix: string
      footerMiddle: string
      footerDocsLabel: string
    }
  }
>

function CheckListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="body-copy text-foreground">{children}</span>
    </li>
  )
}

type AffiliateProgramSectionsProps = {
  locale?: Locale
}

export function AffiliateProgramHero({
  locale = "en",
}: AffiliateProgramSectionsProps) {
  const t = copy[locale].hero

  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 md:pt-20 md:pb-10 lg:pt-24 lg:pb-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="display-heading">
            {t.headingPrefix}{" "}
            <span className="underline decoration-2 underline-offset-4">
              {t.headingAccent}
            </span>
            {t.headingSuffix ? ` ${t.headingSuffix}` : ""}
          </h1>

          <p className="body-copy mx-auto mt-6 max-w-[65ch] md:text-lg">
            {t.subhead}
          </p>

          <div className="mt-8">
            <a
              href={APP_AFFILIATE_URL}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-7 text-sm"
              )}
            >
              {t.cta}
              <ArrowRight className="ml-1 size-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AffiliateProgramBenefits({
  locale = "en",
}: AffiliateProgramSectionsProps) {
  const t = copy[locale].benefits

  return (
    <section className="section-spacing" id="benefits">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{t.heading}</h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {t.items.map((item) => {
            const Icon = item.icon
            return (
              <Card
                key={item.title}
                className="rounded-2xl border-border/70 py-0"
              >
                <CardHeader className="gap-4 px-8 pt-8">
                  <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-muted">
                    <Icon className="size-6 text-foreground" />
                  </div>
                  <CardTitle className="font-heading text-xl font-medium tracking-[-0.03em]">
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <CardDescription className="body-copy text-base text-muted-foreground">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function AffiliateProgramDetails({
  locale = "en",
}: AffiliateProgramSectionsProps) {
  const t = copy[locale].details

  return (
    <section className="section-spacing bg-muted/30" id="details">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <h2 className="section-heading">{t.howItWorks.heading}</h2>
            <ul className="mt-8 flex flex-col gap-4">
              {t.howItWorks.steps.map((step, index) => (
                <CheckListItem key={index}>{step}</CheckListItem>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-heading">{t.whoShouldApply.heading}</h2>
            <ul className="mt-8 flex flex-col gap-4">
              {t.whoShouldApply.items.map((item, index) => (
                <CheckListItem key={index}>{item}</CheckListItem>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AffiliateProgramGuidelines({
  locale = "en",
}: AffiliateProgramSectionsProps) {
  const t = copy[locale].guidelines
  const termsHref = localizeHref(locale, "/terms/#affiliate-program")

  return (
    <section className="section-spacing" id="guidelines">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{t.heading}</h2>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {t.items.map((item) => (
            <div key={item.title}>
              <h3 className="font-heading text-base font-medium">{item.title}</h3>
              <p className="body-copy mt-2 text-muted-foreground">
                {"description" in item ? (
                  item.description
                ) : (
                  <>
                    {item.descriptionPrefix}{" "}
                    <a
                      href={termsHref}
                      className="text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      {item.termsLabel}
                    </a>
                    . {item.descriptionSuffix}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        <p className="body-copy mt-16 text-center text-muted-foreground">
          {t.footerPrefix}{" "}
          <a
            href="mailto:support@lobbystack.com"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            support@lobbystack.com
          </a>{" "}
          {t.footerMiddle}{" "}
          <a
            href={AFFILIATE_DOCS_URL}
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t.footerDocsLabel}
          </a>
          .
        </p>
      </div>
    </section>
  )
}

export function AffiliateProgramSections({
  locale = "en",
}: AffiliateProgramSectionsProps) {
  return (
    <>
      <AffiliateProgramHero locale={locale} />
      <AffiliateProgramBenefits locale={locale} />
      <AffiliateProgramDetails locale={locale} />
      <AffiliateProgramGuidelines locale={locale} />
    </>
  )
}
