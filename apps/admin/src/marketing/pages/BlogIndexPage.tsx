import { ArrowRight } from "lucide-react"

import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { blogCanonicalSlug, blogPath, getBlogPosts } from "@/marketing/content/blog"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import { eyebrow } from "@/marketing/lib/eyebrows"
import {
  blogJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageCopy = {
  en: {
    h1: "AI receptionist blog and product updates",
    intro:
      "Product updates and practical notes on AI phone answering, missed calls, appointment scheduling, call routing, lead follow-up, and open-source receptionist infrastructure.",
    topicsHeading: "Topics we cover",
    topics: [
      {
        title: "Open-source phone answering",
        body: "Compare self-hosted stacks, Asterisk agents, LiveKit voice kits, and full receptionist platforms.",
        href: "/blog/best-open-source-ai-phone-answering-services/",
      },
      {
        title: "Choosing an AI receptionist",
        body: "How to evaluate vendors, pricing models, and setup requirements before you turn on live call handling.",
        href: "/blog/how-to-choose-an-ai-receptionist/",
      },
      {
        title: "AI receptionist comparisons",
        body: "Fair comparisons of Upfirst, Frontdesk, Smith.ai, Goodcall, and other phone-answering products.",
        href: "/blog/upfirst-alternative/",
      },
      {
        title: "Build vs buy",
        body: "When it makes sense to self-host, buy hosted software, or build from scratch.",
        href: "/blog/build-or-buy-ai-receptionist/",
      },
      {
        title: "Missed-call economics",
        body: "How much revenue walks away when calls go unanswered, and what recovery looks like in practice.",
        href: "/blog/ai-receptionist-savings/",
      },
      {
        title: "Open-source stack",
        body: "How LobbyStack packages calls, booking, transcripts, dashboards, billing, and self-hosting in one receptionist stack.",
        href: "/blog/open-source-ai-receptionist-stack/",
      },
      {
        title: "Workflows without flowcharts",
        body: "Why n8n and Zapier chains break on live calls, and what a receptionist product layer should own instead.",
        href: "/blog/ai-receptionist-workflows/",
      },
      {
        title: "Affiliate program",
        body: "Earn recurring commission by recommending an open-source AI receptionist to agencies, consultants, and local operators.",
        href: "/blog/ai-receptionist-affiliate-program/",
      },
      {
        title: "Solution guides",
        body: "Trade-specific pages for plumbers, HVAC teams, dental offices, salons, and other call-heavy businesses.",
        href: "/solutions/",
      },
    ],
  },
  fr: {
    h1: "Blog et mises à jour produit sur les réceptionnistes IA",
    intro:
      "Mises à jour produit et notes pratiques sur la réponse téléphonique IA, les appels manqués, la planification, les transferts, le suivi des prospects et l’infrastructure open source.",
    topicsHeading: "Sujets que nous couvrons",
    topics: [
      {
        title: "Réponse téléphonique open source",
        body: "Comparez les piles auto-hébergées, les agents Asterisk, les kits LiveKit et les plateformes complètes.",
        href: "/fr/blog/best-open-source-ai-phone-answering-services/",
      },
      {
        title: "Choisir un réceptionniste IA",
        body: "Comment évaluer les fournisseurs, les modèles tarifaires et la mise en place avant d’activer la gestion d’appels en production.",
        href: "/fr/blog/how-to-choose-an-ai-receptionist/",
      },
      {
        title: "Comparaisons de réceptionnistes IA",
        body: "Comparaisons documentées d’Upfirst, Frontdesk, Smith.ai, Goodcall et d’autres services de réponse téléphonique.",
        href: "/fr/blog/upfirst-alternative/",
      },
      {
        title: "Construire ou acheter",
        body: "Quand l’auto-hébergement, l’achat d’un service hébergé ou le développement sur mesure est le bon choix.",
        href: "/fr/blog/build-or-buy-ai-receptionist/",
      },
      {
        title: "Coût des appels manqués",
        body: "Ce que vous perdez quand personne ne répond, et ce que la récupération change concrètement.",
        href: "/fr/blog/ai-receptionist-savings/",
      },
      {
        title: "Pile open source",
        body: "Comment LobbyStack regroupe appels, réservation, transcriptions, tableaux de bord, facturation et auto-hébergement.",
        href: "/fr/blog/open-source-ai-receptionist-stack/",
      },
      {
        title: "Workflows sans flowcharts",
        body: "Pourquoi les chaînes n8n et Zapier cassent en direct, et ce qu'une couche produit réceptionniste doit posséder.",
        href: "/fr/blog/ai-receptionist-workflows/",
      },
      {
        title: "Programme d'affiliation",
        body: "Gagnez des commissions récurrentes en recommandant un réceptionniste IA open source aux agences et opérateurs locaux.",
        href: "/fr/blog/ai-receptionist-affiliate-program/",
      },
      {
        title: "Guides par métier",
        body: "Pages dédiées à la plomberie, au CVC, aux cabinets dentaires, aux salons et aux entreprises très sollicitées par téléphone.",
        href: "/fr/solutions/",
      },
    ],
  },
  es: {
    h1: "Blog de recepcionistas con IA y novedades del producto",
    intro:
      "Novedades del producto y notas prácticas sobre atención telefónica con IA, llamadas perdidas, programación de citas, enrutamiento de llamadas, seguimiento de clientes potenciales e infraestructura de recepción de código abierto.",
    topicsHeading: "Temas que tratamos",
    topics: [
      {
        title: "Atención telefónica de código abierto",
        body: "Compare stacks autoalojados, agentes de Asterisk, kits de voz de LiveKit y plataformas de recepción completas.",
        href: "/es/blog/best-open-source-ai-phone-answering-services/",
      },
      {
        title: "Cómo elegir una recepcionista con IA",
        body: "Cómo evaluar proveedores, modelos de precios y requisitos de configuración antes de atender llamadas reales.",
        href: "/es/blog/how-to-choose-an-ai-receptionist/",
      },
      {
        title: "Comparativas de recepcionistas con IA",
        body: "Comparativas justas de Upfirst, Frontdesk, Smith.ai, Goodcall y otros servicios de atención telefónica.",
        href: "/es/blog/upfirst-alternative/",
      },
      {
        title: "Desarrollar o comprar",
        body: "Cuándo conviene el autoalojamiento, contratar software alojado o desarrollar desde cero.",
        href: "/es/blog/build-or-buy-ai-receptionist/",
      },
      {
        title: "El costo de las llamadas perdidas",
        body: "Cuántos ingresos se pierden cuando nadie contesta y cómo se recuperan en la práctica.",
        href: "/es/blog/ai-receptionist-savings/",
      },
      {
        title: "Stack de código abierto",
        body: "Cómo LobbyStack reúne llamadas, reservas, transcripciones, paneles, facturación y autoalojamiento en un solo stack de recepción.",
        href: "/es/blog/open-source-ai-receptionist-stack/",
      },
      {
        title: "Flujos de trabajo sin diagramas",
        body: "Por qué las cadenas de n8n y Zapier fallan en llamadas en vivo y qué debería resolver el propio producto de recepción.",
        href: "/es/blog/ai-receptionist-workflows/",
      },
      {
        title: "Programa de afiliados",
        body: "Gane comisiones recurrentes recomendando una recepcionista con IA de código abierto a agencias, consultores y negocios locales.",
        href: "/es/blog/ai-receptionist-affiliate-program/",
      },
      {
        title: "Guías por sector",
        body: "Páginas para plomeros, técnicos de climatización, consultorios dentales, salones y otros negocios que reciben muchas llamadas.",
        href: "/es/solutions/",
      },
    ],
  },
  sr: {
    h1: "Blog o AI recepcionerima i novosti o proizvodu",
    intro:
      "Novosti o proizvodu i praktični saveti o AI odgovaranju na pozive, propuštenim pozivima, zakazivanju termina, preusmeravanju poziva, praćenju potencijalnih klijenata i infrastrukturi recepcionera otvorenog koda.",
    topicsHeading: "Teme kojima se bavimo",
    topics: [
      {
        title: "Odgovaranje na pozive uz otvoreni kod",
        body: "Uporedite samostalno hostovana rešenja, Asterisk agente, LiveKit glasovne alate i kompletne platforme za recepciju.",
        href: "/sr/blog/best-open-source-ai-phone-answering-services/",
      },
      {
        title: "Kako izabrati AI recepcionera",
        body: "Kako da procenite dobavljače, modele cena i zahteve za podešavanje pre nego što uključite obradu poziva uživo.",
        href: "/sr/blog/how-to-choose-an-ai-receptionist/",
      },
      {
        title: "Poređenja AI recepcionera",
        body: "Fer poređenja servisa Upfirst, Frontdesk, Smith.ai, Goodcall i drugih rešenja za odgovaranje na pozive.",
        href: "/sr/blog/upfirst-alternative/",
      },
      {
        title: "Razviti ili kupiti",
        body: "Kada se isplati samostalno hostovanje, kada hostovani softver, a kada razvoj od nule.",
        href: "/sr/blog/build-or-buy-ai-receptionist/",
      },
      {
        title: "Cena propuštenih poziva",
        body: "Koliko prihoda odlazi kada niko ne odgovori i kako se taj prihod vraća u praksi.",
        href: "/sr/blog/ai-receptionist-savings/",
      },
      {
        title: "Rešenje otvorenog koda",
        body: "Kako LobbyStack objedinjuje pozive, zakazivanje, transkripte, kontrolne table, naplatu i samostalno hostovanje u jednom sistemu.",
        href: "/sr/blog/open-source-ai-receptionist-stack/",
      },
      {
        title: "Tokovi rada bez dijagrama",
        body: "Zašto se n8n i Zapier lanci lome tokom poziva uživo i šta bi umesto njih trebalo da preuzme sam proizvod za recepciju.",
        href: "/sr/blog/ai-receptionist-workflows/",
      },
      {
        title: "Program preporuka",
        body: "Ostvarite stalnu proviziju preporučujući AI recepcionera otvorenog koda agencijama, konsultantima i lokalnim firmama.",
        href: "/sr/blog/ai-receptionist-affiliate-program/",
      },
      {
        title: "Vodiči po delatnostima",
        body: "Stranice za vodoinstalatere, servisere grejanja i klimatizacije, stomatološke ordinacije, salone i druge firme sa mnogo poziva.",
        href: "/sr/solutions/",
      },
    ],
  },
} satisfies Record<
  Locale,
  {
    h1: string
    intro: string
    topicsHeading: string
    topics: Array<{ title: string; body: string; href: string }>
  }
>

const dateLocales = {
  en: "en-US",
  fr: "fr-FR",
  es: "es",
  sr: "sr-Latn",
} satisfies Record<Locale, string>

export function blogIndexPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const routeSeo = getRouteSeo({ locale, path: "/blog/" })
  const canonicalPath = localizePath(locale, "/blog/")
  return {
    ...(routeSeo ? { title: routeSeo.title, description: routeSeo.description } : {}),
    canonicalPath,
    locale,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      blogJsonLd({ locale, path: canonicalPath }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: "Blog", path: canonicalPath },
      ]),
    ],
  }
}

