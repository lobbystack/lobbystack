import type { FaqItem } from "@/lib/seo"
import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/lib/seo-landing-pages"

type SerbianPageCopy = Omit<SeoLandingPage, "group" | "slug" | "path" | "image">

const serbianPage = (path: string, copy: SerbianPageCopy): SeoLandingPage => {
  const source = seoLandingPageByPath(path)
  if (!source) throw new Error(`Missing English SEO page for ${path}`)

  return {
    group: source.group,
    slug: source.slug,
    path: source.path,
    image: source.image,
    ...copy,
  }
}

const ctaLabels = {
  ctaPrimaryLabel: "Isprobajte besplatno",
  ctaSecondaryLabel: "Pogledajte cene",
}

const pricingLink = { label: "Cene", href: "/pricing/" }

const spamPoint =
  "Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju u potrošnju"
const freePlanPoint = "Paket Free uključuje 30 minuta razgovora za testiranje"

const paidPlansAnswer =
  "Paket Free uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta. Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju u potrošnju."

const paidPlansWithOverageAnswer =
  "Paket Free uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta, uz dodatne minute po $0.20 i $0.18. Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju u potrošnju."

const existingNumberFaq: FaqItem = {
  question: "Da li radi sa mojim postojećim poslovnim brojem?",
  answer:
    "Da. Preusmerite pozive sa broja koji Vaši klijenti već znaju ili koristite poseban LobbyStack broj za višak poziva i pozive van radnog vremena.",
}

const callReviewFaq = (details: string): FaqItem => ({
  question: "Da li ću videti o čemu se razgovaralo u svakom pozivu?",
  answer: `Da. Posle svakog poziva LobbyStack šalje rezime sa podacima o pozivaocu, ${details}, vremenom termina, transkriptom i snimkom. Pregledate ga na kontrolnoj tabli ili kroz obaveštenja e-poštom i SMS-om.`,
})

const freePlanPricingFaq = (question: string, who: string): FaqItem => ({
  question,
  answer: `LobbyStack ima besplatan paket sa uključenim minutima razgovora i plaćene pakete za veći broj poziva. Većina ${who} počinje na besplatnom paketu i prelazi na veći kako raste broj poziva. Aktuelne cene su na stranici sa cenama.`,
})

const tradeRelatedLinks = [
  {
    label: "Majstori i servisi za dom",
    href: "/solutions/ai-receptionist-for-home-services/",
  },
  {
    label: "Javljanje van radnog vremena",
    href: "/solutions/after-hours-answering-service/",
  },
  pricingLink,
]

const tradePage = ({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  imageAlt,
  proofPoints,
  emergencyTitle,
  emergencyBody,
  emergencyTransferPoint,
  bookingTitle,
  bookingBody,
  bookingPoint,
  intakeTitle,
  intakeBody,
  faqs,
  faqHeading,
  ctaHeading,
  ctaBody,
}: {
  path: string
  title: string
  description: string
  eyebrow: string
  h1: string
  intro: string
  imageAlt: string
  proofPoints: string[]
  emergencyTitle: string
  emergencyBody: string
  emergencyTransferPoint: string
  bookingTitle: string
  bookingBody: string
  bookingPoint: string
  intakeTitle: string
  intakeBody: string
  faqs: FaqItem[]
  faqHeading: string
  ctaHeading: string
  ctaBody: string
}) =>
  serbianPage(path, {
    title,
    description,
    eyebrow,
    h1,
    intro,
    imageAlt,
    proofPoints,
    sections: [
      {
        title: emergencyTitle,
        body: emergencyBody,
        points: [
          "Razlikuje hitne pozive od redovnih zahteva",
          emergencyTransferPoint,
          "Redovne zahteve šalje na jutarnji pregled",
        ],
      },
      {
        title: bookingTitle,
        body: bookingBody,
        points: [
          "Proverava slobodne termine u kalendaru u realnom vremenu",
          bookingPoint,
          "Šalje potvrdu i sledeće korake pozivaocu i Vašem timu",
        ],
      },
      {
        title: intakeTitle,
        body: intakeBody,
        points: [
          "Postavlja Vaša uvodna pitanja u svakom pozivu",
          "Odgovore prilaže uz rezime zakazivanja",
          "Šalje transkript i snimak zajedno sa detaljima termina",
        ],
      },
    ],
    faqs,
    faqHeading,
    relatedLinks: tradeRelatedLinks,
    ctaHeading,
    ctaBody,
    ...ctaLabels,
  })

const commonFaqs: FaqItem[] = [
  {
    question: "Mogu li da odredim šta AI govori?",
    answer:
      "Da. Unesite svoje usluge, česta pitanja, smernice za cene, pravila, ton, pozdrav i uputstva za različite vrste poziva.",
  },
  {
    question: "Šta ako pozivaocu treba prava osoba?",
    answer:
      "Vi određujete pravila za predaju poziva. LobbyStack može da preusmeri hitne pozive, važne potencijalne klijente, nezadovoljne kupce ili posebne slučajeve pravoj osobi, zajedno sa kontekstom poziva.",
  },
  {
    question: "Mogu li da počnem besplatno?",
    answer:
      "Da. Paket Free uključuje 30 minuta razgovora, pa svog recepcionera možete da testirate probnim pozivom u pregledaču pre prelaska na plaćeni paket.",
  },
]

