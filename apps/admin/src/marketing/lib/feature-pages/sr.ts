import type { FeaturePagesCopy } from "./types"

export const featurePagesSr: FeaturePagesCopy = {
  rules: {
    seo: {
      title: "Pravila i cene AI recepcionera običnim jezikom | LobbyStack",
      description:
        "Obučite AI recepcionera običnim jezikom. Recite LobbyStack-u šta da pita, koje cene da navede i kada da preusmeri poziv. On to radi u svakom pozivu.",
    },
    name: "Pravila i cene",
    hero: {
      title: "Obučite recepcionera običnim jezikom",
      intro:
        "Recite LobbyStack-u šta da pita, koju cenu da navede i kada da preda poziv, kao što biste objasnili novom zaposlenom. On se drži Vaših pravila u svakom pozivu, a Vi više nikada ne crtate tok poziva.",
    },
    facts: [
      "Pravila pisana Vašim rečima",
      "Fiksne, početne i cene u rasponu",
      "Vi određujete koje pravilo pobeđuje",
      "Govori više od 70 jezika",
    ],
    benefits: {
      title: "Vaš način rada, u svakom pozivu",
      items: [
        {
          title: "Napišite onako kako biste rekli",
          body: "„Ako pozivalac kaže da je hitno, preusmeri ga na mene.“ Ta rečenica je gotovo pravilo. Otkucajte je, sačuvajte, i Vaš recepcioner je primenjuje.",
        },
        {
          title: "Navodite svoje prave cene",
          body: "Dajte svakoj usluzi fiksnu cenu, početnu cenu ili raspon. Vaš recepcioner navodi ono što ste uneli i nikada ne izmišlja brojku.",
        },
        {
          title: "Odlučite šta radi kada nije siguran",
          body: "Recite mu da primi poruku, obeća povratni poziv ili preusmeri poziv. Vaš recepcioner radi ono što ste odredili i ne nagađa.",
        },
      ],
    },
    example: {
      eyebrow: "Pravo pravilo",
      title: "Jedna rečenica menja celo stablo poziva",
      body: "Pravila se primenjuju redom koji Vi odredite, pa najvažnija pobeđuju. Prevucite pravilo na vrh i ono dobija prednost.",
      mock: {
        kind: "text",
        text: "Ako pozivalac pita koliko košta ugradnja bojlera, navedi naš raspon od $1,800 do $3,200, pitaj za adresu i zakaži procenu na licu mesta.",
      },
    },
    steps: {
      title: "Podesite sve iz jednog puta",
      items: [
        {
          title: "Dodajte usluge i cene",
          body: "Navedite šta prodajete, koliko svaki posao traje i koliko košta.",
        },
        {
          title: "Napišite pravila",
          body: "Jedno uputstvo po pravilu, Vašim rečima. Šabloni pokrivaju preusmeravanja, povratne pozive, pozive van radnog vremena i pitanja o cenama.",
        },
        {
          title: "Pozovite i slušajte",
          body: "Testirajte iz pregledača, a pravilo izmenite onog dana kada promenite način rada.",
        },
      ],
    },
    faqTitle: "Pitanja o pravilima i cenama",
    faqs: [
      {
        question: "Da li moram da pravim tok poziva?",
        answer:
          "Ne. Pišete uputstva običnim jezikom i Vaš recepcioner ih sledi. LobbyStack nema alat za crtanje dijagrama toka.",
      },
      {
        question: "Šta ako pozivalac pita nešto što moja pravila ne pokrivaju?",
        answer:
          "Vaš recepcioner odgovara iz znanja o Vašoj firmi. Kada ne može, radi ono što ste mu napisali za taj slučaj: prima poruku ili preusmerava poziv.",
      },
      {
        question: "Može li da navodi cene?",
        answer:
          "Da. Svaka usluga ima fiksnu cenu, početnu cenu ili raspon, i Vaš recepcioner navodi ono što ste uneli. Ako cena nije uneta, on je ne nagađa.",
      },
      {
        question: "Može li svaki agent da ima svoja pravila?",
        answer:
          "Da. Svaki agent ima svoja pravila, pa agent za pozive van radnog vremena može da postupa drugačije od dnevnog.",
      },
    ],
    closing: {
      titleLines: ["Objasnite mu jednom.", "On vodi svaki poziv."],
      body: "Napišite prvo pravilo i čujte ga u probnom pozivu još danas.",
    },
  },
  "call-transfers": {
    seo: {
      title: "AI recepcioner preusmerava pozive Vašem timu | LobbyStack",
      description:
        "LobbyStack se javlja na svaki poziv, rešava rutinske i preusmerava hitne na Vaš telefon. Pravila pišete običnim jezikom i više ne filtrirate pozive sami.",
    },
    name: "Preusmeravanje poziva",
    hero: {
      title: "Pozivi kojima ste potrebni stižu do Vas. Ostalo rešava LobbyStack.",
      intro:
        "LobbyStack se javlja prvi, rešava rutinske pozive i preusmerava hitne na Vaš telefon. Hitni slučajevi, veliki poslovi i nezadovoljni klijenti odmah dobijaju čoveka.",
    },
    facts: [
      "Pravila preusmeravanja običnim jezikom",
      "Broj za preusmeravanje za svakog zaposlenog",
      "Poruka primljena kada se niko ne javi",
      "Vaš tim može da se javi prvi",
    ],
    benefits: {
      title: "Prestanite da sami filtrirate pozive",
      items: [
        {
          title: "Hitni pozivi zvone na Vašem telefonu",
          body: "Napišite pravilo jednom: pukla cev, nema grejanja, pozivalac traži vlasnika. LobbyStack te pozive preusmerava na broj koji ste odredili.",
        },
        {
          title: "Pozivalac dobija pravu osobu",
          body: "Dajte svakom zaposlenom broj telefona. Pozivalac koji traži Aleksa dobija Aleksa.",
        },
        {
          title: "Neuspelo preusmeravanje se ne gubi",
          body: "Kada preusmeravanje ne uspe, Vaš recepcioner to kaže pozivaocu, prima poruku i obaveštava Vaš tim.",
        },
      ],
    },
    example: {
      eyebrow: "Osoblje se javlja prvo",
      title: "Javite se kada možete. Ostalo hvata LobbyStack.",
      body: "Vaš telefon zvoni onoliko dugo koliko odredite, a Vi pritiskate 1 da preuzmete poziv. Ako to niko ne uradi, javlja se Vaš recepcioner, pa nijedan pozivalac ne završava na govornoj pošti.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Pukla cev", value: "Preusmereno Aleksu" },
          { label: "Pitanje o ceni", value: "Odgovoreno" },
          { label: "Procena za krov", value: "Zakazano za četvrtak u 9:00" },
          { label: "Tražio vlasnika", value: "Poruka primljena" },
        ],
      },
    },
    steps: {
      title: "Tri koraka do mirnijeg telefona",
      items: [
        {
          title: "Odredite broj za preusmeravanje",
          body: "Izaberite telefon koji zvoni kada pozivaocu treba čovek.",
        },
        {
          title: "Recite koje pozive da preusmeri",
          body: "Napišite pravilo u jednoj rečenici: ko se preusmerava i kada.",
        },
        {
          title: "Javljajte se na pozive koji to zaslužuju",
          body: "LobbyStack se javlja na rutinske pozive i zakazuje termine bez Vas.",
        },
      ],
    },
    faqTitle: "Pitanja o preusmeravanju poziva",
    faqs: [
      {
        question: "Koji pozivi se preusmeravaju?",
        answer:
          "Oni koje navedete u pravilima, na primer hitni slučajevi ili pozivaoci koji traže čoveka. Pozivalac koji traži zaposlenog sa unetim brojem telefona ide tom zaposlenom.",
      },
      {
        question: "Šta ako se niko ne javi na preusmeren poziv?",
        answer:
          "Vaš recepcioner to kaže pozivaocu, nudi da primi poruku i obaveštava Vaš tim, pa se poziv ipak završava dogovorom o sledećem koraku.",
      },
      {
        question: "Može li moj tim da se javi pre AI-ja?",
        answer:
          "Da, u paketima Starter i Pro. Uz opciju Osoblje se javlja prvo Vaš telefon zvoni od 10 do 60 sekundi. Pritisnite 1 da preuzmete poziv ili pustite recepcionera da se javi.",
      },
      {
        question: "Koliko preusmeravanja dobijam?",
        answer: "Starter uključuje 20 pokušaja preusmeravanja mesečno, a Pro 100.",
      },
      {
        question: "U koje zemlje mogu da se preusmere pozivi?",
        answer:
          "Sjedinjene Američke Države, Kanada, Portoriko, Ujedinjeno Kraljevstvo, Francuska, Nemačka, Španija, Italija, Holandija, Portugalija, Meksiko, Brazil, Izrael, Indija, Japan, Australija, Novi Zeland i Srbija.",
      },
    ],
    closing: {
      titleLines: ["Javljajte se na pozive koji donose novac.", "Ostale predajte."],
      body: "Odredite broj za preusmeravanje i pustite LobbyStack da filtrira svaki poziv.",
    },
  },
  inbox: {
    seo: {
      title: "Transkripti i snimci poziva AI recepcionera | LobbyStack",
      description:
        "Svaki poziv na koji se LobbyStack javi stiže u Prijemno sanduče sa ishodom, celim transkriptom i snimkom. Za par sekundi vidite ko je zvao i šta sledi.",
    },
    name: "Prijemno sanduče",
    hero: {
      title: "Svaki poziv zapisan pre nego što pitate",
      intro:
        "Svaki poziv stiže u Vaše Prijemno sanduče sa ishodom, celim transkriptom i snimkom. Znate ko je zvao, šta je hteo i šta sledi, a da niste preslušali nijednu govornu poruku.",
    },
    facts: [
      "Transkript svakog poziva",
      "Snimci koje možete ponovo da pustite",
      "Zadaci za praćenje uz svaki poziv",
      "Pretraga poziva i kontakata",
    ],
    benefits: {
      title: "Znajte šta se desilo u svakom pozivu",
      items: [
        {
          title: "Pročitajte poziv za deset sekundi",
          body: "Ishod stoji na vrhu: termin zakazan, poruka primljena, poziv preusmeren. Otvorite transkript kada želite detalje.",
        },
        {
          title: "Nijedan povratni poziv se ne gubi",
          body: "Kada pozivalac ostavi poruku ili zatraži povratni poziv, zadatak stoji uz taj poziv. Označite ga kao završen kada se Vaš tim javi.",
        },
        {
          title: "Odobrite izmene jednim klikom",
          body: "Pozivalac želi da otkaže ili pomeri termin. Odobrite to iz Prijemnog sandučeta ili ponudite drugo vreme.",
        },
      ],
    },
    example: {
      eyebrow: "Jedna lista",
      title: "Pozivi i SMS poruke na istom mestu",
      body: "SMS poruke poslate na broj Vaše firme čekaju u Prijemnom sandučetu pored poziva, a Vi odgovarate iz same prepiske.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Sarah M. · Telefon", value: "Termin zakazan" },
          { label: "(555) 010-2244 · Telefon", value: "Poruka primljena" },
          { label: "Alex R. · SMS", value: "Nova poruka" },
          { label: "Dana K. · Telefon", value: "Preusmereno" },
        ],
      },
    },
    steps: {
      title: "Od zvona do povratnog poziva",
      items: [
        {
          title: "LobbyStack preuzima poziv",
          body: "Odgovara, zakazuje ili prima poruku, po Vašim pravilima.",
        },
        {
          title: "Poziv stiže u Prijemno sanduče",
          body: "Dobijate ishod i transkript, a snimak čim se zvuk obradi.",
        },
        {
          title: "Vaš tim završava posao",
          body: "Pozovite nazad, odobrite zahtev ili označite zadatak kao završen.",
        },
      ],
    },
    faqTitle: "Pitanja o Prijemnom sandučetu",
    faqs: [
      {
        question: "Da li LobbyStack snima pozive?",
        answer:
          "LobbyStack čuva transkript svakog poziva i može da sačuva snimak. Pustite ga na kartici Snimak u pozivu.",
      },
      {
        question: "Mogu li da pretražujem stare pozive?",
        answer:
          "Da. Pretraga obuhvata kontakte, pozive i poruke. Pritisnite Cmd+K, ili Ctrl+K na Windows-u, na kontrolnoj tabli.",
      },
      {
        question: "Moram li da otvorim Prijemno sanduče da bih znao da je neko zvao?",
        answer:
          "Ne. LobbyStack Vam za svaki odgovoreni poziv šalje e-poruku sa pozivaocem, vremenom, trajanjem i rezimeom. Plaćeni paketi mogu da dodaju SMS obaveštenja.",
      },
      {
        question: "Da li AI odgovara na SMS poruke?",
        answer: "Ne. SMS poruke poslate na broj Vaše firme čekaju u Prijemnom sandučetu da Vaš tim odgovori.",
      },
    ],
    closing: {
      titleLines: ["Vaši pozivi, već zapisani."],
      body: "Počnite besplatno i pročitajte transkript svog prvog poziva još danas.",
    },
  },
  "sms-notifications": {
    seo: {
      title: "SMS potvrde i podsetnici za termine | LobbyStack",
      description:
        "LobbyStack šalje klijentima SMS potvrdu kada zakažu i podsetnik 24 sata ranije, a Vaš tim obaveštava SMS-om kada pozivalac čeka povratni poziv.",
    },
    name: "SMS obaveštenja",
    hero: {
      title: "Manje propuštenih termina, brži povratni pozivi",
      intro:
        "LobbyStack šalje Vašim klijentima SMS potvrdu čim zakažu i podsetnik 24 sata pre termina. Vašem timu šalje SMS kada pozivalac čeka povratni poziv.",
    },
    facts: [
      "SMS potvrda pri zakazivanju",
      "Podsetnik 24 sata ranije",
      "Obaveštenja za tim SMS-om ili e-poštom",
      "Ne registrujete nijedan broj",
    ],
    benefits: {
      title: "Poruke koje odlaze bez Vas",
      items: [
        {
          title: "Klijenti dolaze na termin",
          body: "Svaki pozivalac koji zakaže i pristane dobija potvrdu i podsetnik dan ranije. Vaš recepcioner traži dozvolu u toku poziva.",
        },
        {
          title: "Vaš tim saznaje odmah",
          body: "Poruka koja traži povratni poziv, neuspelo preusmeravanje, nova SMS poruka od klijenta. LobbyStack obaveštava ljude koji mogu da reaguju.",
        },
        {
          title: "Usklađeno od prve poruke",
          body: "LobbyStack traži saglasnost od svakog klijenta, poštuje STOP i HELP i šalje sa verifikovanog besplatnog (toll-free) broja. Vi ne registrujete ništa.",
        },
      ],
    },
    example: {
      eyebrow: "Šta klijenti dobijaju",
      title: "Poruke sa Vašim imenom",
      body: "Svaka poruka o terminu počinje nazivom Vaše firme, pa klijenti znaju ko im piše.",
      mock: {
        kind: "messages",
        messages: [
          "Northside Plumbing: Vaša procena za bojler je potvrđena za 24. maj u 14:00.",
          "Northside Plumbing: Podsetnik, Vaša procena za bojler je sutra u 14:00.",
        ],
      },
    },
    steps: {
      title: "Kako poruke odlaze",
      items: [
        {
          title: "Pozivalac zakazuje",
          body: "Vaš recepcioner pita da li sme da pošalje potvrdu SMS-om.",
        },
        {
          title: "LobbyStack šalje poruke",
          body: "Potvrda odlazi odmah, a podsetnik 24 sata pre termina.",
        },
        {
          title: "Vaš tim dobija obaveštenja",
          body: "Za svaku vrstu obaveštenja izaberite e-poštu, SMS ili oba.",
        },
      ],
    },
    faqTitle: "Pitanja o SMS obaveštenjima",
    faqs: [
      {
        question: "Da li moram da registrujem broj za slanje SMS-ova?",
        answer:
          "Ne. Na LobbyStack cloud-u poruke odlaze sa besplatnog (toll-free) broja koji LobbyStack poseduje i koji je verifikovao. Samostalno hostovana instalacija šalje sa sopstvenog Twilio broja.",
      },
      {
        question: "U koje zemlje LobbyStack šalje SMS?",
        answer: "U Sjedinjene Američke Države, Kanadu i Portoriko, na LobbyStack cloud-u.",
      },
      {
        question: "Koji paketi uključuju SMS?",
        answer:
          "SMS poruke o terminima i SMS obaveštenja su u paketima Starter i Pro. Starter uključuje 50 SMS segmenata za obaveštenja mesečno, a Pro 200.",
      },
      {
        question: "Da li AI odgovara na SMS poruke?",
        answer:
          "Ne. LobbyStack šalje potvrde, podsetnike i obaveštenja. Poruke koje Vaši klijenti pošalju čekaju Vaš tim u Prijemnom sandučetu.",
      },
    ],
    closing: {
      titleLines: ["Zakazano znači zakazano."],
      body: "Uključite SMS obaveštenja i pustite LobbyStack da šalje potvrde.",
    },
  },
  integrations: {
    seo: {
      title: "AI recepcioner uz kalendar, Zapier i webhook-ove | LobbyStack",
      description:
        "Povežite LobbyStack sa Google Calendar, Cal.com ili Calendly i šaljite svaki poziv, termin i poruku u svoj CRM preko Zapier-a, webhook-ova ili REST API-ja.",
    },
    name: "Integracije",
    hero: {
      title: "Uključite LobbyStack u alate koje već koristite",
      intro:
        "Povežite Google Calendar, Cal.com ili Calendly i Vaš recepcioner zakazuje u stvarno slobodne termine. Zapier i webhook-ovi šalju svaki poziv, termin i poruku u Vaš CRM.",
    },
    facts: [
      "Google Calendar, Cal.com i Calendly",
      "Zapier okidači i akcije",
      "Potpisani webhook-ovi sa ponovnim pokušajima",
      "REST API i MCP server",
    ],
    benefits: {
      title: "Vaš kalendar i Vaš CRM, uvek ažurni",
      items: [
        {
          title: "Zakazano u Vašem pravom kalendaru",
          body: "LobbyStack čita kada ste zauzeti i nudi samo termine koje imate. Termin se upisuje u kalendar koji ste izabrali.",
        },
        {
          title: "Zapier bez koda",
          body: "Šaljite nove pozive u tabelu, pravite kontakte u svom CRM-u ili zakažite termin iz druge aplikacije, uz šest okidača i šest akcija.",
        },
        {
          title: "Webhook-ovi po meri Vaših programera",
          body: "Šest događaja, potpisanih tajnim ključem, sa ponovnim pokušajima tokom oko 23 sata i ponovnim slanjem iz dnevnika isporuka.",
        },
      ],
    },
    example: {
      eyebrow: "Događaji",
      title: "Svaki poziv i termin, poslat tamo gde Vam treba",
      body: "Pretplatite se na događaje koji Vas zanimaju i LobbyStack šalje svaki čim se desi.",
      mock: {
        kind: "rows",
        rows: [
          { label: "call.completed", value: "Poziv je završen" },
          { label: "appointment.booked", value: "Termin je zakazan" },
          { label: "appointment.rescheduled", value: "Termin je pomeren" },
          { label: "appointment.cancelled", value: "Termin je otkazan" },
          { label: "message.taken", value: "Poruka je primljena" },
          { label: "contact.created", value: "Dodat je novi kontakt" },
        ],
      },
    },
    steps: {
      title: "Povezano u tri koraka",
      items: [
        {
          title: "Povežite kalendar",
          body: "Odobrite pristup za Google Calendar, Cal.com ili Calendly i izaberite gde se termini upisuju.",
        },
        {
          title: "Dodajte Zapier ili webhook",
          body: "Nalepite URL svog endpointa, izaberite događaje i pošaljite test.",
        },
        {
          title: "Gledajte kako podaci stižu",
          body: "Svaki poziv, termin, poruka i novi kontakt pojavljuje se u Vašim alatima.",
        },
      ],
    },
    faqTitle: "Pitanja o integracijama",
    faqs: [
      {
        question: "U koje kalendare LobbyStack zakazuje?",
        answer:
          "Google Calendar, Cal.com i Calendly. Za Calendly Vam treba njegov paket Standard ili viši, jer Calendly u paketu Free blokira zakazivanje iz drugih aplikacija.",
      },
      {
        question: "Da li radi sa mojim CRM-om?",
        answer:
          "Da, preko Zapier-a ili webhook-ova. LobbyStack šalje svaki poziv, termin, poruku i novi kontakt, a Vaš CRM ih dalje obrađuje.",
      },
      {
        question: "Postoji li API?",
        answer:
          "Da. REST API čita pozive, kontakte, termine i poruke, zakazuje termine i upravlja webhook-ovima. MCP server povezuje AI asistente kao što su Claude i ChatGPT.",
      },
      {
        question: "Šta ako moj endpoint ne radi?",
        answer:
          "LobbyStack pokušava ponovo oko 23 sata, zatim isključuje endpoint i obaveštava Vaš tim. Propuštene događaje pošaljite ponovo iz dnevnika isporuka.",
      },
    ],
    closing: {
      titleLines: ["Povežite jednom.", "Svaki poziv ažurira sve."],
      body: "Počnite besplatno, povežite kalendar i primite prvi poziv sa zakazanim terminom.",
    },
  },
}
