export default {
  title: "Šablon znanja",
  intro: [
    "Popunite ono što se odnosi na vašu firmu, a ostalo ostavite prazno. Otpremite ovaj fajl u Znanje, pod Dodaj znanje. Vaš recepcioner čita vaše odgovore, a sive napomene poput ove preskače.",
    "Pišite cele rečenice koje imenuju temu: „Masaža od 60 minuta košta 90 evra“, a ne „90 evra“. Navedite brojeve sa jedinicama i datume za sve što ističe. Izbegavajte tabele, slike i „pogledajte naš sajt“. Sadržaj upišite ovde.",
  ],
  sections: {
    about: {
      title: "O firmi",
      hint: "Recite ko ste jednostavnim rečima. Pozivaoci to čuju kada pitaju čime se bavite.",
      prompts: [
        "Naziv firme",
        "Čime se vaša firma bavi i kome je namenjena?",
        "Koje gradove ili oblasti pokrivate?",
        "Koliko dugo poslujete i po čemu se, prema klijentima, izdvajate?",
        "Koje jezike govori vaš tim?",
        "Kako vas klijenti mogu kontaktirati osim pozivom (imejl, sajt, društvene mreže)?",
      ],
    },
    location: {
      title: "Lokacija i pristup",
      hint: "Radno vreme i zatvaranja su u vašoj kontrolnoj tabli. Ovde dodajte detalje koje pozivaoci pitaju povrh toga.",
      prompts: [
        "Koja je vaša puna adresa i koji orijentiri ili raskrsnice pomažu da vas nađu?",
        "Gde klijenti mogu da parkiraju i koliko to košta?",
        "Da li je lokacija pristupačna (ulaz bez stepenika, lift, pristupačan toalet)?",
        "Imate li više od jedne lokacije? Navedite adresu svake.",
        "Idete li kod klijenata? Navedite oblasti i eventualnu naknadu za put.",
      ],
    },
    services: {
      title: "Usluge u detalje",
      hint: "Vaša lista usluga je u kontrolnoj tabli. Ovde opišite svaku uslugu. Svaki odgovor počnite nazivom usluge da bi bio jasan i sam za sebe. Kopirajte blok za svaku dodatnu uslugu.",
      prompts: [
        "Naziv usluge",
        "Šta uključuje",
        "Koliko traje",
        "Cena ili raspon cena",
        "Kome odgovara, a kome ne",
        "Šta pripremiti ili poneti",
        "Šta sledi posle",
      ],
    },
    pricing: {
      title: "Cene i plaćanje",
      prompts: [
        "Koje načine plaćanja prihvatate?",
        "Naplaćujete li depozit ili naknadu za rezervaciju? Navedite iznos i rok.",
        "Dajete li ponude ili besplatne procene? Kako ih klijent dobija?",
        "Koja osiguranja, članstva ili opcije finansiranja prihvatate?",
        "Koji popusti, paketi ili akcije trenutno važe? Navedite datume isteka.",
      ],
    },
    booking: {
      title: "Zakazivanje",
      prompts: [
        "Kako novi klijenti zakazuju i šta treba da imaju pri ruci?",
        "Koliko unapred klijenti treba da zakažu i za koliko je obično sledeći slobodan termin?",
        "Primate li klijente bez zakazivanja ili zahteve za isti dan?",
        "Kakva je vaša politika otkazivanja i pomeranja termina? Navedite potrebno obaveštenje i eventualnu naknadu.",
        "Šta se dešava kada klijent kasni ili se ne pojavi?",
        "Mogu li klijenti da dovedu decu, goste ili kućne ljubimce?",
        "Primate li grupna, ponavljajuća zakazivanja ili zakazivanja van radnog vremena?",
      ],
    },
    policies: {
      title: "Pravila",
      prompts: [
        "Kakva je vaša politika povraćaja novca, vraćanja robe ili garancije?",
        "Koji se zahtevi u vezi sa ličnom kartom, godinama ili ispunjenošću uslova primenjuju?",
        "Koja pravila o zdravlju, bezbednosti ili ponašanju klijenti treba da znaju?",
      ],
    },
    team: {
      title: "Tim",
      hint: "Članovi vašeg tima su u kontrolnoj tabli. Dodajte ono što pozivaoci traže po imenu ili po potrebi.",
      prompts: [
        "Koga pozivaoci treba da traže u određenim situacijama? Primer: za zakazivanja venčanja tražite Mariju.",
        "Koji članovi tima imaju specijalnosti ili sertifikate o kojima klijenti pitaju?",
      ],
    },
    urgent: {
      title: "Hitne situacije i van radnog vremena",
      prompts: [
        "Šta se smatra hitnim slučajem i šta pozivaoci treba prvo da urade?",
        "Šta recepcioner treba da kaže pozivaocima koji zovu van radnog vremena?",
      ],
    },
    limits: {
      title: "Granice i prosleđivanje",
      hint: "Recite recepcioneru gde da stane. Navedite temu i razlog.",
      prompts: [
        "Koji zahtevi moraju ići osobi? Primer: žalbe, sporovi oko naplate, pravna ili medicinska pitanja.",
        "Šta recepcioner nikada ne sme da obeća ili navede? Primer: tačne cene telefonom, zagarantovane rezultate.",
        "Šta treba da znate o pozivaocu pre nego što možete da pomognete (ime, adresa, vozilo, broj porudžbine)?",
        "Kako recepcioner treba da postupa sa prodajnim pozivima i pozivima dobavljača?",
      ],
    },
    terms: {
      title: "Imena, izrazi i izgovor",
      prompts: [
        "Koja imena firmi, članova tima ili proizvoda je teško izgovoriti? Napišite kako se izgovara svako.",
        "Koje stručne izraze ili skraćenice klijenti koriste i šta znače?",
        "Koje druge firme ili brendove klijenti mešaju sa vašim?",
      ],
    },
    news: {
      title: "Aktuelnosti",
      hint: "Uklonite svaku stavku čim zastari.",
      prompts: [
        "Šta se nedavno promenilo ili će se uskoro promeniti (nove usluge, radovi, sezonske promene, vreme čekanja)? Navedite datume.",
      ],
    },
    faq: {
      title: "Česta pitanja",
      hint: "Napišite 10 pitanja koja pozivaoci najčešće postavljaju, pa na svako odgovorite celim rečenicama. Obrišite parove koje ne koristite.",
    },
  },
};
