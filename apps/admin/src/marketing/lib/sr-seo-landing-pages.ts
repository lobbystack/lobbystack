import type { FaqItem } from "@/marketing/lib/seo"
import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/marketing/lib/seo-landing-pages"

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
const whiteLabelLink = { label: "Bela etiketa", href: "/white-label/" }

const existingNumberFaq: FaqItem = {
  question: "Da li radi sa mojim postojećim poslovnim brojem?",
  answer:
    "Da. Preusmerite pozive sa broja koji Vaši klijenti već znaju ili koristite poseban LobbyStack broj za višak poziva i pozive van radnog vremena.",
}

const callReviewFaq = (details: string): FaqItem => ({
  question: "Da li ću videti o čemu se razgovaralo u svakom pozivu?",
  answer: `Da. LobbyStack na kontrolnoj tabli čuva rezime, transkript i snimak svakog poziva, zajedno sa ${details}. Kada primi poruku, Vaš tim dobija obaveštenje e-poštom, ili SMS-om ako ga uključite.`,
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

// The plans answer the trade pages share: prices, no setup fee, and what doesn't count.
const tradePlansAnswer =
  "Paket Free uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta, uz dodatne minute po $0.20 i $0.18. Nijedan paket nema naknadu za aktivaciju. Pozivi kraći od 10 sekundi i pozivi koje recepcioner prekine kao neželjene ne računaju se u Vaše minute."

const tradePage = ({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  imageAlt,
  proofPoints,
  sections,
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
  sections: SeoLandingPage["sections"]
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
    sections,
    faqs,
    faqHeading,
    relatedLinks: tradeRelatedLinks,
    ctaHeading,
    ctaBody,
    ...ctaLabels,
  })

const bespokeSolutionPagesSr: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title: "AI služba za odgovaranje na pozive za male firme | LobbyStack",
    description:
      "LobbyStack, AI služba za odgovaranje na pozive, javlja se umesto Vas, zakazuje termine u Google Calendar i preusmerava hitne pozive. Isprobajte besplatno.",
    eyebrow: "AI odgovaranje na pozive",
    h1: "AI služba za odgovaranje na pozive na koje Vi ne stižete da se javite",
    intro:
      "Kada ste na poslu ili sa klijentom, pozivalac kome se niko ne javi zove sledeću firmu sa svog spiska. LobbyStack se javlja na Vaš broj, zakazuje posetu u Google Calendar i zvoni na Vaš telefon kada je poziv hitan.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "AI služba za odgovaranje na pozive LobbyStack se javlja na poziv dok je tim zauzet",
    proofPoints: [
      "Radi na poslovnom broju koji već imate",
      "Zakazuje u Google Calendar tokom poziva",
      "Hitne pozive preusmerava na broj koji podesite",
      "Neželjeni pozivi i pozivi kraći od 10 sekundi ne troše minute",
    ],
    sections: [
      {
        title: "Naša AI služba za odgovaranje na pozive koristi Vaše podatke i zakazuje posetu",
        body: "Pozivaoci razgovaraju kao što bi razgovarali sa Vašom recepcijom. LobbyStack odgovara na pitanja na osnovu usluga, cena, radnog vremena i pravila koje dodate i zakazuje posetu pre nego što pozivalac spusti slušalicu.",
        points: [
          "Odgovara na osnovu teksta, PDF dokumenata ili stranica sa Vašeg sajta",
          "Nudi slobodne termine iz Vašeg Google Calendar-a i, ako pozivalac pristane, šalje potvrdu i podsetnik SMS-om",
        ],
      },
      {
        title: "Hitni pozivi stižu do osobe",
        body: "Običnim rečima napišite šta je hitno, na primer voda koja curi kroz plafon ili klijent koji traži vlasnika. LobbyStack postavlja pitanja koja Vaše pravilo traži, a zatim preusmerava poziv na Vaš dežurni broj ili na zaposlenog kog pozivalac traži.",
        points: [
          "Ako se niko ne javi, kaže to pozivaocu i ponudi da primi poruku",
          "Vaš tim može da dobije obaveštenje kada preusmeravanje ne uspe",
        ],
      },
      {
        title: "Znajte šta je pozivalac želeo pre nego što mu uzvratite poziv",
        body: "Kontrolna tabla prikazuje svaki poziv sa rezimeom od jedne rečenice, transkriptom i snimkom, pored imena i broja pozivaoca.",
        points: [
          "Poruke i povratni pozivi čekaju Vaš tim na jednom spisku",
          "Obaveštenje SMS-om ili e-poštom kada recepcioner primi poruku",
        ],
      },
      {
        title: "Podesite AI odgovaranje na pozive na svom broju",
        body: "Možete da ga čujete kako se javlja u pregledaču pre nego što Vas pozove ijedan klijent.",
        points: [
          "Prosledite liniju kada je zauzeta, kada se niko ne javi, posle zatvaranja ili stalno",
          "Dodajte radno vreme, cene i pravila kao tekst, dokumente ili stranice sa svog sajta",
          "Pravila pišite običnim rečenicama, na primer „Svakoga ko nema grejanje prebaci na dežurni telefon“",
          "Testirajte ga u pregledaču. Besplatan paket uključuje 30 minuta razgovora i broj iz SAD ili Kanade na 14 dana",
        ],
      },
      {
        title: "Pročitajte kod koji se javlja na Vaš telefon",
        body: "LobbyStack je otvorenog koda pod MIT licencom. Koristite LobbyStack Cloud ili ga pokrenite na svom serveru sa svojim Twilio i OpenAI nalozima.",
        points: [
          "Starter i Pro uključuju broj u SAD, Kanadi, Velikoj Britaniji, Australiji ili na Novom Zelandu",
          "Poziv u 2 posle ponoći košta isto kao poziv u podne",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI služba za odgovaranje na pozive?",
        answer:
          "AI služba za odgovaranje na pozive se javlja na Vaše poslovne pozive glasovnom veštačkom inteligencijom umesto osobom. LobbyStack razgovara sa pozivaocem, odgovara na pitanja na osnovu podataka koje dodate, zakazuje termine u Google Calendar, prima poruke i hitne pozive preusmerava Vašem timu, prema pravilima koja napišete.",
      },
      {
        question: "Da li je to dobra AI služba za odgovaranje na pozive za malu firmu?",
        answer:
          "Da. LobbyStack je napravljen za radnje koje vode vlasnici, majstore, klinike i salone kojima telefon zvoni dok su svi zauzeti. Besplatan paket uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500, i nijedan paket nema naknadu za aktivaciju.",
      },
      {
        question: "Koliko traje podešavanje?",
        answer:
          "Oko 10 minuta. Dodajte radno vreme, usluge i pravila za hitne pozive, obavite probni poziv iz pregledača, pa preusmerite svoj broj kada odgovara onako kako želite.",
      },
      {
        question: "Mogu li da zadržim svoj poslovni broj?",
        answer:
          "Da. Prosledite postojeći broj na LobbyStack preko svog telefonskog operatera, a pozivaoci zovu broj koji već znaju. Starter i Pro uključuju i jedan Vaš broj u SAD, Kanadi, Velikoj Britaniji, Australiji ili na Novom Zelandu.",
      },
      {
        question: "Može li da se javlja samo kada smo zauzeti ili zatvoreni?",
        answer:
          "Da. Podešavanja prosleđivanja kod Vašeg operatera određuju koji pozivi stižu do LobbyStack-a: pozivi kada je linija zauzeta, pozivi na koje se niko ne javi, pozivi posle zatvaranja ili svi pozivi. Podešavanje možete da promenite kad god želite, za praznik ili mirnu nedelju.",
      },
      {
        question: "Može li da zakazuje termine tokom poziva?",
        answer:
          "Da. Povežite Google Calendar i dodajte svoje usluge. LobbyStack nudi slobodne termine u okviru radnog vremena, zakazuje onaj koji pozivalac izabere i, ako pozivalac pristane, šalje potvrdu i podsetnik SMS-om 24 sata ranije. Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve.",
      },
      {
        question: "Šta se dešava kada pozivaocu treba prava osoba?",
        answer:
          "Preusmerava poziv. Vi birate kada: za hitne pozive, kada pozivalac to zatraži, uvek ili samo tokom radnog vremena. Poziv ide na Vaš podrazumevani broj za preusmeravanje ili na zaposlenog kog pozivalac traži po imenu. Ako se niko ne javi, recepcioner to kaže pozivaocu i ponudi da primi poruku.",
      },
      {
        question: "Kako da odredim šta govori?",
        answer:
          "Vi podešavate pozdrav, dodajete znanje o firmi i pišete pravila običnim rečenicama, na primer „Ako cena zavisi od posla, ponudi povratni poziv sa ponudom.“ Recepcioner čita pravila redom kojim ste ih poređali, pa najvažnija stavite na vrh.",
      },
      {
        question: "Šta vidim posle svakog poziva?",
        answer:
          "Kontrolna tabla prikazuje svaki poziv sa rezimeom od jedne rečenice, transkriptom, snimkom kada je sačuvan, brojem pozivaoca i imenom koje je naveo, kao i ishodom: zakazan termin, poruka, preusmeravanje ili odgovoreno pitanje.",
      },
      {
        question: "Da li se javlja na neželjene pozive?",
        answer:
          "Javlja se, a zatim prekida automatske pozive i prodajne ponude. Pozivi koje recepcioner prekine kao neželjene ne računaju se u Vaše minute, kao ni pozivi kraći od 10 sekundi.",
      },
      {
        question: "Koliko košta AI odgovaranje na pozive?",
        answer:
          "Free uključuje 30 minuta razgovora mesečno. Starter košta $30 mesečno sa 150 minuta, zatim $0.20 po minutu. Pro košta $100 mesečno sa 500 minuta, zatim $0.18 po minutu. Godišnja naplata je 20% jeftinija. U podešavanjima naplate možete da postavite mesečnu granicu za prekoračenje.",
      },
    ],
    faqHeading: "Pitanja o AI službama za odgovaranje na pozive",
    relatedLinks: [
      {
        label: "AI zakazivanje termina",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Služba za odgovaranje na pozive van radnog vremena",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "AI recepcioner za kućne usluge",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Kalkulator propuštenih poziva",
        href: "/missed-call-revenue-calculator/",
      },
      pricingLink,
    ],
    ctaHeading: "Neka LobbyStack preuzme sledeći poziv na koji ne stižete da se javite",
    ctaBody:
      "Unesite svoje podatke, prosledite broj i sami ga pozovite. Besplatan paket uključuje 30 minuta razgovora.",
    ctaPrimaryLabel: "Isprobajte besplatno",
    ctaSecondaryLabel: "Pogledajte cene",
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "AI zakazivanje termina za dolazne pozive | LobbyStack",
    description:
      "LobbyStack nudi AI zakazivanje termina za pozive koje primate. Nudi slobodne termine iz Google Calendar-a, zakazuje posetu i šalje potvrdu SMS-om.",
    eyebrow: "AI zakazivanje termina",
    h1: "AI zakazivanje termina koje zakaže pozivaoca pre nego što spusti slušalicu",
    intro:
      "Kada pozivalac dobije govornu poštu, sledeća firma koju pozove može da ga zakaže pre nego što mu uzvratite poziv. LobbyStack se javlja, nudi slobodne termine iz Vašeg Google Calendar-a, zakazuje onaj koji pozivalac izabere i šalje mu potvrdu SMS-om.",
    image: "/illustrations/booking-flow.webp",
    imageAlt:
      "LobbyStack AI zakazivanje termina upisuje pozivaoca u slobodan termin",
    proofPoints: [
      "Zakazuje u Google Calendar tokom poziva",
      "Nudi samo termine u okviru Vašeg radnog vremena",
      "Šalje potvrdu i podsetnik SMS-om",
      "Pomera ili otkazuje termine ako to dozvolite",
    ],
    sections: [
      {
        title: "Kako AI zakazivanje termina radi tokom poziva",
        body: "Saznaje koja usluga treba pozivaocu, pronalazi termine dovoljno duge za taj posao i daje mu da bira. Pozivalac izabere jedan, a termin se pojavljuje u Vašem Google Calendar-u.",
        points: [
          "Ako pozivalac pristane, odmah mu šalje potvrdu SMS-om, a podsetnik 24 sata ranije",
          "Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve",
        ],
      },
      {
        title: "Pozivaoci sami pomeraju ili otkazuju termine",
        body: "Uključite izmene termina i pozivalac može da pronađe svoj termin, izabere novo vreme ili otkaže. Recepcioner potvrđuje izmenu pre nego što bilo šta promeni u Vašem kalendaru. Da niko drugi ne bi mogao da promeni termin, prvo tražite jednokratni kod poslat SMS-om ili PIN sa tastature telefona.",
        points: [
          "Izmene su isključene dok ih ne uključite",
          "Kada ne može da potvrdi termin, zahtev predaje Vašem timu",
        ],
      },
      {
        title: "Zakazuje kod osobe koju pozivalac traži",
        body: "Dodajte osobe koje primaju termine, sa uslugama koje rade, radnim vremenom i odsustvima. Pozivalac može da traži nekoga po imenu. Ako nema želju, recepcioner zakazuje kod prve osobe slobodne za tu uslugu.",
        points: [
          "Recepcioner nikome ne zakazuje termin dok je ta osoba na odsustvu",
          "Može i da prebaci pozivaoca na osobu koju traži",
        ],
      },
      {
        title: "Četiri provere pre nego što ponudi termin",
        body: "Recepcioner nudi termin samo kada je slobodan prema sve četiri.",
        points: [
          "Usluga i njeno trajanje",
          "Vaše radno vreme i radno vreme svakog zaposlenog",
          "Zauzeto vreme u Vašem Google Calendar-u",
          "Odsustvo koje unesete za zaposlenog",
        ],
      },
      {
        title: "Za koje pozive služi LobbyStack AI zakazivanje termina",
        body: "LobbyStack obavlja AI zakazivanje termina za pozive koji stižu do Vas. Ne zove spiskove potencijalnih klijenata i ne prati hladne kontakte. Jedini odlazni pozivi koje upućuje su preusmeravanja.",
        points: [
          "Novi klijenti, stalni klijenti i oni koji zovu van radnog vremena mogu da zakažu već u prvom pozivu",
          "Želite sami da odobrite svaku posetu? Podesite ga da željeno vreme pozivaoca sačuva kao zahtev za Vaš tim",
          "Svaki poziv počinje na Vašem podrazumevanom jeziku i prelazi na drugi kada pozivalac počne njime da govori",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI zakazivanje termina?",
        answer:
          "AI zakazivanje termina znači da glasovna veštačka inteligencija zakazuje termine telefonom. LobbyStack se javlja na Vaše dolazne pozive, pita šta pozivaocu treba, nudi slobodne termine iz Vašeg Google Calendar-a i zakazuje onaj koji izabere. Ne upućuje odlazne prodajne pozive.",
      },
      {
        question:
          "Da li je AI zakazivanje termina isto što i AI ugovaranje sastanaka?",
        answer:
          "Ne sasvim. Ugovaranje sastanaka često znači odlazne pozive kojima se zakazuju prodajni sastanci, a AI zakazivanje termina obrađuje pozive koji stižu do Vas. Ljudi koriste oba naziva. LobbyStack radi ovo drugo: zakazuje, pomera i otkazuje termine dok je pozivalac na vezi.",
      },
      {
        question: "U koji kalendar zakazuje?",
        answer:
          "U Google Calendar. Povežete Google nalog i izaberete kalendar u koji stižu termini. LobbyStack iz njega čita zauzeto vreme, pa ne nudi termin koji je već zauzet.",
      },
      {
        question: "Mogu li da izaberem koja pitanja postavlja pre zakazivanja?",
        answer:
          "Da. Dodajte usluge sa trajanjem i opisom i napišite pravila o tome šta da prikupi, na primer adresu, problem ili osiguranje pozivaoca. Odgovori se pojavljuju u rezimeu i transkriptu poziva.",
      },
      {
        question: "Mogu li pozivaoci telefonom da pomere ili otkažu termin?",
        answer:
          "Da, kada uključite izmene termina. Podrazumevano pozivalac mora da zove sa broja sa kog je zakazao i da navede vreme ili uslugu termina. Možete da tražite i jednokratni kod poslat SMS-om ili PIN sa tastature telefona. Recepcioner potvrđuje izmenu pre nego što bilo šta promeni.",
      },
      {
        question: "Da li šalje potvrde i podsetnike?",
        answer:
          "Da, kada pozivalac pristane tokom poziva. LobbyStack SMS-om šalje potvrdu termina, podsetnik 24 sata pre termina i potvrdu otkazivanja. Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve.",
      },
      {
        question: "Može li da zakazuje termine van radnog vremena?",
        answer:
          "Da. Javlja se na pozive koje mu prosledite noću, vikendom i praznicima i nudi termine u okviru Vašeg radnog vremena, pa pozivalac u 21 čas može da zakaže za sledeće jutro.",
      },
      {
        question: "Šta ako želim sam da odobrim svaki termin?",
        answer:
          "Podesite ga da željeno vreme pozivaoca sačuva kao zahtev za Vaš tim ili da primi poruku. Vaš tim potvrđuje posetu, a pozivalac dobija odgovor od Vas.",
      },
      {
        question: "Može li da zakaže kod određenog zaposlenog?",
        answer:
          "Da. Dodajte zaposlene sa uslugama koje rade, radnim vremenom i odsustvima. Pozivaoci mogu da traže nekoga po imenu. Ako nemaju želju, recepcioner zakazuje kod prvog zaposlenog slobodnog za tu uslugu.",
      },
      {
        question: "Koliko košta AI zakazivanje termina?",
        answer:
          "Free uključuje 30 minuta razgovora mesečno. Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu. Pro košta $100 mesečno za 500 minuta, zatim $0.18 po minutu. Godišnja naplata je 20% jeftinija, a nijedan paket nema naknadu za aktivaciju.",
      },
    ],
    faqHeading: "Pitanja o AI zakazivanju termina",
    relatedLinks: [
      {
        label: "AI služba za odgovaranje na pozive",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "AI recepcioner za stomatološke ordinacije",
        href: "/solutions/ai-receptionist-for-dental-offices/",
      },
      {
        label: "AI recepcioner za salone",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
      },
      {
        label: "Služba za odgovaranje na pozive van radnog vremena",
        href: "/solutions/after-hours-answering-service/",
      },
      pricingLink,
    ],
    ctaHeading: "Zakažite sledećeg pozivaoca dok je još na vezi",
    ctaBody:
      "Dodajte svoje usluge, povežite Google Calendar i pozovite svoj broj da zakažete probni termin. Besplatan paket uključuje 30 minuta razgovora.",
    ctaPrimaryLabel: "Isprobajte besplatno",
    ctaSecondaryLabel: "Pogledajte cene",
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "AI recepcioner za kućne usluge i majstore | LobbyStack",
    description:
      "AI recepcioner za kućne usluge koji se javlja dok Vaša ekipa radi, zakazuje poslove u Google Calendar i hitne slučajeve preusmerava dežurnom majstoru.",
    eyebrow: "Kućne usluge",
    h1: "AI recepcioner za kućne usluge koji zakazuje poslove dok Vi radite",
    intro:
      "Ne možete da se javite ispod sudopere ili sa krova. LobbyStack se javlja, beleži adresu i problem, zakazuje posetu u Google Calendar i hitne slučajeve koje ste definisali preusmerava na Vaš dežurni telefon.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "LobbyStack AI recepcioner za kućne usluge zakazuje posao iz telefonskog poziva",
    proofPoints: [
      "Javlja se na broj koji Vaši klijenti već zovu",
      "Hitne slučajeve preusmerava na Vaš dežurni telefon",
      "Zakazuje procene i servisne posete",
      "Prekida neželjene pozive, koji ne troše minute",
    ],
    sections: [
      {
        title:
          "Naša služba za odgovaranje na pozive za kućne usluge odvaja hitne slučajeve od redovnih poslova",
        body: "Vi odlučujete koji pozivi su hitni. Sve ostalo LobbyStack zakazuje ili zapisuje za Vas.",
        points: [
          "Hitni slučajevi, kao što su pukla cev ili kvar grejanja zimi, idu Vašem dežurnom majstoru, sa adresom i opisom problema u transkriptu",
          "Za poslove koji mogu da sačekaju nudi slobodan termin iz Vašeg Google Calendar-a i zapisuje poziv",
        ],
      },
      {
        title: "Od zahteva za ponudu do posete za procenu",
        body: "LobbyStack navodi samo cene koje unesete. Kada cena zavisi od posla, kaže to i zakazuje posetu.",
        points: [
          "Beleži adresu i podatke koje Vaša pravila traže",
          "Pozivalac dobija potvrdu posete SMS-om",
        ],
      },
      {
        title: "Zadržite broj koji piše na Vašem vozilu",
        body: "Preusmerite poslovnu liniju na LobbyStack preko svog telefonskog operatera. Izaberite kada se javlja: kada je linija zauzeta, kada se niko ne javi, posle zatvaranja ili na svaki poziv. Promenite to kad god želite, na primer za praznični vikend.",
        points: [
          "Starter i Pro uključuju i Vaš sopstveni broj",
          "Pozivaoci zovu broj koji već imaju",
        ],
      },
      {
        title: "Podesite svog AI recepcionera za kućne usluge",
        body: "Dodajte ove četiri stvari pre nego što prosledite prvi poziv.",
        points: [
          "Područje rada, da bi mogao da odgovori na „Da li dolazite u Brookline?“",
          "Usluge i cene, da bi zakazao procenu kada posao prvo treba pogledati",
          "Pravila za hitne slučajeve, sa problemima zbog kojih vredi zvati noću, kao što su kvar grejanja ili izlivanje kanalizacije",
          "Ograničenja kao što je „Nikad ne obećavaj posetu istog dana“, napisana kao pravila",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI recepcioner za kućne usluge?",
        answer:
          "To je glasovna veštačka inteligencija koja se javlja na telefon firme za vodoinstalaterske radove, grejanje i klimatizaciju, električne instalacije, krovove ili drugi zanat. LobbyStack se javlja kada Vaša ekipa ne može, beleži adresu i problem, zakazuje posete u Google Calendar, odgovara na pitanja na osnovu Vaših podataka i hitne slučajeve preusmerava na Vaš dežurni broj.",
      },
      {
        question:
          "Po čemu se razlikuje od službe za odgovaranje na pozive za kućne usluge?",
        answer:
          "LobbyStack zakazuje posetu tokom poziva, dok kod službe sa živim operaterima osoba čita Vaš scenario i prima poruku. Hitne slučajeve preusmerava dok je pozivalac još na vezi i čuva rezime, transkript i snimak svakog poziva. Plaćate minute koje potrošite, a poziv noću košta isto kao poziv u podne.",
      },
      {
        question: "Može li da obradi hitne pozive noću?",
        answer:
          "Da. Vi zapisujete šta je hitno, na primer kvar grejanja, curenje koje traje ili izlivanje kanalizacije. LobbyStack postavlja pitanja koja Vaše pravilo traži, a zatim preusmerava poziv na Vaš dežurni broj. Ako preusmeravanje ne uspe, nudi da primi poruku, a Vaš tim može da dobije obaveštenje.",
      },
      {
        question: "Hoće li zakazivati poslove dok sam na terenu?",
        answer:
          "Da. Nudi slobodne termine iz Vašeg Google Calendar-a u okviru radnog vremena, zakazuje onaj koji pozivalac izabere i, ako pristane, šalje mu potvrdu SMS-om i podsetnik dan ranije.",
      },
      {
        question: "Šta kaže kada pozivalac pita za cenu?",
        answer:
          "Navodi cene koje dodate uz usluge. Kada cena zavisi od posla, kaže da majstor prvo mora da pogleda, pa zakazuje posetu za procenu ili prima poruku, u zavisnosti od Vaših pravila.",
      },
      {
        question: "Mogu li da izaberem šta pita pozivaoce?",
        answer:
          "Da. Napišite pravila o tome šta da prikupi, na primer adresu, starost uređaja, da li voda još teče ili kako se dolazi do objekta. Odgovori se pojavljuju u rezimeu i transkriptu poziva.",
      },
      {
        question: "Da li radi sa mojim postojećim poslovnim brojem?",
        answer:
          "Da. Prosledite broj koji Vaši klijenti već zovu. Izaberite zauzete i neodgovorene pozive za višak poziva, pozive posle zatvaranja za noći i vikende, ili sve pozive. Starter i Pro uključuju i Vaš sopstveni broj.",
      },
      {
        question: "Da li će moj tim videti šta je zakazano?",
        answer:
          "Da. Termini se pojavljuju u Vašem Google Calendar-u i na kontrolnoj tabli, pored rezimea, transkripta i snimka svakog poziva. Kada recepcioner primi poruku, Vaš tim dobija obaveštenje e-poštom, ili SMS-om ako ga uključite.",
      },
      {
        question: "Koliko košta za firmu za kućne usluge?",
        answer:
          "Free uključuje 30 minuta razgovora za testiranje. Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu. Pro košta $100 mesečno za 500 minuta, zatim $0.18 po minutu. Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju.",
      },
    ],
    faqHeading: "Pitanja o AI recepcionerima za kućne usluge",
    relatedLinks: [
      {
        label: "Služba za odgovaranje na pozive van radnog vremena",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "AI služba za odgovaranje na pozive",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "AI zakazivanje termina",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Kalkulator propuštenih poziva",
        href: "/missed-call-revenue-calculator/",
      },
      pricingLink,
    ],
    ctaHeading: "Zakažite sledeći posao bez napuštanja ovog",
    ctaBody:
      "Dodajte usluge, pravila za hitne slučajeve i područje rada, prosledite broj i pozovite ga da testirate. Besplatan paket uključuje 30 minuta razgovora.",
    ctaPrimaryLabel: "Isprobajte besplatno",
    ctaSecondaryLabel: "Pogledajte cene",
  },
}

const restoredSerbianSeoPages: Record<string, SeoLandingPage> = {
  "/about/": serbianPage("/about/", {
    title: "O nama | LobbyStack, AI recepcioner otvorenog koda",
    description:
      "LobbyStack je AI recepcioner otvorenog koda za male firme. Javlja se na pozive, zakazuje termine i prosleđuje pozive Vašem timu.",
    eyebrow: "O nama",
    h1: "LobbyStack je AI recepcioner otvorenog koda za male firme",
    intro:
      "Napravili smo LobbyStack za vlasnike koji propuštaju pozive dok rade sa klijentom. Javlja se na Vaš telefon, zakazuje termine u Google Calendar i prosleđuje poziv Vašem timu kada pozivaocu treba čovek. Kod je javan pod MIT licencom, pa možete da koristite LobbyStack Cloud ili da ga pokrenete na svom serveru.",
    imageAlt:
      "LobbyStack kod na GitHub-u, pokrenut na LobbyStack Cloud-u ili na Vašem serveru",
    proofPoints: [
      "Kod pod MIT licencom na GitHub-u",
      "Radi na LobbyStack Cloud-u ili na Vašem serveru",
      "Pozivi, termini, preusmeravanja i rezimei na jednoj kontrolnoj tabli",
    ],
    sections: [
      {
        title: "Napravili smo ga za pozive na koje ne možete da se javite",
        body: "Telefon zazvoni usred šišanja, čišćenja zuba ili posla na drugom kraju grada. Govorna pošta ne zakazuje nikoga, pa pozivalac zove sledeću firmu. Napravili smo LobbyStack da se javi na te pozive, zakaže šta može i ostatak Vam pošalje sa zapisanim detaljima.",
        points: [
          "Javlja se dok radite sa klijentom, posle zatvaranja ili dok ste na terenu",
          "Zakazuje u Google Calendar i šalje SMS potvrdu klijentima koji pristanu",
          "Prosleđuje hitne pozive po Vašim pravilima, a za ostale prima poruku",
        ],
      },
      {
        title: "Možete da pročitate kako odlučuje šta da uradi u pozivu",
        body: "Vaš recepcioner razgovara sa Vašim klijentima, čita Vaš kalendar i odlučuje kada da Vas probudi. Treba da možete da proverite kako donosi te odluke. Ceo LobbyStack je na GitHub-u pod MIT licencom, i svako može da ga čita, pokreće ili menja.",
        points: [
          "Sami pročitajte promptove, alate i obradu poziva",
          "Počnite na LobbyStack Cloud-u i kasnije pređite na svoj server",
          "Napravite kopiju projekta i prilagodite je svom načinu rada",
        ],
      },
      {
        title: "Napravljen za firme koje zakazuju telefonom",
        body: "Pravimo LobbyStack za vlasnike i male timove kojima posao stiže telefonom: salone i spa centre, stomatološke ordinacije, vodoinstalatere i druge majstore, upravnike nekretnina. Agencije mogu i da ga preprodaju svojim klijentima pod sopstvenim brendom.",
        points: [
          "Vlasnici koji propuštaju pozive tokom termina ili na terenu",
          "Firme koje žele da pozivalac završi razgovor sa zakazanim terminom, bez glasovnog menija",
          "Agencije koje žele da ponude AI recepcionera pod sopstvenim brendom",
        ],
      },
      {
        title: "Vi odlučujete šta govori, zakazuje i prosleđuje",
        body: "Pravila pišete običnim jezikom: šta recepcioner sme da kaže pozivaocima, šta sme da zakaže i kada Vam prosleđuje poziv. Na LobbyStack Cloud-u mi vodimo hostovanje, nadzor i ažuriranja. Na svom serveru Vi pokrećete isti kod.",
        points: [
          "Dodajte svoj sajt, dokumente, usluge i radno vreme kao njegovo znanje",
          "Pregledajte rezime, transkript i ishod svakog poziva na kontrolnoj tabli",
          "Pročitajte dokumentaciju ili pišite na support@lobbystack.com kada Vam treba pomoć",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Funkcije", href: "/features/" },
      { label: "Javna dokumentacija", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Isprobajte LobbyStack na svojim pozivima",
    ctaBody:
      "Počnite sa besplatnim paketom i 30 minuta razgovora, bez kartice, ili prvo pročitajte kod na GitHub-u.",
    ctaSecondaryLabel: "Pročitajte kod na GitHub-u",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  }),

  "/solutions/after-hours-answering-service/": serbianPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "AI služba za odgovaranje na pozive van radnog vremena | LobbyStack",
      description:
        "Služba za odgovaranje na pozive van radnog vremena: redovne pozive zakazuje u Google Calendar, a hitne preusmerava na dežurni telefon. Od $30 mesečno.",
      eyebrow: "Javljanje van radnog vremena",
      h1: "AI služba za odgovaranje na pozive van radnog vremena koja Vas budi samo zbog hitnih slučajeva",
      intro:
        "U jedan posle ponoći, pozivalac bez grejanja zove onoga ko se prvi javi. LobbyStack se javlja na Vaš poslovni broj noću, vikendom i praznicima. Za hitne slučajeve koje određuju Vaša pravila zvoni na Vaš dežurni telefon, a redovne pozive zakazuje u Google Calendar.",
      imageAlt:
        "LobbyStack se javlja na pozive van radnog vremena i hitan slučaj preusmerava na dežurni telefon",
      proofPoints: [
        "Javlja se na Vaš postojeći broj kada zatvorite",
        "Hitne slučajeve preusmerava na Vaš dežurni telefon",
        "Besplatan paket sa 30 minuta, zatim $30 mesečno za 150",
      ],
      sections: [
        {
          title: "Hitni slučajevi stižu na Vaš dežurni telefon",
          body: "Vi zapisujete šta je hitno, na primer nema grejanja ispod zadate temperature, voda koja ne prestaje da curi ili stanar koji je ostao zaključan napolju. LobbyStack postavlja pitanja koja Vaše pravilo traži, a zatim preusmerava poziv na Vaš dežurni broj. Adresa i opis problema ostaju u transkriptu poziva.",
          points: [
            "Može da pročita Vaša bezbednosna uputstva, na primer gde se zatvara voda",
            "Ako preusmeravanje ne uspe, nudi da primi poruku i može da obavesti Vaš tim",
          ],
        },
        {
          title: "Redovni pozivaoci sami zakazuju termine",
          body: "Pozivalac koji želi redovan servis ili ponudu čuje slobodne termine iz Vašeg Google Calendar-a i bira jedan. Dobija potvrdu SMS-om, a Vi vidite termin kada ujutru otvorite kalendar.",
          points: [
            "Pomera ili otkazuje termine, ako uključite izmene termina",
            "Odgovara na pitanja o radnom vremenu, području rada i cenama na osnovu Vaših podataka",
          ],
        },
        {
          title: "Ujutru znate ko je zvao tokom noći",
          body: "Kontrolna tabla čuva rezime od jedne rečenice, transkript i snimak svakog poziva. Vidite ko je zvao i šta mu treba pre nego što uzvratite ijedan poziv.",
          points: [
            "Ime i broj pozivaoca i razlog poziva",
            "Neželjeni pozivi i pozivi kraći od 10 sekundi ne troše minute",
          ],
        },
        {
          title: "Koliko košta služba za odgovaranje na pozive van radnog vremena",
          body: "Službe sa živim operaterima obično naplaćuju po minutu ili po pozivu, a neke dodaju naknadu za praznike. LobbyStack naplaćuje mesečni paket sa uključenim minutima, a minut u 3 ujutru na praznik košta isto kao bilo koji drugi. Recimo da mesečno dobijete 40 poziva van radnog vremena od po oko 3 minuta. To je 120 minuta, što staje u Starter za $30.",
          points: [
            "Free: 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana, bez kartice",
            "Starter: $30 mesečno za 150 minuta, zatim $0.20 po minutu",
            "Pro: $100 mesečno za 500 minuta, zatim $0.18 po minutu",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je služba za odgovaranje na pozive van radnog vremena?",
          answer:
            "Ona se javlja na Vaš poslovni telefon kada ne radite: noću, vikendom i praznicima. Kod službe sa živim operaterima osoba prima poruku. LobbyStack je AI služba za odgovaranje na pozive van radnog vremena, pa tokom poziva i odgovara na pitanja na osnovu Vaših podataka, zakazuje termine u Google Calendar i hitne slučajeve preusmerava na Vaš dežurni broj.",
        },
        {
          question: "Može li da zakazuje termine van radnog vremena?",
          answer:
            "Da. LobbyStack nudi slobodne termine iz Vašeg Google Calendar-a u okviru radnog vremena, zakazuje onaj koji pozivalac izabere i, ako pristane, šalje mu potvrdu SMS-om. Termin vidite u kalendaru ujutru.",
        },
        {
          question: "Kako odlučuje šta je hitno?",
          answer:
            "Vi pišete pravila, na primer „Nema grejanja kada je napolju ispod 40°F“ ili „Voda koja ne prestaje da curi“. LobbyStack postavlja pitanja koja svako pravilo traži i preusmerava pozive koji mu odgovaraju. Na sve ostalo odgovara, zakazuje termin ili ga zapisuje za jutro.",
        },
        {
          question: "Da li će buditi moje dežurno osoblje zbog sitnica?",
          answer:
            "Neće. Na Vaš dežurni broj zvone samo pozivi koji odgovaraju Vašim pravilima za preusmeravanje. Vi birate kada preusmerava: za hitne pozive, kada pozivalac to zatraži, uvek, samo tokom radnog vremena ili nikada. Zahtevi za ponudu i redovne posete čekaju jutro.",
        },
        {
          question: "Mogu li da zadržim svoj poslovni broj?",
          answer:
            "Da. Kada zatvorite, uključite prosleđivanje poziva kod svog operatera, ili tokom dana prosleđujte i zauzete i neodgovorene pozive. Starter i Pro uključuju i Vaš sopstveni broj u SAD, Kanadi, Velikoj Britaniji, Australiji ili na Novom Zelandu.",
        },
        {
          question: "Šta vidim sledećeg jutra?",
          answer:
            "Svaki poziv se pojavljuje na kontrolnoj tabli sa rezimeom od jedne rečenice, transkriptom, snimkom, brojem pozivaoca i imenom koje je naveo. Kada recepcioner primi poruku, Vaš tim dobija obaveštenje e-poštom, ili SMS-om ako ga uključite.",
        },
        {
          question:
            "Koje firme koriste službu za odgovaranje na pozive van radnog vremena?",
          answer:
            "Svaka firma koja prima pozive posle zatvaranja. Vodoinstalateri, firme za grejanje i klimatizaciju, ekipe za sanaciju šteta, bravari i upravnici nekretnina dobijaju hitne pozive noću. Stomatološke ordinacije i saloni dobijaju pozive za zakazivanje uveče i vikendom.",
        },
        {
          question:
            "Koliko košta služba za odgovaranje na pozive van radnog vremena?",
          answer:
            "Paket Free u LobbyStack-u uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu, a Pro $100 mesečno za 500 minuta, zatim $0.18 po minutu. Minut noću ili za praznik košta isto kao svaki drugi, a neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju.",
        },
        {
          question: "Po čemu se razlikuje od govorne pošte?",
          answer:
            "Govorna pošta snimi poruku i ostavi pozivaoca da čeka. LobbyStack razgovara sa pozivaocem, zakazuje ono što može da se zakaže i preusmerava ono što ne može da čeka. Pozivalac završava poziv sa odgovorom, zakazanim terminom ili porukom za Vaš tim.",
        },
      ],
      faqHeading: "Pitanja o službama za odgovaranje na pozive van radnog vremena",
      relatedLinks: [
        {
          label: "AI služba za odgovaranje na pozive",
          href: "/solutions/ai-phone-answering/",
        },
        {
          label: "Javljanje van radnog vremena za izvođače",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Koliko košta usluga odgovaranja na pozive",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "Kalkulator propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Neka LobbyStack preuzme večerašnje pozive",
      ctaBody:
        "Napišite pravila za hitne slučajeve, preusmerite broj kada zatvorite i sami ga pozovite. Besplatan paket uključuje 30 minuta.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": serbianPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title:
        "AI recepcioner za stomatološke ordinacije i služba za pozive | LobbyStack",
      description:
        "AI recepcioner za stomatološke ordinacije: javlja se kada je recepcija zauzeta ili zatvorena, zakazuje u Google Calendar i preusmerava hitne slučajeve.",
      eyebrow: "Stomatološke ordinacije",
      h1: "AI recepcioner za stomatološke ordinacije koji zakazuje pacijente dok je recepcija zauzeta",
      intro:
        "Pacijenti zovu tokom prijema, za vreme pauze za ručak i posle zatvaranja, a ti pozivi završavaju u govornoj pošti. LobbyStack se javlja na liniju Vaše ordinacije, nove pacijente i uklanjanje kamenca zakazuje u Google Calendar, a hitne stomatološke slučajeve preusmerava na Vaš dežurni broj. Plaćeni paketi počinju od $30 mesečno.",
      imageAlt:
        "LobbyStack zakazuje pregled za novog pacijenta i šalje potvrdu SMS-om",
      proofPoints: [
        "Zakazuje u Google Calendar i dan ranije šalje podsetnik SMS-om",
        "Hitne slučajeve van radnog vremena preusmerava na Vaš dežurni broj",
        "Razgovara sa pacijentima na više od 70 jezika, uključujući španski",
      ],
      sections: [
        {
          title: "Recepcija ostaje posvećena pacijentu ispred sebe",
          body: "Telefon zazvoni tokom prijema, a LobbyStack preuzima pozive novih pacijenata, pitanja o osiguranju i zakazivanje. Zakazuje redovne posete, odgovara na pitanja o prihvaćenim osiguranjima, parkingu i formularima, a sve ostalo zapisuje da Vaš tim reši između dva pacijenta.",
          points: [
            "Javlja se kada je linija zauzeta, posle zatvaranja ili na svaki poziv, u zavisnosti od toga kako prosleđujete broj",
            "Čuva snimak, transkript i rezime od jedne rečenice za svaki poziv",
          ],
        },
        {
          title: "Novi pacijenti zakazuju već u prvom pozivu",
          body: "LobbyStack beleži osiguravajuću kuću pacijenta i razlog posete, nudi slobodne termine u okviru radnog vremena i zakazuje pregled u Google Calendar. Ako više volite da svaku posetu sami potvrdite, podesite ga da željeno vreme sačuva kao zahtev za Vaš tim. Pacijenti koji pristanu dobijaju SMS potvrdu i podsetnik dan ranije. Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve.",
          points: [
            "Zakazuje za ordinaciju ili posebno za svakog stomatologa i dentalnog higijeničara",
            "Ako uključite izmene termina, pacijenti mogu da pomere ili otkažu termin sa broja sa kog su zakazali",
          ],
        },
        {
          title: "Hitni stomatološki slučajevi idu po Vašim pravilima",
          body: "Vi određujete šta je hitno, na primer otok, temperatura, izbijen zub ili krvarenje koje ne prestaje. LobbyStack postavlja ta pitanja, a zatim zakazuje prvi slobodan termin ili preusmerava poziv na Vaš dežurni broj. Uputstva za negu koja pacijenti treba da čuju napišite u pravilima, svojim rečima.",
          points: [
            "Preusmeravanje ide na jedan broj po ordinaciji, pa taj broj prosledite onome ko dežura",
            "Ako preusmeravanje ne uspe, nudi da primi poruku i može da obavesti Vaš tim",
          ],
        },
        {
          title: "Pacijenti govore na svom jeziku",
          body: "Svaki poziv počinje na podrazumevanom jeziku Vaše ordinacije: engleskom, francuskom, španskom, srpskom, nemačkom, brazilskom portugalskom, italijanskom ili holandskom. Kada pacijent počne da govori drugim jezikom ili ga zatraži, recepcioner prelazi na taj jezik. Radi na OpenAI GPT-Live modelu, koji podržava više od 70 jezika.",
          points: [
            "Kontrolna tabla i imejlovi stižu Vam na engleskom, francuskom, španskom ili srpskom",
            "SMS potvrde i podsetnici stižu na Vašem podrazumevanom jeziku",
          ],
        },
        {
          title: "Koliko košta AI recepcioner za stomatološke ordinacije",
          body: "Nijedan paket nema naknadu za aktivaciju, a cene su u američkim dolarima. LobbyStack meri potrošnju u sekundama, a pozivi kraći od 10 sekundi ili prekinuti kao neželjeni se ne računaju. Godišnja naplata je 20% jeftinija, pa Starter izlazi $24 mesečno, a Pro $80. AI recepcioneri specijalizovani za stomatologiju koji objavljuju cene koštali su od $299 do $1,199 mesečno kada smo 27. oktobra 2026. proverili njihove sajtove.",
          points: [
            "Free: 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana, bez kartice",
            "Starter: $30 mesečno za 150 minuta i jedan broj, zatim $0.20 po minutu",
            "Pro: $100 mesečno za 500 minuta, zatim $0.18 po minutu",
          ],
        },
        {
          title: "Kada je bolji recepcioner specijalizovan za stomatologiju",
          body: "LobbyStack zakazuje samo u Google Calendar, pa Vaš tim nove termine prepisuje u Dentrix, Open Dental ili Eaglesoft. LobbyStack ne tvrdi da je usklađen sa HIPAA, ne proverava pravo na pokriće kod osiguravača i ne vodi kampanje za pozivanje pacijenata na kontrolu. Ako Vam treba nešto od toga, izaberite stomatološkog dobavljača. Svaku tvrdnju ispod pročitali smo na sajtu dobavljača 27. oktobra 2026.",
          points: [
            "Upis termina u softver ordinacije: Dentina navodi 11 sistema u koje upisuje termine",
            "Recepcioner povezan sa softverom ordinacije: Peerlogic navodi 8 sistema sa kojima se povezuje",
            "Automatsko pozivanje na kontrolu: Dentina prodaje odlazne kampanje za pozivanje pacijenata, a Viva AI uključuje pozivanje na kontrolu i ponovno aktiviranje pacijenata u svojim paketima",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI recepcioner za stomatološke ordinacije?",
          answer:
            "AI recepcioner za stomatološke ordinacije je glasovna veštačka inteligencija koja se javlja na telefon ordinacije. Zakazuje termine, odgovara na pitanja o radnom vremenu i prihvaćenim osiguranjima, prima poruke i hitne slučajeve preusmerava na osobu. Ordinacije ga koriste za višak poziva, pauzu za ručak i pozive van radnog vremena, ili za sve pozive. LobbyStack zakazuje u Google Calendar. Neki proizvodi specijalizovani za stomatologiju umesto toga upisuju termine u softver za vođenje ordinacije.",
        },
        {
          question: "Koliko košta AI recepcioner za stomatološke ordinacije?",
          answer:
            "LobbyStack košta $30 mesečno na paketu Starter ili $100 mesečno na paketu Pro, bez naknade za aktivaciju. Starter uključuje 150 minuta, zatim $0.20 po minutu. Pro uključuje 500 minuta, zatim $0.18 po minutu, pa 1,000 minuta mesečno na paketu Pro košta $190. Pozivi kraći od 10 sekundi i pozivi prekinuti kao neželjeni se ne računaju. AI recepcioneri specijalizovani za stomatologiju koji objavljuju cene koštali su od $299 mesečno po lokaciji uz godišnju naplatu (Dentina) do $1,199 mesečno (Viva AI) kada smo ih proverili 27. oktobra 2026.",
        },
        {
          question: "Da li je LobbyStack usklađen sa HIPAA?",
          answer:
            "LobbyStack ne tvrdi da je usklađen sa HIPAA. Za svaki poziv čuva snimak, transkript, rezime od jedne rečenice, broj pozivaoca i ime koje navede, kao i termin koji je zakazao. Plaćeni paketi čuvaju snimke i transkripte 90 dana, a poruke 365 dana. Paket Free ih čuva 30 dana. Ako LobbyStack hostujete sami, njegova kopija tih podataka ostaje na Vašim serverima, ali Twilio i OpenAI i dalje obrađuju zvuk poziva. Proverite sa osobom zaduženom za usklađenost pre nego što pacijenti počnu da zovu.",
        },
        {
          question: "Može li da zakazuje direktno u Dentrix ili Open Dental?",
          answer:
            "Ne. LobbyStack zakazuje u Google Calendar i ne povezuje se sa Dentrix-om, Open Dental-om, Eaglesoft-om ni drugim softverom za vođenje ordinacije, pa Vaš tim nove termine prepisuje. Potpisani webhook-ovi i REST API mogu da šalju podatke o terminima i pozivima u Zapier ili Vaše alate. Ako Vam treba upis termina u softver ordinacije, Dentina navodi 11 sistema u koje upisuje termine, a Peerlogic navodi 8 sa kojima se povezuje (provereno 27. oktobra 2026.).",
        },
        {
          question: "Kako postupa sa hitnim stomatološkim pozivom?",
          answer:
            "Postavlja trijažna pitanja koja odobrite, na primer o jačini bola, otoku, povredi ili krvarenju, a zatim primenjuje Vaše pravilo preusmeravanja. Vi birate kada preusmerava: za hitne pozive, kada pozivalac to zatraži, uvek, samo tokom radnog vremena ili nikada. Preusmerava na jedan dežurni broj. Ako preusmeravanje ne uspe, o tome obavesti pacijenta i ponudi da primi poruku, a Vaš tim može da dobije obaveštenje „Preusmeravanje poziva nije uspelo“.",
        },
        {
          question: "Može li da proveri stomatološko osiguranje?",
          answer:
            "Ne. Beleži osiguravajuću kuću i paket osiguranja pacijenta i odgovara na pitanja na osnovu prihvaćenih osiguranja koja dodate u bazu znanja. Kod osiguravača ne proverava pravo na pokriće ni pokrivene usluge, pa Vaš tim proverava pokriće pre posete.",
        },
        {
          question: "Može li da zakaže termin za novog pacijenta?",
          answer:
            "Da. Beleži ime novog pacijenta, broj telefona, osiguravajuću kuću, razlog posete i željeno vreme, a zatim zakazuje slobodan termin u Google Calendar u okviru Vašeg radnog vremena. Možete ga podesiti i da željeno vreme sačuva kao zahtev koji Vaš tim potvrđuje. Ako pacijent pristane, šalje mu SMS potvrdu i podsetnik 24 sata ranije. Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve.",
        },
        {
          question: "Na kojim jezicima pacijenti mogu da govore?",
          answer:
            "Svaki poziv počinje na podrazumevanom jeziku Vaše ordinacije: engleskom, francuskom, španskom, srpskom, nemačkom, brazilskom portugalskom, italijanskom ili holandskom. Recepcioner prelazi na drugi jezik kada pacijent počne njime da govori ili ga zatraži. Radi na OpenAI GPT-Live modelu, koji podržava više od 70 jezika, a cenovnik LobbyStack-a ne navodi doplatu za jezike.",
        },
        {
          question:
            "Da li se javlja tokom pauze, posle radnog vremena i vikendom?",
          answer:
            "Da, na pozive koje mu prosledite. Podesite kod operatera da prosleđuje zauzete ili neodgovorene pozive za višak poziva i pauzu, pozive posle zatvaranja za noći i vikende, ili sve pozive. Zadržavate broj ordinacije. Starter i Pro uključuju i jedan broj u SAD, Kanadi, Velikoj Britaniji, Australiji ili na Novom Zelandu.",
        },
        {
          question: "Mogu li pacijenti telefonom da pomere ili otkažu termin?",
          answer:
            "Da, kada uključite izmene termina, koje su podrazumevano isključene. Pacijenti zovu sa broja sa kog su zakazali, a Vi možete prvo da tražite jednokratni kod poslat SMS-om. Ako su izmene isključene ili pacijent zove sa drugog broja, recepcioner beleži zahtev, a termin ostaje zakazan dok ga Vaš tim ne promeni.",
        },
        {
          question: "Da li AI recepcioner zamenjuje recepcionera u mojoj ordinaciji?",
          answer:
            "Ne. LobbyStack pokriva telefon: javlja se, zakazuje, odgovara na rutinska pitanja, prima poruke i preusmerava hitne pozive. Prijem pacijenata, naplata, provera osiguranja, upis termina u softver ordinacije i odgovori na SMS poruke pacijenata ostaju Vašem osoblju. Ne vodi kampanje za pozivanje na kontrolu, a jedini odlazni pozivi koje upućuje su preusmeravanja.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za stomatološke ordinacije",
      relatedLinks: [
        {
          label: "Služba za odgovaranje na pozive van radnog vremena",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "AI zakazivanje termina",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Samostalno hostovan AI recepcioner",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Koliko košta usluga odgovaranja na pozive",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "AI recepcioner ili virtuelni recepcioner",
          href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        },
        pricingLink,
      ],
      ctaHeading: "Zakažite pacijente koji zovu za vreme pauze",
      ctaBody:
        "Unesite prihvaćena osiguranja, radno vreme i pravila za hitne slučajeve, pa pozovite svoj broj da ga testirate. Besplatan paket uključuje 30 minuta.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": serbianPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "AI recepcioner za salone i spa centre | LobbyStack",
      description:
        "AI recepcioner za salone i spa centre koji se javlja dok farbate, zakazuje kod osobe koju klijent traži i navodi cene iz Vašeg cenovnika usluga.",
      eyebrow: "Saloni i spa centri",
      h1: "AI recepcioner za salone koji zakazuje dok su Vam ruke zauzete",
      intro:
        "Telefon zazvoni usred farbanja ili masaže, a LobbyStack se javi. Zakazuje u Google Calendar kod osobe koju klijent traži i odgovara iz Vašeg cenovnika usluga, pa se poziv završava terminom u kalendaru.",
      imageAlt:
        "Dan jedne frizerke u LobbyStack-u, sa balayage tretmanom zakazanim telefonom u slobodnom terminu",
      proofPoints: [
        "Zakazuje u Google Calendar prema trajanju usluge i radnom vremenu svakog frizera",
        "Šalje SMS potvrdu i podsetnik 24 sata ranije klijentima koji pristanu",
        "Pomera i otkazuje termine kada pronađe klijentovu rezervaciju",
      ],
      sections: [
        {
          title: "Zakažite kod osobe koju klijent traži",
          body: "Dodajte svakog frizera, koloristu i masera sa uslugama koje radi i radnim vremenom. Klijent koji traži nekoga po imenu čuje slobodne termine te osobe. Ako je ta osoba odsutna, LobbyStack kaže kada se vraća i nudi drugi dan ili drugu osobu.",
          points: [
            "Pronalazi termin dovoljno dug za uslugu, pa balayage od 150 minuta dobija 150 minuta",
            "Preskače slobodne dane i sate van rasporeda svake osobe",
            "Prebacuje poziv na telefon frizera kada klijent želi da razgovara s njim",
          ],
        },
        {
          title: "Pomerajte i otkazujte termine tokom poziva",
          body: "Klijentkinja zove da pomeri šišanje sa subote na četvrtak. LobbyStack pronalazi termin po njenom broju, imenu i vremenu termina, ponavlja joj izmenu i ažurira Vaš kalendar kada ona potvrdi. Pre izmene možete da zahtevate i SMS kod ili PIN na tastaturi.",
          points: [
            "Navodi Vaša pravila otkazivanja kada ih dodate u beleške",
            "Prosleđuje zahtev Vašem timu kada ne pronađe termin",
            "Šalje SMS potvrdu otkazivanja klijentima koji su pristali na poruke",
          ],
        },
        {
          title: "Telefonska služba za salone koja zna Vaš cenovnik",
          body: "Svakoj usluzi dodelite trajanje i cenu: fiksnu, početnu, raspon ili cenu koja se određuje na licu mesta. LobbyStack navodi cenu koju ste uneli i ne izmišlja cenu koju ste ostavili praznu. Dodajte i svoj sajt i pravila u PDF-u, pa odgovara na pitanja o testu na alergiju, parkingu ili poklon-karticama.",
          points: [
            "Daje iste odgovore telefonom, u četu na Vašem sajtu i u Instagram porukama",
            "Prima poruku za Vaš tim kada Vaše beleške ne pokrivaju pitanje",
          ],
        },
        {
          title: "Zakažite klijente koji zovu posle zatvaranja",
          body: "U 21 čas klijentkinja primeti da joj je potreban izrastak. LobbyStack se tada javlja isto kao u podne i zakazuje u terminima koje ste otvorili. Sledećeg jutra na kontrolnoj tabli nalazite svaki poziv sa rezimeom, transkriptom i ishodom.",
          points: [
            "Šalje Vam obaveštenje imejlom ili SMS-om za pozive na koje Vaš tim treba da odgovori",
            "Prelazi na jezik pozivaoca, od više od 70 jezika",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta radi AI recepcioner za salon?",
          answer:
            "Javlja se na telefon Vašeg salona kada niko na recepciji ne može. LobbyStack zakazuje termine u Google Calendar, pomera ih i otkazuje, odgovara na pitanja iz Vašeg cenovnika i pravila i prebacuje poziv na osobu kada klijent to zatraži ili kada to nalažu Vaša pravila. Svaki poziv se pojavljuje na kontrolnoj tabli sa rezimeom i transkriptom.",
        },
        {
          question: "Mogu li klijenti da zakažu kod određenog frizera?",
          answer:
            "Da. Dodajte frizere na stranici Zaposleni sa uslugama koje rade, radnim vremenom i odsustvima. LobbyStack pita da li klijent želi nekoga posebno, nudi slobodne termine te osobe i kaže klijentu kod koga je termin. Ako klijent nema želju, zakazuje kod prve slobodne osobe koja radi tu uslugu.",
        },
        {
          question: "Da li radi sa mojim softverom za zakazivanje u salonu?",
          answer:
            "Ne direktno. LobbyStack zakazuje u Google Calendar i ne povezuje se sa platformama za zakazivanje u salonima. Ako Vaš salon zakazuje u drugoj aplikaciji, podesite LobbyStack da prima zahteve: beleži uslugu, osobu i vreme koje klijent želi, a Vaš tim potvrđuje termin. Webhookovi i LobbyStack API mogu da proslede svaki zahtev Vašim drugim alatima.",
        },
        {
          question: "Mogu li klijenti da otkažu ili pomere termin telefonom?",
          answer:
            "Da, kada uključite izmene termina. LobbyStack povezuje termin sa brojem pozivaoca, imenom i vremenom termina, ponavlja izmenu i zatim ažurira Vaš kalendar. Možete da tražite i SMS kod ili PIN na tastaturi. Kada ne pronađe termin, prosleđuje zahtev Vašem timu.",
        },
        {
          question: "Da li šalje podsetnike za termine?",
          answer:
            "Da. Klijenti koji tokom poziva pristanu na SMS poruke dobijaju potvrdu zakazivanja, podsetnik 24 sata pre termina i potvrdu ako otkažu. Na LobbyStack Cloud-u ove poruke stižu samo na brojeve iz SAD i Kanade, a vreme slanja i tekst ne možete da menjate.",
        },
        {
          question: "Može li da odgovara na pitanja o cenama i uslugama?",
          answer:
            "Da. Navodi cenu koju ste postavili za svaku uslugu: fiksnu, početnu, raspon ili cenu na licu mesta. Na ostala pitanja, na primer o testu na alergiju ili parkingu, odgovara iz Vašeg sajta, dokumenata i beleški. Kada cenu ostavite praznu, ne izmišlja je.",
        },
        {
          question: "Da li radi za spa centre, berbernice i salone za nokte?",
          answer:
            "Da. Berbernica, spa centar, medicinski spa, salon za nokte i masažni salon podešavaju ga na isti način: dodate svoje usluge, ljude, radno vreme i pravila.",
        },
        {
          question: "Šta se dešava kada klijent želi da razgovara sa osobom?",
          answer:
            "LobbyStack prebacuje poziv. Klijent koji traži frizera po imenu dobija telefon tog frizera, ako ste ga dodali, a svi ostali idu na Vaš podrazumevani broj za preusmeravanje. Možete i da napišete pravila po kojima umesto toga prima poruku.",
        },
        {
          question: "Mogu li da zadržim broj svog salona?",
          answer:
            "Da. Preusmerite svoj postojeći broj na LobbyStack, za sve pozive ili samo za one koje propustite. Klijenti i dalje biraju broj koji znaju.",
        },
        {
          question: "Koliko košta AI recepcioner za salon?",
          answer:
            "Možete da počnete besplatno. Paket Free uključuje 30 minuta razgovora i broj iz SAD ili Kanade na 14 dana, bez kartice. Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu, a Pro $100 mesečno za 500 minuta, zatim $0.18 po minutu. Uz godišnje plaćanje cena je 20% niža. Pozivi kraći od 10 sekundi i pozivi završeni kao neželjeni se ne računaju.",
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
      ctaHeading: "Zakazujte i dok radite sa klijentom",
      ctaBody:
        "Počnite besplatno sa 30 minuta razgovora. Dodajte usluge, frizere i radno vreme, pa zakažite probni termin iz pregledača.",
      ...ctaLabels,
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": serbianPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title: "Samostalno hostovan AI recepcioner otvorenog koda | LobbyStack",
      description:
        "Pokrenite LobbyStack, samostalno hostovan AI recepcioner otvorenog koda, na svom serveru uz Docker Compose ili Railway. Snimci ostaju kod Vas.",
      eyebrow: "Samostalno hostovanje",
      h1: "Samostalno hostovan AI recepcioner koji čuva zapise o pozivima na Vašem serveru",
      intro:
        "AI recepcioner koji hostuje dobavljač čuva snimke Vaših klijenata na tuđim serverima. LobbyStack odgovara na Vaše pozive, zakazuje termine i prima poruke sa servera kojim Vi upravljate i tamo čuva svaki snimak, transkript i kontakt.",
      heroFootnote:
        "Samostalno hostovanje je besplatno pod MIT licencom. Hosting, Twilio i OpenAI plaćate direktno.",
      imageAlt: "LobbyStack kao samostalno hostovan AI recepcioner na Vašem serveru",
      proofPoints: [
        "Jedan server sa 2 vCPU i 4 GB RAM-a",
        "Docker Compose ili Railway šablon",
        "Vaši Twilio i OpenAI nalozi",
      ],
      sections: [
        {
          title: "Docker Compose na jednom serveru",
          body: "Jedan docker-compose.yml fajl pokreće kontrolnu tablu, worker, PostgreSQL, Redis i Caddy na jednoj mašini. Skripta popunjava svaku lozinku i tajni ključ, pa Vi dodajete samo domen, OpenAI ključ i Twilio podatke za prijavu.",
          points: [
            "Docker Engine 24 ili noviji, sa Compose v2",
            "Node.js 22 ili noviji za generisanje tajnih ključeva",
            "Domen sa HTTPS-om za kontrolnu tablu",
          ],
        },
        {
          title: "Railway šablon",
          body: "Railway pravi servise, baze podataka i bucket za skladište i generiše sve tajne ključeve. Vi unesete svoj OpenAI ključ i Twilio podatke za prijavu. Probni pozivi u pregledaču rade čim se postavljanje završi.",
          points: [
            "Lozinke i tajne ključeve generiše Railway",
            "Vaš nalog na novoj kontrolnoj tabli",
            "E-pošta, telefonski pozivi i Google Calendar se podešavaju posle",
          ],
        },
        {
          title: "Zapisi o pozivima ostaju na Vašem serveru",
          body: "Snimci, transkripti, kontakti i podešavanja čuvaju se u PostgreSQL bazi i skladištu kojima Vi upravljate, a Vi birate kako pravite rezervne kopije. Twilio i OpenAI i dalje obrađuju zvuk poziva uživo preko Vaših naloga, pa proverite njihove uslove za svoj slučaj.",
          points: [
            "Posebne uloge u bazi i bezbednost na nivou redova za svaki servis",
            "Snimci na lokalnom volumenu ili u bilo kom S3 kompatibilnom bucket-u",
            "Trace-ovi, metrike i logovi ka bilo kom servisu kompatibilnom sa OTLP-om",
          ],
        },
        {
          title: "Prilagodite kod svojim pozivima",
          body: "Dobijate isti TypeScript monorepo na kome radi LobbyStack Cloud. Menjajte uputstva recepcionera u packages/agent-core ili dodajte alat koji ga povezuje sa softverom koji Vaš tim već koristi.",
          points: [
            "Čet i embeddingi ka bilo kom endpointu kompatibilnom sa OpenAI-jem",
            "Glasovni pozivi na OpenAI GPT-Live sa Vašim ključem",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je samostalno hostovan AI recepcioner?",
          answer:
            "Samostalno hostovan AI recepcioner radi na serveru koji Vi kontrolišete, a ne kod dobavljača. I dalje odgovara na Vaše pozive, zakazuje termine i prima poruke, ali kontrolna tabla, baza podataka i snimci ostaju na Vašoj mašini. LobbyStack je otvorenog koda pod MIT licencom, pa ga možete sami instalirati.",
        },
        {
          question: "Da li je LobbyStack otvorenog koda?",
          answer:
            "Da. LobbyStack koristi MIT licencu. Kod možete čitati, forkovati, menjati, deliti i postavljati. Uz kopije ili značajne delove softvera zadržite obaveštenje o autorskim pravima i dozvoli.",
        },
        {
          question: "Šta mi treba za samostalno hostovanje?",
          answer:
            "Vodič za Docker Compose traži Docker Engine 24 ili noviji sa Compose v2, Node.js 22 ili noviji za generisanje tajnih ključeva i server sa najmanje 2 vCPU, 4 GB RAM-a i trajnim diskom. Za pozive uživo potrebni su i domen sa HTTPS-om za kontrolnu tablu i Vaši Twilio i OpenAI nalozi. Za telefonske pozive treba Vam i Twilio Elastic SIP trunk. Railway šablon umesto Vas postavlja servise i baze podataka.",
        },
        {
          question: "Mogu li da koristim svoj LLM ili API ključ?",
          answer:
            "Da. Samostalna instalacija radi sa Vašim sopstvenim ključevima. Čet na sajtu i embeddingi za znanje prihvataju bilo koji endpoint kompatibilan sa OpenAI-jem, pa ih možete usmeriti ka drugom provajderu ili modelu koji sami hostujete, ako podržava pozive alata i ako model za embeddinge vraća 1536 dimenzija. Glasovni pozivi rade na OpenAI GPT-Live preko Vašeg OpenAI naloga.",
        },
        {
          question: "Koliko košta samostalno hostovanje?",
          answer:
            "LobbyStack ne naplaćuje licencu za samostalno hostovanje. Plaćate hosting provajdera, Twilio za brojeve i minute poziva i OpenAI za pozive, svakog preko sopstvenog naloga. Pre poređenja sa Cloud paketom uračunajte sate koje će Vaš tim provesti na ažuriranjima, rezervnim kopijama i nadzoru.",
        },
        {
          question: "Kako funkcionišu ažuriranja?",
          answer:
            "Napravite rezervnu kopiju PostgreSQL baze i skladišta, preuzmite novo izdanje sa GitHub-a, pregledajte njegove migracije i nove promenljive, pa ponovo izgradite i pokrenite servise. Migrator primenjuje izmene baze pre nego što se pokrenu kontrolna tabla i worker. Zaključajte verziju koju ste testirali umesto da postavljate svaku novu izmenu.",
        },
        {
          question: "Šta je sa privatnošću podataka i usklađenošću?",
          answer:
            "Samostalno hostovanje stavlja aplikaciju i poslovne podatke koje ona čuva na infrastrukturu koju Vi kontrolišete. Twilio, OpenAI, Vaš hosting provajder i svaka integracija koju povežete i dalje obrađuju delove svakog poziva. Proverite kako svaki od njih postupa sa podacima i sprovedite sopstvenu procenu privatnosti i usklađenosti.",
        },
        {
          question: "Može li agencija da hostuje LobbyStack za svoje klijente?",
          answer:
            "Da. MIT licenca dozvoljava agencijama da menjaju i distribuiraju LobbyStack za rad sa klijentima, a partnerske white-label funkcije rade i na samostalnoj instalaciji. Naziv LobbyStack, logotipi i brending podležu posebnim pravima na žig.",
        },
        {
          question: "Da li pružate podršku za samostalne instalacije?",
          answer:
            "Da. Zajednica pomaže besplatno na Discordu i u GitHub issue-ima. Za pomoć našeg tima kupite paket Premium podrška ili Enterprise podrška. Oba paketa dodaju podršku putem imejla sa ciljanim vremenom odgovora, kao i pomoć pri postavljanju i nadogradnji Vaše instalacije. Enterprise Vam daje i privatni Slack kanal i dodeljenog inženjera. Stranica sa cenama za samostalno hostovanje navodi cene i šta svaki paket obuhvata.",
        },
      ],
      faqHeading: "Pitanja o samostalno hostovanim AI recepcionerima",
      relatedLinks: [
        {
          label: "AI recepcioner otvorenog koda",
          href: "/solutions/open-source-ai-receptionist/",
        },
        {
          label: "Vodič za samostalno hostovanje",
          href: "https://docs.lobbystack.com/self-hosting/overview",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        pricingLink,
        { label: "Cene za samostalno hostovanje", href: "/pricing/self-hosted/" },
        whiteLabelLink,
      ],
      ctaHeading: "Pokrenite LobbyStack na svom serveru",
      ctaBody:
        "Vodič za samostalno hostovanje navodi servise, naloge kod provajdera i rezervne kopije o kojima ćete brinuti. Vodič za Docker Compose Vas vodi kroz instalaciju na jednom serveru.",
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
        "LobbyStack je AI telefonska služba za vodoinstalatere. Pozivaocu čita Vaše korake za zatvaranje vode, a puklu cev preusmerava dežurnom majstoru.",
      eyebrow: "Vodoinstalateri",
      h1: "Telefonska služba za vodoinstalatere koja se javlja kada cev pukne u ponoć",
      intro:
        "Pozivaocu kome voda curi kroz plafon treba glavni ventil i vodoinstalater na putu. LobbyStack mu čita Vaše korake za zatvaranje vode, uzima adresu i preusmerava poziv dežurnom vodoinstalateru, a odgušenja i bojlere zakazuje u Vaš kalendar.",
      imageAlt:
        "Poziv zbog pukle cevi koji LobbyStack preusmerava dežurnom vodoinstalateru",
      proofPoints: [
        "Čita Vaše korake za zatvaranje vode pozivaocu kome curi voda",
        "Pukle cevi i izlivanje kanalizacije preusmerava dežurnom vodoinstalateru",
        "Navodi cene odgušenja i izlaska koje unesete",
      ],
      sections: [
        {
          title:
            "Pozivalac sa hitnim curenjem čuje Vaše korake za zatvaranje vode",
          body: "U bazu znanja upišite gde je glavni ventil, kada treba isključiti bojler i šta raditi ako se oseti miris gasa. LobbyStack te korake čita pozivaocu, uzima adresu i preusmerava poziv na Vaš dežurni broj.",
          points: [
            "Pita da li voda još curi i da li je čista ili iz kanalizacije",
            "Slavinu koja kaplje zakazuje u prvi slobodan termin",
            "Obavite probni poziv da čujete kako koraci zvuče",
          ],
        },
        {
          title: "Zakazuje odgušenja dok ste ispod sudopere",
          body: "LobbyStack nudi slobodne termine iz Vašeg Google Calendar-a, zakazuje onaj koji pozivalac izabere i šalje mu SMS potvrdu ako pristane. Za zamenu bojlera ili instalacija zakazuje izlazak na procenu umesto da nagađa cenu.",
          points: [
            "Zakazuje u Google Calendar dok je pozivalac na vezi",
            "Ako želite sami da odobrite posao, beleži željeni termin kao zahtev",
          ],
        },
        {
          title:
            "Telefonska služba za vodoinstalatere koja odgovara na pitanje o ceni",
          body: "Upišite početnu cenu odgušenja, cenu izlaska i doplatu za intervenciju van radnog vremena. LobbyStack navodi samo cene koje ste uneli, kao tačan iznos, početnu cenu ili raspon.",
          points: [
            "Za uslugu bez upisane cene zakazuje izlazak na procenu",
            "Iste cene navodi i u četu na Vašem sajtu",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta radi telefonska služba za vodoinstalatere?",
          answer:
            "Javlja se na pozive koje ne stignete da primite i po Vašim pravilima odlučuje šta dalje. LobbyStack pukle cevi i izlivanje kanalizacije preusmerava dežurnom vodoinstalateru, odgušenja i bojlere zakazuje u Google Calendar, a za svaki poziv čuva rezime, transkript i snimak.",
        },
        {
          question: "Može li pozivaocu da objasni kako da zatvori vodu?",
          answer:
            "Da. Dodajte korake za zatvaranje vode u bazu znanja i LobbyStack će ih pročitati pozivaocu koji prijavi curenje. Zatim preusmerava poziv ili zakazuje izlazak, po Vašim pravilima. Obavite probni poziv da čujete kako zvuči.",
        },
        {
          question: "Šta se dešava ako pozivalac oseti miris gasa?",
          answer:
            "Pozivalac čuje pravilo koje Vi napišete. Uobičajeno je da napusti objekat i pozove hitnu službu distributera gasa. LobbyStack čita taj scenario, a zatim preusmerava poziv ili prima poruku, po Vašim pravilima.",
        },
        {
          question: "Može li da navede cenu odgušenja ili izlaska?",
          answer:
            "Da, ako mu date iznose. LobbyStack navodi tačnu cenu, početnu cenu ili raspon. Vi birate koje usluge dobijaju cenu, a za koje, kao što su zamena bojlera i instalacija, zakazuje izlazak na procenu.",
        },
        {
          question: "Šta ako se dežurni vodoinstalater ne javi?",
          answer:
            "Pozivalac dobija govornu poštu tog telefona, ako je ima. LobbyStack predaje poziv Vašem dežurnom broju i izlazi iz razgovora čim telefon zazvoni. Ako preusmeravanje ne uspe, kaže to pozivaocu i nudi da primi poruku, a Vaš tim može da dobije obaveštenje „Preusmeravanje poziva nije uspelo“.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Podesite kod operatera da se Vaš postojeći broj prosleđuje na LobbyStack, za sve pozive ili samo za propuštene i one van radnog vremena.",
        },
        {
          question:
            "Po čemu se razlikuje od službe sa živim operaterima?",
          answer:
            "LobbyStack zakazuje posao tokom poziva, a operater u klasičnoj službi obično čita Vaš scenario i prima poruku. LobbyStack navodi i cene koje unesete. Neobične pozive čovek bolje rešava, pa ih LobbyStack preusmerava Vašem timu ili prima poruku.",
        },
        {
          question: "Koliko košta telefonska služba za vodoinstalatere?",
          answer: tradePlansAnswer,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za vodoinstalatere",
      relatedLinks: [
        {
          label: "Uporedite usluge odgovaranja na pozive za vodoinstalatere",
          href: "/blog/best-plumbing-answering-services/",
        },
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
      ctaHeading: "Neka LobbyStack preuzme večerašnje dežurstvo",
      ctaBody:
        "Počnite na paketu Free, upišite korake za zatvaranje vode i prosledite liniju van radnog vremena kada probni pozivi prođu kako želite.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": serbianPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "AI recepcioner za grejanje i klimatizaciju | LobbyStack",
      description:
        "AI recepcioner za grejanje i klimatizaciju. Kvarove grejanja i klime preusmerava dežurnom tehničaru, a servise zakazuje tokom poziva. Od $30 mesečno.",
      eyebrow: "Grejanje i klimatizacija",
      h1: "AI recepcioner za grejanje i klimatizaciju za kotao koji stane noću",
      intro:
        "Kada kotao stane u ponoć, a niko se ne javi, porodica zove sledeću firmu sa spiska. LobbyStack takav poziv preusmerava Vašem dežurnom tehničaru po pravilima koja napišete, a redovne servise i procene za zamenu sistema zakazuje u Google Calendar dok je pozivalac na vezi.",
      imageAlt:
        "Hitan poziv zbog kvara grejanja preusmeren dežurnom tehničaru firme za grejanje i klimatizaciju",
      proofPoints: [
        "Kvarove grejanja i klime i miris gasa preusmerava dežurnom tehničaru",
        "Zakazuje servise i procene za zamenu sistema u Google Calendar",
        "Prelazi na jezik pozivaoca, a GPT-Live podržava više od 70 jezika",
      ],
      sections: [
        {
          title: "Javlja se na višak poziva tokom toplotnog talasa",
          body: "Telefoni utihnu u aprilu, a prve vrele nedelje u junu zvone ceo dan. Podesite kod operatera da se pozivi prosleđuju na LobbyStack kada je linija zauzeta ili se niko ne javi, ili prosledite sve. LobbyStack svakog pozivaoca pita za vrstu sistema, simptome i adresu, pa zakazuje prvi slobodan termin ili ostavlja poruku Vašoj kancelariji.",
          points: [
            "Vi birate kada operater prosleđuje: kad je zauzeto, kad se niko ne javi ili uvek",
            "Poruka stiže sa imenom pozivaoca, brojem za povratni poziv i hitnošću",
          ],
        },
        {
          title: "Hitan kvar grejanja zvoni dežurnom tehničaru",
          body: "Pravila hitnosti pišete običnim rečima, prema simptomima, temperaturi u kući i tome ko u njoj živi. Ako u januaru stane kotao, a u kući je beba, poziv ide dežurnom tehničaru. Ako je termostat podešen na hlađenje, pozivalac čuje korake za proveru koje ste odobrili. Za miris gasa ili alarm za ugljen-monoksid LobbyStack prvo čita Vaša bezbednosna uputstva, pa preusmerava poziv.",
          points: [
            "Pita koliko je stepeni u kući i ko u njoj živi",
            "Ako se tehničar ne javi, pozivalac dobija govornu poštu tog telefona",
            "Kada preusmeravanje ne uspe, nudi da primi poruku",
          ],
        },
        {
          title: "Zakazuje procenu za novi sistem dok kupac još zove",
          body: "Vlasnik kuće koji traži cenu novog sistema neće dugo čekati povratni poziv. LobbyStack pita za veličinu kuće, starost sistema i vrstu energenta, pa zakazuje izlazak na procenu u Google Calendar dok je pozivalac na vezi. Ako želite sami da odobrite svaku posetu, režim zahteva beleži termin koji pozivalac želi, a Vaš tim ga potvrđuje.",
          points: [
            "Izbegava termine koji su već zauzeti u Vašem kalendaru",
            "Pozivaocu koji pristane šalje SMS potvrdu i podsetnik 24 sata pre posete, na brojeve iz SAD i Kanade",
          ],
        },
        {
          title: "Razgovara sa pozivaocem na njegovom jeziku",
          body: "Svaki poziv počinje na Vašem podrazumevanom jeziku. Kada pozivalac zatraži drugi jezik ili progovori na njemu, LobbyStack prelazi na taj jezik i zadržava Vaša pravila hitnosti i zakazivanja. Radi na OpenAI GPT-Live modelu, koji podržava više od 70 jezika.",
          points: [
            "Podrazumevani jezik birate između 8, među kojima su srpski, engleski i španski",
            "Cene paketa iste su na svakom jeziku",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta radi AI recepcioner za grejanje i klimatizaciju?",
          answer:
            "Javlja se na pozive koje Vaša kancelarija propusti i po Vašim pravilima odlučuje šta dalje. LobbyStack pozive zbog kvara grejanja, klime ili mirisa gasa preusmerava dežurnom tehničaru, servise i procene zakazuje u Google Calendar, a za svaki poziv čuva rezime, transkript i snimak.",
        },
        {
          question:
            "Može li da se javlja samo kada je kancelarija preopterećena?",
          answer:
            "Da, preko prosleđivanja poziva kod Vašeg operatera. Prosleđujte pozive kada je linija zauzeta ili se niko ne javi, posle zatvaranja ili uvek. LobbyStack se javlja na sve što stigne na njegov broj, pa u sezoni možete da prosleđujete višak poziva, a noću sve.",
        },
        {
          question:
            "Kako odlučuje koji poziv zbog kvara grejanja ili klime je hitan?",
          answer:
            "Pravilo opisujete običnim jezikom, na primer: nema grejanja i u kući je ispod 55°F (oko 13°C), ili u kući živi starija osoba ili beba. LobbyStack postavlja pitanja potrebna za Vaše pravilo i odgovarajuće pozive preusmerava dežurnom tehničaru.",
        },
        {
          question: "Šta se dešava ako se dežurni tehničar ne javi?",
          answer:
            "Pozivalac dobija govornu poštu tog telefona, ako je ima. Recepcioner predaje poziv Vašem dežurnom broju bez najave tehničaru, a zatim izlazi iz poziva. Ako preusmeravanje ne uspe, recepcioner obavesti pozivaoca i ponudi da primi poruku, koja stiže u Vaše prijemno sanduče uz obaveštenje e-poštom. Vaš tim može da dobije i obaveštenje „Preusmeravanje poziva nije uspelo“. Ako Vaš paket ne pokriva još jedan pokušaj preusmeravanja, recepcioner umesto toga prima poruku.",
        },
        {
          question: "Koje podatke o sistemu može da prikupi?",
          answer:
            "Sve što traže Vaši tehničari: vrstu sistema, marku, približnu starost, vrstu energenta, očitavanje termostata i simptome koje pozivalac opisuje. LobbyStack čuva odgovore u transkriptu i snimku poziva. Kada recepcioner primi poruku, ona stiže u Vaše prijemno sanduče sa imenom pozivaoca, brojem za povratni poziv i hitnošću. Događaj u Google Calendar-u prikazuje samo uslugu i ime pozivaoca.",
        },
        {
          question: "Može li da navede cenu redovnog servisa ili dijagnostike?",
          answer:
            "Da, ako mu date iznose. LobbyStack navodi tačnu cenu, početnu cenu ili raspon. Za zamenu celog sistema zakazuje izlazak na procenu.",
        },
        {
          question:
            "Da li radi sa ServiceTitan-om, Housecall Pro-om ili Jobber-om?",
          answer:
            "Ne direktno. Google Calendar je jedini kalendar sa kojim se LobbyStack povezuje. Šalje potpisane webhook-ove kada se poziv završi, kada se termin zakaže, pomeri ili otkaže, kada primi poruku ili napravi kontakt, a ima i REST API sa ključevima ograničenih ovlašćenja. Zapier se povezuje preko oba. Ako firmu vodite u Jobber-u ili Housecall Pro-u, njihovi recepcioneri zakazuju poslove direktno u tom softveru, a LobbyStack to ne može.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Podesite kod operatera da se Vaš postojeći broj prosleđuje na LobbyStack, za sve pozive ili samo za višak poziva i pozive van radnog vremena. Ako želite da prenesete broj, javite se LobbyStack timu. LobbyStack broj možete jednom zameniti u Podešavanja > Broj telefona.",
        },
        {
          question:
            "Da li da izaberem AI recepcionera ili službu sa živim operaterima?",
          answer:
            "Ljudi bolje rešavaju neobične pozive. U MAP Communications-u, službi sa živim operaterima, agenti rade po spisku dežurnih koji im pošaljete i mogu da zakazuju termine. Njen paket Pay As You Go košta $49 mesečno plus $1.37 po minutu (provereno 9. oktobra 2026.). Dodatni minuti u LobbyStack-u koštaju $0.20 na paketu Starter i $0.18 na paketu Pro. LobbyStack ipak preusmerava samo na jedan broj. Izaberite službu uživo ako želite osobu na svakom pozivu ili spisak dežurnih koji se smenjuju.",
        },
        {
          question: "Mogu li da ga isprobam pre nego što prosledim liniju?",
          answer:
            "Da. Paket Free Vam daje 30 minuta razgovora mesečno i broj iz SAD ili Kanade besplatno 14 dana, bez kartice. Tokom tih 14 dana broj odgovara na prave pozive, a preusmeravanja idu samo na mobilni broj koji ste potvrdili. Izaberite Starter ili Pro da biste zadržali broj.",
        },
        {
          question: "Koliko košta AI recepcioner za grejanje i klimatizaciju?",
          answer:
            "Cene iz oktobra 2026: paket Free uključuje 30 minuta razgovora. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta, uz dodatne minute po $0.20 i $0.18. Uz godišnju naplatu Starter košta $288 godišnje, a Pro $960. Nijedan paket nema naknadu za aktivaciju, a pozivi kraći od 10 sekundi i pozivi koje recepcioner prekine kao neželjene ne računaju se u Vaše minute.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima za grejanje i klimatizaciju",
      relatedLinks: [
        {
          label:
            "Uporedite usluge odgovaranja na pozive za grejanje i klimatizaciju",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Javljanje van radnog vremena za izvođače",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Kalkulator prihoda od propuštenih poziva",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
        {
          label: "Majstori i servisi za dom",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
      ],
      ctaHeading: "Napišite pravilo za kvar grejanja pre prvih hladnih dana",
      ctaBody:
        "Počnite na paketu Free, isprobajte poziv zbog kvara grejanja i jedan za redovni servis, pa prosledite liniju za višak poziva.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": serbianPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "AI telefonska služba za električare | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za električare. Čita Vaša bezbednosna uputstva za varnice i dim i zakazuje procene za razvodne table i punjače.",
      eyebrow: "Električari",
      h1: "Telefonska služba za električare koja opasne pozive šalje dežurnom, a procene zakazuje",
      intro:
        "Jedan pozivalac oseća miris paljevine iz utičnice, a sledeći traži ponudu za punjač električnog vozila. LobbyStack prvom čita Vaš bezbednosni scenario i preusmerava ga dežurnom električaru, a drugom zakazuje izlazak na procenu.",
      imageAlt:
        "Poziv zbog opasnosti koji LobbyStack preusmerava dežurnom električaru",
      proofPoints: [
        "Čita Vaš bezbednosni scenario za varnice, dim i miris paljevine",
        "Opasne pozive preusmerava dežurnom električaru",
        "Zakazuje procene za razvodne table, punjače i agregate",
      ],
      sections: [
        {
          title: "Bezbednosna uputstva za hitne pozive, Vašim rečima",
          body: "Kada neko prijavi dim ili miris paljevine, LobbyStack čita uputstva koja ste napisali: isključite osigurač ako mu se bezbedno prilazi, izađite iz kuće i pozovite hitne službe ako ima vatre. Zatim pita za adresu i šta je pozivalac video, pa preusmerava poziv dežurnom električaru.",
          points: [
            "Obavite probni poziv da čujete kako scenario zvuči",
            "Svaki takav poziv ostaje na kontrolnoj tabli sa transkriptom i snimkom",
          ],
        },
        {
          title: "Pre izlaska proverava da li je nestanak struje na mreži",
          body: "Pozivalac bez struje možda ima izbačen glavni osigurač, a možda je ceo kraj bez struje. LobbyStack postavlja Vaša pitanja: da li komšije imaju struju i da li je elektrodistribucija objavila nestanak. Kvar na mreži upućuje elektrodistribuciji, a kvar u kućnoj instalaciji dobija termin.",
          points: [
            "Vi odlučujete koji odgovori vode do termina",
            "Odgovori pozivaoca ostaju uz poziv",
          ],
        },
        {
          title:
            "Telefonska služba za električare koja zakazuje procene za table i punjače",
          body: "Nove razvodne table, punjači za električna vozila i rezervni agregati su veći poslovi, a pozivaoci skupljaju više ponuda. LobbyStack beleži jačinu priključka, starost kuće, opremu koju pozivalac želi i da li je vlasnik kuće, pa zakazuje izlazak na procenu u Google Calendar.",
          points: [
            "Odgovori ostaju uz poziv, pa ih vidite pre izlaska",
            "Pozivaocu koji pristane šalje SMS potvrdu",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta telefonska služba za električare treba da obradi?",
          answer:
            "Dve vrste poziva: opasne situacije kojima trebaju bezbednosna uputstva i brzo preusmeravanje, i zahteve za procenu kojima trebaju prava pitanja. LobbyStack obe vrste obrađuje po pravilima koja napišete i zakazuje procene u Google Calendar tokom poziva.",
        },
        {
          question: "Šta kaže nekome ko prijavi varnice ili dim?",
          answer:
            "Čita bezbednosni scenario koji napišete, na primer da isključi osigurač ako mu se bezbedno prilazi, napusti kuću i pozove hitne službe ako ima vatre. Zatim preusmerava poziv dežurnom električaru.",
        },
        {
          question:
            "Može li da razlikuje nestanak struje na mreži od kvara u kući?",
          answer:
            "Da, uz pitanja koja biste i Vi postavili: da li komšije imaju struju, da li je elektrodistribucija objavila nestanak i da li je izbacio osigurač. Vi odlučujete koji odgovori vode do termina, a koji pozivaoca upućuju elektrodistribuciji.",
        },
        {
          question: "Šta pita o novim razvodnim tablama i punjačima?",
          answer:
            "Ono što izaberete. Električari često pitaju za jačinu priključka, starost kuće, punjač ili agregat koji pozivalac želi i da li je vlasnik kuće. LobbyStack odgovore čuva uz poziv.",
        },
        {
          question:
            "Po čemu se AI recepcioner razlikuje od virtuelnog recepcionera za električare?",
          answer:
            "Virtuelni recepcioner je obično osoba koja se sa udaljenosti javlja u dogovoreno radno vreme. LobbyStack se javlja kad god Vaš operater prosledi poziv, prati pravila koja napišete i preusmerava poziv dežurnom električaru kada je potreban čovek.",
        },
        {
          question: "Može li drugačije da usmerava poslovne i stambene pozive?",
          answer:
            "Delimično. LobbyStack može da pita da li je objekat poslovni ili stambeni, pa jednu vrstu poziva zakaže, a za drugu primi poruku. Preusmeravanja idu na jedan broj, pa poslovne pozive ne može da pošalje na posebnu liniju.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Podesite kod operatera da se Vaš postojeći broj prosleđuje na LobbyStack, za sve pozive ili samo za propuštene i one van radnog vremena.",
        },
        {
          question: "Koliko košta telefonska služba za električare?",
          answer: `${tradePlansAnswer} Pozivi za procene traju duže zbog dodatnih pitanja, pa pogledajte potrošnju za mesec dana pre nego što izaberete paket.`,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za električare",
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
      ctaHeading: "Neka sledeću procenu za tablu zakaže LobbyStack dok ste na poslu",
      ctaBody:
        "Na paketu Free napišite bezbednosni scenario i pitanja za procene, pa prosledite liniju.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "AI recepcioner za popravku garažnih vrata | LobbyStack",
    description:
      "AI recepcioner za popravku garažnih vrata. LobbyStack zakazuje popravku puknute opruge, a vrata koja noću ne mogu da se zatvore šalje dežurnom tehničaru.",
    eyebrow: "Popravka garažnih vrata",
    h1: "AI recepcioner za popravku garažnih vrata koji zakazuje popravku puknute opruge",
    intro:
      "Vlasnik kuće čuje prasak, a automobil ostaje zarobljen u garaži. LobbyStack mu kaže da ne podiže vrata rukom, uzima adresu i veličinu vrata i zakazuje prvi slobodan termin, a vrata koja noću ne mogu da se zatvore preusmerava Vašem dežurnom tehničaru.",
    imageAlt:
      "Poziv zbog puknute opruge koji LobbyStack zakazuje u prvi slobodan termin",
    proofPoints: [
      "Zakazuje popravke za isti dan u Google Calendar",
      "Čita Vaša bezbednosna uputstva za puknute opruge i sajle",
      "Vrata koja noću ostanu otvorena preusmerava dežurnom tehničaru",
    ],
    sections: [
      {
        title: "Vrata koja noću ne mogu da se zatvore idu dežurnom tehničaru",
        body: "Otvorena garaža noću ostavlja kuću nezaštićenom. LobbyStack pita šta se desilo i da li su vrata otvorena ili zatvorena, pa preusmerava poziv po Vašim pravilima. Automobil zarobljen u garaži može da dobije prvi jutarnji termin.",
        points: [
          "Vi pišete koja stanja vrata su hitna",
          "Odgovori pozivaoca ostaju uz poziv na kontrolnoj tabli",
        ],
      },
      {
        title: "Zakazuje ponude za nova vrata i popravke motora",
        body: "LobbyStack pita za veličinu i vrstu vrata i marku motora, nudi Vaše slobodne termine i zakazuje izlazak dok je pozivalac na vezi. Pozivalac dobija SMS potvrdu ako pristane.",
        points: [
          "Tehničar vidi podatke o vratima pre izlaska",
          "Pita i za šifru kapije, ako je potrebna",
        ],
      },
      {
        title: "Vodi pozivaoca kroz uputstva koja odobrite",
        body: "Kada daljinski ne radi ili motor ne reaguje, LobbyStack čita korake za resetovanje koje ste napisali. Ako ne pomognu, zakazuje izlazak.",
        points: [
          "Čita samo korake koje ste odobrili",
          "Uputstva menjate u bazi znanja kad god želite",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI recepcioner za popravku garažnih vrata?",
        answer:
          "To je recepcioner koji se javlja na Vaše pozive dok ste na poslu ili ne radite. LobbyStack pita šta se desilo sa vratima, zakazuje popravke i procene u Google Calendar, a pozive koje Vaša pravila označe kao hitne, na primer vrata koja noću ne mogu da se zatvore, preusmerava dežurnom tehničaru.",
      },
      {
        question: "Šta kaže pozivaocu sa puknutom oprugom?",
        answer:
          "Ono što napišete u bezbednosnim uputstvima. Uobičajeno je da pozivaocu kaže da ne podiže vrata rukom, jer opruga nosi veći deo njihove težine. Zatim LobbyStack zakazuje popravku u prvi slobodan termin.",
      },
      {
        question: "Može li da prima pozive za garažna vrata van radnog vremena?",
        answer:
          "Da. LobbyStack i noću prati Vaša pravila. Automobil zarobljen u garaži može da dobije prvi jutarnji termin, a vrata koja ne mogu da se zatvore idu dežurnom tehničaru. Odgovori pozivaoca ostaju uz poziv na kontrolnoj tabli.",
      },
      {
        question: "Šta može da pita pozivaoce?",
        answer:
          "Ono što izaberete: šta se desilo, da li su vrata otvorena ili zatvorena, da li su za jedan ili dva automobila, marku motora i šifru kapije. LobbyStack odgovore čuva uz poziv.",
      },
      {
        question: "Mogu li da ga koristim samo za višak poziva?",
        answer:
          "Da. Podesite kod operatera da prosleđuje pozive kada je linija zauzeta ili se niko ne javi, a ostale pozive primajte sami. Van radnog vremena možete da prosleđujete sve pozive.",
      },
      callReviewFaq("opisom kvara"),
      {
        question: "Koliko košta za firmu za garažna vrata?",
        answer: tradePlansAnswer,
      },
    ],
    faqHeading: "Pitanja o AI recepcionerima za popravku garažnih vrata",
    ctaHeading: "Neka sledeću puknutu oprugu zakaže LobbyStack dok ste na merdevinama",
    ctaBody:
      "Na paketu Free upišite bezbednosna uputstva i radno vreme, obavite probni poziv, pa prosledite liniju.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "AI recepcioner za popravku kućnih aparata | LobbyStack",
    description:
      "AI recepcioner za popravku kućnih aparata. LobbyStack pita za marku, model i kvar, navodi cenu dijagnostike i zakazuje izlazak tokom poziva.",
    eyebrow: "Popravka kućnih aparata",
    h1: "AI recepcioner za popravku kućnih aparata koji zakazuje izlazak sa brojem modela",
    intro:
      "Serviser mora da zna marku, model i kvar pre nego što krene na teren. LobbyStack to pita, proverava da li servisirate tu marku, navodi Vašu cenu dijagnostike i zakazuje termin dok ste na drugoj popravci.",
    imageAlt:
      "Poziv za popravku frižidera koji LobbyStack zakazuje sa markom i modelom",
    proofPoints: [
      "Pita za aparat, marku, model i simptome",
      "Navodi cenu dijagnostike koju unesete",
      "Zakazuje izlazak u Google Calendar tokom poziva",
    ],
    sections: [
      {
        title: "Zakazuje servisni izlazak dok ste na drugoj popravci",
        body: "LobbyStack pita za aparat, marku, model i simptome, pa zakazuje termin u Vaš Google Calendar. Serviser čita odgovore u rezimeu poziva pre izlaska.",
        points: [
          "Može da pita i za šifru greške, starost aparata i garanciju",
          "Pozivaocu koji pristane šalje SMS potvrdu",
        ],
      },
      {
        title: "Odgovara na pitanja o markama i ceni dijagnostike",
        body: "Pozivaoci prvo pitaju da li popravljate njihovu marku i koliko košta dijagnostika. LobbyStack odgovara na osnovu maraka i cena koje unesete, pa pozivalac sa markom koju ne servisirate to čuje pre nego što iko zakaže izlazak.",
        points: [
          "Navodi tačnu cenu, početnu cenu ili raspon",
          "Kaže kako se cena dijagnostike računa u popravku, ako to upišete",
        ],
      },
      {
        title: "Veš mašina koja pušta vodu prati Vaše hitno pravilo",
        body: "Uobičajeno podešavanje čita pozivaocu Vaš savet za zatvaranje vode i zakazuje prvi slobodan termin. Ako dodate dežurni broj, LobbyStack preusmerava pozive koje Vaša pravila označe kao hitne.",
        points: [
          "Pozivalac čuje savet za zatvaranje vode pre zakazivanja",
          "Dežurni broj dodajete samo ako ga želite",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI recepcioner za popravku kućnih aparata?",
        answer:
          "To je recepcioner koji se javlja na pozive Vaše radnje dok su serviseri na popravkama. LobbyStack pita za aparat, marku, model i simptome, navodi cene koje unesete i zakazuje izlazak u Google Calendar tokom poziva.",
      },
      {
        question: "Može li da proveri koje marke servisiram?",
        answer:
          "Da. Upišite marke koje popravljate i LobbyStack kaže pozivaocu da li servisirate njegovu. Pozivalac sa drugom markom to čuje pre nego što iko zakaže izlazak.",
      },
      {
        question: "Može li da navede cenu dijagnostike?",
        answer:
          "Da, ako mu date iznos. LobbyStack navodi tačnu cenu, početnu cenu ili raspon i kaže kako se cena dijagnostike računa u popravku.",
      },
      {
        question: "Šta može da pita pozivaoce?",
        answer:
          "Ono što izaberete: vrstu aparata, marku, broj modela, simptome, šifru greške, starost, garanciju i da li aparat radi na struju ili gas. LobbyStack odgovore čuva uz poziv, pa ih serviser čita pre izlaska.",
      },
      {
        question: "Može li da obradi hitne pozive, kao što je veš mašina koja pušta vodu?",
        answer:
          "Da, po Vašim pravilima. Uobičajeno podešavanje čita pozivaocu Vaš savet za zatvaranje vode i zakazuje prvi slobodan termin. Ako dodate dežurni broj, LobbyStack preusmerava pozive koje pravila označe kao hitne.",
      },
      existingNumberFaq,
      {
        question: "Koliko košta za servis kućnih aparata?",
        answer: tradePlansAnswer,
      },
    ],
    faqHeading: "Pitanja o AI recepcionerima za popravku kućnih aparata",
    ctaHeading: "Neka LobbyStack zakazuje sutrašnje popravke dok ste na današnjoj",
    ctaBody:
      "Na paketu Free upišite marke koje servisirate i cenu dijagnostike, obavite probni poziv, pa prosledite liniju.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "AI recepcioner za sanaciju šteta od vode i požara | LobbyStack",
    description:
      "AI recepcioner za firme za sanaciju. Poplavu, izlivanje kanalizacije i požar šalje dežurnoj ekipi, beleži podatke o osiguranju i zakazuje preglede na buđ.",
    eyebrow: "Sanacija šteta",
    h1: "AI recepcioner za firme za sanaciju koji prima poziv zbog poplave u 1 ujutru",
    intro:
      "Voda posle oluje ulazi u podrum, a porodica je na spratu. LobbyStack čita Vaš bezbednosni scenario, pita odakle voda dolazi i da li će prijaviti štetu osiguranju, pa preusmerava poziv Vašoj dežurnoj ekipi. Stare mrlje i buđ dobijaju dnevni termin.",
    imageAlt:
      "Poziv zbog poplavljenog podruma koji LobbyStack preusmerava dežurnoj ekipi firme za sanaciju",
    proofPoints: [
      "Poplavu, kanalizaciju i štetu od požara preusmerava dežurnoj ekipi",
      "Uz svaki poziv čuva izvor vode, dubinu i podatke o osiguranju",
      "Zakazuje preglede na buđ i merenja vlage u Vaš kalendar",
    ],
    sections: [
      {
        title: "Zakazuje provere buđi i merenja vlage",
        body: "Pozivi zbog starih mrlja i mirisa buđi dobijaju dnevni termin. LobbyStack pita da li je skoro bilo curenja ili poplave i zakazuje proveru u Vaš Google Calendar.",
        points: [
          "Nudi slobodne termine i zakazuje onaj koji pozivalac izabere",
          "Pozivaocu koji pristane šalje SMS potvrdu",
        ],
      },
      {
        title: "Podaci o osiguranju ostaju uz poziv",
        body: "LobbyStack pita za osiguravajuću kuću i broj odštetnog zahteva, kada postoji, i odgovara na pitanja o naplati iz podataka koje unesete. Kada pozove procenitelj, prima poruku sa brojem zahteva i kontakt podacima.",
        points: [
          "Pita i da li pozivalac planira da prijavi štetu",
          "Broj zahteva vidite u rezimeu poziva",
        ],
      },
      {
        title: "Hitni pozivi zbog vode, kanalizacije i požara zvone na dežurni telefon",
        body: "Vi pišete pravilo hitnosti. LobbyStack čita bezbednosni scenario, pita odakle voda dolazi, da li još ulazi i koliko je duboka, pa preusmerava poziv na Vaš dežurni broj.",
        points: [
          "Ako se ekipa ne javi, pozivalac dobija govornu poštu tog telefona",
          "Kada preusmeravanje ne uspe, nudi da primi poruku",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta je AI recepcioner za firme za sanaciju šteta?",
        answer:
          "To je recepcioner koji se javlja na Vaše pozive dok je ekipa na terenu ili spava. LobbyStack poplavu, izlivanje kanalizacije i štetu od požara preusmerava dežurnoj ekipi, preglede na buđ i merenja vlage zakazuje u Google Calendar, a uz svaki poziv čuva izvor vode i podatke o osiguranju.",
      },
      {
        question: "Može li noću da prima pozive zbog štete od vode?",
        answer:
          "Da. Prosledite liniju van radnog vremena ili sve pozive. LobbyStack čita Vaš bezbednosni scenario, pita odakle voda dolazi i da li još ulazi, a dežurnu ekipu zove kada poziv odgovara Vašem pravilu hitnosti.",
      },
      {
        question: "Šta beleži za odštetne zahteve?",
        answer:
          "Ono što tražite. Firme za sanaciju često pitaju za osiguravajuću kuću, broj odštetnog zahteva, ako postoji, i da li pozivalac planira da prijavi štetu. Kada pozove procenitelj, LobbyStack prima poruku sa brojem zahteva i kontakt podacima.",
      },
      {
        question: "Da li zakazuje preglede na buđ i procene?",
        answer:
          "Da. LobbyStack pita za skorašnja curenja ili poplave, nudi Vaše slobodne termine i zakazuje pregled dok je pozivalac na vezi. Pozivaocu koji pristane šalje SMS potvrdu.",
      },
      {
        question: "Šta ako se dežurna ekipa ne javi?",
        answer:
          "Pozivalac dobija govornu poštu tog telefona, ako je ima. LobbyStack predaje poziv Vašem dežurnom broju i izlazi iz razgovora čim telefon zazvoni. Ako preusmeravanje ne uspe, nudi da primi poruku, a Vaš tim može da dobije obaveštenje „Preusmeravanje poziva nije uspelo“.",
      },
      callReviewFaq("opisom štete"),
      {
        question: "Koliko košta za firmu za sanaciju?",
        answer: tradePlansAnswer,
      },
    ],
    faqHeading: "Pitanja o AI recepcionerima za firme za sanaciju šteta",
    ctaHeading: "Neka sledeći poziv zbog poplave stigne do Vaše ekipe",
    ctaBody:
      "Na paketu Free napišite pravilo hitnosti i bezbednosni scenario, isprobajte poziv zbog poplave, pa prosledite liniju van radnog vremena.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "AI recepcioner za bravare | LobbyStack",
    description:
      "AI recepcioner za bravare. LobbyStack navodi Vašu cenu otvaranja, uzima podatke o automobilu i lokaciju i preusmerava poziv dežurnom bravaru.",
    eyebrow: "Bravari",
    h1: "AI recepcioner za bravare koji noćna zaključavanja šalje dežurnom bravaru",
    intro:
      "Vozač stoji na parkingu u 11 uveče, a ključevi su u automobilu. LobbyStack proverava da niko nije zaključan unutra, uzima podatke o automobilu i lokaciju, navodi Vašu cenu intervencije van radnog vremena i preusmerava poziv dežurnom bravaru.",
    imageAlt:
      "Poziv zbog zaključanog automobila koji LobbyStack preusmerava dežurnom bravaru",
    proofPoints: [
      "Navodi cenu otvaranja pre nego što preusmeri poziv",
      "Zaključane kuće i automobile preusmerava dežurnom bravaru",
      "Zakazuje zamenu uložaka, daljinske ključeve i ugradnju brava",
    ],
    sections: [
      {
        title: "Hitna otvaranja idu dežurnom bravaru",
        body: "Kada neko ne može da uđe u kuću ili automobil, ne ostavlja poruku. LobbyStack prvo pita da li je neko zaključan unutra, zatim uzima tačnu lokaciju i marku, model i godište automobila, pa preusmerava poziv na Vaš dežurni broj.",
        points: [
          "Za dete ili ljubimca zaključanog u automobilu čita Vaše pravilo, na primer da pozivalac pozove hitne službe",
          "Odgovori ostaju uz poziv na kontrolnoj tabli",
        ],
      },
      {
        title: "Zakazuje zamenu uložaka, daljinske ključeve i ugradnju brava",
        body: "Za ključeve automobila LobbyStack pita za marku, model i godište, a za ugradnju broj vrata. Zatim zakazuje dnevni izlazak u Vaš Google Calendar.",
        points: [
          "Nudi slobodne termine i zakazuje onaj koji pozivalac izabere",
          "Pozivaocu koji pristane šalje SMS potvrdu",
        ],
      },
      {
        title: "Odgovara na pitanje o ceni pre svega ostalog",
        body: "Pozivaoci prvo pitaju koliko košta otvaranje ili zamena uloška. LobbyStack navodi cene koje unesete i kaže koji dokument treba da pripreme.",
        points: [
          "Navodi tačnu cenu, početnu cenu ili raspon",
          "Traži ličnu kartu ili dokaz o vlasništvu, po Vašem pravilu",
        ],
      },
    ],
    faqs: [
      {
        question: "Šta radi AI recepcioner za bravare?",
        answer:
          "Javlja se na Vaše pozive dok ste na poslu ili ne radite. LobbyStack navodi Vašu cenu otvaranja, uzima podatke o automobilu ili adresu i preusmerava zaključavanja dežurnom bravaru. Zamenu uložaka, daljinske ključeve i ugradnje zakazuje u Google Calendar.",
      },
      {
        question: "Može li da navede moju cenu otvaranja?",
        answer:
          "Da, ako mu date iznos. LobbyStack navodi tačnu cenu, početnu cenu ili raspon i kaže pozivaocu koji dokument ili dokaz o vlasništvu treba da pripremi.",
      },
      {
        question: "Šta ako je dete ili ljubimac zaključan u automobilu?",
        answer:
          "Pozivalac čuje pravilo koje Vi napišete. Uobičajeno je da odmah pozove hitne službe, a LobbyStack zatim preusmerava poziv dežurnom bravaru. Pre svega ostalog pita da li je neko unutra.",
      },
      {
        question: "Šta pita pre nego što preusmeri poziv?",
        answer:
          "Ono što izaberete. Bravari često pitaju da li je neko zaključan unutra, za tačnu lokaciju i za marku, model i godište automobila. LobbyStack odgovore čuva uz poziv.",
      },
      {
        question: "Da li zakazuje dnevne poslove?",
        answer:
          "Da. LobbyStack nudi Vaše slobodne termine za zamenu uložaka, izradu ključeva i ugradnju brava, zakazuje onaj koji pozivalac izabere i šalje SMS potvrdu ako pristane.",
      },
      existingNumberFaq,
      {
        question: "Koliko košta AI recepcioner za bravare?",
        answer: tradePlansAnswer,
      },
    ],
    faqHeading: "Pitanja o AI recepcionerima za bravare",
    ctaHeading: "Pošaljite večerašnja zaključavanja dežurnom bravaru",
    ctaBody:
      "Na paketu Free upišite cenu otvaranja i pravila za dokumenta, isprobajte poziv zbog zaključavanja, pa prosledite liniju.",
  }),

  "/solutions/after-hours-answering-service-for-contractors/": serbianPage(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Služba za pozive van radnog vremena za izvođače | LobbyStack",
      description:
        "Telefonska služba za izvođače radova van radnog vremena. Povezuje klijente sa projektom, hitne slučajeve preusmerava dežurnom i zakazuje konsultacije.",
      eyebrow: "Izvođači van radnog vremena",
      h1: "Telefonska služba za izvođače radova za noći, vikende i curenja na gradilištu",
      intro:
        "Klijent usred renoviranja zove u 9 uveče jer ima vodu u kuhinji. LobbyStack mu kaže da zatvori glavni ventil, pita o kom projektu je reč i preusmerava poziv Vašem dežurnom rukovodiocu, a novim klijentima zakazuje konsultacije.",
      imageAlt:
        "Poziv zbog curenja na gradilištu koji LobbyStack preusmerava dežurnom rukovodiocu projekta",
      proofPoints: [
        "Povezuje postojeće klijente sa njihovim projektom",
        "Hitne slučajeve sa gradilišta preusmerava dežurnom rukovodiocu",
        "Zakazuje konsultacije za nove poslove u Vaš kalendar",
      ],
      sections: [
        {
          title: "Zakazuje konsultacije za nove projekte",
          body: "Novi klijent koji zove u 9 uveče čuje pitanja koja biste i Vi postavili, o obimu posla, budžetu i rokovima. LobbyStack zakazuje konsultacije u Vaš Google Calendar pre nego što pozove sledećeg izvođača.",
          points: [
            "Za ponudu beleži obim posla, lokaciju i kontakt",
            "Navodi samo cene koje mu date",
          ],
        },
        {
          title: "Pitanja klijenata čekaju jutro kao poruke",
          body: "LobbyStack pitanja postojećih klijenata o rasporedu i pozive podizvođača i dobavljača beleži kao poruke, sa imenom pozivaoca i onim što traži. Vaši rukovodioci ih čitaju ujutru umesto za večerom.",
          points: [
            "Robopozive i prodajne pozive može da prekine, a pozivi koje prekine kao neželjene ne troše minute",
            "Rezime svakog poziva čeka na kontrolnoj tabli",
          ],
        },
        {
          title: "Hitan slučaj na gradilištu zvoni dežurnom",
          body: "Pravilo hitnosti pišete običnim rečima, na primer aktivno curenje, bezbednosni rizik ili kvar grejanja zimi. LobbyStack pita da li pozivalac ima projekat sa Vama i koji, postavlja pitanja koja Vaše pravilo traži i odgovarajuće pozive preusmerava na dežurni broj.",
          points: [
            "Postojeći klijenti prolaze kroz Vaša pravila za projekte",
            "Ostali pozivi čekaju jutro u redu poruka",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je telefonska služba za izvođače radova?",
          answer:
            "To je služba koja se javlja na Vašu liniju kada ekipa ne radi ili je na drugom poslu. LobbyStack povezuje pozivaoce sa njihovim projektom, hitne slučajeve sa gradilišta preusmerava dežurnom rukovodiocu, zakazuje konsultacije za nove poslove, a sve ostalo čuva kao poruke za jutro.",
        },
        {
          question: "Kako odlučuje koji pozivi van radnog vremena su hitni?",
          answer:
            "Po pravilu koje napišete običnim rečima, na primer aktivno curenje, bezbednosni rizik ili kvar grejanja zimi. LobbyStack postavlja pitanja koja Vaše pravilo traži i odgovarajuće pozive preusmerava na dežurni broj. Ostali čekaju jutro.",
        },
        {
          question: "Može li da razlikuje postojeće klijente od novih?",
          answer:
            "Da. LobbyStack može da pita da li pozivalac ima projekat sa Vama i koji. Postojeći klijenti prolaze kroz Vaša pravila za projekte, a novi dobijaju pitanja o obimu posla, budžetu i rokovima.",
        },
        {
          question: "Može li da zakaže konsultacije za sledeći radni dan?",
          answer:
            "Da. LobbyStack nudi slobodne termine iz Vašeg Google Calendar-a i zakazuje konsultacije tokom poziva, pa su novi poslovi u rasporedu kada tim počne dan.",
        },
        {
          question: "Šta se dešava kada pozivalac van radnog vremena traži ponudu?",
          answer:
            "LobbyStack pita za obim posla, lokaciju i kontakt podatke, pa zakazuje izlazak na procenu ili prima poruku za Vašu kancelariju. Navodi samo cene koje mu date.",
        },
        {
          question: "Da li služba za pozive van radnog vremena filtrira neželjene pozive?",
          answer:
            "Da. LobbyStack može da prekine robopozive i prodajne pozive, a pozivi koje prekine kao neželjene ne računaju se u Vaše minute. Dežurni telefon zvoni samo za pozive koje Vaša pravila pošalju na njega.",
        },
        {
          question: "Koliko košta za izvođača radova?",
          answer: tradePlansAnswer,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za izvođače radova",
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
        {
          label:
            "Uporedite usluge odgovaranja na pozive za grejanje i klimatizaciju",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Uporedite usluge odgovaranja na pozive za izvođače radova",
          href: "/blog/best-answering-services-for-contractors/",
        },
        pricingLink,
      ],
      ctaHeading: "Pokrijte liniju van radnog vremena već ovog vikenda",
      ctaBody:
        "Na paketu Free napišite pravilo za hitne slučajeve na gradilištu, isprobajte poziv postojećeg i novog klijenta, pa prosledite liniju.",
      ...ctaLabels,
    }
  ),

  "/solutions/property-management-answering-service/": serbianPage(
    "/solutions/property-management-answering-service/",
    {
      title: "AI telefonska služba za upravljanje nekretninama | LobbyStack",
      description:
        "AI telefonska služba za upravljanje nekretninama. Hitne kvarove šalje dežurnom tehničaru, redovne beleži za jutro i zakazuje razgledanja stanova.",
      eyebrow: "Upravljanje nekretninama",
      h1: "Telefonska služba za upravljanje nekretninama i kvarove u 2 ujutru",
      intro:
        "Stanari zovu u 2 ujutru zbog curenja, zaključanih vrata ili hladnih radijatora, a zainteresovani zakupci u podne pitaju za ljubimce i parking. LobbyStack hitne slučajeve sa Vaše liste šalje dežurnom tehničaru, ostalo beleži za jutro i zakazuje razgledanja Vašem agentu za izdavanje.",
      imageAlt:
        "Poziv stanara zbog curenja koji LobbyStack preusmerava dežurnom tehničaru za održavanje",
      proofPoints: [
        "Hitne slučajeve sa Vaše liste preusmerava dežurnom tehničaru",
        "Redovne zahteve za popravke beleži za jutro",
        "Odgovara na pitanja o zakupu i zakazuje razgledanja",
      ],
      sections: [
        {
          title:
            "Razvrstajte pozive za održavanje po svojoj listi hitnih slučajeva",
          body: "Upišite listu koju već koristite, na primer poplava, nema grejanja zimi, miris gasa, zaključana vrata i zapušena kanalizacija. LobbyStack pita stanara za broj stana i šta vidi, hitne slučajeve preusmerava dežurnom tehničaru, a slavinu koja kaplje beleži za jutro.",
          points: [
            "Uz svaki zahtev beleži broj stana i broj za povratni poziv",
            "Redovni zahtevi čekaju jutro u redu poruka",
          ],
        },
        {
          title: "Zakazuje razgledanja za Vašeg agenta za izdavanje",
          body: "Kada neko želi da vidi stan, LobbyStack proverava Google Calendar Vašeg agenta, nudi slobodne termine i zakazuje razgledanje. Pozivaocu koji pristane šalje SMS potvrdu.",
          points: [
            "Agent vidi razgledanje u svom Google Calendar-u",
            "Na pitanja o stanu pre razgledanja odgovara iz Vaših podataka",
          ],
        },
        {
          title: "Odgovara na pitanja o kiriji i zakupu",
          body: "Upišite kiriju, depozit, pravila za ljubimce, parking i slobodne stanove. LobbyStack odgovara iz tih podataka, pa stanar koji u 11 uveče pita kada se plaća kirija ne budi Vašeg tehničara.",
          points: [
            "Za pitanje bez odgovora u Vašim podacima prima poruku za kancelariju",
            "Rezime i transkript svakog poziva čekaju na kontrolnoj tabli",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta radi telefonska služba za upravljanje nekretninama?",
          answer:
            "Javlja se na pozive stanara i zainteresovanih zakupaca kada kancelarija ne može. LobbyStack hitne slučajeve sa Vaše liste preusmerava dežurnom tehničaru, redovne popravke beleži za jutro, odgovara na pitanja o zakupu i zakazuje razgledanja.",
        },
        {
          question: "Može li da razlikuje hitan kvar od redovnog zahteva?",
          answer:
            "Da. Listu hitnih slučajeva zadajete običnim rečima, na primer poplava, nema grejanja ispod zadate temperature, miris gasa ili zaključana vrata. LobbyStack postavlja dodatna pitanja, odgovarajuće pozive preusmerava dežurnom tehničaru, a ostalo beleži za jutro.",
        },
        {
          question: "Može li da odgovara na pitanja o mojim nekretninama?",
          answer:
            "Da. U bazu znanja dodajte kiriju, depozit, pravila za ljubimce, parking i slobodne stanove. LobbyStack odgovara na osnovu tih podataka, a za pitanje na koje ne zna odgovor prima poruku.",
        },
        {
          question: "Može li da zakazuje razgledanja?",
          answer:
            "Da. LobbyStack proverava Google Calendar Vašeg agenta za izdavanje, nudi slobodne termine, zakazuje razgledanje i šalje SMS potvrdu ako zainteresovani pristane.",
        },
        {
          question: "Da li odgovara stanodavcima sa nekoliko stanova?",
          answer:
            "Da. Plaćate minute, pa mali portfolio može da ostane na paketu Starter. Uzmimo, kao primer, 60 poziva van radnog vremena mesečno po 3 minuta. To je 180 minuta: Starter za $30 pokriva 150, a preostalih 30 košta po $0.20, ukupno oko $36.",
        },
        {
          question: "Da li radi sa postojećim brojem kancelarije?",
          answer:
            "Da. Prosledite liniju kancelarije na LobbyStack van radnog vremena ili tokom celog dana, a stanari nastavljaju da zovu broj koji znaju.",
        },
        {
          question:
            "Koliko košta telefonska služba za upravljanje nekretninama?",
          answer: tradePlansAnswer,
        },
      ],
      faqHeading: "Pitanja o telefonskoj službi za upravljanje nekretninama",
      relatedLinks: [
        {
          label:
            "Uporedite usluge odgovaranja na pozive za upravljanje nekretninama",
          href: "/blog/best-property-management-answering-services/",
        },
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
      ctaHeading: "Neka dežurni telefon zvoni samo za prave hitne slučajeve",
      ctaBody:
        "Na paketu Free upišite listu hitnih slučajeva, isprobajte poziv zbog curenja i zahtev za razgledanje, pa prosledite liniju van radnog vremena.",
      ...ctaLabels,
    }
  ),

  "/solutions/roofing-answering-service/": serbianPage(
    "/solutions/roofing-answering-service/",
    {
      title: "AI telefonska služba za krovopokrivače | LobbyStack",
      description:
        "AI telefonska služba za krovopokrivače. Posle oluje zakazuje preglede pre dolaska procenitelja, odgovara o osiguranju i curenja šalje dežurnoj ekipi.",
      eyebrow: "Krovopokrivači",
      h1: "Telefonska služba za krovopokrivače za jutro posle grada",
      intro:
        "Posle oluje vlasnici kuća žele nekoga na krovu pre nego što dođe procenitelj osiguranja. LobbyStack proverava da li krov curi, pita za starost krova i odštetni zahtev i zakazuje pregled u Vaš kalendar, a aktivna curenja preusmerava dežurnoj ekipi.",
      imageAlt:
        "Poziv zbog štete od grada koji LobbyStack zakazuje u prvi slobodan termin za pregled krova",
      proofPoints: [
        "Zakazuje preglede posle oluje u Google Calendar",
        "Odgovara na pitanja o osiguranju i proceniteljima po Vašem scenariju",
        "Aktivna curenja preusmerava dežurnoj ekipi",
      ],
      sections: [
        {
          title:
            "Telefonska služba za krovopokrivače koja zakazuje preglede posle oluje",
          body: "Grad i vetar za nekoliko dana donesu pozive za više nedelja. LobbyStack uzima adresu, starost krova i štetu koju vlasnik vidi, pa zakazuje prvi slobodan pregled.",
          points: [
            "Kancelarija ujutru zatiče zakazane preglede u kalendaru",
            "Pozivaocu koji pristane šalje SMS potvrdu",
          ],
        },
        {
          title: "Odgovara na pitanja o osiguranju po Vašem scenariju",
          body: "Vlasnici pitaju da li radite sa njihovim osiguranjem, da li ćete se sastati sa proceniteljem i koliko košta pregled. Odgovore napišete jednom, a LobbyStack ih daje u svakom pozivu.",
          points: [
            "Za pitanje van scenarija prima poruku za povratni poziv",
            "Iste odgovore daje i u četu na Vašem sajtu",
          ],
        },
        {
          title: "Aktivno curenje ide dežurnoj ekipi",
          body: "Voda koja curi kroz plafon traži ceradu još večeras. Vi određujete šta je hitno, a LobbyStack pita za adresu i šta curi, pa takve pozive preusmerava dežurnoj ekipi. Nekoliko otpalih šindri bez curenja dobija termin za pregled.",
          points: [
            "Pita za adresu pre nego što preusmeri poziv",
            "Ako se ekipa ne javi, pozivalac dobija govornu poštu tog telefona",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta radi telefonska služba za krovopokrivače posle oluje?",
          answer:
            "Javlja se na pozive koje Vaš operater prosledi, pita za adresu, starost krova i štetu koju vlasnik vidi i zakazuje preglede u Vaše slobodne termine. Aktivna curenja idu dežurnoj ekipi, a za pitanja Vašoj kancelariji prima poruku.",
        },
        {
          question: "Šta radi kada krov aktivno curi?",
          answer:
            "Prati Vaša pravila. Uobičajeno podešavanje pita za adresu i šta curi, aktivna curenja preusmerava dežurnoj ekipi, a sve ostalo zakazuje za pregled.",
        },
        {
          question: "Može li da odgovara na pitanja o odštetnim zahtevima?",
          answer:
            "Da, iz odgovora koje napišete, na primer da li se sastajete sa proceniteljima i sa kojim osiguravajućim kućama radite. Za sve van scenarija LobbyStack prima poruku za povratni poziv.",
        },
        {
          question: "Da li navodi cene popravke ili zamene krova?",
          answer:
            "Zakazuje pregled ili izlazak na procenu. Vi odlučujete da li navodi cenu pregleda ili početnu cenu za uobičajene popravke.",
        },
        {
          question:
            "Po čemu se AI recepcioner za krovopokrivače razlikuje od službe sa živim operaterima?",
          answer:
            "LobbyStack zakazuje pregled u Vaš kalendar tokom poziva i odgovara na pitanja o osiguranju iz Vašeg scenarija, a operater obično primi poruku. Neobične pozive čovek bolje rešava, pa LobbyStack za sve van scenarija prima poruku.",
        },
        {
          question: "Da li radi sa mojim postojećim poslovnim brojem?",
          answer:
            "Da. Prosledite postojeći broj na LobbyStack ili mu šaljite samo propuštene pozive i one van radnog vremena.",
        },
        {
          question: "Koliko košta telefonska služba za krovopokrivače?",
          answer: `${tradePlansAnswer} Uzmimo, kao primer, a ne prognozu, mesec posle oluje sa 200 poziva po 4 minuta. To je 800 minuta, pa Pro iznosi $100 plus 300 dodatnih minuta po $0.18, ukupno $154.`,
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
      ctaHeading: "Podesite pozive za oluju pre sledećeg grada",
      ctaBody:
        "Na paketu Free napišite pravilo za curenja i odgovore o osiguranju, isprobajte poziv za pregled, pa prosledite liniju za višak poziva.",
      ...ctaLabels,
    }
  ),

  "/solutions/open-source-ai-receptionist/": serbianPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "AI recepcioner otvorenog koda pod MIT licencom | LobbyStack",
      description:
        "LobbyStack je AI recepcioner otvorenog koda pod MIT licencom. Pročitajte njegov kod, izmenite ga i hostujte na svom serveru ili na LobbyStack Cloud-u.",
      eyebrow: "Otvoren kod",
      h1: "AI recepcioner otvorenog koda koji možete proveriti, menjati i sami hostovati",
      intro:
        "Pre nego što AI počne da se javlja na Vaš telefon, želećete da znate šta govori pozivaocima i gde završavaju njihovi snimci. LobbyStack odgovara na pozive, zakazuje termine i prosleđuje pozivaoce Vašem timu, a ceo njegov kod je na GitHub-u pod MIT licencom da biste ga proverili.",
      imageAlt:
        "LobbyStack repozitorijum na GitHub-u pod MIT licencom",
      proofPoints: [
        "Ceo TypeScript kod na GitHub-u",
        "Hostujte ga sami ili na LobbyStack Cloud-u",
        "Samostalno hostovani pozivi idu preko Vaših Twilio i OpenAI naloga",
      ],
      sections: [
        {
          title: "Pročitajte kako obrađuje poziv",
          body: "Uputstva i alati recepcionera nalaze se u packages/agent-core. Otvorite ih na GitHub-u i videćete kako pronalazi slobodne termine, zakazuje, prima poruku i odlučuje da prosledi pozivaoca.",
          points: [
            "Koje podatke čuva o svakom pozivaocu",
            "Gde se čuvaju snimci i transkripti",
            "Svaka izmena, u javnoj Git istoriji",
          ],
        },
        {
          title: "Menjajte promptove i pravila",
          body: "Forkujte repozitorijum i izmenite pozdrav, uvodna pitanja ili pravila prosleđivanja. MIT licenca Vam dozvoljava da izmene zadržite za sebe ili ih podelite.",
          points: [
            "Dodajte alat koji pristupa Vašem softveru",
            "Postavite svoj fork kada prođe Vaše testove",
          ],
        },
        {
          title: "Pokrenite ga na svom serveru",
          body: "Docker Compose instalacija pokreće kontrolnu tablu, worker, PostgreSQL i Redis na jednoj mašini. Pozivi idu preko Vaših Twilio i OpenAI naloga, a snimci, transkripti i kontakti ostaju na Vašem serveru.",
          points: [
            "Docker Compose na jednom serveru ili Railway šablon",
            "Od 2 vCPU i 4 GB RAM-a",
            "Vi birate kada ćete nadograditi",
          ],
        },
        {
          title: "Ili neka ga LobbyStack hostuje",
          body: "LobbyStack Cloud pokreće isti otvoreni kod umesto Vas, sa minutima razgovora u svakom paketu. Počnite sa besplatnim paketom i isprobajte recepcionera u pregledaču pre nego što preusmerite broj.",
          points: [
            "Besplatan paket sa 30 minuta razgovora i probnim brojem na 14 dana",
            "Hosting, ažuriranja i rezervne kopije preuzima LobbyStack",
            "Starter za 30 USD mesečno sa 150 minuta",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI recepcioner otvorenog koda?",
          answer:
            "AI recepcioner otvorenog koda odgovara na pozive Vaše firme i objavljuje svoj kod, pa svako može da ga čita, menja i pokrene na svom serveru. LobbyStack je jedan od njih, pod MIT licencom. Odgovara na pitanja, zakazuje termine, prima poruke i prosleđuje pozivaoce osobi.",
        },
        {
          question: "Zašto je otvoren kod važan za AI recepcionera?",
          answer:
            "Vaš recepcioner razgovara sa Vašim klijentima i čuva njihova imena, brojeve i snimke. Kada je kod javan, Vi ili Vaš programer možete da proverite šta govori, šta čuva i gde idu podaci pre nego što mu pošaljete prave pozive. Ta provera je najvažnija ako radite po pravilima o privatnosti ili odgovarate na pozive za klijente.",
        },
        {
          question: "Mogu li sam da hostujem LobbyStack?",
          answer:
            "Da. Vodič za Docker Compose ga instalira na server sa 2 vCPU i 4 GB RAM-a, a Railway šablon umesto Vas postavlja servise i baze podataka. Koristite svoje Twilio i OpenAI naloge. Stranica o samostalno hostovanom AI recepcioneru opisuje instalaciju.",
        },
        {
          question: "Mogu li da menjam AI promptove i tokove poziva?",
          answer:
            "Da. Uputstva i alati su u workspace-u packages/agent-core. Izmenite pozdrav, uvodna pitanja, korake zakazivanja ili pravila prosleđivanja u svom forku, pa ga postavite. Na LobbyStack Cloud-u isto ponašanje menjate u AI podešavanjima i pravilima na kontrolnoj tabli.",
        },
        {
          question: "Da li otvoren kod znači manje podrške?",
          answer:
            "Ne. Na LobbyStack Cloud-u paket Starter uključuje podršku e-poštom, a Pro prioritetnu e-poštu. Ako sami hostujete, imate vodiče na docs.lobbystack.com i issue tracker na GitHub-u. Za pomoć našeg tima kupite paket Premium podrška ili Enterprise podrška.",
        },
        {
          question:
            "Da li su moji podaci o pozivima bezbedni u projektu otvorenog koda?",
          answer:
            "Vaši podaci o pozivima ostaju tamo gde pokrećete LobbyStack. Kada sami hostujete, snimci, transkripti i kontakti ostaju u Vašoj PostgreSQL bazi i skladištu, a Vi određujete rezervne kopije i rokove čuvanja. Twilio i OpenAI i dalje obrađuju zvuk poziva uživo preko Vaših naloga. Na LobbyStack Cloud-u te podatke čuva LobbyStack. U oba slučaja možete čitati kod i videti šta se čuva.",
        },
        {
          question: "Po čemu se razlikuje od AI recepcionera zatvorenog koda?",
          answer:
            "Dobavljač zatvorenog koda drži svoje promptove, usmeravanje i obradu podataka privatnim, pa možete menjati samo ono što njegova stranica sa podešavanjima dozvoljava. Uz LobbyStack možete da čitate ceo sistem, forkujete ga i menjate bilo koji njegov deo.",
        },
        {
          question: "Gde mogu da nađem izvorni kod?",
          answer:
            "Na GitHub-u, na adresi github.com/lobbystack/lobbystack. Možete ga čitati, otvarati issue-e i slati pull requestove. Fajl CONTRIBUTING.md u repozitorijumu objašnjava kako da pošaljete izmenu.",
        },
      ],
      faqHeading: "Pitanja o AI recepcionerima otvorenog koda",
      relatedLinks: [
        {
          label: "Samostalno hostovan AI recepcioner",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Kako je složen open-source sistem",
          href: "/blog/open-source-ai-receptionist-stack/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        pricingLink,
        whiteLabelLink,
      ],
      ctaHeading: "Pročitajte kod, pa izaberite gde će raditi",
      ctaBody:
        "Počnite od repozitorijuma na GitHub-u. Hostujte LobbyStack na svom serveru ili ga besplatno isprobajte na LobbyStack Cloud-u.",
      ctaPrimaryLabel: "Pogledajte kod na GitHub-u",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Pročitajte vodič za hostovanje",
      ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    }
  ),
}

export const serbianSeoPages: Record<string, SeoLandingPage> = {
  ...restoredSerbianSeoPages,
  ...bespokeSolutionPagesSr,
}