const bespokeSolutionPagesSr: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title: "AI javljanje na pozive za male firme | LobbyStack",
    description:
      "LobbyStack se javlja na poslovne pozive 24/7, zakazuje termine, beleži podatke pozivalaca i hitne pozive prosleđuje Vašem timu.",
    eyebrow: "AI javljanje na pozive",
    h1: "AI javljanje na pozive koje pozive pretvara u zakazane poslove",
    intro:
      "LobbyStack se javlja kada Vaš tim ne može. Odgovara na česta pitanja, beleži podatke pozivalaca, zakazuje termine, šalje potvrde SMS-om i hitne pozive prosleđuje pravoj osobi.",
    image: "/illustrations/call-capture.webp",
    imageAlt: "LobbyStack AI javljanje na pozive beleži podatke pozivaoca",
    proofPoints: [
      "Javlja se na pozive 24/7, i van radnog vremena i u gužvi",
      "Zakazuje termine i šalje rezimee poziva",
      "Hitne pozive preusmerava pravoj osobi prema Vašim pravilima",
    ],
    sections: [
      {
        title: "Pozivi bez odgovora postaju jasni sledeći koraci",
        body: "Većina ljudi više ne ostavlja poruke na govornoj pošti. Pozovu, sačekaju nekoliko zvona, pa probaju sledeću firmu. LobbyStack se brzo javlja, postavlja prava pitanja i Vašem timu daje rezime sa kojim može odmah da radi.",
        points: [
          "Pozdrav i ton prilagođeni Vašoj firmi",
          "Uvodna pitanja za Vašu delatnost",
          "Rezime, transkript i ishod poziva na jednom mestu",
        ],
      },
      {
        title: "Ljudi ostaju za razgovore koji su važni",
        body: "Rutinski pozivi mogu da se obrade automatski, a hitni slučajevi, osetljivi klijenti i važni potencijalni klijenti stižu do Vašeg tima sa celim kontekstom.",
        points: [
          "Pravila preusmeravanja koja sami podešavate",
          "Poruke za tim o zahtevima koji nisu hitni",
          "Istorija poziva na jednom mestu",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Pitanja o AI javljanju na pozive",
    relatedLinks: [
      pricingLink,
      { label: "Funkcije", href: "/features/" },
      {
        label: "Kalkulator propuštenih poziva",
        href: "/missed-call-revenue-calculator/",
      },
    ],
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "AI zakazivanje termina za male firme | LobbyStack",
    description:
      "LobbyStack zakazuje termine tokom poziva, beleži podatke pozivalaca, šalje potvrde i hitne zahteve prosleđuje Vašem timu.",
    eyebrow: "AI zakazivanje termina",
    h1: "AI zakazivanje termina za pozivaoce spremne da zakažu",
    intro:
      "LobbyStack se javlja na pozive, prikuplja podatke koji trebaju Vašem timu, nudi slobodne termine, zakazuje i šalje potvrde pre nego što pozivalac ode dalje.",
    image: "/illustrations/booking-flow.webp",
    imageAlt: "LobbyStack AI zakazivanje termina zakazuje termin za pozivaoca",
    proofPoints: [
      "Zakazuje tokom poziva umesto da čeka povratni poziv",
      "Radi sa Google Calendar i šalje potvrde SMS-om",
      "Beleži podatke pozivaoca pre zakazivanja",
    ],
    sections: [
      {
        title: "Manje dogovaranja oko termina",
        body: "Kada je pozivalac spreman, LobbyStack nudi odgovarajuće termine, potvrđuje zakazivanje i prikuplja podatke potrebne za pripremu.",
        points: [
          "Slobodni termini iz Google Calendar-a",
          "Kvalifikaciona pitanja pre zakazivanja",
          "Automatske potvrde i sledeći koraci",
        ],
      },
      {
        title: "Zadržite kontrolu nad posebnim slučajevima",
        body: "Ako zahtev izlazi iz okvira Vaših pravila, LobbyStack beleži želje pozivaoca, objašnjava šta sledi i kontekst prosleđuje Vašem timu.",
        points: [
          "Pravila po usluzi, području ili vrsti termina",
          "Poruka za tim kada je potrebno",
          "Preusmeravanje hitnih slučajeva prema Vašim uputstvima",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Pitanja o AI zakazivanju termina",
    relatedLinks: [
      pricingLink,
      { label: "Funkcije", href: "/features/" },
      {
        label: "AI javljanje na pozive",
        href: "/solutions/ai-phone-answering/",
      },
    ],
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "AI recepcioner za majstore i servise za dom | LobbyStack",
    description:
      "LobbyStack je AI telefonska služba za majstore i servise. Javlja se na pozive za grejanje, klimatizaciju, vodu, struju, krovove i dvorišta dok su ekipe na terenu.",
    eyebrow: "Majstori i servisi za dom",
    h1: "Telefonska služba za majstore koja zakazuje poslove dok ekipa radi",
    intro:
      "LobbyStack se javlja na pozive za firme za grejanje i klimatizaciju, vodoinstalatere, električare, krovopokrivače i uređenje dvorišta. Prima hitne pozive, zakazuje termine i hitne poslove prosleđuje Vašem timu dok ste zauzeti poslom.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "LobbyStack AI recepcioner zakazuje poslove za majstore iz telefonskih poziva",
    proofPoints: [
      "Proverava hitnost, područje rada i vrstu posla",
      "Pomaže pozivaocima da zakažu ili ostave poruku",
      "Kritične situacije preusmerava pravoj osobi",
    ],
    sections: [
      {
        title: "Pokrijte telefon dok je ekipa na terenu",
        body: "Majstori ne mogu uvek da se jave bez prekidanja posla, a propušten poziv je često propušten posao. LobbyStack prikuplja ključne podatke i svaki zahtev čuva vidljivim.",
        points: [
          "Pitanja prilagođena majstorskim uslugama",
          "Beleške o poslu i rezime posle svakog poziva",
          "Pokrivenost van radnog vremena i u sezonskim gužvama",
        ],
      },
      {
        title: "Brže dajte prednost pravim pozivima",
        body: "Hitni slučajevi, veliki projekti i osetljivi zahtevi stižu do Vas sa kontekstom, a rutinski pozivi idu ka terminu ili poruci.",
        points: [
          "Preusmeravanje prema hitnosti ili vrsti zahteva",
          "Zakazivanje i potvrde prema Vašim pravilima",
          "Istorija poziva na jednom mestu za vlasnike, ekipe i kancelariju",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Pitanja o AI recepcionerima za majstore i servise",
    relatedLinks: [
      pricingLink,
      {
        label: "Kalkulator propuštenih poziva",
        href: "/missed-call-revenue-calculator/",
      },
      {
        label: "Javljanje van radnog vremena",
        href: "/solutions/after-hours-answering-service/",
      },
    ],
  },
}

const restoredSerbianSeoPages: Record<string, SeoLandingPage> = {
  "/about/": serbianPage("/about/", {
    title: "O nama: LobbyStack, AI recepcioner otvorenog koda",
    description:
      "Upoznajte LobbyStack, AI recepcioner otvorenog koda za male firme kojima treba javljanje na pozive, zakazivanje termina i preusmeravanje poziva.",
    eyebrow: "O nama",
    h1: "Upoznajte LobbyStack",
    intro:
      "LobbyStack postoji da bi male firme mogle da se javljaju na pozive i zakazuju termine, a da ne izgube kontrolu nad telefonskim procesima i podacima klijenata.",
    imageAlt:
      "LobbyStack, AI recepcioner otvorenog koda, povezuje pozivaoce, timove i poslovne procese",
    proofPoints: [
      "AI recepcioner otvorenog koda za male firme",
      "Javljanje na pozive, zakazivanje, preusmeravanje i rezimei poziva na jednom mestu",
      "Za upravljani cloud ili samostalno hostovanje uz pomoć pri postavljanju",
    ],
    sections: [
      {
        title: "Zašto LobbyStack postoji",
        body: "Većina malih firmi ne gubi klijente zato što ih nije briga. Gubi ih zato što telefon zazvoni dok tim već pomaže nekom drugom.",
        points: [
          "Svaki važan poziv postaje vidljiv",
          "Rutinska pitanja dobijaju jasan tok i rešenje",
          "Ljudi zadržavaju kontrolu nad osetljivim i vrednim pozivima",
        ],
      },
      {
        title: "Zašto smo izabrali otvoren kod",
        body: "Telefonski procesi se oslanjaju na podatke klijenata, pravila zakazivanja i pravila eskalacije. Timovi treba da mogu da provere kako se te odluke donose, umesto da veruju crnoj kutiji.",
        points: [
          "Pregledajte kod pod MIT licencom, model postavljanja i granice podataka na GitHub-u",
          "Počnite na LobbyStack Cloud-u i pređite na samostalno hostovanje kada Vašem timu zatreba više kontrole",
          "Izbegnite zavisnost od jednog dobavljača za recepcionera koji dočekuje svakog pozivaoca",
        ],
      },
      {
        title: "Za koga je LobbyStack",
        body: "LobbyStack je napravljen za vlasnike i male timove koji žive od dolaznih poziva: majstore i servise za dom, zanatlije, klinike, salone i lokalne uslužne firme koje ne smeju da propuste pozivaoce spremne da zakažu.",
        points: [
          "Timovi koji propuštaju pozive dok su na terenu, na terminu ili kada ne rade",
          "Vlasnici koji žele zakazivanje telefonom bez glasovnog menija i IVR alata",
          "Firme kojima treba pokrivenost van radnog vremena bez zapošljavanja još jednog recepcionera",
        ],
      },
      {
        title: "Kako funkcionišu podrška i bezbednost",
        body: "LobbyStack Cloud brine o hostovanju, nadzoru i ažuriranjima. Korisnici koji sami hostuju pokreću isti otvoreni kod na infrastrukturi koju kontrolišu. U oba slučaja Vi određujete šta recepcioner sme da kaže, zakaže i prosledi.",
        points: [
          "Podesite dozvoljene odgovore, pravila zakazivanja i preusmeravanja običnim jezikom",
          "Pregledajte rezimee, transkripte i ishode poziva na jednoj kontrolnoj tabli",
          "Koristite javnu dokumentaciju ili pišite na support@lobbystack.com kada Vam treba pomoć pri postavljanju",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Funkcije", href: "/features/" },
      { label: "Javna dokumentacija", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Javite se na svaki poziv bez preopterećenja tima",
    ctaBody:
      "Isprobajte LobbyStack sa uključenim minutima razgovora, pa podesite odgovore, zakazivanje i preusmeravanje za svoju firmu.",
  }),

  "/solutions/after-hours-answering-service/": serbianPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "AI služba za pozive van radnog vremena | LobbyStack",
      description:
        "LobbyStack se javlja na pozive van radnog vremena, zakazuje termine u Vaš kalendar i hitne slučajeve prosleđuje dežurnoj osobi. Besplatan paket, zatim $30 mesečno.",
      eyebrow: "Van radnog vremena",
      h1: "AI javljanje na pozive van radnog vremena za male firme",
      intro:
        "LobbyStack se javlja na Vaš poslovni telefon noću, vikendom i praznicima. Redovne poslove zakazuje u Vaš kalendar, a hitne slučajeve preusmerava dežurnoj osobi. Ujutru Vas na kontrolnoj tabli čeka rezime svakog poziva.",
      imageAlt:
        "LobbyStack obrađuje pozive van radnog vremena i prosleđuje hitne zahteve",
      proofPoints: [
        "Javlja se noću, vikendom i praznicima na Vašem postojećem broju",
        "Hitne slučajeve preusmerava na dežurni telefon sa podacima pozivaoca",
        "Besplatan paket sa 30 minuta, zatim $30 mesečno za 150",
      ],
      sections: [
        {
          title: "Hitni slučajevi stižu do dežurne osobe",
          body: "Vi zapisujete šta se smatra hitnim: nema grejanja ispod zadate temperature, voda koja ne prestaje da curi, stanar koji je ostao zaključan napolju. LobbyStack postavlja pitanja koja Vaše pravilo zahteva, a zatim preusmerava poziv sa već prikupljenom adresom i opisom problema. Sve što može da sačeka ide u jutarnji rezime.",
          points: [
            "Preusmerava na dežurni broj koji ste podesili",
            "Prvo čita Vaša bezbednosna uputstva, na primer gde se zatvara voda",
            "Šalje Vašem timu SMS upozorenje za hitne pozive",
          ],
        },
        {
          title: "Redovni pozivaoci sami zakazuju termine",
          body: "Kada pozivalac želi ponudu ili redovnu posetu, LobbyStack nudi slobodne termine iz Google Calendar-a i zakazuje onaj koji izabere. Pozivalac dobija potvrdu SMS-om, a Vi vidite termin čim otvorite kalendar.",
          points: [
            "Zakazuje u Google Calendar tokom poziva",
            "Pomera ili otkazuje termine nakon provere ko zove",
            "Odgovara na pitanja o radnom vremenu, području rada i cenama na osnovu Vaših podataka",
          ],
        },
        {
          title: "Jutro počinjete sa zapisom svakog poziva",
          body: "Svaki poziv dobija rezime, transkript i snimak na kontrolnoj tabli, pa vidite ko je zvao tokom noći i šta mu treba pre nego što uzvratite ijedan poziv. LobbyStack prekida neželjene pozive i oni ne troše Vaše minute.",
          points: [
            "Rezime sa imenom i brojem pozivaoca i razlogom poziva",
            "Snimak i ceo transkript svakog poziva",
            "Neželjeni pozivi i pozivi kraći od 10 sekundi ne troše minute",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI služba za pozive van radnog vremena?",
          answer:
            "To je služba koja se javlja na poslovne pozive van Vašeg uobičajenog radnog vremena, odgovara na pitanja, zakazuje termine, beleži podatke pozivalaca i hitne pozive prosleđuje pravoj osobi. Radi noću, vikendom, praznicima i kad god Vaš tim nije dostupan.",
        },
        {
          question: "Može li zaista da zakazuje termine van radnog vremena?",
          answer:
            "Da. LobbyStack proverava slobodne termine u Vašem kalendaru, nudi ih pozivaocu, zakazuje termin i šalje potvrdu SMS-om. Vaš tim vidi detalje termina sledećeg jutra.",
        },
        {
          question: "Kako zna šta je hitno?",
          answer:
            "Vi određujete pravila. LobbyStack može da pita pozivaoca o situaciji, prepozna reči kao što su hitno ili pokvareno i preusmeri poziv dežurnoj osobi. Za sve ostalo pravi rezime za jutarnji pregled.",
        },
        {
          question: "Da li će buditi moje dežurno osoblje?",
          answer:
            "Samo kada Vi to želite. Vi postavljate kriterijume za preusmeravanja i upozorenja. Redovne poruke, zahtevi za ponudu i zakazani termini idu u jutarnji rezime. Pravi hitni slučajevi se odmah prosleđuju sa celim kontekstom.",
        },
        {
          question: "Može li da radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Van radnog vremena preusmerite pozive sa postojećeg poslovnog broja na LobbyStack ili koristite poseban broj. Pozivaoci ne primećuju razliku. Jednostavno dobiju nekoga ko može da pomogne.",
        },
        {
          question:
            "Kojim delatnostima se najviše isplati javljanje van radnog vremena?",
          answer:
            "Svakoj firmi koja prima pozive van uobičajenog radnog vremena: majstorima i servisima za dom, stomatološkim ordinacijama, klinikama, salonima, servisima za popravke, upraviteljima nekretnina, advokatskim i drugim kancelarijama. Ako Vas klijenti zovu uveče i vikendom, pokrivenost van radnog vremena sprečava izgubljene prilike.",
        },
        {
          question: "Po čemu se ovo razlikuje od govorne pošte?",
          answer:
            "Govorna pošta traži od pozivaoca da ostavi poruku i čeka. Većina ljudi spusti slušalicu. LobbyStack se javlja, postavlja pitanja, beleži podatke i zakazuje termine. Pozivalac odmah dobija pomoć, a Vaš tim kompletan rezime.",
        },
        {
          question: "Da li je jeftinije od službe sa živim operaterima?",
          answer:
            "Ukupan trošak zavisi od broja poziva, trajanja razgovora, podešavanja i obima ljudske usluge. Uporedite objavljene cene minuta razgovora u LobbyStack-u sa cenama po pozivu, po minutu, za osoblje i za prekoračenja kod svake službe.",
        },
        {
          question:
            "Mogu li da pregledam šta se desilo u pozivima van radnog vremena?",
          answer:
            "Da. Za svaki poziv nastaju rezime, transkript, snimak i detalji termina. Pregledate ih na LobbyStack kontrolnoj tabli ili dobijate obaveštenja e-poštom i SMS-om. Ništa se ne gubi tokom noći.",
        },
        {
          question: "Koliko košta javljanje van radnog vremena?",
          answer:
            "Besplatan paket uključuje minute razgovora za testiranje pokrivenosti van radnog vremena. Plaćeni paketi rastu sa potrošnjom. Aktuelni broj minuta, cene SMS poruka i troškove prekoračenja pogledajte na stranici sa cenama.",
        },
      ],
      faqHeading: "Pitanja o AI javljanju na pozive van radnog vremena",
      relatedLinks: [
        {
          label: "AI javljanje na pozive",
          href: "/solutions/ai-phone-answering/",
        },
        pricingLink,
        {
          label: "Kalkulator propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
      ],
      ctaHeading: "Ne šaljite više noćne pozive na govornu poštu",
      ctaBody:
        "Podesite pravila za hitne slučajeve, preusmerite broj kada zatvorite i obavite probni poziv još večeras. Besplatan paket uključuje 30 minuta.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": serbianPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title: "AI telefonska služba za stomatološke ordinacije | LobbyStack",
      description:
        "LobbyStack se javlja na pozive Vaše ordinacije kada je recepcija zauzeta ili zatvorena. Zakazuje nove pacijente, odgovara na pitanja o osiguranju i prosleđuje hitne slučajeve.",
      eyebrow: "Stomatološke ordinacije",
      h1: "AI telefonska služba za stomatološke ordinacije",
      intro:
        "LobbyStack se javlja na telefon Vaše ordinacije kada je recepcija zauzeta, za vreme pauze i posle radnog vremena. Zakazuje nove pacijente i uklanjanje kamenca u Vaš kalendar, odgovara na pitanja o osiguranju i hitne slučajeve šalje dežurnom stomatologu.",
      imageAlt:
        "LobbyStack zakazuje termin za pacijenta i pravi rezime poziva",
      proofPoints: [
        "Javlja se na pozive novih pacijenata, pitanja o osiguranju i zakazivanje",
        "Zakazuje u Google Calendar i može da pošalje SMS podsetnik dan ranije",
        "Hitne slučajeve van radnog vremena prosleđuje dežurnom stomatologu",
      ],
      sections: [
        {
          title: "Recepcija ostaje posvećena pacijentu ispred sebe",
          body: "Kada telefon zazvoni tokom prijema pacijenta, LobbyStack se javlja. Zakazuje redovne posete, odgovara na pitanja o osiguranju i parkingu na osnovu podataka koje ste uneli, a sve ostalo zapisuje da Vaš tim reši između pacijenata.",
          points: [
            "Javlja se kada je linija zauzeta ili na svaki poziv",
            "Odgovara na pitanja o radnom vremenu, parkingu, formularima i prihvaćenim osiguranjima",
            "Čuva rezime, transkript i snimak svakog poziva",
          ],
        },
        {
          title: "Novi pacijenti zakazuju iz prvog poziva",
          body: "Novi pacijenti često zovu za vreme pauze ili posle posla. LobbyStack beleži njihovo osiguranje i razlog posete, nudi slobodne termine iz Google Calendar-a i zakazuje pregled. Pacijent dobija potvrdu SMS-om i, ako pristane, podsetnik dan pre posete.",
          points: [
            "Zakazuje u Google Calendar tokom poziva",
            "Šalje SMS podsetnik 24 sata pre posete ako pacijent pristane",
            "Pomera ili otkazuje termine nakon provere ko zove",
          ],
        },
        {
          title: "Hitni stomatološki slučajevi prate Vaša pravila",
          body: "Vi određujete šta je hitno: otok, temperatura, izbijen zub ili krvarenje koje ne prestaje. LobbyStack postavlja ta pitanja, tokom radnog vremena zakazuje termin istog dana, a posle radnog vremena preusmerava poziv dežurnom stomatologu.",
          points: [
            "Postavlja trijažna pitanja koja odobrite",
            "Hitne slučajeve van radnog vremena prosleđuje na dežurni broj",
            "Čita samo uputstva za negu koja Vi napišete",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI telefonska služba za stomatologe?",
          answer:
            "To je služba koja se javlja na telefon Vaše ordinacije, zakazuje termine, odgovara na pitanja o osiguranju i pravilima ordinacije i prosleđuje hitne slučajeve. Javlja se kada je recepcija zauzeta ili zatvorena, pa pacijenti dobiju odgovor umesto govorne pošte.",
        },
        {
          question: "Može li da zakaže termin za novog pacijenta?",
          answer:
            "Da. LobbyStack može da prikupi kontakt podatke novog pacijenta, podatke o osiguranju, razlog posete i željeno vreme, zatim da zakaže termin direktno u Vaš kalendar i pošalje potvrdu SMS-om.",
        },
        {
          question: "Da li radi posle radnog vremena i vikendom?",
          answer:
            "Da. LobbyStack se javlja noću, vikendom i tokom pauze za ručak. Može da zakaže termine, primi poruke ili prave hitne slučajeve preusmeri dežurnom stomatologu prema pravilima koja Vi postavite.",
        },
        {
          question: "Može li da odgovara na pitanja o osiguranju?",
          answer:
            "Da. U bazu znanja možete dodati osiguranja koja prihvatate, pravila pokrića i pitanja za proveru. LobbyStack odgovara na rutinska pitanja, a složene slučajeve označava za Vaš tim.",
        },
        {
          question: "Šta se dešava kada pacijent ima hitan stomatološki problem?",
          answer:
            "Vi određujete šta je hitno. LobbyStack može da pita o jačini bola, otoku, povredi ili krvarenju, zatim da preusmeri poziv na Vašu liniju za hitne slučajeve ili primi detaljnu poruku sa kontekstom.",
        },
        {
          question: "Može li da šalje podsetnike za termine?",
          answer:
            "Da. LobbyStack šalje SMS podsetnik 24 sata pre svakog termina koji zakaže, ako je pacijent pristao na SMS poruke. Ne vodi kampanje za pozivanje pacijenata kojima je vreme za uklanjanje kamenca.",
        },
        {
          question: "Da li su podaci pacijenata bezbedni?",
          answer:
            "Za svaki poziv LobbyStack čuva snimak, transkript, rezime, ime i broj pozivaoca i termin koji je zakazao. Čuva i SMS poruke sa pacijentima i dokumente koje otpremite u bazu znanja. Na LobbyStack Cloud-u ti podaci su na našim serverima, a snimci se brišu posle 90 dana. Twilio i OpenAI takođe obrađuju zvuk poziva dok poziv traje. Ako Vaša ordinacija podleže propisima HIPAA, LobbyStack možete hostovati sami da podaci ostanu na Vašim serverima. Proverite postavku sa osobom zaduženom za usklađenost pre nego što počnete da primate pozive pacijenata.",
        },
        {
          question: "Da li se povezuje sa mojim softverom za vođenje ordinacije?",
          answer:
            "Ne direktno. LobbyStack zakazuje u Google Calendar i ne povezuje se sa softverom za vođenje ordinacije kao što su Dentrix ili Open Dental, pa Vaš tim nove termine prepisuje u svoj sistem.",
        },
        {
          question: "Može li da pomeri ili otkaže termin?",
          answer:
            "Da. LobbyStack može da obavi jednostavna pomeranja i otkazivanja kada Vaša pravila to dozvoljavaju. Složene izmene, posebno zamene termina istog dana, može da prosledi recepciji sa podacima pacijenta.",
        },
        {
          question: "Koliko košta za stomatološku ordinaciju?",
          answer:
            "Besplatan paket uključuje 30 minuta razgovora za testiranje, bez broja telefona. Starter košta $30 mesečno za 150 minuta i poseban broj, a Pro $100 mesečno za 500 minuta. Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za stomatološke ordinacije",
      relatedLinks: [
        {
          label: "AI zakazivanje termina",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Samostalno hostovan AI recepcioner",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        pricingLink,
      ],
      ctaHeading: "Ne šaljite nove pacijente na govornu poštu",
      ctaBody:
        "Unesite prihvaćena osiguranja, radno vreme i pravila za hitne slučajeve, pa obavite probni poziv. Besplatan paket uključuje 30 minuta.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": serbianPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "AI telefonska služba za salone i spa centre | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za salone i spa centre. Javlja se na pozive za zakazivanje, zakazuje i pomera termine i odgovara na pitanja o uslugama.",
      eyebrow: "Saloni i spa centri",
      h1: "Telefonska služba za salone i spa centre koja zakazuje bez pauze",
      intro:
        "LobbyStack se javlja na pozive za frizerske salone, spa centre, berbernice i wellness studije, pa klijenti mogu da zakažu, pomere termin i dobiju odgovore bez čekanja na recepciju.",
      imageAlt: "LobbyStack zakazuje termin u salonu ili spa centru tokom poziva",
      proofPoints: [
        "Zakazuje termine dok su frizeri i terapeuti zauzeti",
        "Odgovara na pitanja o uslugama, cenama i slobodnim terminima",
        "Otkazuje i pomera termine nakon provere ko zove",
      ],
      sections: [
        {
          title: "Zakazujte i kada su Vam ruke zauzete",
          body: "Frizeri i maseri ne bi trebalo da prekidaju tretman, peru farbu sa ruku ili gube koncentraciju da bi se javili na poziv za zakazivanje. LobbyStack se javlja na prvo zvono i proverava tačnu dostupnost svakog frizera.",
          points: [
            "Sprečava dvostruka zakazivanja i preklapanje termina",
            "Potvrđuje željenog frizera, trajanje usluge i kontakt podatke klijenta",
            "Vaše osoblje ostaje posvećeno tretmanima i feniranju",
          ],
        },
        {
          title: "Ljubazno sprovodite pravila otkazivanja",
          body: "Nedolasci i otkazivanja u poslednjem trenutku direktno smanjuju zaradu salona. LobbyStack objašnjava Vaša pravila zakazivanja i u svakom pozivu isto postupa sa pomeranjima.",
          points: [
            "Objašnjava pravila otkazivanja i pomeranja tokom poziva",
            "Klijenti sami menjaju termine u okviru dozvoljenih rokova",
          ],
        },
        {
          title: "Dosledni i tačni odgovori o uslugama",
          body: "Bilo da klijent pita koliko traje jednobojno farbanje, koliko košta balayage ili da li je potreban test na alergiju, LobbyStack daje precizne odgovore iz Vaših smernica, bez nagađanja na recepciji.",
          points: [
            "Odgovara na složena pitanja o uslugama, paketima i frizerima",
            "Zahteve za specijalizovane usluge šalje pravom stručnjaku",
            "Komunikacija recepcije ostaje u skladu sa standardima Vašeg brenda",
          ],
        },
        {
          title: "Čuvajte vreme sa klijentom bez ignorisanja telefona",
          body: "Svaki telefon koji zvoni takmiči se sa klijentom koji već sedi u stolici. LobbyStack preuzima rutinsko zakazivanje i pitanja o uslugama, pa frizeri, kozmetičari, maseri i berberi ostaju posvećeni terminu.",
          points: [
            "Beleži vrstu usluge, željenog stručnjaka, vreme i kontakt podatke klijenta",
            "Potvrđuje termin pre nego što pozivalac spusti slušalicu",
            "Osetljiva pitanja o uslugama šalje pravom članu tima",
          ],
        },
        {
          title: "Dosledna pravila koja utiču na prihod",
          body: "Depozite, rokove za otkazivanje, pravila paketa i pomeranja istog dana lako je objasniti nedosledno kada je recepcija u gužvi. LobbyStack svaki put ponavlja isto odobreno pravilo.",
          points: [
            "Objašnjava pravila otkazivanja i nedolaska pre potvrde izmena",
            "Koristi Vaš meni usluga, trajanja, pravila za stručnjake i ograničenja zakazivanja",
            "Šalje rezimee da Vaš tim zna šta je obećano",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI telefonska služba za salone i spa centre?",
          answer:
            "To je služba koja se javlja na pozive za zakazivanje, zakazuje i pomera termine, odgovara na pitanja o uslugama i šalje potvrde. Radi kada je recepcija zauzeta ili zatvorena i kada klijenti zovu van radnog vremena.",
        },
        {
          question: "Može li da zakazuje dok su frizeri sa klijentima?",
          answer:
            "Da. Dok Vaš tim šiša, farba ili radi tretman, LobbyStack se javlja, proverava dostupnost, nudi slobodne termine i zakazuje. Klijent odmah dobija potvrdu SMS-om.",
        },
        {
          question: "Da li obrađuje otkazivanja i pomeranja?",
          answer:
            "Da. LobbyStack može da obradi jednostavna otkazivanja i pomeranja prema Vašim pravilima. Složene zahteve i izmene istog dana može da prosledi recepciji sa već priloženim podacima klijenta.",
        },
        {
          question: "Može li da odgovara na pitanja o uslugama i cenama?",
          answer:
            "Da. U bazu znanja dodajte meni usluga, cene, trajanje i detalje paketa. LobbyStack odgovara na rutinska pitanja o šišanju, farbanju, masažama, tretmanima lica i akcijama bez ometanja Vašeg tima.",
        },
        {
          question: "Da li radi sa mojim sistemom za onlajn zakazivanje?",
          answer:
            "LobbyStack zakazuje termine u Google Calendar. Ne povezuje se sa platformama za zakazivanje u salonima, pa mnogi saloni koriste LobbyStack za zakazivanje telefonom, a onlajn sistem zadržavaju za klijente koji sami zakazuju.",
        },
        {
          question: "Može li da šalje podsetnike za termine?",
          answer:
            "Da, na plaćenim paketima. LobbyStack posle zakazivanja šalje klijentu potvrdu SMS-om i, ako klijent pristane, jedan podsetnik 24 sata pre termina. Vreme slanja i tekst se ne mogu menjati.",
        },
        {
          question: "Šta je sa klijentima koji dođu bez zakazivanja?",
          answer:
            "LobbyStack može da objasni Vaša pravila za dolazak bez zakazivanja i proveri da li ima slobodnog termina istog dana.",
        },
        {
          question: "Može li da odgovara na pitanja o poklon-karticama i paketima?",
          answer:
            "Da. U LobbyStack možete dodati pravila za poklon-kartice, detalje paketa i uslove korišćenja. Odgovara na pitanja na osnovu tih podataka i prima poruku za Vaš tim kada klijent želi da kupi karticu ili paket.",
        },
        {
          question: "Da li radi i za medicinske spa centre i berbernice?",
          answer:
            "Da. LobbyStack radi za frizerske salone, studije za nokte, masažne salone, medicinske spa centre, berbernice i wellness centre. Usluge, pitanja i pravila zakazivanja prilagođavate svojoj firmi.",
        },
        {
          question: "Koliko košta za salon ili spa centar?",
          answer:
            "LobbyStack ima besplatan paket sa uključenim minutima razgovora i plaćene pakete za veći broj poziva. Većina malih salona počinje besplatno i prelazi na veći paket kako raste. Aktuelne cene i funkcije su na stranici sa cenama.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za salone i spa centre",
      relatedLinks: [
        {
          label: "AI zakazivanje termina",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "AI javljanje na pozive",
          href: "/solutions/ai-phone-answering/",
        },
        pricingLink,
      ],
      ctaHeading: "Zakazujte klijente dok su Vam ruke u njihovoj kosi",
      ctaBody:
        "LobbyStack se javlja na pozive za zakazivanje, pomera termine i odgovara na pitanja o uslugama, pa Vaši frizeri nikad ne moraju da prekinu tretman zbog telefona.",
      ...ctaLabels,
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": serbianPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title: "Samostalno hostovan AI recepcioner otvorenog koda | LobbyStack",
      description:
        "Pokrenite LobbyStack, AI recepcioner otvorenog koda, na svojim serverima uz Docker Compose. Snimci, transkripti i podaci klijenata ostaju u Vašoj PostgreSQL bazi.",
      eyebrow: "Samostalno hostovanje",
      h1: "Samostalno hostovan AI recepcioner koji radi na Vašim serverima",
      intro:
        "Pod MIT licencom i napravljen da radi uz Docker Compose. Snimci, transkripti i zapisi o klijentima ostaju u Vašoj bazi podataka, a pozivi idu preko Vaših Twilio i OpenAI naloga.",
      imageAlt: "LobbyStack kontrole za samostalno hostovanog AI recepcionera",
      proofPoints: [
        "MIT licenca bez naknade za licencu",
        "Postavlja se uz Docker Compose ili Railway šablon",
        "Pokreće isti kod kao LobbyStack Cloud",
      ],
      sections: [
        {
          title: "Izaberite gde se čuvaju podaci o pozivima",
          body: "Snimci, transkripti, kontakti i podešavanja ostaju u PostgreSQL bazi i skladištu kojima Vi upravljate. Vi postavljate pravila čuvanja, rezervnih kopija i brisanja. Twilio i OpenAI i dalje obrađuju zvuk poziva uživo preko Vaših naloga, pa proverite njihove uslove za svoj slučaj.",
          points: [
            "Posebne uloge u bazi i bezbednost na nivou redova za svaki servis",
            "Snimci na lokalnom volumenu ili u bilo kom S3 kompatibilnom bucket-u",
            "Rezervne kopije i vraćanje po Vašem rasporedu",
          ],
        },
        {
          title: "Prilagodite kod svom načinu rada",
          body: "Dobijate TypeScript monorepo na kome radi LobbyStack Cloud. Menjajte promptove, uvodna pitanja i pravila poziva ili povežite LobbyStack sa internim sistemima koje Vaš tim već koristi.",
          points: [
            "Sistemski promptovi su u workspace-u packages/agent-core",
            "Usmerite chat i embeddinge na bilo koji endpoint kompatibilan sa OpenAI-jem",
            "Zaključajte verziju i nadogradite je tek kada je testirate",
          ],
        },
        {
          title: "Znajte koliko ćete platiti pre postavljanja",
          body: "LobbyStack ne naplaćuje licencu za samostalno hostovanje. Plaćate hosting provajdera, Twilio za brojeve i minute poziva i OpenAI za Realtime potrošnju, svakog preko svog naloga. Pre poređenja sa Cloud paketom uračunajte sate koje će Vaš tim provesti na ažuriranjima, rezervnim kopijama i nadzoru.",
          points: [
            "Twilio i OpenAI Vam naplaćuju direktno",
            "LobbyStack ne naplaćuje po korisniku ni po minutu",
            "Cloud paketi počinju besplatno ako ne želite da održavate servere",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je samostalno hostovan AI recepcioner?",
          answer:
            "To je AI recepcioner koji radi na Vašim serverima ili cloud infrastrukturi umesto na tuđoj SaaS platformi. Vi kontrolišete podatke, model, okruženje i integracije. LobbyStack je otvorenog koda i podržava samostalno hostovanje za timove kojima treba puna kontrola.",
        },
        {
          question: "Da li je LobbyStack otvorenog koda?",
          answer:
            "Da. LobbyStack koristi MIT licencu. Izvorni kod možete pregledati, forkovati, menjati, distribuirati i postavljati u skladu sa tom licencom. Uz kopije ili značajne delove softvera zadržite obaveštenja o autorskim pravima i dozvoli.",
        },
        {
          question: "Šta je potrebno za samostalno hostovanje?",
          answer:
            "Vodič za Docker Compose traži Docker Engine 24 ili noviji sa Compose v2, Node.js 22 ili noviji za generisanje tajnih ključeva i server sa najmanje 2 vCPU, 4 GB RAM-a i trajnim diskom. Za pozive uživo potrebni su i domen sa HTTPS-om za kontrolnu tablu, kao i Twilio i OpenAI nalozi. Railway šablon umesto Vas postavlja servise i baze podataka.",
        },
        {
          question: "Mogu li da koristim svoj LLM ili API ključ?",
          answer:
            "Koristite sopstvene API ključeve. Glasovni pozivi rade na OpenAI GPT-Live preko Vašeg OpenAI naloga. Generisanje teksta i embeddingi za znanje prihvataju bilo koji endpoint kompatibilan sa OpenAI-jem, pa ih možete usmeriti na drugog provajdera ili model koji sami hostujete.",
        },
        {
          question:
            "Da li je samostalno hostovanje pogodno za agencije i preprodavce?",
          answer:
            "Da. MIT licenca dozvoljava agencijama da menjaju i distribuiraju LobbyStack za rad sa klijentima. Naziv LobbyStack, logotipi i brending podležu posebnim pravima na žig.",
        },
        {
          question: "Kako funkcionišu ažuriranja kod samostalnog hostovanja?",
          answer:
            "Preuzimate izmene iz GitHub repozitorijuma, pregledate changelog i napomene o migracijama i ponovo postavljate kroz svoj proces izdavanja. Zaključajte verziju koju ste testirali umesto da automatski postavljate svaku novu izmenu.",
        },
        {
          question: "Šta je sa privatnošću podataka i usklađenošću?",
          answer:
            "Samostalno hostovanje Vam daje kontrolu nad postavljanjem aplikacije i sačuvanim poslovnim podacima. Pozive i dalje mogu da obrađuju podešeni provajderi telefonije, AI-ja, hostinga i integracija, pa proverite kako svaki od njih postupa sa podacima i sprovedite sopstvenu procenu privatnosti i usklađenosti.",
        },
        {
          question: "Da li pružate podršku za samostalne instalacije?",
          answer:
            "Počnite od dokumentacije u repozitorijumu i javnog GitHub issue trackera. Za pitanja koja ne pripadaju javnom issue-u, kontaktirajte LobbyStack tim preko adrese za podršku navedene na sajtu.",
        },
        {
          question: "Mogu li da prilagodim glas, promptove i ponašanje?",
          answer:
            "Da. Samostalno hostovanje Vam daje pun pristup šablonima promptova, podešavanjima glasa, pozdravima i pravilima usmeravanja. Svaki deo iskustva pozivaoca možete prilagoditi.",
        },
        {
          question: "Kako funkcionišu cene za samostalno hostovanje?",
          answer:
            "Izvorni kod pod MIT licencom nema posebnu naknadu za licencu. Vi plaćate infrastrukturu i troškove provajdera za telefoniju, AI, skladištenje, nadzor i integracije koje Vaša instalacija koristi.",
        },
      ],
      faqHeading: "Pitanja o samostalno hostovanim AI recepcionerima",
      relatedLinks: [
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        { label: "API dokumentacija", href: "/docs/api/" },
        pricingLink,
      ],
      ctaHeading: "Postavite LobbyStack na svoje servere",
      ctaBody:
        "Vodič za samostalno hostovanje pokriva servise, naloge kod provajdera i rezervne kopije o kojima ćete brinuti. Vodič za Docker Compose prolazi kroz postavljanje na jednom serveru.",
      ctaPrimaryLabel: "Pročitajte vodič za hostovanje",
      ctaPrimaryHref: "https://docs.lobbystack.com/self-hosting/overview",
      ctaSecondaryLabel: "Pogledajte na GitHub-u",
      ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
    }
  ),

  "/solutions/ai-receptionist-for-plumbers/": serbianPage(
    "/solutions/ai-receptionist-for-plumbers/",
    {
      title: "AI telefonska služba za vodoinstalatere 24/7 | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za vodoinstalatere. Objašnjava pozivaocima kako da zatvore vodu, navodi Vaše cene i pukle cevi prosleđuje dežurnom majstoru.",
      eyebrow: "Vodoinstalateri",
      h1: "Telefonska služba za vodoinstalatere koja rešava i ponoćnu puklu cev",
      intro:
        "Pozivaocu kome voda curi kroz plafon trebaju dve stvari: neko da mu kaže gde je glavni ventil i vodoinstalater na putu. LobbyStack radi oboje već na prvo zvono, a zatim zakazuje odgušenja i radove na bojlerima u Vaš kalendar.",
      imageAlt:
        "Dijagram propuštenog vodoinstalaterskog poziva koji preko LobbyStack-a postaje zakazan termin",
      proofPoints: [
        "Pozivaocima sa aktivnim curenjem čita Vaša uputstva za zatvaranje vode i bezbednost",
        "Navodi cene koje postavite za odgušenje, izlazak i intervencije van radnog vremena",
        "Pukle cevi i izlivanje kanalizacije prosleđuje dežurnom vodoinstalateru",
      ],
      sections: [
        {
          title:
            "Dajte uspaničenom pozivaocu nešto da uradi dok pomoć stiže",
          body: "U LobbyStack unosite svoja uputstva: gde je glavni ventil, kada isključiti bojler i šta raditi ako se oseti miris gasa. Asistent čita te korake pozivaocu, beleži adresu i preusmerava poziv osobi koja je te noći dežurna.",
          points: [
            "Čita bezbednosne korake koje odobrite",
            "Preusmerava poziv sa već prikupljenom adresom i opisom problema",
          ],
        },
        {
          title:
            "Odgovorite na pitanje o ceni pre nego što pozivalac spusti slušalicu",
          body: "Mnogi pozivaoci žele da čuju cifru pre zakazivanja. Unesite svoje cene, na primer početnu cenu odgušenja ili fiksnu naknadu za izlazak van radnog vremena, i LobbyStack će ih navesti. Za zamenu instalacija, kanalizacione priključke i zamenu bojlera zakazuje izlazak na procenu umesto da nagađa.",
          points: [
            "Navodi tačne cene, početne cene ili raspone koje postavite",
            "Zakazuje izlazak na procenu za veće poslove",
          ],
        },
        {
          title: "Razlikujte izlivanje kanalizacije od slavine koja kaplje",
          body: "Vi određujete koji problemi su hitni: aktivno curenje, kanalizacija, potpuni nestanak vode. LobbyStack postavlja dodatna pitanja kao dispečer. Da li voda još curi? Da li je čista ili iz kanalizacije? Na kom spratu? Hitni pozivi zvone na dežurni telefon, a slavina dobija prvi slobodan termin u utorak.",
          points: [
            "Pita da li voda još curi i da li je čista ili iz kanalizacije",
            "Hitne pozive šalje na dežurni telefon",
            "Redovne popravke zakazuje u prvi slobodan termin",
          ],
        },
        {
          title: "Koliko košta pokrivenost van radnog vremena",
          body: "Uz 3 minuta po pozivu, 30 minuta razgovora iz paketa Free pokriva oko 10 poziva, dovoljno da testirate LobbyStack na liniji van radnog vremena. Starter pokriva oko 50 poziva za $30 mesečno. Preko toga Starter naplaćuje $0.20 po dodatnom minutu, pa još jedan poziv od 3 minuta košta $0.60.",
          points: [spamPoint, "Promenite paket kako se menja broj poziva"],
        },
      ],
      faqs: [
        {
          question: "Može li pozivaocu da objasni kako da zatvori vodu?",
          answer:
            "Da. Dodajte uputstva za zatvaranje vode u bazu znanja. Kada pozivalac prijavi aktivno curenje, LobbyStack pročita te korake, a zatim preusmeri poziv ili zakaže izlazak prema Vašim pravilima.",
        },
        {
          question: "Šta se dešava ako pozivalac oseti miris gasa?",
          answer:
            "Vi pišete pravilo. Uobičajeno je da se pozivaocu kaže da napusti objekat i pozove dežurnu službu distributera gasa. LobbyStack prati Vaš scenario i obaveštava Vaš tim.",
        },
        {
          question: "Može li da navede cenu odgušenja ili izlaska?",
          answer:
            "Da, ako mu date cifre. LobbyStack može da navede tačnu cenu, početnu cenu ili raspon. Vi birate za koje usluge navodi cenu, a za koje je potreban izlazak na procenu.",
        },
        {
          question: "Da li zakazuje zamenu bojlera?",
          answer:
            "Zakazuje procenu ili izlazak na teren. Vi odlučujete da li navodi početnu cenu za ugradnju ili pozivaoca upućuje Vašoj kancelariji.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Preusmerite postojeći broj na LobbyStack ili mu dajte posebnu liniju za pozive van radnog vremena i višak poziva.",
        },
        {
          question:
            "Po čemu se AI služba razlikuje od službe sa živim operaterima?",
          answer:
            "Kod klasične službe na liniji je operater koji obično čita scenario i prima poruku. LobbyStack se javlja uz pomoć AI-ja, pa prima više poziva istovremeno, zakazuje poslove u Vaš kalendar tokom poziva i navodi cene koje postavite. Svaki poziv i dalje možete preusmeriti nekome iz tima.",
        },
        {
          question: "Koliko košta za vodoinstalatersku firmu?",
          answer: paidPlansAnswer,
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za vodoinstalatere",
      relatedLinks: [
        {
          label: "Javljanje van radnog vremena za izvođače",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Kalkulator prihoda od propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Pokrijte večerašnje dežurstvo",
      ctaBody:
        "Počnite na paketu Free, unesite uputstva za zatvaranje vode i preusmerite liniju van radnog vremena kada budete spremni.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": serbianPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "AI telefonska služba za grejanje i klimatizaciju | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za servise grejanja i klimatizacije. Preuzima višak poziva u sezoni, označava hitne kvarove i zakazuje servise i procene.",
      eyebrow: "Grejanje i klimatizacija",
      h1: "Telefonska služba za grejanje i klimatizaciju spremna za sezonske gužve",
      intro:
        "Telefoni utihnu u aprilu, a zatim zvone bez prestanka prve vrele nedelje u junu. LobbyStack preuzima višak poziva, razdvaja prave hitne slučajeve od pitanja o termostatu i zakazuje procene za zamenu sistema koje Vaša kancelarija ne stiže da vrati.",
      imageAlt:
        "Hitan poziv za grejanje ili klimatizaciju označen za osobu i preusmeren tehničaru",
      proofPoints: [
        "Javlja se samo kada je Vaša kancelarija zauzeta, zatvorena ili na drugoj liniji",
        "Označava pozive zbog kvara grejanja ili klime prema pravilima koja napišete",
        "Hitne slučajeve preusmerava dežurnom tehničaru",
      ],
      sections: [
        {
          title: "Izdržite talas poziva u prvim vrućinama",
          body: "Mala kancelarija ne može da isprati kada se iste nedelje pokvare sve klime u gradu. Podesite LobbyStack da se javlja samo kada je Vaš tim zauzet. Prima onoliko istovremenih poziva koliko ih stigne, beleži vrstu sistema, simptome i adresu, a zatim zakazuje prvi slobodan termin ili dodaje pozivaoca na Vašu listu za izlazak.",
          points: [
            "Režim za višak poziva javlja se kada su linije pune",
            "Prima istovremene pozive bez signala zauzeća",
            "Zakazuje prvi slobodan termin ili stavlja pozivaoca na listu za izlazak",
          ],
        },
        {
          title: "Razdvojite prave hitne slučajeve od pitanja o termostatu",
          body: "Pokvaren kotao u januaru sa bebom u kući zahteva dežurnog tehničara. Termostat podešen na hlađenje zahteva samo brz odgovor. Pravila pišete običnim jezikom: koji simptomi, unutrašnje temperature ili ukućani čine poziv hitnim. LobbyStack takve pozivaoce preusmerava, a ostalima odgovara na osnovu koraka koje odobrite, kao što je provera osigurača ili filtera.",
          points: [
            "Eskalira prema simptomima, unutrašnjoj temperaturi i ukućanima",
            "Preusmerava hitne pozive sa priloženim podacima o sistemu",
            "Odgovara na česta pitanja o otklanjanju kvarova prema Vašem scenariju",
          ],
        },
        {
          title: "Ne dozvolite da upiti za zamenu sistema ohlade",
          body: "Vlasnik kuće koji traži cenu novog sistema sačekaće dan na povratni poziv. Posle dve nedelje sezone već je potpisao sa nekim drugim. LobbyStack beleži veličinu kuće, starost sistema i vrstu energenta i zakazuje izlazak na procenu tokom poziva.",
          points: [
            "Beleži veličinu kuće, starost sistema i vrstu energenta",
            "Zakazuje izlazak na procenu dok je pozivalac na vezi",
          ],
        },
        {
          title: "Koliko košta mesec u sezoni",
          body: "Recimo da Vaš prosečan poziv traje 3 minuta. Starter sa 150 minuta razgovora pokriva oko 50 poziva za $30 mesečno. Pro sa 500 minuta pokriva oko 165 poziva za $100, a svaki dodatni minut košta $0.18.",
          points: [freePlanPoint, spamPoint],
        },
      ],
      faqs: [
        {
          question: "Može li da se javlja samo kada je kancelarija preopterećena?",
          answer:
            "Da. LobbyStack možete podesiti da se javlja na svaki poziv ili samo kada je Vaš tim zauzet, zatvoren ili nedostupan. U sezoni možete koristiti režim za višak poziva, a van radnog vremena punu pokrivenost.",
        },
        {
          question:
            "Kako odlučuje koji poziv zbog kvara grejanja ili klime je hitan?",
          answer:
            "Pravilo opisujete običnim jezikom, na primer: nema grejanja i u kući je ispod 55°F (oko 13°C), ili u kući živi starija osoba ili beba. LobbyStack postavlja pitanja potrebna za Vaše pravilo i odgovarajuće pozive preusmerava dežurnom tehničaru.",
        },
        {
          question: "Koje podatke o sistemu može da prikupi?",
          answer:
            "Sve što traže Vaši tehničari: vrstu sistema, marku, približnu starost, vrstu energenta, očitavanje termostata i simptome koje pozivalac opisuje. Podaci se pojavljuju u rezimeu poziva i uz zakazani termin.",
        },
        {
          question: "Može li da navede cenu redovnog servisa ili dijagnostike?",
          answer:
            "Da, ako mu date cifre. LobbyStack može da navede tačnu cenu, početnu cenu ili raspon. Za zamenu celog sistema umesto toga zakazuje izlazak na procenu.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Preusmerite postojeći broj na LobbyStack ili na njega usmerite samo višak poziva i pozive van radnog vremena.",
        },
        {
          question: "Da li da izaberem AI ili službu sa živim operaterima?",
          answer:
            "Zavisi od toga koje pozive želite da preuzme čovek. LobbyStack je pravi izbor kada želite da se poslovi zakazuju u Vaš kalendar tokom poziva i da se višak poziva obradi bez signala zauzeća. Možete ga koristiti samo za višak poziva, a kancelariji ostaviti pozive na koje želite sami da odgovorite.",
        },
        {
          question: "Koliko košta za firmu za grejanje i klimatizaciju?",
          answer: paidPlansWithOverageAnswer,
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za grejanje i klimatizaciju",
      relatedLinks: [
        {
          label: "Javljanje van radnog vremena za izvođače",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Majstori i servisi za dom",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
        pricingLink,
      ],
      ctaHeading: "Spremite se za sledeći toplotni talas",
      ctaBody:
        "Postavite LobbyStack na liniju za višak poziva već sada i testirajte ga na pravim pozivima pre početka sezone.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": serbianPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "AI telefonska služba za električare | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za električare. Čita Vaša bezbednosna uputstva za varnice i miris paljevine i zakazuje procene za razvodne table, punjače i agregate.",
      eyebrow: "Električari",
      h1: "Telefonska služba za električare koja prepoznaje opasnost i zakazuje procene",
      intro:
        "Vaši pozivi su dve vrste. Jedan pozivalac ima utičnicu koja varniči i odmah mu trebaju bezbednosna uputstva. Sledeći želi novu razvodnu tablu, punjač za električno vozilo ili rezervni agregat i treba mu izlazak na procenu. LobbyStack obrađuje oba dok ste Vi na poslu.",
      imageAlt: "Dolazni poziv električaru preusmeren pravoj osobi u timu",
      proofPoints: [
        "Čita Vaš bezbednosni scenario za varnice, dim i miris paljevine",
        "Zakazuje procene za razvodne table, punjače za električna vozila i agregate",
        "Opasne situacije preusmerava dežurnom električaru",
      ],
      sections: [
        {
          title: "Bezbednosna uputstva na prvom mestu",
          body: "Kada neko prijavi dim ili miris paljevine, LobbyStack čita uputstva koja ste napisali: isključite osigurač ako je bezbedno prići, napustite kuću, pozovite hitne službe ako ima vatre. Zatim preusmerava poziv dežurnom električaru sa adresom i opisom onoga što je pozivalac video.",
          points: [
            "Koristi Vaše reči za opasne situacije",
            "Opasne situacije preusmerava dežurnom električaru",
            "Beleži svaki takav poziv na kontrolnoj tabli radi praćenja",
          ],
        },
        {
          title: "Proverite da li je kvar na mreži pre izlaska na teren",
          body: "Pozivalac bez struje možda ima izbačen glavni osigurač, a možda je jedan od 400 domova na pokidanom vodu. LobbyStack može da pita da li komšije imaju struju i da li je elektrodistribucija objavila nestanak. Problemi na mreži se upućuju elektrodistribuciji. Problemi u kući dobijaju termin.",
          points: [
            "Pita da li komšije imaju struju",
            "Zakazuje izlazak za kvarove u kućnoj instalaciji",
          ],
        },
        {
          title:
            "Pozive za punjače i razvodne table pretvorite u zakazane procene",
          body: "Nove razvodne table, punjači za električna vozila i rezervni agregati su Vaši veći poslovi, a pozivaoci upoređuju ponude. LobbyStack beleži jačinu priključka, starost kuće, punjač ili agregat koji žele i da li su vlasnici kuće. Zakazuje izlazak na procenu pre nego što pozivalac pozove sledećeg električara.",
          points: [
            "Beleži jačinu priključka, starost kuće i podatke o opremi",
            "Zakazuje izlazak na procenu tokom poziva",
          ],
        },
        {
          title: "Koliko košta mnogo poziva za procene",
          body: "Pozivi za procene traju duže zbog dodatnih pitanja. Uz 5 minuta po pozivu, Pro sa 500 minuta razgovora pokriva oko 100 poziva za $100 mesečno, a Starter sa 150 minuta oko 30 poziva za $30. Iskoristite 30 minuta iz paketa Free da testirate bezbednosni scenario pre nego što preusmerite prave pozive.",
          points: ["Pro naplaćuje $0.18 po dodatnom minutu", spamPoint],
        },
      ],
      faqs: [
        {
          question: "Šta kaže nekome ko prijavi varnice ili dim?",
          answer:
            "Čita bezbednosni scenario koji napišete, na primer da isključi osigurač ako je bezbedno prići, napusti kuću i pozove hitne službe ako ima vatre. Zatim preusmerava poziv dežurnom električaru.",
        },
        {
          question:
            "Može li da razlikuje nestanak struje na mreži od kvara u kući?",
          answer:
            "Postavlja pitanja koja biste i Vi postavili: da li komšije imaju struju, da li je elektrodistribucija objavila nestanak, da li je izbacio osigurač. Vi odlučujete koji odgovori vode do zakazivanja, a koji pozivaoca upućuju elektrodistribuciji.",
        },
        {
          question: "Šta pita o novim razvodnim tablama i punjačima?",
          answer:
            "Vi birate pitanja. Uobičajena su jačina priključka, starost kuće, punjač ili agregat koji pozivalac želi i da li je vlasnik kuće. LobbyStack odgovore prilaže uz zakazanu procenu.",
        },
        {
          question: "Može li drugačije da usmerava poslovne i stambene pozive?",
          answer:
            "Da. LobbyStack može da pita da li je objekat poslovni ili stambeni i poslovne pozive pošalje Vašem procenitelju ili na liniju kancelarije.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Preusmerite postojeći broj na LobbyStack ili koristite posebnu liniju za pozive van radnog vremena i višak poziva.",
        },
        {
          question: "Šta telefonska služba za električare treba da obradi?",
          answer:
            "Dve vrste poziva: opasne situacije kojima trebaju bezbednosna uputstva i brzo preusmeravanje, i zahteve za procenu kojima trebaju prava uvodna pitanja. LobbyStack obrađuje obe vrste prema pravilima koja napišete i zakazuje procene u Vaš kalendar tokom poziva.",
        },
        {
          question: "Koliko košta za elektroinstalatersku firmu?",
          answer: paidPlansAnswer,
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za električare",
      relatedLinks: [
        {
          label: "Majstori i servisi za dom",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
        {
          label: "Kalkulator prihoda od propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Zakažite više procena za razvodne table i punjače",
      ctaBody:
        "Napišite bezbednosni scenario, podesite pitanja za procene i preusmerite liniju kada budete spremni.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "AI recepcioner za popravku garažnih vrata | LobbyStack",
    description:
      "LobbyStack se javlja na pozive za garažna vrata, beleži podatke o opremi, zakazuje popravke i hitne slučajeve zaglavljenih vrata ili puknutih opruga prosleđuje tehničaru.",
    eyebrow: "Popravka garažnih vrata",
    h1: "AI recepcioner za popravku garažnih vrata koji prima svaki poziv",
    intro:
      "LobbyStack se javlja na pozive za garažna vrata dok menjate opruge, ugrađujete motore ili ne radite. Beleži detalje kvara, zakazuje termine i hitne slučajeve prosleđuje sa celim kontekstom.",
    imageAlt:
      "LobbyStack se javlja na poziv za popravku garažnih vrata i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive za garažna vrata 24/7",
      "Beleži vrstu vrata, marku motora i simptome kvara",
      "Zaglavljena vrata i puknute opruge prosleđuje dežurnom tehničaru",
    ],
    emergencyTitle: "Ne propustite nijedan hitan poziv zbog zaglavljenih vrata",
    emergencyBody:
      "Kada vlasnik kuće zove jer mu je automobil zarobljen u garaži ili su vrata noću ostala otvorena, pomoć mu treba odmah. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom tehničaru sa već prikupljenim podacima.",
    emergencyTransferPoint:
      "Preusmerava hitne pozive sa vrstom vrata i bezbednosnim detaljima",
    bookingTitle: "Zakazujte termine dok ste na poslu",
    bookingBody:
      "Ne možete da se javite na telefon dok radite na torzionoj opruzi ili ugrađujete motor. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac pozove nekog drugog.",
    bookingPoint: "Direktno zakazuje popravke i ugradnje",
    intakeTitle: "Prikupite podatke koji su timu potrebni pre izlaska",
    intakeBody:
      "Pozivi za garažna vrata zahtevaju kontekst: vrstu vrata, marku motora, vrstu opruge i opis kvara. LobbyStack postavlja pitanja koja izaberete, pa Vaš tim stiže sa pravim delovima.",
    faqs: [
      {
        question: "Šta je AI recepcioner za popravku garažnih vrata?",
        answer:
          "AI recepcioner za popravku garažnih vrata se javlja na dolazne pozive, beleži detalje kvara, zakazuje servisne termine i hitne pozive, kao što su zaglavljena vrata ili puknute opruge, prosleđuje dežurnom tehničaru.",
      },
      {
        question: "Može li da obradi hitne pozive van radnog vremena?",
        answer:
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi da je automobil zarobljen u garaži ili da su vrata noću ostala otvorena, preusmerava ga dežurnom tehničaru sa već prikupljenim podacima.",
      },
      {
        question: "Da li zakazuje termine dok sam na poslu?",
        answer:
          "Da. Dok menjate opruge ili ugrađujete motore, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta vrata, marka motora, simptomi kvara, dimenzije vrata, vrsta opruge i sve drugo što timu treba pre izlaska. Odgovori se prilažu uz rezime zakazivanja.",
      },
      existingNumberFaq,
      callReviewFaq("opisom kvara"),
      freePlanPricingFaq(
        "Koliko košta za servis garažnih vrata?",
        "servisa za garažna vrata"
      ),
    ],
    faqHeading: "Pitanja o AI recepcionerima za popravku garažnih vrata",
    ctaHeading: "Ne gubite više pozive za garažna vrata na govornoj pošti",
    ctaBody:
      "LobbyStack se javlja na hitne i redovne pozive za garažna vrata, zakazuje termine i zaglavljena vrata prosleđuje sa celim kontekstom.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "AI recepcioner za popravku kućnih aparata | LobbyStack",
    description:
      "LobbyStack se javlja na pozive za popravku aparata, beleži vrstu aparata, marku, model i simptome, a zatim zakazuje odgovarajući servisni izlazak.",
    eyebrow: "Popravka kućnih aparata",
    h1: "AI recepcioner za popravku kućnih aparata koji prima svaki poziv",
    intro:
      "LobbyStack se javlja na pozive dok dijagnostikujete mašinu za sudove ili menjate kompresor. Beleži marku i model, zakazuje termine i hitne slučajeve prosleđuje sa celim kontekstom.",
    imageAlt:
      "LobbyStack se javlja na poziv za popravku aparata i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive za kućne aparate 24/7",
      "Beleži vrstu aparata, marku, broj modela i simptome",
      "Kvarove frižidera i poplave od mašina prosleđuje dežurnom tehničaru",
    ],
    emergencyTitle: "Ne propustite nijedan hitan kvar aparata",
    emergencyBody:
      "Kada vlasnik kuće zove jer mu je frižider prestao da radi ili mu veš mašina pušta vodu, neće čekati govornu poštu. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom tehničaru sa već prikupljenim podacima.",
    emergencyTransferPoint:
      "Preusmerava hitne pozive sa markom i modelom aparata",
    bookingTitle: "Zakazujte termine dok radite na popravci",
    bookingBody:
      "Ne možete da se javite na telefon dok menjate kompresor ili dijagnostikujete upravljačku ploču. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac pozove nekog drugog.",
    bookingPoint: "Direktno zakazuje popravke i održavanje",
    intakeTitle: "Prikupite marku i model pre izlaska",
    intakeBody:
      "Pozivi za popravku aparata zahtevaju konkretne podatke: vrstu aparata, marku, broj modela, starost i opis kvara. LobbyStack postavlja pitanja koja izaberete, pa Vaš tim stiže sa pravim delovima.",
    faqs: [
      {
        question: "Šta je AI recepcioner za popravku kućnih aparata?",
        answer:
          "AI recepcioner za popravku aparata se javlja na dolazne pozive, beleži marku i model, zakazuje servisne termine i hitne pozive, kao što su kvarovi frižidera, prosleđuje dežurnom tehničaru.",
      },
      {
        question: "Može li da obradi hitne pozive van radnog vremena?",
        answer:
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi da je frižider prestao da radi ili da veš mašina pušta vodu, preusmerava ga dežurnom tehničaru sa već prikupljenim podacima.",
      },
      {
        question: "Da li zakazuje termine dok radim na popravci?",
        answer:
          "Da. Dok dijagnostikujete mašinu za sudove ili menjate kompresor, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta aparata, marka, broj modela, simptomi kvara, starost aparata i sve drugo što timu treba pre zakazivanja izlaska. Odgovori se prilažu uz rezime zakazivanja.",
      },
      existingNumberFaq,
      callReviewFaq("opisom aparata"),
      freePlanPricingFaq(
        "Koliko košta za servis kućnih aparata?",
        "servisa za kućne aparate"
      ),
    ],
    faqHeading: "Pitanja o AI recepcionerima za popravku kućnih aparata",
    ctaHeading: "Ne gubite više pozive za popravke na govornoj pošti",
    ctaBody:
      "LobbyStack se javlja na hitne i redovne pozive za kućne aparate, zakazuje termine i hitne kvarove prosleđuje sa celim kontekstom.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "AI recepcioner za sanaciju šteta od vode i požara | LobbyStack",
    description:
      "LobbyStack proverava pozive zbog šteta od vode, požara i buđi, zakazuje procene za sanaciju i hitne zahteve prosleđuje Vašem dežurnom timu.",
    eyebrow: "Sanacija šteta",
    h1: "AI recepcioner za firme za sanaciju koji prima svaki hitan poziv",
    intro:
      "LobbyStack se javlja na pozive dok je Vaša ekipa na terenu ili ne radi. Beleži detalje štete, zakazuje procene i hitne slučajeve prosleđuje sa celim kontekstom.",
    imageAlt: "LobbyStack se javlja na hitan poziv zbog štete i prosleđuje ga",
    proofPoints: [
      "Javlja se na hitne pozive zbog štete od vode i požara 24/7",
      "Beleži vrstu štete, pogođenu površinu, izvor vode i status osiguranja",
      "Hitne zahteve za sanaciju prosleđuje Vašem dežurnom timu",
    ],
    emergencyTitle: "Ne propustite nijedan hitan slučaj zbog vode ili požara",
    emergencyBody:
      "Kada vlasnik objekta zove u 3 ujutru zbog poplave ili štete od dima, sanacija mu treba odmah. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca Vašem dežurnom timu sa već prikupljenim podacima.",
    emergencyTransferPoint:
      "Preusmerava hitne pozive sa vrstom štete, površinom i izvorom",
    bookingTitle: "Zakazujte procene dok je ekipa na terenu",
    bookingBody:
      "Ne možete da se javite na telefon dok izvlačite vodu ili zatvarate otvore na objektu. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje procenu pre nego što pozivalac pozove nekog drugog.",
    bookingPoint: "Direktno zakazuje procene i konsultacije",
    intakeTitle: "Prikupite podatke koji su timu potrebni pre izlaska",
    intakeBody:
      "Pozivi za sanaciju zahtevaju kontekst: vrstu štete, veličinu pogođene površine, izvor vode, vremenski tok i status osiguranja. LobbyStack postavlja pitanja koja izaberete, pa Vaš tim stiže spreman i sa pravom opremom.",
    faqs: [
      {
        question: "Šta je AI recepcioner za firme za sanaciju šteta?",
        answer:
          "AI recepcioner za firme za sanaciju se javlja na dolazne pozive, beleži detalje i hitnost štete, zakazuje procene i hitne pozive, kao što su poplava ili požar, prosleđuje Vašem dežurnom timu.",
      },
      {
        question: "Može li da obradi hitne pozive van radnog vremena?",
        answer:
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi štetu od vode, dima ili buđ, preusmerava ga dežurnom timu sa već prikupljenim podacima. Redovni zahtevi za procenu idu na jutarnji pregled.",
      },
      {
        question: "Da li zakazuje procene dok je moj tim na terenu?",
        answer:
          "Da. Dok Vaša ekipa sanira štetu ili radi obnovu, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje procenu pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta štete, veličina pogođene površine, izvor vode, vremenski tok, status osiguranja i sve drugo što timu treba pre izlaska. Odgovori se prilažu uz rezime zakazivanja.",
      },
      existingNumberFaq,
      callReviewFaq("opisom štete"),
      freePlanPricingFaq(
        "Koliko košta za firmu za sanaciju?",
        "firmi za sanaciju"
      ),
    ],
    faqHeading: "Pitanja o AI recepcionerima za firme za sanaciju šteta",
    ctaHeading: "Ne gubite više hitne pozive za sanaciju na govornoj pošti",
    ctaBody:
      "LobbyStack se javlja na hitne i redovne pozive za sanaciju, zakazuje procene i hitne zahteve prosleđuje sa celim kontekstom.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "AI recepcioner za bravare | LobbyStack",
    description:
      "AI recepcioner za bravare koji se javlja na hitne pozive kada je neko zaključan napolju, zakazuje servisne termine i hitne pozive prosleđuje dežurnom bravaru.",
    eyebrow: "Bravari",
    h1: "AI recepcioner za bravare koji prima svaki hitan poziv",
    intro:
      "LobbyStack se javlja na pozive dok menjate uloške, ugrađujete okove ili ne radite. Beleži detalje, zakazuje termine i hitne slučajeve prosleđuje sa celim kontekstom.",
    imageAlt: "LobbyStack se javlja na poziv za bravara i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive 24/7",
      "Beleži vrstu problema, lokaciju i podatke o vozilu ili objektu",
      "Hitne pozive prosleđuje Vašem dežurnom bravaru",
    ],
    emergencyTitle: "Ne propustite nijedan poziv nekoga ko je zaključan napolju",
    emergencyBody:
      "Kada neko ne može da uđe u kuću ili automobil, pomoć mu treba odmah. Neće ostaviti poruku i čekati. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom bravaru sa već prikupljenom lokacijom i podacima.",
    emergencyTransferPoint:
      "Preusmerava hitne pozive sa lokacijom i vrstom problema",
    bookingTitle: "Zakazujte termine dok ste na poslu",
    bookingBody:
      "Ne možete da se javite na telefon dok menjate uloške ili ugrađujete okove. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac pozove nekog drugog.",
    bookingPoint: "Direktno zakazuje zamenu uložaka, ugradnje i servise",
    intakeTitle: "Prikupite podatke koji su timu potrebni pre izlaska",
    intakeBody:
      "Pozivi za bravare zahtevaju kontekst: vrstu problema, lokaciju, vrstu vozila ili objekta, stanje ključeva i hitnost. LobbyStack postavlja pitanja koja izaberete, pa Vaš tim stiže spreman.",
    faqs: [
      {
        question: "Šta je AI recepcioner za bravare?",
        answer:
          "AI recepcioner za bravare se javlja na dolazne pozive, beleži detalje i lokaciju, zakazuje servisne termine i hitne pozive ljudi zaključanih napolju prosleđuje dežurnom bravaru.",
      },
      {
        question: "Može li da obradi hitne pozive van radnog vremena?",
        answer:
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac ne može da uđe u kuću ili automobil, preusmerava ga dežurnom bravaru sa već prikupljenom lokacijom i podacima.",
      },
      {
        question: "Da li zakazuje termine dok sam na poslu?",
        answer:
          "Da. Dok menjate uloške ili ugrađujete okove, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta problema, lokacija, vrsta vozila ili objekta, stanje ključeva, hitnost i sve drugo što timu treba pre izlaska. Odgovori se prilažu uz rezime zakazivanja.",
      },
      existingNumberFaq,
      callReviewFaq("opisom problema"),
      freePlanPricingFaq(
        "Koliko košta za bravarsku radnju?",
        "bravarskih radnji"
      ),
    ],
    faqHeading: "Pitanja o AI recepcionerima za bravare",
    ctaHeading: "Ne gubite više hitne pozive na govornoj pošti",
    ctaBody:
      "LobbyStack se javlja na hitne i redovne pozive za bravare, zakazuje termine i hitne slučajeve prosleđuje sa celim kontekstom.",
  }),

  "/solutions/after-hours-answering-service-for-contractors/": serbianPage(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Služba za pozive van radnog vremena za izvođače | LobbyStack",
      description:
        "LobbyStack je telefonska služba za izvođače radova van radnog vremena. Prepoznaje hitne slučajeve, zakazuje izlaske za sledeći dan i hitne poslove prosleđuje dežurnima.",
      eyebrow: "Izvođači van radnog vremena",
      h1: "Telefonska služba za hitne poslove izvođača van radnog vremena",
      intro:
        "LobbyStack se javlja na pozive noću, vikendom i praznicima. Prepoznaje hitne slučajeve, zakazuje termine za sledeći dan i hitne zahteve prosleđuje Vašem dežurnom osoblju sa celim kontekstom.",
      imageAlt:
        "LobbyStack obrađuje pozive izvođačima van radnog vremena i prosleđuje hitne slučajeve",
      proofPoints: [
        "Javlja se van radnog vremena i prepoznaje hitne slučajeve",
        "Zakazuje termine za sledeći dan direktno u Vaš kalendar",
        "Hitne pozive prosleđuje dežurnom osoblju sa kontekstom",
      ],
      sections: [
        {
          title: "Ne gubite hitne poslove na govornoj pošti",
          body: "Kada vlasnik kuće zove u 10 uveče sa hitnim problemom, neće ostaviti poruku. Pozvaće sledećeg izvođača sa spiska. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnoj osobi sa već prikupljenim podacima.",
          points: [
            "Razlikuje hitne pozive od redovnih zahteva za ponudu",
            "Preusmerava hitne pozive sa opisom problema, lokacijom i kontakt podacima",
            "Redovne zahteve šalje na jutarnji pregled",
          ],
        },
        {
          title: "Automatski zakazujte termine za sledeći dan",
          body: "Pozivaoci van radnog vremena često žele da zakažu izlazak za sledeći radni dan. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje. Vaš tim počinje dan sa poslovima koji su već u kalendaru.",
          points: [
            "Proverava slobodne termine za sledeći dan u realnom vremenu",
            "Zakazuje termine direktno u Vaš kalendar",
            "Šalje potvrdu i sledeće korake pozivaocu i Vašem timu",
          ],
        },
        {
          title: "Filtrirajte spam, neka Vas budi samo pravi poziv",
          body: "Nije svaki poziv van radnog vremena vredan prekidanja Vaše večeri. LobbyStack odbacuje automatske pozive, telemarketing i spam. Do dežurnog osoblja stižu samo pravi hitni slučajevi.",
          points: [
            "Automatski filtrira pozivaoce koji nisu ljudi",
            "Šalje pregledne rezimee za jutarnji pregled",
            "Čuva Vaše slobodno vreme, a telefon ostaje pokriven",
          ],
        },
        {
          title: "Pratite svoj stvarni proces dežurstva",
          body: "Svaki izvođač drugačije definiše hitno. LobbyStack postavlja kvalifikaciona pitanja koja izaberete: aktivno curenje vode, bezbednosni rizik, kvar grejanja, rizik po konstrukciju. Pravu osobu prekida samo kada poziv odgovara Vašim pravilima.",
          points: [
            "Koristi Vaša pravila eskalacije u svakom pozivu",
            "Beleži simptome, lokaciju i vreme pre preusmeravanja",
            "Redovne pozive ostavlja u jutarnjem redu",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je telefonska služba za izvođače van radnog vremena?",
          answer:
            "To je služba koja se javlja na pozive kada Vaš tim ne radi, vozi se ili je zauzet na drugom poslu. Beleži podatke pozivaoca, prepoznaje hitne slučajeve, zakazuje termine i hitne zahteve prosleđuje dežurnom osoblju.",
        },
        {
          question: "Kako odlučuje koji pozivi su hitni?",
          answer:
            "Vi određujete pravila. LobbyStack postavlja kvalifikaciona pitanja koja izaberete, na primer da li voda aktivno curi, da li postoji bezbednosni rizik ili kvar grejanja zimi. Pozivi koji odgovaraju Vašim kriterijumima preusmeravaju se dežurnoj osobi. Sve ostalo ide na jutarnji pregled.",
        },
        {
          question: "Može li da zakazuje termine za sledeći radni dan?",
          answer:
            "Da. LobbyStack proverava slobodne termine u Vašem kalendaru i direktno zakazuje standardne termine. Kada se Vaš tim prijavi sledećeg jutra, novi termini su već u rasporedu.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Preusmerite pozive sa broja koji Vaši klijenti već znaju ili koristite poseban LobbyStack broj samo za pozive van radnog vremena.",
        },
        {
          question: "Šta se dešava kada pozivalac van radnog vremena traži ponudu?",
          answer:
            "LobbyStack beleži obim posla, lokaciju i kontakt podatke. Može da zakaže izlazak na procenu ili da zahtev ujutru prosledi Vašem prodajnom timu. Ne nagađa cene.",
        },
        callReviewFaq("opisom problema"),
        freePlanPricingFaq(
          "Koliko košta za firmu izvođača radova?",
          "izvođača radova"
        ),
      ],
      faqHeading: "Pitanja o javljanju na pozive van radnog vremena za izvođače",
      relatedLinks: [
        {
          label: "Javljanje van radnog vremena",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Vodoinstalateri",
          href: "/solutions/ai-receptionist-for-plumbers/",
        },
        {
          label: "Grejanje i klimatizacija",
          href: "/solutions/ai-receptionist-for-hvac/",
        },
        pricingLink,
      ],
      ctaHeading: "Ne gubite više pozive van radnog vremena na govornoj pošti",
      ctaBody:
        "LobbyStack se javlja na pozive van radnog vremena, prepoznaje hitne slučajeve, zakazuje termine za sledeći dan i hitne poslove prosleđuje dežurnom osoblju sa celim kontekstom.",
      ...ctaLabels,
    }
  ),

  "/solutions/property-management-answering-service/": serbianPage(
    "/solutions/property-management-answering-service/",
    {
      title: "AI telefonska služba za upravljanje nekretninama | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za upravnike nekretnina. Razvrstava hitne kvarove van radnog vremena, odgovara na pitanja o zakupu i zakazuje razgledanja.",
      eyebrow: "Upravljanje nekretninama",
      h1: "Telefonska služba za upravnike nekretnina i hitne kvarove van radnog vremena",
      intro:
        "Stanari zovu u 2 ujutru zbog curenja, zaključanih vrata ili nestanka grejanja. Zainteresovani zakupci zovu u podne i pitaju za ljubimce i parking. LobbyStack se javlja svima, prave hitne slučajeve šalje dežurnom tehničaru za održavanje i zakazuje razgledanja za Vaš tim za izdavanje.",
      imageAlt:
        "LobbyStack izvori znanja, uključujući česta pitanja, pravila i radno vreme, spremni za pozive stanara",
      proofPoints: [
        "Razdvaja hitne kvarove od zahteva koji mogu da sačekaju jutro",
        "Odgovara na pitanja o zakupu na osnovu pravila koja unesete",
        "Curenja, poplave i miris gasa prosleđuje dežurnom tehničaru",
      ],
      sections: [
        {
          title:
            "Razvrstajte pozive za održavanje po svojoj listi hitnih slučajeva",
          body: "Verovatno već imate zapisanu listu: poplava, nema grejanja zimi, miris gasa, zaključana vrata, zapušena kanalizacija. Unesite je u LobbyStack. On pita stanara za broj stana i šta vidi, hitne slučajeve preusmerava dežurnom tehničaru, a slavinu koja kaplje beleži za jutro.",
          points: [
            "Beleži broj stana, broj za povratni poziv i opis problema",
            "Hitne slučajeve preusmerava dežurnom tehničaru za održavanje",
            "Redovne zahteve beleži u jutarnji red",
          ],
        },
        {
          title: "Odgovarajte na pitanja o zakupu i zakazujte razgledanja",
          body: "Zainteresovani pitaju za kiriju, depozit, pravila za ljubimce, parking i slobodne stanove. Dodajte te podatke u bazu znanja i LobbyStack će odgovarati na osnovu njih. Kada neko želi da vidi stan, zakazuje razgledanje u kalendar Vašeg agenta i šalje potvrdu SMS-om.",
          points: [
            "Odgovara na osnovu podataka o nekretninama koje unesete",
            "Zakazuje razgledanja i šalje potvrde SMS-om",
          ],
        },
        {
          title: "Rutinska pitanja ne stižu na dežurni telefon",
          body: "Stanar koji u 11 uveče pita kada se plaća kirija ne treba da probudi Vašeg tehničara. LobbyStack odgovara na pitanja o kiriji, radnom vremenu kancelarije i portalu na osnovu Vaših pravila i čuva rezime poziva, pa dežurni telefon zvoni samo za hitne slučajeve sa Vaše liste.",
          points: [
            "Odgovara na pitanja o kiriji, radnom vremenu kancelarije i portalu",
            "Čuva rezime i transkript svakog poziva na kontrolnoj tabli",
          ],
        },
        {
          title: "Koliko košta pokrivenost van radnog vremena",
          body: "Recimo da Vaše nekretnine imaju 60 poziva van radnog vremena mesečno, po 3 minuta. To je 180 minuta. Starter uključuje 150 minuta za $30 mesečno, a preostalih 30 minuta košta po $0.20, pa plaćate oko $36. Pro uključuje 500 minuta za $100 ako Vam portfolio poraste.",
          points: [spamPoint, freePlanPoint],
        },
      ],
      faqs: [
        {
          question: "Može li da razlikuje hitan kvar od redovnog zahteva?",
          answer:
            "Da. Listu hitnih slučajeva zadajete običnim jezikom, na primer poplava, nema grejanja ispod zadate temperature, miris gasa ili zaključana vrata. LobbyStack postavlja dodatna pitanja, odgovarajuće pozive preusmerava dežurnom tehničaru, a ostatak šalje u jutarnji red.",
        },
        {
          question: "Može li da odgovara na pitanja o mojim nekretninama?",
          answer:
            "Da. U bazu znanja dodajte podatke kao što su kirija, depozit, pravila za ljubimce, parking i slobodni stanovi. LobbyStack odgovara na osnovu njih, a ono na šta ne može da odgovori označava za Vašu kancelariju.",
        },
        {
          question: "Može li da zakazuje razgledanja?",
          answer:
            "Da. LobbyStack proverava kalendar Vašeg agenta za izdavanje, nudi slobodne termine, zakazuje razgledanje i šalje potvrdu SMS-om.",
        },
        {
          question: "Da li radi sa postojećim brojem kancelarije?",
          answer:
            "Da. Preusmerite liniju kancelarije na LobbyStack van radnog vremena ili tokom celog dana, a stanari nastavljaju da zovu broj koji znaju.",
        },
        {
          question:
            "Koliko košta telefonska služba za upravljanje nekretninama?",
          answer: paidPlansAnswer,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za upravljanje nekretninama",
      relatedLinks: [
        {
          label: "Javljanje van radnog vremena",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "AI zakazivanje termina",
          href: "/solutions/ai-appointment-scheduler/",
        },
        pricingLink,
      ],
      ctaHeading: "Odgovarajte stanarima i van radnog vremena",
      ctaBody:
        "Unesite listu hitnih slučajeva, preusmerite liniju van radnog vremena i testirajte LobbyStack na paketu Free.",
      ...ctaLabels,
    }
  ),

  "/solutions/roofing-answering-service/": serbianPage(
    "/solutions/roofing-answering-service/",
    {
      title: "AI telefonska služba za krovopokrivače | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za krovopokrivače. Prima talas poziva posle oluje, aktivna curenja šalje dežurnoj ekipi i zakazuje preglede i procene.",
      eyebrow: "Krovopokrivači",
      h1: "Telefonska služba za krovopokrivače koja izdrži talas poziva posle oluje",
      intro:
        "Posle grada vlasnici kuća zovu ceo dan jer žele pregled krova pre dolaska procenitelja osiguranja. LobbyStack se javlja na sve te pozive istovremeno, zakazuje preglede u Vaš kalendar i aktivna curenja šalje Vašoj ekipi.",
      imageAlt:
        "Usmeravanje poziva koje prvo zvoni Vašem timu, a poziv predaje LobbyStack-u kada niko nije slobodan",
      proofPoints: [
        "Prima istovremene pozive posle oluje bez signala zauzeća",
        "Zakazuje preglede i procene u Vaš kalendar",
        "Aktivna curenja prosleđuje dežurnoj ekipi",
      ],
      sections: [
        {
          title: "Izdržite nedelju posle oluje",
          body: "Grad i vetar mogu za dva dana doneti pozive za ceo mesec. LobbyStack prima onoliko istovremenih poziva koliko ih stigne, beleži adresu, starost krova i štetu koju vlasnik vidi i zakazuje prvi slobodan termin za pregled. Vaša kancelarija počinje dan sa spiskom zakazanih pregleda.",
          points: [
            "Javlja se na istovremene pozive",
            "Beleži adresu, starost krova i vidljivu štetu",
            "Zakazuje preglede u slobodne termine",
          ],
        },
        {
          title: "Aktivna curenja šaljite ekipi",
          body: "Voda koja curi kroz plafon zahteva ceradu još večeras. Vi određujete šta je hitno, a LobbyStack te pozive preusmerava dežurnoj ekipi sa adresom i opisom vlasnika. Nekoliko otpalih šindri bez curenja dobija termin za pregled.",
          points: [
            "Preusmerava aktivna curenja sa adresom i opisom",
            "Zakazuje pregled za štete koje nisu hitne",
          ],
        },
        {
          title: "Odgovarajte na pitanja o osiguranju po svom scenariju",
          body: "Vlasnici pitaju da li radite sa njihovim osiguranjem, da li ćete se sastati sa proceniteljem i koliko košta pregled. Odgovore napišite jednom. LobbyStack ih daje tokom poziva, a sve van scenarija označava da Vaša kancelarija uzvrati poziv.",
          points: [
            "Odgovara na pitanja o osiguranju i pregledima koja odobrite",
            "Neobična pitanja označava za povratni poziv",
          ],
        },
        {
          title: "Koliko košta sezona oluja",
          body: "Recimo da poziv sa uvodnim pitanjima traje 4 minuta. Posle velike oluje, 200 poziva mesečno daje 800 minuta. Pro uključuje 500 minuta za $100, a preostalih 300 košta po $0.18, pa taj mesec iznosi $154. Miran mesec ostaje $100.",
          points: [spamPoint, freePlanPoint],
        },
      ],
      faqs: [
        {
          question: "Može li da izdrži talas poziva posle oluje?",
          answer:
            "Da. LobbyStack se javlja na istovremene pozive, pa vlasnici kuća ne dobijaju signal zauzeća ni govornu poštu. Zakazuje preglede u Vaše slobodne termine, a ostalo stavlja u red za Vašu kancelariju.",
        },
        {
          question: "Šta radi kada krov aktivno curi?",
          answer:
            "Prati Vaša pravila. Uobičajeno podešavanje preusmerava aktivna curenja dežurnoj ekipi sa adresom i opisom, a sve ostalo zakazuje za pregled.",
        },
        {
          question: "Može li da odgovara na pitanja o odšteti iz osiguranja?",
          answer:
            "Da, na osnovu odgovora koje napišete, na primer da li se sastajete sa proceniteljima i sa kojim osiguravajućim kućama radite. LobbyStack sve van scenarija označava za povratni poziv.",
        },
        {
          question: "Da li navodi cene popravke ili zamene krova?",
          answer:
            "Zakazuje pregled ili izlazak na procenu. Vi odlučujete da li navodi cenu pregleda ili početnu cenu za uobičajene popravke.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Preusmerite postojeći broj na LobbyStack ili mu šaljite samo višak poziva i pozive van radnog vremena.",
        },
        {
          question: "Koliko košta telefonska služba za krovopokrivače?",
          answer: paidPlansWithOverageAnswer,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za krovopokrivače",
      relatedLinks: [
        {
          label: "Telefonska služba za izvođače",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Kalkulator prihoda od propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Budite spremni za sledeću oluju",
      ctaBody:
        "Podesite LobbyStack pre sezone oluja da preuzme višak poziva kada se linije popune.",
      ...ctaLabels,
    }
  ),

  "/solutions/open-source-ai-receptionist/": serbianPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "AI recepcioner otvorenog koda | LobbyStack",
      description:
        "LobbyStack je AI recepcioner otvorenog koda koji možete proveriti, prilagoditi i sami hostovati. Pregledajte obradu poziva, menjajte promptove i pokrenite ga kod sebe.",
      eyebrow: "Otvoren kod",
      h1: "AI recepcioner otvorenog koda koji možete proveriti, prilagoditi i sami hostovati",
      intro:
        "LobbyStack je otvorenog koda da bi Vaš tim mogao da vidi kako se pozivi obrađuju, menja promptove i usmeravanje i postavi sistem na infrastrukturu koju kontroliše. Bez skrivene logike poziva. Bez zavisnosti od jednog dobavljača.",
      imageAlt:
        "Kod i kontrole postavljanja LobbyStack AI recepcionera otvorenog koda",
      proofPoints: [
        "Izvorni kod javno dostupan za proveru i izmene",
        "Prilagodite promptove, pravila za uvodna pitanja i eskalaciju",
        "Hostujte na svojim serverima ili koristite upravljani cloud",
      ],
      sections: [
        {
          title: "Sami proverite logiku obrade poziva",
          body: "Platforme za AI recepcionere zatvorenog koda drže odluke o usmeravanju, strukturu promptova i tokove podataka privatnim. Ne možete da proverite kako se pozivi obrađuju ni koji podaci se čuvaju. LobbyStack objavljuje izvorni kod, pa svaku tačku odlučivanja možete pregledati pre nego što mu poverite svoje pozivaoce.",
          points: [
            "Pregledajte kako rade uvodna pitanja, usmeravanje i eskalacija",
            "Proverite obradu i čuvanje podataka i kontrole privatnosti",
            "Saznajte tačno šta se dešava u svakoj vrsti poziva",
          ],
        },
        {
          title: "Menjajte promptove i pravila bez čekanja na dobavljača",
          body: "Kada se Vaš način obrade poziva promeni, ne bi trebalo da otvarate tiket za podršku i čekate. Pošto je kod otvoren, pozdrave, uvodna pitanja, logiku zakazivanja i puteve eskalacije možete menjati sami.",
          points: [
            "Menjajte promptove i tokove poziva kada Vama odgovara",
            "Forkujte kod za agencijske ili višekorisničke instalacije",
          ],
        },
        {
          title: "Postavite ga na infrastrukturu koju kontrolišete",
          body: "Samostalno hostovanje stavlja skladište aplikacije, pristup, logove i čuvanje podataka pod Vašu kontrolu. Podešeni provajderi telefonije i AI-ja i dalje mogu da obrađuju podatke o pozivima prema svojim uslovima.",
          points: [
            "Pokrenite ga u kontejnerima na željenom cloud-u ili u privatnom okruženju",
            "Podesite provajdere telefonije i AI-ja koje repozitorijum podržava",
            "Vi određujete vreme ažuriranja, pravila pristupa, logove i rokove čuvanja",
          ],
        },
        {
          title: "Upravljani cloud ili samostalno hostovanje, po Vašem izboru",
          body: "Otvoren kod ne znači da infrastrukturu morate sami da održavate. LobbyStack nudi upravljani cloud sa uključenim minutima razgovora i podrškom. Kada Vam zatreba više kontrole, isti otvoreni kod je spreman za samostalno hostovanje.",
          points: [
            "Počnite na upravljanom cloud-u i pređite na samostalno hostovanje kada se zahtevi promene",
            "Prelazite između cloud-a i samostalnog hostovanja bez gubitka podešavanja",
            "Koristite oboje: cloud za standardne linije, samostalno hostovanje za regulisane procese",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI recepcioner otvorenog koda?",
          answer:
            "To je platforma za javljanje na pozive čiji je izvorni kod javno dostupan za pregled, izmene i samostalno hostovanje. LobbyStack je otvorenog koda da bi timovi mogli da provere logiku obrade poziva, prilagode promptove i pokrenu sistem na svojoj infrastrukturi.",
        },
        {
          question: "Zašto je otvoren kod važan za AI recepcionera?",
          answer:
            "Otvoren kod Vam pokazuje kako se pozivi obrađuju, koji podaci se čuvaju i kako AI odlučuje o usmeravanju. Za regulisane delatnosti, agencije i timove sa zahtevima za kontrolu podataka, ta vidljivost je preduslov, a ne dodatak.",
        },
        {
          question: "Mogu li sam da hostujem LobbyStack?",
          answer:
            "Da. LobbyStack može da radi na Vašim serverima ili cloud infrastrukturi. Vi kontrolišete podatke o pozivima, snimke, transkripte i izbor modela. Detalje o postavljanju potražite na stranici o samostalno hostovanom AI recepcioneru.",
        },
        {
          question: "Mogu li da menjam AI promptove i tokove poziva?",
          answer:
            "Da. Pošto je kod otvoren, možete menjati pozdrave, uvodna pitanja, pravila eskalacije i logiku zakazivanja bez čekanja na plan razvoja dobavljača.",
        },
        {
          question: "Da li otvoren kod znači manje podrške?",
          answer:
            "Ne obavezno. LobbyStack nudi upravljane cloud pakete sa podrškom, a korisnici koji sami hostuju imaju dokumentaciju, resurse zajednice i profesionalnu pomoć pri postavljanju. Otvoren kod znači više kontrole, a ne manje pomoći.",
        },
        {
          question:
            "Da li su moji podaci o pozivima bezbedni u projektu otvorenog koda?",
          answer:
            "Kada sami hostujete, podaci o pozivima ostaju na Vašoj infrastrukturi. Kada koristite upravljani cloud, LobbyStack prati standardne prakse rukovanja podacima. Otvoren kod znači da obradu podataka možete sami proveriti umesto da verujete crnoj kutiji.",
        },
        {
          question: "Po čemu se razlikuje od AI recepcionera zatvorenog koda?",
          answer:
            "Platforme zatvorenog koda drže logiku obrade poziva, strukturu promptova i tokove podataka privatnim. Ne možete da proverite kako se odluke donose niti da prilagodite sistem van onoga što dobavljač dozvoljava. LobbyStack Vam omogućava da pregledate, forkujete i menjate ceo sistem.",
        },
        {
          question: "Gde mogu da nađem izvorni kod?",
          answer:
            "Izvorni kod LobbyStack-a je na GitHub-u, na adresi github.com/lobbystack/lobbystack. Možete ga pregledati, prijavljivati probleme i doprinositi izmenama.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima otvorenog koda",
      relatedLinks: [
        {
          label: "Samostalno hostovanje",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        { label: "API dokumentacija", href: "/docs/api/" },
        pricingLink,
      ],
      ctaHeading: "Proverite, prilagodite i postavite AI recepcionera",
      ctaBody:
        "LobbyStack je otvorenog koda, pa možete proveriti logiku poziva, menjati proces i postaviti ga na svoju infrastrukturu. Bez crne kutije. Bez zavisnosti od jednog dobavljača.",
      ctaPrimaryLabel: "Pogledajte na GitHub-u",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Pročitajte dokumentaciju",
      ctaSecondaryHref: "/docs/api/",
    }
  ),
}

export const serbianSeoPages: Record<string, SeoLandingPage> = {
  ...restoredSerbianSeoPages,
  ...bespokeSolutionPagesSr,
}