export async function BlogIndexPage({ locale }: { locale: Locale }) {
  const seo = blogIndexPageSeo(locale)
  const copy = getCopy(locale)
  const allPosts = await getBlogPosts(locale)
  const featuredPost = allPosts.find((p) => p.data.featured) || allPosts[0]
  const regularPosts = featuredPost
    ? allPosts.filter(
        (p) => blogCanonicalSlug(p) !== blogCanonicalSlug(featuredPost)
      )
    : allPosts
  const dateLocale = dateLocales[locale]
  const formatDate = (date: Date) =>
    date.toLocaleDateString(dateLocale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })

  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />

      <main id="main-content" className="min-h-screen bg-background text-foreground">
        <header className="px-6 pt-10 pb-12 md:pt-11 md:pb-15">
          <SectionTitle
            as="h1"
            centered
            eyebrow={eyebrow(locale, "blog.hero")}
            intro={pageCopy[locale].intro}
            className="max-w-[48rem]"
          >
            {pageCopy[locale].h1}
          </SectionTitle>
        </header>

        <div className="mx-auto max-w-site px-6">
          {featuredPost && (
            <section className="mb-6">
              <a
                href={blogPath(featuredPost, locale)}
                className="group grid overflow-hidden rounded-2xl border border-border/60 bg-beige lg:grid-cols-[1fr_1.4fr]"
              >
                <div className="order-2 flex flex-col p-6 md:p-8 lg:order-1 lg:p-10">
                  <p className="eyebrow">{copy.common.featured}</p>
                  <h2 className="feature-heading mt-4 transition-colors group-hover:text-foreground/70">
                    {featuredPost.data.title}
                  </h2>
                  <p className="mt-4 text-base leading-6 text-pretty text-muted-foreground md:text-lg md:leading-[1.6]">
                    {featuredPost.data.description}
                  </p>
                  <time
                    className="mt-8 block text-sm text-muted-foreground lg:mt-auto lg:pt-8"
                    dateTime={featuredPost.data.pubDate.toISOString()}
                  >
                    {formatDate(featuredPost.data.pubDate)}
                  </time>
                </div>

                <div className="relative order-1 aspect-[16/9] w-full overflow-hidden bg-beige-strong/60 lg:order-2 lg:aspect-auto">
                  {featuredPost.data.coverImage && (
                    <img
                      src={featuredPost.data.coverImage}
                      alt={featuredPost.data.title}
                      width="1672"
                      height="941"
                      className="h-full w-full object-cover"
                      decoding="async"
                      fetchPriority="high"
                    />
                  )}
                </div>
              </a>
            </section>
          )}

          <section>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {regularPosts.map((post) => (
                <a
                  key={blogCanonicalSlug(post)}
                  href={blogPath(post, locale)}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-beige"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-beige-strong/60">
                    {post.data.coverImage ? (
                      <img
                        src={post.data.coverImage}
                        alt={post.data.title}
                        width="1672"
                        height="941"
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-heading text-4xl text-muted-foreground/30">LobbyStack</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="card-heading transition-colors group-hover:text-foreground/70">{post.data.title}</h3>
                    <time className="mt-auto block pt-6 text-sm text-muted-foreground" dateTime={post.data.pubDate.toISOString()}>
                      {formatDate(post.data.pubDate)}
                    </time>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>

        <section className="section-spacing mx-auto max-w-site px-6">
          <SectionTitle eyebrow={eyebrow(locale, "blog.topics")}>{pageCopy[locale].topicsHeading}</SectionTitle>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pageCopy[locale].topics.map((topic) => (
              <a
                key={topic.href}
                href={topic.href}
                className="group flex flex-col rounded-2xl border border-border/60 bg-background p-6 transition-colors hover:bg-beige"
              >
                <h3 className="card-heading">{topic.title}</h3>
                <p className="mt-3 text-base leading-6 text-muted-foreground">{topic.body}</p>
                <span className="mt-auto pt-6">
                  <ArrowRight
                    className="size-4 text-foreground/60 transition-transform duration-200 ease-(--ease-out) group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>

      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
