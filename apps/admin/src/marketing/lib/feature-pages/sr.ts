import type { FeaturePagesCopy } from "./types"

export const featurePagesSr: FeaturePagesCopy = {
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
        "LobbyStack se javlja prvi, rešava rutinske pozive i preusmerava hitne na Vaš telefon.",
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
    sections: [
      {
        title: "Svaki poziv stiže pravoj osobi",
        body: "Unesite jedan broj za firmu i po jedan za svakog zaposlenog. Vaša pravila određuju ko dobija koji poziv.",
        points: [
          "Podrazumevani broj za preusmeravanje",
          "Broj za svakog zaposlenog",
          "Pravila ko dobija šta",
        ],
      },
      {
        title: "Pozivaoci stižu do Vas i kada potrošite minute",
        body: "Kada potrošite minute iz paketa, LobbyStack prosleđuje pozive na Vaš broj za preusmeravanje, pa niko ne nailazi na mrtvu liniju.",
        points: [
          "Pozivi se prosleđuju Vašem timu",
          "Prosleđeni pozivi ne troše minute",
          "Sami određujete limit potrošnje",
        ],
      },
    ],
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
      {
        question: "Da li poziv na koji se sam javim troši glasovne minute?",
        answer:
          "Ne. Uz opciju Osoblje se javlja prvo, poziv koji preuzme Vaš tim troši jedan pokušaj preusmeravanja i nijedan glasovni minut.",
      },
    ],
    closing: {
      titleLines: ["Javljajte se na pozive koji donose novac.", "Ostale predajte."],
      body: "Odredite broj za preusmeravanje i pustite LobbyStack da filtrira svaki poziv.",
    },
  },
  knowledge: {
    seo: {
      title: "Baza znanja AI recepcionera sa Vašeg sajta | LobbyStack",
      description:
        "Nalepite adresu sajta i otpremite fajlove. LobbyStack odgovara pozivaocima Vašim radnim vremenom, cenama i pravilima i beleži svako pitanje bez odgovora.",
    },
    name: "Baza znanja",
    hero: {
      title: "Nalepite adresu sajta. Vaš recepcioner zna Vašu firmu.",
      intro:
        "LobbyStack čita Vaš sajt, dokumente i beleške, pa pozivaocima odgovara Vašim radnim vremenom, cenama i pravilima.",
    },
    facts: [
      "Uvozi Vaš sajt",
      "PDF, Word, tekst i Markdown",
      "Do 8.000 stranica u paketu Pro",
      "Beleži pitanja bez odgovora",
    ],
    benefits: {
      title: "Odgovara kao što bi Vaš tim",
      items: [
        {
          title: "Uči sa Vašeg sajta",
          body: "Nalepite URL i LobbyStack čita Vaše javne stranice: usluge, radno vreme, cene i česta pitanja.",
        },
        {
          title: "Čita Vaše dokumente",
          body: "Otpremite cenovnike, pravila i prijemne formulare kao PDF ili Word, do 10 MB po fajlu.",
        },
        {
          title: "Kaže Vam na šta nije znao da odgovori",
          body: "Svako pitanje bez odgovora stiže na listu, najčešća prva. Napišite odgovor jednom i on ga koristi u narednim pozivima.",
        },
      ],
    },
    example: {
      eyebrow: "Pitanja bez odgovora",
      title: "Svake nedelje zna više",
      body: "Odgovorite na pitanje sa liste i Vaš recepcioner ga više ne propušta.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Radite li protočne bojlere?", value: "Pitano 6 puta" },
          { label: "Ima li parkinga?", value: "Pitano 4 puta" },
          { label: "Nudite li plaćanje na rate?", value: "Pitano 3 puta" },
        ],
      },
    },
    sections: [
      {
        title: "Ono što pozivaoci najčešće pitaju",
        body: "Vaš recepcioner odgovara iz onoga što ste mu dali. Kada nema odgovor, radi ono što ste odredili za taj slučaj.",
        points: [
          "Radno vreme, adresa i parking",
          "Usluge, cene i pravila",
          "Uslovi za prijem i česta pitanja",
        ],
      },
      {
        title: "Jedna firma, više agenata",
        body: "Delite znanje među svim agentima ili jednom agentu dajte njegovo.",
        points: [
          "Zajedničko znanje firme",
          "Unosi za jednog agenta",
          "Svaki unos menjate na kontrolnoj tabli",
        ],
      },
    ],
    steps: {
      title: "Gotovo iz jednog puta",
      items: [
        {
          title: "Uvezite sajt",
          body: "Nalepite početnu stranicu i LobbyStack čita stranice bitne pozivaocima.",
        },
        {
          title: "Dodajte ono što fali",
          body: "Otpremite dokumente ili upišite kratke odgovore o radnom vremenu, parkingu i pravilima.",
        },
        {
          title: "Popunite praznine",
          body: "Pregledajte pitanja bez odgovora i svaki odgovor napišite jednom.",
        },
      ],
    },
    faqTitle: "Pitanja o bazi znanja",
    faqs: [
      {
        question: "Koje fajlove mogu da otpremim?",
        answer: "PDF, Word (DOCX), tekstualne i Markdown fajlove, do 10 MB po fajlu.",
      },
      {
        question: "Koliko može da stane?",
        answer:
          "1 MB teksta u paketu Free, 5 MB u paketu Starter i 20 MB u paketu Pro, odnosno oko 400, 2.000 i 8.000 stranica. Ograničenje se odnosi na izdvojeni tekst, a ne na veličinu fajla.",
      },
      {
        question: "Šta radi kada ne zna odgovor?",
        answer:
          "Radi ono što ste odredili za taj slučaj, na primer prima poruku, i čuva pitanje u odeljku Pitanja bez odgovora.",
      },
      {
        question: "Da li čita ceo moj sajt?",
        answer:
          "Čita javne stranice namenjene pozivaocima. Preskače stranice iza prijave i stranice kao što su plaćanje, korpa, nalog, privatnost i uslovi korišćenja.",
      },
      {
        question: "Koliko brzo se novi odgovor primenjuje?",
        answer: "Novi pozivi ga koriste ubrzo nakon što sačuvate.",
      },
      {
        question: "Može li svaki agent da zna različite stvari?",
        answer:
          "Da. Znanje je podrazumevano zajedničko za sve agente, a jednom agentu možete dati i njegove unose.",
      },
    ],
    closing: {
      titleLines: ["Nalepite adresu sajta.", "Primite prvi poziv."],
      body: "Počnite besplatno, uvezite sajt i pozovite svog recepcionera iz pregledača.",
    },
  },
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
        "Recite LobbyStack-u šta da pita, koju cenu da navede i kada da preda poziv, kao što biste objasnili novom zaposlenom. On se drži Vaših pravila u svakom pozivu.",
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
    sections: [
      {
        title: "Jedan agent za dan, drugi za noć",
        body: "Svaki agent ima svoja pravila, pa linija van radnog vremena prima poruke dok dnevna zakazuje.",
        points: [
          "Pravila za svakog agenta",
          "Prevucite da odredite prioritet",
          "Šabloni za početak",
        ],
      },
      {
        title: "Cene koje nikada ne nagađa",
        body: "Dajte svakoj usluzi vrstu cene i Vaš recepcioner je navodi isto u svakom pozivu.",
        points: ["Fiksna cena", "Početna cena", "Raspon cena"],
      },
    ],
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
      {
        question: "Može li da zakaže procenu umesto da navede cenu?",
        answer:
          "Da. Označite da se cena usluge određuje na licu mesta i Vaš recepcioner zakazuje posetu bez navođenja brojke.",
      },
      {
        question: "Da li moja pravila važe i na drugim jezicima?",
        answer:
          "Da. Napišite ih na svom jeziku i Vaš recepcioner ih sledi na svakom od više od 70 jezika koje govori.",
      },
    ],
    closing: {
      titleLines: ["Objasnite mu jednom.", "On vodi svaki poziv."],
      body: "Napišite prvo pravilo i čujte ga u probnom pozivu još danas.",
    },
  },
  "voices-and-languages": {
    seo: {
      title: "Glasovi AI recepcionera na više od 70 jezika | LobbyStack",
      description:
        "Izaberite jedan od 22 prirodna glasa, napišite svoj pozdrav i pustite AI recepcionera da odgovara na više od 70 jezika i menja jezik kada to uradi pozivalac.",
    },
    name: "Glasovi i jezici",
    hero: {
      title: "Zvuči kao Vaša firma, na više od 70 jezika",
      intro:
        "Izaberite jedan od 22 glasa, napišite svoj pozdrav i pustite recepcionera da promeni jezik čim to uradi pozivalac.",
    },
    facts: [
      "22 glasa na izbor",
      "Govori više od 70 jezika",
      "Vaš pozdrav",
      "Radi na OpenAI GPT-Live",
    ],
    benefits: {
      title: "Prvi utisak je Vaš",
      items: [
        {
          title: "Izaberite glas koji pozivaoci čuju",
          body: "Preslušajte svaki od 22 glasa na svom jeziku, pa izaberite onaj koji odgovara Vašoj firmi.",
        },
        {
          title: "Pozdravite pozivaoce na svoj način",
          body: "Napišite uvodnu rečenicu sa nazivom firme i onim u čemu možete da pomognete.",
        },
        {
          title: "Menja jezik usred poziva",
          body: "Pozivalac počne na španskom ili zatraži francuski, i Vaš recepcioner odgovara na tom jeziku.",
        },
      ],
    },
    example: {
      eyebrow: "Vaš pozdrav",
      title: "Prva rečenica daje ton",
      body: "Neka bude kratak i konkretan. Menjajte ga kad god želite, a novi pozivi ga koriste ubrzo nakon što sačuvate.",
      mock: {
        kind: "text",
        text: "Hvala što ste pozvali Peak HVAC. Zovete li zbog servisa, zakazivanja ili hitnog kvara?",
      },
    },
    sections: [
      {
        title: "Jedan broj za svaki jezik Vaših klijenata",
        body: "LobbyStack govori više od 70 jezika, među njima španski i francuski. Vaša pravila i cene ostaju isti na svakom.",
        points: [
          "Menja jezik kada i pozivalac",
          "Ista pravila na svakom jeziku",
          "Jezici se ne doplaćuju",
        ],
      },
      {
        title: "Glas za svakog agenta",
        body: "Imajte dnevnog agenta i agenta za pozive van radnog vremena, svakog sa svojim glasom i pozdravom.",
        points: [
          "Glas za svakog agenta",
          "Pozdrav za svakog agenta",
          "Probni pozivi iz pregledača",
        ],
      },
    ],
    steps: {
      title: "Tri koraka do Vašeg glasa",
      items: [
        {
          title: "Izaberite glas",
          body: "Preslušajte uzorke i izaberite jedan.",
        },
        {
          title: "Napišite pozdrav",
          body: "Jedna ili dve rečenice koje pozivaoci čuju prve.",
        },
        {
          title: "Pozovite ga",
          body: "Pokrenite probni poziv iz pregledača i slušajte.",
        },
      ],
    },
    faqTitle: "Pitanja o glasovima i jezicima",
    faqs: [
      {
        question: "Koliko glasova postoji?",
        answer: "22, svaki sa svojom visinom i tempom. Svaki možete da preslušate pre izbora.",
      },
      {
        question: "Koje jezike govori?",
        answer:
          "Više od 70 jezika, među njima engleski, francuski, španski i srpski. Menja jezik kada pozivalac progovori na drugom ili ga zatraži.",
      },
      {
        question: "Da li drugi jezici koštaju više?",
        answer: "Ne. U cenama LobbyStack-a nema doplate za jezike.",
      },
      {
        question: "Hoće li zvučati robotski?",
        answer:
          "Pozovite ga i procenite sami. Paket Free uključuje 30 glasovnih minuta, a probni poziv možete da pokrenete iz pregledača.",
      },
      {
        question: "Mogu li kasnije da promenim glas?",
        answer:
          "Da. Novi pozivi koriste novi glas ubrzo nakon što sačuvate, a poziv u toku zadržava onaj sa kojim je počeo.",
      },
      {
        question: "Može li svaki agent da ima drugi glas?",
        answer: "Da. Svaki agent ima svoj glas i pozdrav.",
      },
    ],
    closing: {
      titleLines: ["Čujte ga pre svojih pozivalaca."],
      body: "Počnite besplatno i pokrenite probni poziv iz pregledača.",
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
        "Svaki poziv stiže u Vaše Prijemno sanduče sa ishodom, transkriptom i snimkom. Znate ko je zvao i šta sledi, a da niste preslušali govornu poruku.",
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
    sections: [
      {
        title: "Nađite bilo koji poziv za par sekundi",
        body: "Pretražujte kontakte, pozive i poruke ili filtrirajte listu po kanalu i po agentu.",
        points: [
          "Pretraga uz Cmd+K",
          "Filter po telefonu ili SMS-u",
          "Filter po agentu",
        ],
      },
      {
        title: "Svaki pozivalac ima istoriju",
        body: "LobbyStack pravi kontakt za svakog pozivaoca, sa pozivima, SMS porukama i terminima po redu.",
        points: [
          "Hronologija aktivnosti",
          "Termini i status",
          "Blokiranje neželjenih pozivalaca",
        ],
      },
    ],
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
      {
        question: "Može li moj tim da odgovara na SMS poruke iz Prijemnog sandučeta?",
        answer:
          "Da. Otvorite prepisku i pošaljite odgovor. AI ne odgovara na SMS poruke, pa svaka čeka čoveka.",
      },
      {
        question: "Da li se vide pozivi na koje se javio moj tim?",
        answer: "Da. Imaju oznaku Javio se Vaš tim, bez transkripta i snimka.",
      },
    ],
    closing: {
      titleLines: ["Vaši pozivi, već zapisani."],
      body: "Počnite besplatno i pročitajte transkript svog prvog poziva još danas.",
    },
  },
  notifications: {
    seo: {
      title: "Rezime poziva e-poštom i SMS obaveštenja | LobbyStack",
      description:
        "LobbyStack Vam posle svakog poziva šalje rezime e-poštom, Vašem timu SMS kada pozivalac čeka povratni poziv, a klijentima SMS potvrdu i podsetnik.",
    },
    name: "Obaveštenja",
    hero: {
      title: "Rezime svakog poziva u Vašoj e-pošti",
      intro:
        "LobbyStack Vam šalje e-poruku posle svakog poziva i SMS kada neko čeka povratni poziv. Vaši klijenti dobijaju potvrdu i podsetnik SMS-om.",
    },
    facts: [
      "Rezime svakog poziva e-poštom",
      "SMS obaveštenja za Vaš tim",
      "SMS potvrda pri zakazivanju",
      "Podsetnik 24 sata ranije",
    ],
    benefits: {
      title: "Saznajete, a da ne proveravate",
      items: [
        {
          title: "Rezime posle svakog poziva",
          body: "Pozivalac, vreme, trajanje i šta je tražio, u e-poruci sa linkom ka celom pozivu.",
        },
        {
          title: "SMS kada je hitno",
          body: "Poruka koja traži povratni poziv, neuspelo preusmeravanje, nova SMS poruka od klijenta. Izaberite šta stiže na Vaš telefon.",
        },
        {
          title: "Klijenti dolaze na termin",
          body: "Svaki pozivalac koji zakaže i pristane dobija potvrdu i podsetnik dan ranije. Vaš recepcioner traži dozvolu u toku poziva.",
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
    sections: [
      {
        title: "Vi birate šta Vas prekida",
        body: "Uključite ili isključite svako obaveštenje, za e-poštu, SMS ili oba.",
        points: ["Odgovoren poziv", "Potreban povratni poziv", "Neuspelo preusmeravanje"],
      },
      {
        title: "Usklađeno od prve poruke",
        body: "LobbyStack u toku poziva traži saglasnost od svakog klijenta, poštuje STOP i HELP i šalje sa verifikovanog besplatnog (toll-free) broja.",
        points: [
          "Saglasnost zabeležena za svaki broj",
          "STOP i HELP su pokriveni",
          "Ne registrujete nijedan broj",
        ],
      },
    ],
    steps: {
      title: "Kako stiže do Vas",
      items: [
        {
          title: "LobbyStack preuzima poziv",
          body: "Odgovara, zakazuje ili prima poruku, po Vašim pravilima.",
        },
        {
          title: "Vi dobijate rezime",
          body: "E-poruka za svaki poziv i SMS za obaveštenja koja ste izabrali.",
        },
        {
          title: "Vaš klijent dobija SMS",
          body: "Potvrda odlazi pri zakazivanju, a podsetnik 24 sata pre termina.",
        },
      ],
    },
    faqTitle: "Pitanja o obaveštenjima",
    faqs: [
      {
        question: "Mogu li da isključim e-poruku za svaki poziv?",
        answer:
          "Da. Isključite Odgovoren poziv u podešavanjima obaveštenja i zadržite ona koja traže reakciju.",
      },
      {
        question: "Koji paketi uključuju SMS?",
        answer:
          "SMS obaveštenja su u paketima Starter i Pro. Starter uključuje 50 SMS segmenata za obaveštenja mesečno, a Pro 200.",
      },
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
        question: "Da li klijenti moraju da prihvate SMS poruke da bi zakazali?",
        answer: "Ne. Pozivalac koji odbije ipak dobija termin, bez SMS poruka.",
      },
      {
        question: "Da li AI odgovara na SMS poruke?",
        answer:
          "Ne. LobbyStack šalje potvrde, podsetnike i obaveštenja. Poruke koje Vaši klijenti pošalju čekaju Vaš tim u Prijemnom sandučetu.",
      },
    ],
    closing: {
      titleLines: ["Prestanite da proveravate.", "Sve Vam stiže samo."],
      body: "Počnite besplatno i dobijte prvi rezime poziva e-poštom još danas.",
    },
  },
  analytics: {
    seo: {
      title: "Analitika AI recepcionera: vrednost termina i ušteda | LobbyStack",
      description:
        "Vidite šta Vam je AI recepcioner zaradio: vrednost zakazanih poslova, ušteđene sate, ishod svakog poziva i poređenje ove nedelje sa prošlom.",
    },
    name: "Analitika",
    hero: {
      title: "Vidite šta Vam je recepcioner zaradio",
      intro:
        "LobbyStack prikazuje vrednost poslova koje je zakazao, sate koje Vam je uštedeo i broj poziva koje je rešio bez Vašeg tima.",
    },
    facts: [
      "Vrednost termina, poslednjih 30 dana",
      "Ušteđeno vreme na pozivima",
      "Pozivi rešeni bez preusmeravanja",
      "Trendovi iz nedelje u nedelju",
    ],
    benefits: {
      title: "Dokaz da se telefon isplati",
      items: [
        {
          title: "Vrednost termina u dolarima",
          body: "LobbyStack sabira cenu svakog termina koji je zakazao, pa vidite koliko je telefon doneo.",
        },
        {
          title: "Sati vraćeni u Vašu nedelju",
          body: "Vreme razgovora u pozivima koje je vodio Vaš recepcioner, u satima i minutima.",
        },
        {
          title: "Kako se svaki poziv završio",
          body: "Vidite koliko je poziva završeno, preusmereno ili propušteno i kako se to promenilo od prošle nedelje.",
        },
      ],
    },
    example: {
      eyebrow: "Vaših poslednjih 30 dana",
      title: "Tri broja na početnoj stranici",
      body: "Otvorite kontrolnu tablu i rezultat je prvo što vidite.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Vrednost termina", value: "$4,860" },
          { label: "Ušteđeno vreme", value: "11 h 20 min" },
          { label: "Pozivi bez preusmeravanja", value: "86%" },
        ],
      },
    },
    sections: [
      {
        title: "Znajte kada Vam treba pojačanje",
        body: "Nedeljni trendovi pokazuju kada rastu pozivi, termini ili trajanje poziva, pa raspored ljudi pravite prema tome.",
        points: [
          "Pozivi ove nedelje u odnosu na prošlu",
          "Prosečno trajanje poziva",
          "Zakazani termini",
        ],
      },
      {
        title: "Brojke kojima možete da verujete",
        body: "Vrednost termina računa početnu cenu po minimumu, a raspon cena po donjoj granici, i ne uključuje otkazane termine.",
        points: [
          "Otkazani termini se ne računaju",
          "Pozivi Vašeg tima vode se odvojeno",
          "Sami birate datume",
        ],
      },
    ],
    steps: {
      title: "Gde da gledate",
      items: [
        {
          title: "LobbyStack preuzima Vaše pozive",
          body: "Svaki poziv i termin se broji čim se desi.",
        },
        {
          title: "Otvorite Početnu",
          body: "Vrednost termina, ušteđeno vreme i pozivi bez preusmeravanja za poslednjih 30 dana.",
        },
        {
          title: "Otvorite Analitiku",
          body: "Trendovi, ishodi poziva i kanali za datume koje izaberete.",
        },
      ],
    },
    faqTitle: "Pitanja o analitici",
    faqs: [
      {
        question: "Kako se računa vrednost termina?",
        answer:
          "Sabira se cena svakog termina koji je Vaš recepcioner zakazao u poslednjih 30 dana. Fiksna cena se računa u celosti, početna po minimumu, a raspon po donjoj granici.",
      },
      {
        question: "Šta se računa kao ušteđeno vreme?",
        answer: "Vreme razgovora u pozivima koje je vodio Vaš recepcioner.",
      },
      {
        question: "Da li se računaju pozivi na koje se javio moj tim?",
        answer:
          "Ne. Pozivi koje Vaš tim preuzme uz opciju Osoblje se javlja prvo ne ulaze u brojke. Naći ćete ih u Prijemnom sandučetu.",
      },
      {
        question: "Koje datume mogu da vidim?",
        answer: "Početna pokriva poslednjih 30 dana. Analitika pokriva datume koje izaberete.",
      },
      {
        question: "Da li se računaju otkazani termini?",
        answer:
          "Ne. Vrednost termina ih ne uključuje, kao ni termine koje je Vaš tim zakazao na kontrolnoj tabli ili preko API-ja.",
      },
    ],
    closing: {
      titleLines: ["Znajte koliko telefon donosi."],
      body: "Počnite besplatno i gledajte kako stiže Vaš prvi zakazani poziv.",
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
    sections: [
      {
        title: "Tri kalendara, stvarna dostupnost",
        body: "Vaš recepcioner čita kada ste zauzeti pre nego što ponudi termin i upisuje zakazano u kalendar.",
        points: ["Google Calendar", "Cal.com", "Calendly"],
      },
      {
        title: "Gradite na njemu",
        body: "REST API i MCP server daju Vašim programerima i Vašem AI asistentu iste pozive, kontakte i termine.",
        points: [
          "REST API sa API ključevima",
          "Potpisani webhook-ovi",
          "MCP server za AI asistente",
        ],
      },
    ],
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
      {
        question: "Da li su integracije u svakom paketu?",
        answer: "Da. Zapier, webhook-ovi i MCP server su u svakom paketu.",
      },
      {
        question: "Može li da pomeri ili otkaže događaj u mom kalendaru?",
        answer:
          "Da. Kada dozvolite izmene termina, LobbyStack ažurira događaj u Vašem kalendaru.",
      },
    ],
    closing: {
      titleLines: ["Povežite jednom.", "Svaki poziv ažurira sve."],
      body: "Počnite besplatno, povežite kalendar i primite prvi poziv sa zakazanim terminom.",
    },
  },
}
