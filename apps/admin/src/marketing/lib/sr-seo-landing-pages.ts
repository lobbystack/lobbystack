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
  answer: `Da. LobbyStack na kontrolnoj tabli čuva rezime, transkript i snimak svakog poziva, zajedno sa ${details}. Kada primi poruku, Vaš tim dobija obaveštenje e-poštom, ili SMS-om ako ga uključite.`,
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
          "Pozivaocu šalje potvrdu SMS-om i dodaje posetu u Vaš kalendar",
        ],
      },
      {
        title: intakeTitle,
        body: intakeBody,
        points: [
          "Postavlja Vaša uvodna pitanja u svakom pozivu",
          "Odgovore čuva u transkriptu poziva",
          "Čuva transkript i snimak na kontrolnoj tabli",
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
      "Vi određujete pravila za predaju poziva. LobbyStack može da preusmeri hitne pozive, važne potencijalne klijente, nezadovoljne kupce ili posebne slučajeve na broj koji izaberete, ili da primi poruku.",
  },
  {
    question: "Mogu li da počnem besplatno?",
    answer:
      "Da. Paket Free uključuje 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana, pa svog recepcionera možete da testirate na pravim pozivima pre prelaska na plaćeni paket.",
  },
]

const bespokeSolutionPagesSr: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title: "AI služba za odgovaranje na pozive za male firme | LobbyStack",
    description:
      "LobbyStack, AI služba za odgovaranje na pozive, javlja se na Vaše poslovne pozive, zakazuje termine u Google Calendar i preusmerava hitne pozive. Isprobajte besplatno.",
    eyebrow: "AI odgovaranje na pozive",
    h1: "AI služba za odgovaranje na pozive na koje Vi ne stižete da se javite",
    intro:
      "LobbyStack se javlja na Vaš poslovni broj kada ste na poslu, sa klijentom ili kada ste zatvorili za taj dan. Odgovara na pitanja na osnovu podataka koje mu date, zakazuje termine u Google Calendar i hitne pozive šalje na Vaš telefon.",
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
        title: "Šta naša AI služba za odgovaranje na pozive radi tokom poziva",
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
        title: "Kontrolna tabla čuva zapis svakog poziva",
        body: "Svaki poziv dobija rezime od jedne rečenice, transkript i snimak, pored imena i broja pozivaoca. Pre nego što uzvratite poziv, možete da pročitate šta je pozivaocu trebalo.",
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
          "Napravljena je za male firme: radnje koje vode vlasnici, majstore, klinike i salone kojima telefon zvoni dok su svi zauzeti. Paketi počinju besplatnim nivoom sa 30 minuta razgovora, zatim Starter za $30 mesečno sa 150 minuta ili Pro za $100 mesečno sa 500 minuta. Nijedan paket nema naknadu za aktivaciju.",
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
          "Vi birate kada preusmerava: za hitne pozive, kada pozivalac to zatraži, uvek, samo tokom radnog vremena ili nikada. Preusmerava na Vaš podrazumevani broj za preusmeravanje ili na zaposlenog kog pozivalac traži po imenu. Ako se niko ne javi, recepcioner to kaže pozivaocu i ponudi da primi poruku.",
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
    ctaHeading: "Neka LobbyStack preuzme Vaš sledeći poziv",
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
      "Kada neko pozove da zakaže, LobbyStack se javlja, nudi slobodne termine iz Vašeg Google Calendar-a, zakazuje onaj koji pozivalac izabere i šalje mu potvrdu SMS-om. Vaš tim posetu nalazi u kalendaru.",
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
        body: "Saznaje koja usluga treba pozivaocu, pronalazi termin dovoljno dug za nju i nudi nekoliko opcija. Pozivalac bira jednu, a termin se pojavljuje u Vašem kalendaru.",
        points: [
          "Ako pozivalac pristane, odmah mu šalje potvrdu SMS-om, a podsetnik 24 sata ranije",
          "Na LobbyStack Cloud-u SMS poruke stižu na američke i kanadske brojeve",
        ],
      },
      {
        title: "Pozivaoci sami pomeraju ili otkazuju termine",
        body: "Uključite izmene termina i pozivalac može da pronađe svoj termin, izabere novo vreme ili otkaže. Recepcioner potvrđuje izmenu pre nego što bilo šta promeni u Vašem kalendaru. Za dodatnu sigurnost, prvo tražite jednokratni kod poslat SMS-om ili PIN sa tastature telefona.",
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
          "Pozivaoce koji traže nekoga može da prebaci na telefon te osobe",
        ],
      },
      {
        title: "Šta proverava pre nego što ponudi termin",
        body: "Recepcioner nudi termin samo kada je slobodan prema svakoj od ovih stavki.",
        points: [
          "Usluga i njeno trajanje",
          "Vaše radno vreme i radno vreme svakog zaposlenog",
          "Zauzeto vreme u Vašem Google Calendar-u",
          "Odsustvo koje unesete za zaposlenog",
        ],
      },
      {
        title: "Za koje pozive služi LobbyStack AI zakazivanje termina",
        body: "LobbyStack zakazuje pozive koji stižu do Vas. Ne zove spiskove potencijalnih klijenata i ne prati hladne kontakte. Jedini odlazni pozivi koje upućuje su preusmeravanja.",
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
          "Ljudi koriste oba naziva. Ugovaranje sastanaka često znači odlazne pozive kojima se zakazuju prodajni sastanci. LobbyStack zakazuje termine za pozive koji stižu do Vas: zakazuje, pomera i otkazuje ih dok je pozivalac na vezi.",
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
      "AI recepcioner za kućne usluge koji se javlja dok Vaša ekipa radi. LobbyStack zakazuje poslove u Google Calendar i hitne slučajeve preusmerava na Vašeg dežurnog majstora.",
    eyebrow: "Kućne usluge",
    h1: "AI recepcioner za kućne usluge koji zakazuje poslove dok Vi radite",
    intro:
      "Ne možete da se javite ispod sudopere ili sa krova. LobbyStack se javlja, beleži adresu i problem, zakazuje posetu u Google Calendar i prave hitne slučajeve preusmerava na Vaš dežurni telefon.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "LobbyStack AI recepcioner za kućne usluge zakazuje posao iz telefonskog poziva",
    proofPoints: [
      "Javlja se dok je Vaša ekipa na poslu",
      "Hitne slučajeve preusmerava na Vaš dežurni telefon",
      "Zakazuje procene i servisne posete",
      "Prekida neželjene pozive, koji ne troše minute",
    ],
    sections: [
      {
        title:
          "Šta služba za odgovaranje na pozive za kućne usluge treba da uradi sa svakim pozivom",
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
          "Pravila za hitne slučajeve, sa problemima zbog kojih je opravdan poziv noću",
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
          "Kod službe sa živim operaterima osoba čita Vaš scenario i prima poruku. LobbyStack sam zakazuje posetu, preusmerava hitne slučajeve tokom poziva i čuva rezime, transkript i snimak svakog poziva. Plaćate minute koje potrošite, a poziv noću košta isto kao poziv u podne.",
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
    ctaHeading: "Javite se na sledeći poziv za posao dok ste na trenutnom",
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
      "Javlja se na Vaš telefon, zakazuje termine i prosleđuje poziv Vašem timu kada pozivaocu treba čovek. Kod je javan pod MIT licencom, pa možete da koristite LobbyStack Cloud ili da ga pokrenete na svom serveru.",
    imageAlt:
      "LobbyStack kod na GitHub-u, pokrenut na LobbyStack Cloud-u ili na Vašem serveru",
    proofPoints: [
      "Kod pod MIT licencom na GitHub-u",
      "Radi na LobbyStack Cloud-u ili na Vašem serveru",
      "Pozivi, termini, preusmeravanja i rezimei na jednoj kontrolnoj tabli",
    ],
    sections: [
      {
        title: "Zašto LobbyStack postoji",
        body: "Mala firma gubi pozivaoce kada telefon zazvoni usred šišanja, čišćenja zuba ili posla na drugom kraju grada. Govorna pošta ne zakazuje nikoga. Napravili smo LobbyStack da se javi na te pozive, zakaže šta može i ostatak Vam pošalje sa zapisanim detaljima.",
        points: [
          "Javlja se dok je Vaš tim zauzet, van radnog vremena ili na terenu",
          "Zakazuje u Google Calendar i potvrđuje termin SMS-om",
          "Prosleđuje hitne pozive, a za ostale prima poruku",
        ],
      },
      {
        title: "Zašto je kod otvoren",
        body: "Vaš recepcioner razgovara sa Vašim klijentima, čita Vaš kalendar i odlučuje kada da Vas probudi. Treba da možete da vidite kako donosi te odluke. Ceo proizvod je na GitHub-u pod MIT licencom, i svako može da ga čita, pokreće ili menja.",
        points: [
          "Sami pročitajte promptove, alate i obradu poziva",
          "Počnite na LobbyStack Cloud-u i kasnije pređite na svoj server",
          "Napravite kopiju projekta i prilagodite je svom načinu rada",
        ],
      },
      {
        title: "Za koga je LobbyStack",
        body: "Pravimo LobbyStack za vlasnike i male timove koji žive od dolaznih poziva: salone i spa centre, stomatološke ordinacije, vodoinstalatere i druge majstore, upravnike nekretnina. Agencije mogu i da ga prodaju svojim klijentima pod sopstvenim brendom.",
        points: [
          "Timovi koji propuštaju pozive tokom termina ili na terenu",
          "Firme koje žele zakazivanje telefonom bez pravljenja glasovnog menija",
          "Agencije koje žele da svojim klijentima ponude AI recepcionera",
        ],
      },
      {
        title: "Kako funkcionišu podrška i kontrola",
        body: "Na LobbyStack Cloud-u mi vodimo hostovanje, nadzor i ažuriranja. Na svom serveru Vi pokrećete isti kod. U oba slučaja Vi odlučujete šta recepcioner sme da kaže, zakaže i prosledi, kroz pravila napisana običnim jezikom.",
        points: [
          "Dodajte svoj sajt, dokumente, usluge i radno vreme kao njegovo znanje",
          "Pregledajte rezime, transkript i ishod svakog poziva na kontrolnoj tabli",
          "Pročitajte dokumentaciju ili pišite na support@lobbystack.com",
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
      "Počnite sa besplatnim paketom i 30 minuta razgovora ili prvo pročitajte kod na GitHub-u.",
  }),

  "/solutions/after-hours-answering-service/": serbianPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "AI služba za odgovaranje na pozive van radnog vremena | LobbyStack",
      description:
        "Služba za odgovaranje na pozive van radnog vremena koja redovne pozive zakazuje u Google Calendar, a hitne slučajeve preusmerava na Vaš dežurni telefon. Besplatan paket, zatim $30 mesečno.",
      eyebrow: "Javljanje van radnog vremena",
      h1: "AI služba za odgovaranje na pozive van radnog vremena, noću, vikendom i praznicima",
      intro:
        "Kada zatvorite, LobbyStack se javlja na Vaš poslovni broj. Redovne pozive zakazuje u Google Calendar, hitne slučajeve koje određuju Vaša pravila preusmerava na Vaš dežurni telefon i do jutra zapisuje svaki poziv.",
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
          title: "Ujutru Vas čeka zapis svakog noćnog poziva",
          body: "Svaki poziv dobija rezime od jedne rečenice, transkript i snimak na kontrolnoj tabli. Vidite ko je zvao i šta mu treba pre nego što uzvratite ijedan poziv.",
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
            "Na Vaš dežurni broj zvone samo pozivi koji odgovaraju Vašim pravilima za preusmeravanje. Vi birate kada preusmerava: za hitne pozive, kada pozivalac to zatraži, uvek, samo tokom radnog vremena ili nikada. Zahtevi za ponudu i redovne posete čekaju jutro.",
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
        "LobbyStack je AI recepcioner za stomatološke ordinacije koji se javlja kada je recepcija zauzeta ili zatvorena, zakazuje pacijente u Google Calendar i preusmerava hitne slučajeve. Od $30 mesečno.",
      eyebrow: "Stomatološke ordinacije",
      h1: "AI recepcioner za stomatološke ordinacije koji zakazuje pacijente dok je recepcija zauzeta",
      intro:
        "LobbyStack se javlja na telefon Vaše ordinacije tokom prijema pacijenata, za vreme pauze za ručak i posle zatvaranja. Nove pacijente i uklanjanje kamenca zakazuje u Google Calendar, odgovara na pitanja o osiguranju i parkingu na osnovu onoga što unesete i hitne stomatološke slučajeve preusmerava na Vaš dežurni broj. Plaćeni paketi počinju od $30 mesečno, bez naknade za aktivaciju.",
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
      ctaHeading: "Javite se pacijentima koji zovu za vreme pauze",
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
        "LobbyStack je AI recepcioner za salone i spa centre. Javlja se na pozive, zakazuje kod osobe koju klijent traži i odgovara iz Vašeg cenovnika usluga.",
      eyebrow: "Saloni i spa centri",
      h1: "AI recepcioner za salone koji zakazuje dok Vi radite",
      intro:
        "Usred farbanja ili masaže ne možete da se javite. LobbyStack se javlja, zakazuje kod osobe koju klijent traži, pomera termine po Vašim pravilima i odgovara iz Vašeg cenovnika usluga.",
      imageAlt:
        "Dan jedne frizerke u LobbyStack-u, sa balayage tretmanom zakazanim telefonom u slobodnom terminu",
      proofPoints: [
        "Zakazuje u Google Calendar prema trajanju usluge i radnom vremenu svakog frizera",
        "Šalje SMS potvrdu i podsetnik 24 sata ranije klijentima koji pristanu",
        "Otkazuje i pomera termine kada pronađe rezervaciju",
      ],
      sections: [
        {
          title: "Zakažite kod osobe koju klijent traži",
          body: "Dodajte svakog frizera, koloristu i masera sa uslugama koje radi i radnim vremenom. Klijent koji traži nekoga po imenu čuje slobodne termine te osobe. Ako je ta osoba odsutna, LobbyStack kaže kada se vraća i nudi nekoga ko je slobodan ranije.",
          points: [
            "Pronalazi termin dovoljno dug za uslugu, pa balayage od 150 minuta dobija 150 minuta",
            "Preskače slobodne dane i sate van rasporeda svake osobe",
            "Prebacuje poziv na telefon frizera kada klijent želi da razgovara s njim",
          ],
        },
        {
          title: "Pomerajte i otkazujte termine tokom poziva",
          body: "Klijentkinja zove da pomeri šišanje sa subote na četvrtak. LobbyStack pronalazi termin po njenom broju, imenu i vremenu termina, ponavlja joj izmenu i ažurira Vaš kalendar. Pre izmene možete da tražite i SMS kod ili PIN na tastaturi.",
          points: [
            "Objašnjava Vaša pravila otkazivanja pre nego što napravi izmenu",
            "Prosleđuje zahtev Vašem timu kada ne pronađe termin",
            "Šalje SMS potvrdu otkazivanja klijentima koji su pristali na poruke",
          ],
        },
        {
          title: "Telefonska služba za salone koja zna Vaš cenovnik",
          body: "Svakoj usluzi dodelite trajanje i cenu: fiksnu, početnu, raspon ili cenu koja se određuje na licu mesta. LobbyStack navodi cenu koju ste uneli i ne izmišlja cenu koju ste ostavili praznu. Dodajte i svoj sajt i pravila u PDF-u, pa može da odgovori o testu na alergiju, parkingu ili poklon-karticama.",
          points: [
            "Daje iste odgovore telefonom, u četu na Vašem sajtu i u Instagram porukama",
            "Prima poruku za Vaš tim kada Vaše beleške ne pokrivaju pitanje",
            "Navodi cene u valuti koju izaberete u podešavanjima",
          ],
        },
        {
          title: "Zakažite klijente koji zovu posle zatvaranja",
          body: "Mnogi klijenti se sete sledećeg termina u 21 čas. LobbyStack se tada javlja isto kao u podne i zakazuje u terminima koje ste otvorili. Sledećeg jutra na kontrolnoj tabli nalazite svaki poziv sa rezimeom, transkriptom i ishodom.",
          points: [
            "Obaveštenja imejlom ili SMS-om za pozive na koje Vaš tim treba da odgovori",
            "Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju u Vaše minute",
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
            "LobbyStack zakazuje u Google Calendar i ne povezuje se sa platformama za zakazivanje u salonima. Ako Vaš salon zakazuje u drugoj aplikaciji, podesite LobbyStack da prima zahteve: beleži uslugu, osobu i vreme koje klijent želi, a Vaš tim potvrđuje termin.",
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
            "Da. Usluge, ljude, radno vreme i pravila podešavate za svoju firmu, bilo da je to berbernica, spa centar, medicinski spa, salon za nokte ili masažni salon.",
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
            "Paket Free uključuje 30 minuta razgovora i besplatan broj telefona na 14 dana. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta. Neželjeni pozivi i pozivi kraći od 10 sekundi se ne računaju. Cene dodatnih minuta su na stranici sa cenama.",
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
        "Pokrenite LobbyStack, samostalno hostovan AI recepcioner otvorenog koda, na svom serveru uz Docker Compose ili Railway. Pozivi idu preko Vaših Twilio i OpenAI naloga.",
      eyebrow: "Samostalno hostovanje",
      h1: "Samostalno hostovan AI recepcioner koji radi na Vašem serveru",
      intro:
        "LobbyStack odgovara na Vaše pozive, zakazuje termine i prima poruke sa servera koji Vi kontrolišete. Pozivi idu preko Vaših Twilio i OpenAI naloga. Snimci, transkripti i kontakti ostaju u Vašoj PostgreSQL bazi.",
      imageAlt: "LobbyStack kao samostalno hostovan AI recepcioner na Vašem serveru",
      proofPoints: [
        "MIT licenca, bez naknade za licencu",
        "Docker Compose ili Railway šablon",
        "Vaši Twilio i OpenAI nalozi",
      ],
      sections: [
        {
          title: "Docker Compose na jednom serveru",
          body: "Zvanična instalacija pokreće kontrolnu tablu, worker, PostgreSQL, Redis i Caddy na jednoj mašini. Skripta popunjava svaku lozinku i tajni ključ, a migracije se izvršavaju pre nego što se aplikacija pokrene.",
          points: [
            "Docker Engine 24 ili noviji, sa Compose v2",
            "2 vCPU, 4 GB RAM-a i trajni disk",
            "Domen sa HTTPS-om za kontrolnu tablu",
          ],
        },
        {
          title: "Railway šablon",
          body: "Railway pravi servise, baze podataka i bucket za skladište, a zatim generiše tajne ključeve. Vi unesete svoj OpenAI ključ i Twilio podatke za prijavu, pa otvorite nalog na novoj kontrolnoj tabli.",
          points: [
            "Lozinke i tajne ključeve generiše Railway",
            "Probni pozivi u pregledaču čim se postavljanje završi",
            "E-pošta, telefonski pozivi i Google Calendar se podešavaju posle",
          ],
        },
        {
          title: "Zapisi o pozivima ostaju na Vašem serveru",
          body: "Snimci, transkripti, kontakti i podešavanja čuvaju se u PostgreSQL bazi i skladištu kojima Vi upravljate. Vi odlučujete koliko dugo ih čuvate i kako pravite rezervne kopije. Twilio i OpenAI i dalje obrađuju zvuk poziva uživo preko Vaših naloga, pa pročitajte njihove uslove za svoj slučaj.",
          points: [
            "Posebne uloge u bazi i bezbednost na nivou redova za svaki servis",
            "Snimci na lokalnom volumenu ili u bilo kom S3 kompatibilnom bucket-u",
            "Trace-ovi, metrike i logovi ka bilo kom servisu kompatibilnom sa OTLP-om",
          ],
        },
        {
          title: "Prilagodite kod svojim pozivima",
          body: "Dobijate TypeScript monorepo na kome radi LobbyStack Cloud. Menjajte uputstva i alate u packages/agent-core ili povežite recepcionera sa sistemima koje Vaš tim već koristi.",
          points: [
            "Čet i embeddingi ka bilo kom endpointu kompatibilnom sa OpenAI-jem",
            "Glasovni pozivi na OpenAI GPT-Live sa Vašim ključem",
            "Zaključajte verziju i nadogradite je kada je testirate",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je samostalno hostovan AI recepcioner?",
          answer:
            "To je AI recepcioner koji radi na serveru koji Vi kontrolišete, a ne kod dobavljača. I dalje odgovara na Vaše pozive, zakazuje termine i prima poruke, ali kontrolna tabla, baza podataka i snimci ostaju na Vašoj mašini. LobbyStack je otvorenog koda pod MIT licencom, pa ga možete sami instalirati.",
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
            "Uvek koristite sopstvene ključeve. Glasovni pozivi rade na OpenAI GPT-Live preko Vašeg OpenAI naloga. Čet na sajtu i embeddingi za znanje prihvataju bilo koji endpoint kompatibilan sa OpenAI-jem, pa ih možete usmeriti ka drugom provajderu ili modelu koji sami hostujete. Model mora da podržava pozive alata, a model za embeddinge mora da vraća 1536 dimenzija.",
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
            "Počnite od vodiča za samostalno hostovanje na docs.lobbystack.com i javnog issue trackera na GitHub-u. Enterprise paket pokriva samostalne instalacije uz posvećenu pomoć pri implementaciji. Za sve što ne pripada javnom issue-u pišite na support@lobbystack.com.",
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
        "LobbyStack je AI telefonska služba za vodoinstalatere. Može da objasni pozivaocima kako da zatvore vodu, navodi Vaše cene i pukle cevi prosleđuje dežurnom majstoru.",
      eyebrow: "Vodoinstalateri",
      h1: "Telefonska služba za vodoinstalatere koja rešava i ponoćnu puklu cev",
      intro:
        "Pozivaocu kome voda curi kroz plafon trebaju dve stvari: neko da mu kaže gde je glavni ventil i vodoinstalater na putu. LobbyStack može da prenese korake za zatvaranje vode koje napišete i preusmerava poziv dežurnom vodoinstalateru. Odgušenja i radove na bojlerima zakazuje u Vaš kalendar.",
      imageAlt:
        "Dijagram propuštenog vodoinstalaterskog poziva koji preko LobbyStack-a postaje zakazan termin",
      proofPoints: [
        "Može da prenese Vaša uputstva za zatvaranje vode pozivaocima sa aktivnim curenjem",
        "Navodi cene koje postavite za odgušenje, izlazak i intervencije van radnog vremena",
        "Pukle cevi i izlivanje kanalizacije prosleđuje dežurnom vodoinstalateru",
      ],
      sections: [
        {
          title:
            "Dajte uspaničenom pozivaocu nešto da uradi dok pomoć stiže",
          body: "U LobbyStack unosite svoja uputstva: gde je glavni ventil, kada isključiti bojler i šta raditi ako se oseti miris gasa. Asistent može da prenese te korake pozivaocu. Beleži adresu i preusmerava poziv na Vaš dežurni broj. Obavite probni poziv da čujete kako to radi.",
          points: [
            "Koristi bezbednosne korake koje odobrite",
            "Adresu i opis problema čuva u transkriptu, pa preusmerava poziv",
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
            "Da. Dodajte uputstva za zatvaranje vode u bazu znanja, i LobbyStack može da ih prenese kada pozivalac prijavi aktivno curenje. Poziv preusmerava ili zakazuje izlazak prema Vašim pravilima. Obavite probni poziv da čujete kako to radi.",
        },
        {
          question: "Šta se dešava ako pozivalac oseti miris gasa?",
          answer:
            "Vi pišete pravilo. Uobičajeno je da se pozivaocu kaže da napusti objekat i pozove dežurnu službu distributera gasa. LobbyStack može da prenese Vaš scenario pozivaocu, a poziv preusmerava ili prima poruku prema Vašim pravilima.",
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
      ctaHeading: "Pokrijte večerašnje dežurstvo",
      ctaBody:
        "Počnite na paketu Free, unesite uputstva za zatvaranje vode i preusmerite liniju van radnog vremena kada budete spremni.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": serbianPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "AI recepcioner za grejanje i klimatizaciju | LobbyStack",
      description:
        "AI recepcioner za grejanje i klimatizaciju od $30 mesečno, bez naknade za aktivaciju. Hitne pozive preusmerava dežurnom tehničaru i zakazuje servise.",
      eyebrow: "Grejanje i klimatizacija",
      h1: "AI recepcioner i telefonska služba za grejanje i klimatizaciju",
      intro:
        "AI recepcioner za grejanje i klimatizaciju javlja se na pozive koje Vaša kancelarija propusti. Kada ne radi grejanje ili klima, LobbyStack hitne pozive preusmerava dežurnom tehničaru prema pravilima koja napišete, a redovne servise i izlaske na procenu zakazuje u Google Calendar tokom poziva. Starter košta $30 mesečno za 150 minuta razgovora. Nijedan paket nema naknadu za aktivaciju.",
      imageAlt:
        "Hitan poziv zbog kvara grejanja preusmeren dežurnom tehničaru firme za grejanje i klimatizaciju",
      proofPoints: [
        "Javlja se na pozive koje Vaš operater prosledi: kada je zauzeto, kada se niko ne javi, van radnog vremena ili na sve",
        "Pozive zbog kvara grejanja, klime ili mirisa gasa preusmerava dežurnom tehničaru prema Vašim pravilima",
        "Pozivaocima odgovara na njihovom jeziku, na više od 70 jezika uz GPT-Live",
      ],
      sections: [
        {
          title: "Šta AI recepcioner radi tokom toplotnog talasa?",
          body: "Telefoni utihnu u aprilu, a zatim zvone bez prestanka prve vrele nedelje u junu, kada se sve klime u gradu pokvare u isto vreme. Recite operateru da prosleđuje pozive kada je linija zauzeta ili se niko ne javi, ili da prosleđuje sve pozive. LobbyStack se javlja na sve što stigne na njegov broj. Paketi ne ograničavaju koliko poziva prima istovremeno, a ti pozivi troše isti fond minuta. Svakog pozivaoca pita za vrstu sistema, simptome i adresu, a zatim zakazuje prvi slobodan termin ili prima poruku za Vašu kancelariju.",
          points: [
            "Javlja se na pozive koje šalje Vaše pravilo prosleđivanja: kada je zauzeto, kada se niko ne javi ili na sve",
            "Paketi ne ograničavaju koliko poziva prima istovremeno",
            "Zakazuje prvi slobodan termin ili Vašoj kancelariji ostavlja poruku sa podacima pozivaoca",
          ],
        },
        {
          title: "Kako razlikuje hitan kvar grejanja od pitanja o termostatu?",
          body: "Pravila hitnosti pišete običnim jezikom, prema simptomima, unutrašnjoj temperaturi i tome ko živi u kući. Ako se u januaru pokvari kotao, a u kući je beba, poziv ide dežurnom tehničaru. Ako je termostat podešen na hlađenje, pozivalac dobija brz odgovor iz koraka za otklanjanje kvara koje odobrite, kao što je provera osigurača ili filtera. Za miris gasa ili alarm za ugljen-monoksid Vi pišete bezbednosna uputstva, na primer da ukućani izađu iz kuće i pozovu hitnu liniju distributera gasa ili hitne službe. Recepcioner može da ih prenese pozivaocu pre nego što preusmeri poziv. Obavite probni poziv da čujete kako to radi. Preusmeravanje ide na jedan broj. Ako niste uneli broj za preusmeravanje, recepcioner prima poruku. Ako preusmeravanje ne uspe, recepcioner o tome obavesti pozivaoca i ponudi da primi poruku, a Vaš tim može da dobije obaveštenje „Preusmeravanje poziva nije uspelo“. Čim telefon Vašeg tehničara počne da zvoni, recepcioner izlazi iz poziva. Ako se tehničar ne javi, pozivalac dobija govornu poštu tog telefona, ako je ima.",
          points: [
            "Procenjuje hitnost prema simptomima, unutrašnjoj temperaturi i ukućanima",
            "Miris gasa i alarm za ugljen-monoksid tretira kao hitne slučajeve i odmah preusmerava poziv",
            "Nudi da primi poruku ako preusmeravanje ne uspe",
          ],
        },
        {
          title:
            "Može li da zakaže procenu za zamenu sistema pre nego što kupac ode drugome?",
          body: "Da. Vlasnik kuće koji traži cenu novog sistema sačekaće dan na Vaš povratni poziv. Posle dve nedelje glavne sezone Vaši povratni pozivi kasne duže od toga, pa on potpiše sa nekim drugim. LobbyStack pita za veličinu kuće, starost sistema i vrstu energenta, a zatim zakazuje izlazak na procenu prema Vašem radnom vremenu dok je pozivalac na vezi. Kada povežete Google Calendar, izbegava Vaše zauzete termine i dodaje posetu kao događaj. Ako pozivalac pristane, LobbyStack šalje SMS potvrdu i podsetnik 24 sata pre posete, samo na američke i kanadske brojeve. Ako želite sami da odobrite svaku posetu, uključite režim zahteva: recepcioner beleži termin koji pozivalac želi, a Vaš tim ga potvrđuje.",
          points: [
            "Beleži veličinu kuće, starost sistema i vrstu energenta",
            "Zakazuje izlaske na procenu u Google Calendar dok je pozivalac na vezi",
            "Šalje SMS potvrdu i podsetnik 24 sata unapred kada pozivalac pristane",
          ],
        },
        {
          title: "Koliko košta AI recepcioner za grejanje i klimatizaciju?",
          body: "Cene iz oktobra 2026: Starter košta $30 mesečno za 150 minuta razgovora, a Pro $100 mesečno za 500. Ako Vaš prosečan poziv traje 3 minuta (naša pretpostavka), Starter pokriva oko 50 poziva, a Pro oko 165. Uzmimo sada užurban jul sa 300 poziva, što je takođe naša pretpostavka. To je 900 minuta. Pro košta $100 plus 400 dodatnih minuta po $0.18, ukupno $172. Starter košta $30 plus 750 dodatnih minuta po $0.20, ukupno $180. Na 500 minuta oba paketa koštaju isto, a iznad toga je Pro jeftiniji. LobbyStack meri potrošnju u sekundama, pa poziv od 90 sekundi troši 1.5 minuta. Uz godišnju naplatu Starter košta $288 godišnje ($24 mesečno), a Pro $960 ($80 mesečno).",
          points: [
            "Nijedan paket nema naknadu za aktivaciju",
            "Pozivi kraći od 10 sekundi i pozivi koje recepcioner prekine kao neželjene ne računaju se u Vaše minute",
            "Vlasnici i administratori mogu da postave mesečno ograničenje prekoračenja u Podešavanja > Paket. Podrazumevano ga nema, a kada ga dostignete, novi pozivi dobijaju signal zauzeća",
          ],
        },
        {
          title:
            "Može li da razgovara sa pozivaocima na srpskom, španskom ili drugom jeziku?",
          body: "Da. Svaki poziv počinje na Vašem podrazumevanom jeziku: engleskom, francuskom, španskom, srpskom, nemačkom, brazilskom portugalskom, italijanskom ili holandskom. Ako pozivalac zatraži drugi jezik ili govori nekim drugim jezikom, recepcioner odgovara na tom jeziku. Radi na OpenAI GPT-Live modelu, koji podržava više od 70 jezika, uključujući srpski i španski. LobbyStack šalje SMS potvrde i podsetnike na Vašem podrazumevanom jeziku. Ako preko API-ja kontaktu sačuvate srpski ili španski kao jezik, taj kontakt ih dobija na tom jeziku. Stranica sa cenama ne navodi doplatu za jezike.",
          points: [
            "Počinje na jednom od 8 jezika po izboru, a zatim prati jezik pozivaoca",
            "Više od 70 jezika uz GPT-Live, uključujući srpski i španski",
            "Vaša pravila hitnosti i podešavanja zakazivanja ista su na svakom jeziku",
          ],
        },
        {
          title:
            "Da li radi sa ServiceTitan-om, Housecall Pro-om ili Jobber-om?",
          body: "Ne direktno. LobbyStack nema integraciju sa ServiceTitan-om, Housecall Pro-om ni Jobber-om, a Google Calendar je jedini kalendar sa kojim se povezuje. Šalje potpisane webhook-ove za šest događaja: završen poziv, zakazan termin, pomeren termin, otkazan termin, primljena poruka i kreiran kontakt. Ima i REST API sa ključevima ograničenih ovlašćenja, a Zapier se povezuje preko webhook-ova i API-ja. MCP server omogućava da Claude ili ChatGPT čitaju Vaše pozive i zakazuju termine. Ako firmu već vodite u Jobber-u ili Housecall Pro-u, njihovi ugrađeni recepcioneri zakazuju poslove direktno u tom softveru. LobbyStack to ne može. Jobber Receptionist košta $29 mesečno za 30 razgovora ($0.79 za svaki sledeći), uz Jobber paket. Housecall Pro prodaje CSR AI kao plaćeni dodatak bez objavljene cene. Oba smo proverili 9. oktobra 2026.",
          points: [
            "Zakazuje u Google Calendar",
            "Šalje podatke o pozivima i terminima preko webhook-ova i REST API-ja",
            "Povezuje Zapier preko webhook-ova i API-ja",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Može li da se javlja samo kada je kancelarija preopterećena?",
          answer:
            "Da, preko prosleđivanja poziva kod Vašeg operatera. Prosleđujte pozive kada je linija zauzeta ili se niko ne javi da pokrijete višak poziva, posle zatvaranja za pozive van radnog vremena, ili prosleđujte sve pozive. LobbyStack se javlja na sve što stigne na njegov broj. U sezoni, na primer, možete prosleđivati višak poziva, a noću sve pozive.",
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
            "Preusmeravanje je direktno: recepcioner prebacuje poziv na Vaš dežurni broj bez najave tehničaru, a zatim izlazi iz poziva. Ako se tehničar ne javi, pozivalac dobija govornu poštu tog telefona, ako je ima. Ako preusmeravanje ne uspe, recepcioner obavesti pozivaoca i ponudi da primi poruku, koja stiže u Vaše prijemno sanduče uz obaveštenje e-poštom. Vaš tim može da dobije i obaveštenje „Preusmeravanje poziva nije uspelo“. Ako Vaš paket ne pokriva još jedan pokušaj preusmeravanja, recepcioner umesto toga prima poruku.",
        },
        {
          question: "Koje podatke o sistemu može da prikupi?",
          answer:
            "Sve što traže Vaši tehničari: vrstu sistema, marku, približnu starost, vrstu energenta, očitavanje termostata i simptome koje pozivalac opisuje. LobbyStack čuva odgovore u transkriptu i snimku poziva. Kada recepcioner primi poruku, ona stiže u Vaše prijemno sanduče sa imenom pozivaoca, brojem za povratni poziv i hitnošću. Događaj u Google Calendar-u prikazuje samo uslugu i ime pozivaoca.",
        },
        {
          question: "Može li da navede cenu redovnog servisa ili dijagnostike?",
          answer:
            "Da, ako mu date cifre. LobbyStack može da navede tačnu cenu, početnu cenu ili raspon. Za zamenu celog sistema umesto toga zakazuje izlazak na procenu.",
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
          question:
            "Da li se AI recepcioner isplati firmi za grejanje i klimatizaciju?",
          answer:
            "Vredi ga isprobati ako Vaši pozivaoci u sezoni ili noću završavaju na govornoj pošti. Unesite propuštene pozive nedeljno i prosečnu vrednost posla u kalkulator prihoda od propuštenih poziva da procenite ugroženi prihod. Zatim isprobajte recepcionera na paketu Free pre nego što prosledite liniju.",
        },
        {
          question: "Mogu li da ga isprobam pre nego što prosledim liniju?",
          answer:
            "Da. Paket Free Vam daje 30 minuta razgovora mesečno i broj iz SAD ili Kanade besplatno 14 dana, bez kartice. Tokom tih 14 dana broj odgovara na prave pozive, a preusmeravanja idu samo na mobilni broj koji ste potvrdili. Izaberite Starter ili Pro da biste zadržali broj.",
        },
        {
          question: "Koliko košta za firmu za grejanje i klimatizaciju?",
          answer:
            "Cene iz oktobra 2026: paket Free uključuje 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana. Starter košta $30 mesečno za 150 minuta, a Pro $100 mesečno za 500 minuta, uz dodatne minute po $0.20 i $0.18. Nijedan paket nema naknadu za aktivaciju. Pozivi kraći od 10 sekundi i pozivi koje recepcioner prekine kao neželjene ne računaju se u potrošnju.",
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
      ctaHeading: "Spremite se za prve hladne dane",
      ctaBody:
        "Počnite na paketu Free, napišite pravila za kvarove grejanja i prosledite liniju za višak poziva kada budete spremni.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": serbianPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "AI telefonska služba za električare | LobbyStack",
      description:
        "LobbyStack je AI telefonska služba za električare. Može da prenese Vaša bezbednosna uputstva za varnice i miris paljevine, a zakazuje i procene za razvodne table, punjače i agregate.",
      eyebrow: "Električari",
      h1: "Telefonska služba za električare koja prepoznaje opasnost i zakazuje procene",
      intro:
        "Vaši pozivi su dve vrste. Jedan pozivalac ima utičnicu koja varniči i odmah mu trebaju bezbednosna uputstva. Sledeći želi novu razvodnu tablu, punjač za električno vozilo ili rezervni agregat i treba mu izlazak na procenu. LobbyStack obrađuje oba dok ste Vi na poslu.",
      imageAlt: "Dolazni poziv električaru pored tri člana tima",
      proofPoints: [
        "Može da prenese Vaš bezbednosni scenario za varnice, dim i miris paljevine",
        "Zakazuje procene za razvodne table, punjače za električna vozila i agregate",
        "Opasne situacije preusmerava dežurnom električaru",
      ],
      sections: [
        {
          title: "Napišite bezbednosna uputstva koja pozivaoci čuju",
          body: "Kada neko prijavi dim ili miris paljevine, LobbyStack može da prenese uputstva koja ste napisali: isključite osigurač ako je bezbedno prići, napustite kuću, pozovite hitne službe ako ima vatre. Pita za adresu i ono što je pozivalac video, pa poziv preusmerava dežurnom električaru. Obavite probni poziv da čujete kako to radi.",
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
            "Može da prenese bezbednosni scenario koji napišete, na primer da isključi osigurač ako je bezbedno prići, napusti kuću i pozove hitne službe ako ima vatre. Poziv preusmerava dežurnom električaru.",
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
            "Vi birate pitanja. Uobičajena su jačina priključka, starost kuće, punjač ili agregat koji pozivalac želi i da li je vlasnik kuće. LobbyStack odgovore čuva u transkriptu poziva.",
        },
        {
          question: "Može li drugačije da usmerava poslovne i stambene pozive?",
          answer:
            "Delimično. LobbyStack može da pita da li je objekat poslovni ili stambeni, pa jednu vrstu poziva zakaže, a za drugu primi poruku. Preusmeravanja idu na jedan broj, pa poslovne pozive ne može da pošalje na posebnu liniju.",
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
      "LobbyStack se javlja na pozive za garažna vrata dok menjate opruge, ugrađujete motore ili ne radite. Beleži detalje kvara, zakazuje termine i hitne slučajeve preusmerava na Vaš dežurni broj.",
    imageAlt:
      "LobbyStack se javlja na poziv za popravku garažnih vrata i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive za garažna vrata 24/7",
      "Beleži vrstu vrata, marku motora i simptome kvara",
      "Zaglavljena vrata i puknute opruge prosleđuje dežurnom tehničaru",
    ],
    emergencyTitle: "Ne propustite nijedan hitan poziv zbog zaglavljenih vrata",
    emergencyBody:
      "Kada vlasnik kuće zove jer mu je automobil zarobljen u garaži ili su vrata noću ostala otvorena, pomoć mu treba odmah. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom tehničaru.",
    emergencyTransferPoint:
      "Pita za vrstu vrata i bezbednost, pa preusmerava hitne pozive",
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
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi da je automobil zarobljen u garaži ili da su vrata noću ostala otvorena, preusmerava ga dežurnom tehničaru.",
      },
      {
        question: "Da li zakazuje termine dok sam na poslu?",
        answer:
          "Da. Dok menjate opruge ili ugrađujete motore, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta vrata, marka motora, simptomi kvara, dimenzije vrata, vrsta opruge i sve drugo što timu treba pre izlaska. LobbyStack odgovore čuva u transkriptu poziva.",
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
      "LobbyStack se javlja na hitne i redovne pozive za garažna vrata, zakazuje termine i zaglavljena vrata preusmerava dežurnom tehničaru.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "AI recepcioner za popravku kućnih aparata | LobbyStack",
    description:
      "LobbyStack se javlja na pozive za popravku aparata, beleži vrstu aparata, marku, model i simptome, a zatim zakazuje odgovarajući servisni izlazak.",
    eyebrow: "Popravka kućnih aparata",
    h1: "AI recepcioner za popravku kućnih aparata koji prima svaki poziv",
    intro:
      "LobbyStack se javlja na pozive dok dijagnostikujete mašinu za sudove ili menjate kompresor. Beleži marku i model, zakazuje termine i hitne slučajeve preusmerava na Vaš dežurni broj.",
    imageAlt:
      "LobbyStack se javlja na poziv za popravku aparata i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive za kućne aparate 24/7",
      "Beleži vrstu aparata, marku, broj modela i simptome",
      "Kvarove frižidera i poplave od mašina prosleđuje dežurnom tehničaru",
    ],
    emergencyTitle: "Ne propustite nijedan hitan kvar aparata",
    emergencyBody:
      "Kada vlasnik kuće zove jer mu je frižider prestao da radi ili mu veš mašina pušta vodu, neće čekati govornu poštu. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom tehničaru.",
    emergencyTransferPoint:
      "Pita za marku i model, pa preusmerava hitne pozive",
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
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi da je frižider prestao da radi ili da veš mašina pušta vodu, preusmerava ga dežurnom tehničaru.",
      },
      {
        question: "Da li zakazuje termine dok radim na popravci?",
        answer:
          "Da. Dok dijagnostikujete mašinu za sudove ili menjate kompresor, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta aparata, marka, broj modela, simptomi kvara, starost aparata i sve drugo što timu treba pre zakazivanja izlaska. LobbyStack odgovore čuva u transkriptu poziva.",
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
      "LobbyStack se javlja na hitne i redovne pozive za kućne aparate, zakazuje termine i hitne kvarove preusmerava dežurnom tehničaru.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "AI recepcioner za sanaciju šteta od vode i požara | LobbyStack",
    description:
      "LobbyStack proverava pozive zbog šteta od vode, požara i buđi, zakazuje procene za sanaciju i hitne zahteve prosleđuje Vašem dežurnom timu.",
    eyebrow: "Sanacija šteta",
    h1: "AI recepcioner za firme za sanaciju koji prima svaki hitan poziv",
    intro:
      "LobbyStack se javlja na pozive dok je Vaša ekipa na terenu ili ne radi. Beleži detalje štete, zakazuje procene i hitne slučajeve preusmerava na Vaš dežurni broj.",
    imageAlt: "LobbyStack se javlja na hitan poziv zbog štete i prosleđuje ga",
    proofPoints: [
      "Javlja se na hitne pozive zbog štete od vode i požara 24/7",
      "Beleži vrstu štete, pogođenu površinu, izvor vode i status osiguranja",
      "Hitne zahteve za sanaciju prosleđuje Vašem dežurnom timu",
    ],
    emergencyTitle: "Ne propustite nijedan hitan slučaj zbog vode ili požara",
    emergencyBody:
      "Kada vlasnik objekta zove u 3 ujutru zbog poplave ili štete od dima, sanacija mu treba odmah. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca Vašem dežurnom timu.",
    emergencyTransferPoint:
      "Pita za vrstu štete, površinu i izvor, pa preusmerava hitne pozive",
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
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac prijavi štetu od vode, dima ili buđ, preusmerava ga dežurnom timu. Redovni zahtevi za procenu idu na jutarnji pregled.",
      },
      {
        question: "Da li zakazuje procene dok je moj tim na terenu?",
        answer:
          "Da. Dok Vaša ekipa sanira štetu ili radi obnovu, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje procenu pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta štete, veličina pogođene površine, izvor vode, vremenski tok, status osiguranja i sve drugo što timu treba pre izlaska. LobbyStack odgovore čuva u transkriptu poziva.",
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
      "LobbyStack se javlja na hitne i redovne pozive za sanaciju, zakazuje procene i hitne zahteve preusmerava dežurnom timu.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "AI recepcioner za bravare | LobbyStack",
    description:
      "AI recepcioner za bravare koji se javlja na hitne pozive kada je neko zaključan napolju, zakazuje servisne termine i hitne pozive prosleđuje dežurnom bravaru.",
    eyebrow: "Bravari",
    h1: "AI recepcioner za bravare koji prima svaki hitan poziv",
    intro:
      "LobbyStack se javlja na pozive dok menjate uloške, ugrađujete okove ili ne radite. Beleži detalje, zakazuje termine i hitne slučajeve preusmerava na Vaš dežurni broj.",
    imageAlt: "LobbyStack se javlja na poziv za bravara i zakazuje izlazak",
    proofPoints: [
      "Javlja se na hitne i redovne pozive 24/7",
      "Beleži vrstu problema, lokaciju i podatke o vozilu ili objektu",
      "Hitne pozive prosleđuje Vašem dežurnom bravaru",
    ],
    emergencyTitle: "Ne propustite nijedan poziv nekoga ko je zaključan napolju",
    emergencyBody:
      "Kada neko ne može da uđe u kuću ili automobil, pomoć mu treba odmah. Neće ostaviti poruku i čekati. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnom bravaru.",
    emergencyTransferPoint:
      "Pita za lokaciju i vrstu problema, pa preusmerava hitne pozive",
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
          "Da. LobbyStack se javlja na pozive van radnog vremena i prati Vaša pravila eskalacije. Ako pozivalac ne može da uđe u kuću ili automobil, preusmerava ga dežurnom bravaru.",
      },
      {
        question: "Da li zakazuje termine dok sam na poslu?",
        answer:
          "Da. Dok menjate uloške ili ugrađujete okove, LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje pre nego što pozivalac spusti slušalicu.",
      },
      {
        question: "Koja uvodna pitanja može da postavi?",
        answer:
          "Vi birate pitanja: vrsta problema, lokacija, vrsta vozila ili objekta, stanje ključeva, hitnost i sve drugo što timu treba pre izlaska. LobbyStack odgovore čuva u transkriptu poziva.",
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
      "LobbyStack se javlja na hitne i redovne pozive za bravare, zakazuje termine i hitne slučajeve preusmerava na Vaš dežurni broj.",
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
        "LobbyStack se javlja na pozive noću, vikendom i praznicima. Prepoznaje hitne slučajeve, zakazuje termine za sledeći dan i hitne zahteve preusmerava na Vaš dežurni broj.",
      imageAlt:
        "LobbyStack obrađuje pozive izvođačima van radnog vremena i prosleđuje hitne slučajeve",
      proofPoints: [
        "Javlja se van radnog vremena i prepoznaje hitne slučajeve",
        "Zakazuje termine za sledeći dan direktno u Vaš kalendar",
        "Hitne pozive preusmerava na Vaš dežurni broj",
      ],
      sections: [
        {
          title: "Ne gubite hitne poslove na govornoj pošti",
          body: "Kada vlasnik kuće zove u 10 uveče sa hitnim problemom, neće ostaviti poruku. Pozvaće sledećeg izvođača sa spiska. LobbyStack se javlja na prvo zvono, prati Vaša pravila eskalacije i preusmerava pozivaoca dežurnoj osobi.",
          points: [
            "Razlikuje hitne pozive od redovnih zahteva za ponudu",
            "Beleži opis problema, lokaciju i kontakt podatke, pa preusmerava hitne pozive",
            "Redovne zahteve šalje na jutarnji pregled",
          ],
        },
        {
          title: "Automatski zakazujte termine za sledeći dan",
          body: "Pozivaoci van radnog vremena često žele da zakažu izlazak za sledeći radni dan. LobbyStack proverava Vaš kalendar, nudi slobodne termine i zakazuje. Vaš tim počinje dan sa poslovima koji su već u kalendaru.",
          points: [
            "Proverava slobodne termine za sledeći dan u realnom vremenu",
            "Zakazuje termine direktno u Vaš kalendar",
            "Pozivaocu šalje potvrdu SMS-om i dodaje posetu u Vaš kalendar",
          ],
        },
        {
          title: "Filtrirajte spam, neka Vas budi samo pravi poziv",
          body: "Nije svaki poziv van radnog vremena vredan prekidanja Vaše večeri. LobbyStack odbacuje automatske pozive, telemarketing i spam. Do dežurnog osoblja stižu samo pravi hitni slučajevi.",
          points: [
            "Automatski filtrira pozivaoce koji nisu ljudi",
            "Čuva rezime svakog poziva za jutarnji pregled",
            "Čuva Vaše slobodno vreme, a telefon ostaje pokriven",
          ],
        },
        {
          title: "Pratite svoj stvarni proces dežurstva",
          body: "Svaki izvođač drugačije definiše hitno. LobbyStack postavlja kvalifikaciona pitanja koja izaberete: aktivno curenje vode, bezbednosni rizik, kvar grejanja, rizik po konstrukciju. Vaš dežurni broj zvoni samo kada poziv odgovara Vašim pravilima.",
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
      ctaHeading: "Ne gubite više pozive van radnog vremena na govornoj pošti",
      ctaBody:
        "LobbyStack se javlja na pozive van radnog vremena, prepoznaje hitne slučajeve, zakazuje termine za sledeći dan i hitne poslove preusmerava na Vaš dežurni broj.",
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
        "Paketi ne ograničavaju koliko poziva posle oluje prima istovremeno",
        "Zakazuje preglede i procene u Vaš kalendar",
        "Aktivna curenja prosleđuje dežurnoj ekipi",
      ],
      sections: [
        {
          title: "Izdržite nedelju posle oluje",
          body: "Grad i vetar mogu za dva dana doneti pozive za ceo mesec. Paketi ne ograničavaju koliko poziva LobbyStack prima istovremeno, a novi pozivi dobijaju signal zauzeća samo ako postavite mesečno ograničenje prekoračenja i dostignete ga. LobbyStack beleži adresu, starost krova i štetu koju vlasnik vidi i zakazuje prvi slobodan termin za pregled. Vaša kancelarija počinje dan sa spiskom zakazanih pregleda.",
          points: [
            "Javlja se na istovremene pozive",
            "Beleži adresu, starost krova i vidljivu štetu",
            "Zakazuje preglede u slobodne termine",
          ],
        },
        {
          title: "Aktivna curenja šaljite ekipi",
          body: "Voda koja curi kroz plafon zahteva ceradu još večeras. Vi određujete šta je hitno, a LobbyStack pita za adresu i ono što vlasnik vidi, pa te pozive preusmerava dežurnoj ekipi. Nekoliko otpalih šindri bez curenja dobija termin za pregled.",
          points: [
            "Pita za adresu, pa aktivna curenja preusmerava Vašoj ekipi",
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
            "Da. Paketi ne ograničavaju koliko poziva LobbyStack prima istovremeno. Novi pozivi dobijaju signal zauzeća samo ako vlasnik ili administrator postavi mesečno ograničenje prekoračenja i Vi ga dostignete. Zakazuje preglede u Vaše slobodne termine, a ostalo stavlja u red za Vašu kancelariju.",
        },
        {
          question: "Šta radi kada krov aktivno curi?",
          answer:
            "Prati Vaša pravila. Uobičajeno podešavanje pita za adresu i šta curi, aktivna curenja preusmerava dežurnoj ekipi, a sve ostalo zakazuje za pregled.",
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
      title: "AI recepcioner otvorenog koda pod MIT licencom | LobbyStack",
      description:
        "LobbyStack je AI recepcioner otvorenog koda pod MIT licencom. Pročitajte kako obrađuje pozive, menjajte promptove i pravila i hostujte ga sami ili na LobbyStack Cloud-u.",
      eyebrow: "Otvoren kod",
      h1: "AI recepcioner otvorenog koda koji možete proveriti, menjati i sami hostovati",
      intro:
        "LobbyStack odgovara na Vaše pozive, zakazuje termine i prosleđuje pozivaoce Vašem timu. Ceo njegov kod je na GitHub-u pod MIT licencom, pa možete proveriti šta radi tokom poziva pre nego što mu poverite svoj broj telefona.",
      imageAlt:
        "LobbyStack repozitorijum na GitHub-u pod MIT licencom",
      proofPoints: [
        "MIT licenca i ceo kod na GitHub-u",
        "Hostujte ga sami ili na LobbyStack Cloud-u",
        "Samostalno hostovani pozivi idu preko Vaših Twilio i OpenAI naloga",
      ],
      sections: [
        {
          title: "Pročitajte kako obrađuje poziv",
          body: "Uputstva i alati recepcionera nalaze se u packages/agent-core. Otvorite ih na GitHub-u i videćete kako pronalazi slobodne termine, zakazuje, prima poruku i odlučuje da prosledi pozivaoca.",
          points: [
            "Uputstva i alati u packages/agent-core",
            "Kod koji radi na LobbyStack Cloud-u",
            "Svaka izmena u javnoj Git istoriji",
          ],
        },
        {
          title: "Menjajte promptove i pravila",
          body: "Forkujte repozitorijum i izmenite pozdrav, uvodna pitanja ili pravila prosleđivanja. Postavite svoju verziju kada prođe Vaše testove. MIT licenca Vam dozvoljava da izmene zadržite za sebe ili ih podelite.",
          points: [
            "Pozdrav, uvodna pitanja i pravila prosleđivanja",
            "Privatan ili javan fork, po Vašem izboru",
            "Vaša verzija ide uživo kada ste spremni",
          ],
        },
        {
          title: "Pokrenite ga na svom serveru",
          body: "Docker Compose instalacija pokreće kontrolnu tablu, worker, PostgreSQL i Redis na jednoj mašini. Pozivi idu preko Vaših Twilio i OpenAI naloga, a snimci, transkripti i kontakti ostaju u Vašoj bazi podataka.",
          points: [
            "Docker Compose na jednom serveru ili Railway šablon",
            "Bilo koji endpoint kompatibilan sa OpenAI-jem za čet i embeddinge",
            "Vi birate kada ćete nadograditi",
          ],
        },
        {
          title: "Ili neka ga LobbyStack hostuje",
          body: "LobbyStack Cloud pokreće isti otvoreni kod umesto Vas, sa minutima razgovora u svakom paketu. Počnite sa besplatnim paketom i isprobajte recepcionera u pregledaču pre nego što preusmerite broj.",
          points: [
            "Besplatan paket sa 30 minuta razgovora",
            "Hosting, ažuriranja i rezervne kopije preuzima LobbyStack",
            "Kod koji možete čitati na GitHub-u",
          ],
        },
      ],
      faqs: [
        {
          question: "Šta je AI recepcioner otvorenog koda?",
          answer:
            "AI recepcioner odgovara na pozive Vaše firme. Odgovara na pitanja, zakazuje termine, prima poruke i prosleđuje pozivaoce osobi. Recepcioner otvorenog koda objavljuje svoj kod, pa svako može da ga čita, menja i pokrene na svom serveru. LobbyStack je AI recepcioner otvorenog koda pod MIT licencom.",
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
            "Ne. Na LobbyStack Cloud-u paket Starter uključuje podršku e-poštom, a Pro prioritetnu e-poštu. Ako sami hostujete, imate vodiče na docs.lobbystack.com i issue tracker na GitHub-u. Enterprise paket pokriva samostalne instalacije uz posvećenu pomoć pri implementaciji.",
        },
        {
          question:
            "Da li su moji podaci o pozivima bezbedni u projektu otvorenog koda?",
          answer:
            "Kada sami hostujete, snimci, transkripti i kontakti ostaju u Vašoj PostgreSQL bazi i skladištu, a Vi određujete rezervne kopije i rokove čuvanja. Twilio i OpenAI i dalje obrađuju zvuk poziva uživo preko Vaših naloga. Na LobbyStack Cloud-u te podatke čuva LobbyStack. U oba slučaja možete čitati kod i videti šta se čuva.",
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
      ],
      ctaHeading: "Pročitajte kod, pa izaberite gde će raditi",
      ctaBody:
        "Počnite od repozitorijuma na GitHub-u. Hostujte LobbyStack na svom serveru ili ga besplatno isprobajte na LobbyStack Cloud-u.",
      ctaPrimaryLabel: "Pogledajte na GitHub-u",
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
