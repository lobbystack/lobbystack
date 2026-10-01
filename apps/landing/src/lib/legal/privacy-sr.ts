import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const privacySr: LegalDocument = {
  updated: "Poslednje ažuriranje: 26. septembar 2026.",
  h1: "Politika privatnosti",
  intro: `Ova Politika privatnosti objašnjava kako Lobbystack Inc. („LobbyStack“, „mi“, „naš“ ili „nas“) prikuplja, koristi, deli i štiti podatke o ličnosti kada posećujete naše sajtove, koristite hostovanu uslugu LobbyStack, pozovete firmu koja koristi LobbyStack ili se s njom dopisujete putem četa, primite SMS poruku poslatu putem usluge LobbyStack ili nas kontaktirate.`,
  sections: [
    {
      id: "scope",
      nav: "Obuhvat",
      title: "1. Ko smo mi i šta obuhvata ova Politika",
      blocks: [
        `1.1 LobbyStack je AI recepcioner za mala preduzeća. Firme ga koriste da odgovaraju na telefonske pozive i pozive iz pregledača, dopisuju se s posetiocima sajta putem četa, zakazuju termine, primaju poruke i preusmeravaju pozive svojim zaposlenima. Sedište nam je u Kanadi.`,
        `1.2 Ova Politika obuhvata naše sajtove, uključujući lobbystack.com, hostovanu uslugu LobbyStack („Usluga“), našu podršku i naš partnerski program.`,
        `1.3 Ova Politika ne obuhvata kopije softvera LobbyStack koje druga lica pokreću na sopstvenim serverima. Pogledajte odeljak 20.`,
      ],
    },
    {
      id: "roles",
      nav: "Naša uloga",
      title: "2. Naša uloga",
      blocks: [
        `2.1 <strong>Kada mi odlučujemo kako se podaci koriste.</strong> U svojstvu rukovaoca ili privrednog subjekta odgovorni smo za podatke o ličnosti posetilaca naših sajtova, nosilaca naloga, Ovlašćenih korisnika naloga klijenata, kontakata za naplatu, partnera i lica koja nas kontaktiraju.`,
        `2.2 <strong>Kada firma odlučuje kako se podaci koriste.</strong> Kada firma koristi LobbyStack za komunikaciju sa svojim pozivaocima, posetiocima sajta ili klijentima („Pozivaoci“), ta firma odlučuje zašto i kako se njihovi podaci obrađuju. Mi postupamo kao njen pružalac usluga ili obrađivač i obrađujemo podatke Pozivalaca u njeno ime, u skladu sa našim <a href="/sr/terms/">Uslovima korišćenja</a>. Primenjuje se obaveštenje o privatnosti te firme. Ako ste Pozivalac, pogledajte odeljak 18.`,
      ],
    },
    {
      id: "collect",
      nav: "Šta prikupljamo",
      title: "3. Podaci koje prikupljamo",
      blocks: [
        { h3: "3.1 Podaci o nalogu i firmi" },
        `Imena, imejl adrese, brojevi telefona, nazivi i adrese firmi, uloge, lozinke (čuvane u obliku heš vrednosti), evidencije prijavljivanja i bezbednosti, podešavanja naloga i Ovlašćeni korisnici kojima pošaljete pozivnicu. Kada tokom podešavanja potvrdite broj telefona, beležimo taj broj i rezultat provere.`,
        { h3: "3.2 Znanje i konfiguracija firme" },
        `Podaci koje dajete AI recepcioneru kako bi mogao da uslužuje Vaše Pozivaoce: usluge, cene, radno vreme, lokacije, pravila poslovanja, česta pitanja, dokumenti, pozdravi, uputstva, pravila zakazivanja, brojevi za preusmeravanje, primaoci obaveštenja i sadržaj uvezen sa Vašeg sajta.`,
        { h3: "3.3 Podaci o Pozivaocima i razgovorima" },
        {
          ul: [
            `brojevi telefona, ID pozivaoca i podaci o pozivu, kao što su vreme, trajanje, ishod i odredište preusmeravanja;`,
            `zvuk poziva i snimci poziva;`,
            `transkripti poziva i rezimei koje generiše AI;`,
            `poruke iz četa na sajtu i sesije poziva iz pregledača, sa nasumičnim identifikatorom posetioca;`,
            `poruke koje Pozivaoci ostave, kao i imena i kontakt podaci koje navedu;`,
            `podaci o terminima, kao što su usluga, datum, vreme i izmene ili otkazivanja;`,
            `evidencije provere koje služe za potvrdu identiteta Pozivaoca pre izmene termina;`,
            `evidencije SMS poruka, kao što su pristanak na podsetnike, status odjave, sadržaj poruke i status isporuke.`,
          ],
        },
        { h3: "3.4 Podaci o naplati" },
        `Paket, period naplate, potrošnja, fakture, poreski podaci, status plaćanja i podešavanja limita potrošnje. Naš pružalac usluga obrade plaćanja, Polar, direktno prikuplja podatke o platnim karticama. Ne primamo niti čuvamo pune brojeve kartica.`,
        { h3: "3.5 Podaci o sajtu, uređaju i korišćenju" },
        `IP adresa, tip pregledača i uređaja, pregledane stranice, stranice sa kojih ste došli, klikovi, približna lokacija izvedena iz IP adrese, evidencije grešaka i način na koji koristite kontrolnu tablu. Uz Vaš pristanak prikupljamo i snimke sesija na našem sajtu, pri čemu su unosi u obrasce maskirani. Pogledajte odeljak 10 i našu <a href="/sr/cookie-policy/">Politiku kolačića</a>.`,
        { h3: "3.6 Komunikacija i podrška" },
        `Imejlovi, zahtevi za podršku, povratne informacije i odgovori na ankete koje nam pošaljete.`,
        { h3: "3.7 Podaci o partnerskom programu i preporukama" },
        `Kodovi za preporuku, vreme klikova, stranice sa kojih su posetioci došli, pripisivanje registracija, evidencije provizija i PayPal imejl adresa koja se koristi za isplate.`,
        { h3: "3.8 Izvori" },
        `Podatke prikupljamo direktno od Vas, od Pozivalaca kada firma koristi Uslugu, iz Vašeg povezanog naloga Google Calendar, sa Vašeg sajta kada ga uvezete, od naših pružalaca usluga (na primer, status plaćanja od kompanije Polar i status poziva od kompanije Twilio) i automatski sa Vašeg uređaja.`,
      ],
    },
    {
      id: "use",
      nav: "Kako ih koristimo",
      title: "4. Kako koristimo podatke",
      blocks: [
        `Podatke o ličnosti koristimo da bismo:`,
        {
          ul: [
            `pružali Uslugu, uključujući odgovaranje na pozive i poruke u četu, zakazivanje termina, primanje poruka, preusmeravanje poziva, snimanje i transkribovanje poziva, kao i slanje obaveštenja i podsetnika;`,
            `otvarali naloge i upravljali njima, proveravali identitet i autentifikovali korisnike;`,
            `naplaćivali pakete i potrošnju, primenjivali limite potrošnje i izvršavali poreske obaveze;`,
            `pružali podršku i odgovarali na zahteve;`,
            `slali servisne i bezbednosne poruke, poruke o naplati i administrativne poruke;`,
            `pratili rad Usluge, otklanjali probleme i unapređivali njen kvalitet i pouzdanost;`,
            `otkrivali i sprečavali prevare, neželjene poruke, zloupotrebe i bezbednosne incidente;`,
            `vodili partnerski program;`,
            `razumeli kako ljudi koriste naš sajt i proizvod, uz pristanak tamo gde to zakon zahteva;`,
            `postupali u skladu sa zakonom, pravilima operatera i pravnim zahtevima i sprovodili naše Uslove.`,
          ],
        },
        `Podatke Pozivalaca obrađujemo samo da bismo pružili Uslugu firmi koja je koristi, kao i radi bezbednosti, sprečavanja zloupotreba, naplate i usklađenosti sa propisima.`,
      ],
    },
    {
      id: "legal-bases",
      nav: "Pravni osnovi",
      title: "5. Pravni osnovi obrade",
      blocks: [
        `Kada se primenjuje Opšta uredba o zaštiti podataka EU ili Ujedinjenog Kraljevstva (GDPR), za obradu koju kontrolišemo oslanjamo se na sledeće pravne osnove:`,
        {
          ul: [
            `<strong>Ugovor:</strong> radi pružanja Usluge, upravljanja nalozima, naplate i pružanja podrške;`,
            `<strong>Legitimni interesi:</strong> radi zaštite i unapređenja Usluge, sprečavanja zloupotreba, osnovne analitike sajta i komunikacije s poslovnim kontaktima, ako nad tim interesima ne pretežu Vaša prava;`,
            `<strong>Pristanak:</strong> za opcione analitičke kolačiće i snimke sesija, pri čemu pristanak možete povući u bilo kom trenutku;`,
            `<strong>Pravna obaveza:</strong> radi vođenja poreske i računovodstvene evidencije i odgovaranja na zakonite zahteve.`,
          ],
        },
        `Za podatke Pozivalaca, firma koja koristi LobbyStack odgovorna je za izbor i dokumentovanje svog pravnog osnova.`,
      ],
    },
    {
      id: "ai",
      nav: "AI obrada",
      title: "6. Obrada pomoću veštačke inteligencije",
      blocks: [
        `6.1 Usluga obrađuje telefonske pozive i pozive iz pregledača pomoću glasovnog modela GPT-Live kompanije OpenAI. Zvuk poziva se u realnom vremenu šalje kompaniji OpenAI kako bi model mogao da sluša i odgovara. OpenAI čuva snimak poziva tokom sesije, a mi ga zatim kopiramo u sopstveno skladište, gde podleže rokovima čuvanja iz odeljka 12.`,
        `6.2 Čet na sajtu, pretraga znanja firme i druge tekstualne funkcije koriste OpenAI modele. Pravimo vektorske reprezentacije (embeddings) znanja Vaše firme kako bi AI recepcioner mogao da pronađe relevantne odgovore.`,
        `6.3 Pružaocima AI usluga šaljemo samo podatke potrebne za određeni zadatak, kao što su razgovor, znanje i uputstva Vaše firme i informacija o tome da li je neki termin slobodan.`,
        `6.4 Ne koristimo podatke o ličnosti niti Podatke Klijenta za treniranje AI modela. OpenAI obrađuje ove podatke prema svojim poslovnim uslovima za API, koji, na dan donošenja ove Politike, ne dozvoljavaju da na tim podacima trenira svoje modele. OpenAI može ograničeno vreme čuvati podatke iz API-ja prema sopstvenim pravilima, na primer radi otkrivanja zloupotreba.`,
        `6.5 AI recepcioner tokom razgovora samostalno donosi neke odluke, na primer da li je neki termin slobodan, da li je Pozivalac prošao proveru za izmenu termina ili kada treba preusmeriti poziv. Te odluke slede podešavanja firme. Pozivalac koji se ne slaže s nekom od tih odluka može kontaktirati firmu i zatražiti da je preispita osoba.`,
      ],
    },
    {
      id: "google-oauth-calendar",
      nav: "Google Calendar",
      title: "7. Integracija sa uslugom Google Calendar",
      blocks: [
        `7.1 Kada u usluzi LobbyStack povežete Google nalog, koristimo Google OAuth za upravljanje rezervacijama u kalendaru koji izaberete. Tražimo sledeće dozvole:`,
        {
          ul: [
            `<strong>openid</strong> i <strong>email</strong>, za identifikaciju povezanog Google naloga;`,
            `<strong>calendar.calendarlist.readonly</strong>, za prikaz liste Vaših kalendara kako biste mogli da izaberete onaj koji LobbyStack treba da koristi;`,
            `<strong>calendar.events</strong>, za čitanje događaja u izabranom kalendaru radi pronalaženja zauzetih termina, kao i za kreiranje, ažuriranje i brisanje događaja za termine koje LobbyStack zakazuje, pomera ili otkazuje.`,
          ],
        },
        `7.2 <strong>Podaci kojima pristupamo.</strong> Identifikator i imejl adresa Vašeg Google naloga, lista Vaših kalendara i vremena događaja u izabranom kalendaru.`,
        `7.3 <strong>Čuvanje i zaštita.</strong> Čuvamo OAuth tokene potrebne za održavanje veze. Šifrujemo ih u stanju mirovanja. Kada prekinete vezu sa uslugom Google Calendar, prestajemo sa sinhronizacijom, brišemo sačuvane tokene i brišemo zauzete termine koje smo kopirali iz Vašeg kalendara. Događaji za termine koje smo već kreirali ostaju u Vašem kalendaru Google Calendar; tamo ih možete obrisati.`,
        `7.4 <strong>Deljenje.</strong> Podatke Google korisnika delimo samo sa interfejsom Google Calendar API radi izvršavanja radnji koje ste zatražili i sa našim pružaocima usluga hostinga koji ih čuvaju za nas.`,
        `7.5 <strong>AI obrada.</strong> Naslove i opise događaja iz Vašeg kalendara Google Calendar ne šaljemo pružaocima AI usluga. AI recepcioner dobija samo izvedene informacije o rasporedu, na primer da li je neki termin slobodan i da li je zakazivanje uspelo.`,
        `7.6 <strong>Ograničeno korišćenje.</strong> Korišćenje i prenos podataka koje LobbyStack dobija od Google API-ja usklađeni su sa dokumentom <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, uključujući njegove zahteve za ograničeno korišćenje (Limited Use). Ne prodajemo podatke Google korisnika, ne koristimo ih za oglašavanje i ne koristimo ih za treniranje ili unapređenje opštih modela veštačke inteligencije ili mašinskog učenja.`,
      ],
    },
    {
      id: "sms",
      nav: "SMS poruke",
      title: "8. SMS poruke",
      blocks: [
        `8.1 LobbyStack šalje nemarketinške SMS poruke putem usluge Twilio: obaveštenja zaposlenima firme, jedan podsetnik oko 24 sata pre termina Pozivaocima koji su na to pristali prilikom zakazivanja i jednokratne kodove za proveru. Učestalost poruka varira. Mogu se primeniti troškovi slanja poruka i prenosa podataka. Odgovorite <strong>STOP</strong> da biste se odjavili ili <strong>HELP</strong> za pomoć, ili pišite na ${support}.`,
        `8.2 Vodimo evidenciju o brojevima telefona, pristancima, odjavama, sadržaju poruka i statusu isporuke kako bismo slali poruke, poštovali odjave i ispunili zahteve operatera.`,
        `<strong>8.3 Ne prodajemo, ne iznajmljujemo i ne delimo brojeve mobilnih telefona, podatke o prijavi za prijem SMS poruka niti informacije o pristanku sa trećim licima ili povezanim licima za njihove marketinške ili promotivne svrhe.</strong>`,
      ],
    },
    {
      id: "share",
      nav: "Deljenje",
      title: "9. Kako delimo podatke",
      blocks: [
        `9.1 <strong>Pružaoci usluga.</strong> Za rad Usluge koristimo sledeće pružaoce usluga (podobrađivače). Svaki od njih sme da obrađuje podatke o ličnosti samo radi pružanja svoje usluge nama.`,
        {
          ul: [
            `<strong>OpenAI:</strong> AI glasovni razgovori, odgovori u četu, rezimei, vektorske reprezentacije (embeddings) i privremeno čuvanje snimaka poziva tokom poziva;`,
            `<strong>Twilio:</strong> brojevi telefona, usmeravanje i preusmeravanje poziva i SMS poruke;`,
            `<strong>Railway:</strong> hosting aplikacije, baze podataka i skladištenje datoteka, uključujući snimke;`,
            `<strong>Cloudflare:</strong> hosting sajta, isporuka sadržaja, bezbednost i zaštita od botova pri registraciji;`,
            `<strong>PostHog:</strong> analitika sajta i proizvoda i, uz pristanak, snimci sesija na sajtu;`,
            `<strong>Polar:</strong> proces kupovine, pretplate, naplata potrošnje i obrada plaćanja;`,
            `<strong>Google:</strong> pristup kalendaru, samo kada povežete Google Calendar;`,
            `<strong>Firecrawl:</strong> čitanje Vašeg javnog sajta, samo kada ga uvezete u znanje svoje firme;`,
            `<strong>Resend:</strong> imejlovi u vezi sa nalogom i obaveštenjima;`,
            `<strong>PayPal:</strong> isplate partnerima;`,
            `pružaoci usluga nadzora i evidentiranja koji nam pomažu da otkrivamo greške i održavamo rad Usluge.`,
          ],
        },
        `9.2 <strong>Firma koju kontaktirate.</strong> Kada pozovete firmu koja koristi LobbyStack ili se s njom dopisujete putem četa, Vaše podatke činimo dostupnim toj firmi na njenoj kontrolnoj tabli, u obaveštenjima i u povezanom kalendaru.`,
        `9.3 <strong>Pravni i bezbednosni razlozi.</strong> Podatke možemo otkriti radi postupanja u skladu sa zakonom, sudskim nalogom ili zakonitim zahtevom nadležnih organa, radi sprovođenja naših Uslova ili radi zaštite prava, imovine ili bezbednosti kompanije LobbyStack, naših klijenata ili drugih lica.`,
        `9.4 <strong>Poslovni prenosi.</strong> Podatke možemo deliti sa kupcem, investitorom ili pravnim sledbenikom u slučaju spajanja, preuzimanja, finansiranja, reorganizacije ili prodaje imovine, uz obavezu čuvanja poverljivosti. Obavestićemo Vas ako Vaši podaci postanu predmet drugačije politike privatnosti.`,
        `9.5 <strong>Uz Vaš pristanak.</strong> Podatke možemo deliti i u druge svrhe kada nas to zatražite ili se sa tim saglasite.`,
        `9.6 <strong>Bez prodaje.</strong> Ne prodajemo podatke o ličnosti i ne delimo ih radi bihevioralnog oglašavanja zasnovanog na aktivnostima u različitim kontekstima (cross-context behavioral advertising).`,
      ],
    },
    {
      id: "cookies",
      nav: "Kolačići",
      title: "10. Kolačići i analitika",
      blocks: [
        `10.1 Koristimo neophodne kolačiće i skladište pregledača za rad našeg sajta, pamćenje Vašeg izbora u vezi sa kolačićima i zaštitu od zloupotreba. PostHog analitičke kolačiće i snimke sesija koristimo tek nakon što ih prihvatite u našem baneru za kolačiće. Pre nego što napravite izbor, brojimo preglede stranica bez čuvanja bilo čega na Vašem uređaju. Ako odbijete opcione kolačiće, zaustavljamo analitiku na našem sajtu.`,
        `10.2 Svoj izbor možete promeniti u bilo kom trenutku putem linka <strong>Podešavanja kolačića</strong> u podnožju stranice. Naša <a href="/sr/cookie-policy/">Politika kolačića</a> navodi kolačiće koje koristimo.`,
        `10.3 Kontrolna tabla LobbyStack koristi PostHog da bi razumela kako prijavljeni korisnici koriste proizvod, i to samo dok je analitika proizvoda uključena u Vašim podešavanjima. Kontrolna tabla ne prikuplja analitiku na stranicama označenim kao osetljive.`,
      ],
    },
    {
      id: "transfers",
      nav: "Prenosi",
      title: "11. Međunarodni prenosi",
      blocks: [
        `11.1 Sedište nam je u Kanadi. Mi i naši pružaoci usluga obrađujemo podatke o ličnosti u Kanadi, Sjedinjenim Američkim Državama i drugim zemljama u kojima naši pružaoci usluga posluju. Zakoni o privatnosti u tim zemljama mogu se razlikovati od zakona u mestu u kome živite, a tamošnji organi mogu imati pristup podacima na osnovu svojih zakona.`,
        `11.2 Pre nego što podatke o ličnosti pošaljemo van Kvebeka ili Kanade, procenjujemo rizike i koristimo ugovore i druge mere zaštite kako bismo ih zaštitili. Kada se primenjuje GDPR, oslanjamo se na odluke o adekvatnosti ili na standardne ugovorne klauzule koje je odobrila Evropska komisija ili Ujedinjeno Kraljevstvo.`,
      ],
    },
    {
      id: "retention",
      nav: "Čuvanje",
      title: "12. Čuvanje podataka",
      blocks: [
        `12.1 Hostovana Usluga podrazumevano automatski briše sadržaj Pozivalaca nakon sledećih rokova:`,
        {
          ul: [
            `<strong>Paket Free:</strong> snimke, transkripte, poruke i stavke za praćenje nakon 30 dana;`,
            `<strong>Paketi Starter i Pro:</strong> snimke i transkripte nakon 90 dana, a poruke i stavke za praćenje nakon 365 dana;`,
            `<strong>Paketi Enterprise:</strong> isti rokovi kao za pakete Starter i Pro, osim ako Porudžbina ne utvrđuje drugačije rokove.`,
          ],
        },
        `12.2 Firma može ranije obrisati neke evidencije, kao što su kontakti, sa svoje kontrolne table i može od nas zatražiti da obrišemo drugi sadržaj.`,
        `12.3 Podatke o nalogu čuvamo dok je nalog otvoren. Nakon zatvaranja naloga brišemo ih ili deidentifikujemo, osim evidencija koje moramo da čuvamo iz pravnih, poreskih, računovodstvenih ili bezbednosnih razloga ili radi rešavanja sporova, a njih čuvamo samo onoliko dugo koliko je potrebno za te svrhe.`,
        `12.4 Obrisani podaci mogu ostati u rezervnim kopijama dok te kopije ne isteknu u svom redovnom ciklusu. Ne vraćamo ih u aktivnu upotrebu.`,
        `12.5 OpenAI i drugi naši pružaoci usluga mogu čuvati podatke ograničeno vreme prema sopstvenim pravilima.`,
      ],
    },
    {
      id: "security",
      nav: "Bezbednost",
      title: "13. Bezbednost",
      blocks: [
        `13.1 Za zaštitu podataka o ličnosti koristimo administrativne, tehničke i fizičke mere zaštite. One obuhvataju šifrovanje tokom prenosa, šifrovanje u stanju mirovanja za osetljive akreditive kao što su tokeni za kalendar, pravila pristupa bazi podataka koja razdvajaju podatke svake firme, pristup zasnovan na ulogama, ograničen pristup zaposlenih i evidentiranje.`,
        `13.2 Nijedan sistem nije potpuno bezbedan i ne možemo garantovati bezbednost podataka. Vi ste odgovorni za čuvanje svoje lozinke i za upravljanje time ko može da pristupi Vašem nalogu.`,
        `13.3 Ako bezbednosni incident stvori rizik od ozbiljne štete po Vas, obavestićemo Vas i nadležne organe kako to zakon zahteva. Kada incident obuhvata podatke Pozivalaca, obavestićemo pogođenu firmu kako bi mogla da ispuni sopstvene obaveze.`,
      ],
    },
    {
      id: "rights",
      nav: "Vaša prava",
      title: "14. Vaša prava na privatnost",
      blocks: [
        `14.1 U zavisnosti od toga gde živite, možete imati pravo da:`,
        {
          ul: [
            `saznate koje podatke o ličnosti imamo o Vama i dobijete njihovu kopiju;`,
            `ispravite netačne podatke;`,
            `zahtevate brisanje svojih podataka;`,
            `dobijete svoje podatke u prenosivom formatu;`,
            `uložite prigovor na određenu obradu ili zahtevate njeno ograničenje;`,
            `povučete pristanak, bez uticaja na obradu izvršenu pre toga;`,
            `podnesete pritužbu organu nadležnom za zaštitu privatnosti.`,
          ],
        },
        `14.2 Da biste podneli zahtev, pošaljite imejl na ${support}. Pre nego što postupimo, proverićemo Vaš identitet i u tu svrhu možemo zatražiti dodatne informacije. Možete koristiti ovlašćenog zastupnika tamo gde zakon to dozvoljava, a mi možemo zatražiti dokaz o ovlašćenju zastupnika.`,
        `14.3 Odgovorićemo u roku koji propisuje zakon, obično u roku od 30 dana. Ako odbijemo Vaš zahtev, objasnićemo razlog i obavestiti Vas kako možete uložiti žalbu ili pritužbu.`,
        `14.4 Ako se Vaš zahtev odnosi na podatke koje obrađujemo za neku firmu, prosledićemo ga toj firmi ili ćemo Vas zamoliti da je kontaktirate. Pogledajte odeljak 18.`,
      ],
    },
    {
      id: "canada",
      nav: "Kanada i Kvebek",
      title: "15. Kanada i Kvebek",
      blocks: [
        `15.1 Podatke o ličnosti obrađujemo u skladu sa kanadskim Zakonom o zaštiti ličnih informacija i elektronskim dokumentima (PIPEDA) i kvebečkim Zakonom o zaštiti ličnih informacija u privatnom sektoru (Act respecting the protection of personal information in the private sector), sa izmenama uvedenim Zakonom 25 (Law 25).`,
        `15.2 Lice odgovorno za zaštitu podataka o ličnosti kod nas je Raphaël Morency, lice sa najvišim ovlašćenjima u kompaniji Lobbystack Inc. Možete ga kontaktirati na ${support} ili poštom na adresu 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canada.`,
        `15.3 Možete zatražiti pristup svojim podacima ili njihovu ispravku, povući pristanak ili, u Kvebeku, zatražiti svoje kompjuterizovane podatke u strukturisanom, uobičajeno korišćenom tehnološkom formatu. Ako AI recepcioner donese odluku o Vama isključivo na osnovu automatizovane obrade, možete od firme zatražiti da Vas obavesti koji su podaci korišćeni i da odluku preispita osoba.`,
        `15.4 Ako niste zadovoljni našim odgovorom, možete se obratiti organu Commission d'accès à l'information du Québec ili Kancelariji poverenika za zaštitu privatnosti Kanade (Office of the Privacy Commissioner of Canada).`,
      ],
    },
    {
      id: "gdpr",
      nav: "EU i UK",
      title: "16. Evropski ekonomski prostor i Ujedinjeno Kraljevstvo",
      blocks: [
        `16.1 Ako se na Vas primenjuje GDPR ili UK GDPR, imate prava navedena u odeljku 14 i možete podneti pritužbu organu za zaštitu podataka u mestu gde živite ili radite, ili u mestu gde smatrate da je došlo do povrede.`,
        `16.2 Naši pravni osnovi navedeni su u odeljku 5, a mere zaštite pri prenosu u odeljku 11.`,
      ],
    },
    {
      id: "us-states",
      nav: "Prava u SAD",
      title: "17. Prava na privatnost u saveznim državama SAD",
      blocks: [
        `17.1 Ovaj odeljak se primenjuje ako se na nas i na Vas primenjuje Kalifornijski zakon o privatnosti potrošača (CCPA), sa izmenama uvedenim zakonom CPRA, ili sličan zakon neke savezne države SAD.`,
        `17.2 U poslednjih 12 meseci prikupili smo sledeće kategorije podataka o ličnosti: identifikatore (kao što su ime, imejl adresa, broj telefona i IP adresa); evidencije o klijentima (kao što su podaci o naplati); komercijalne podatke (kao što su paketi i kupovine); podatke o aktivnostima na internetu i mreži; približnu geolokaciju; audio i elektronske podatke (kao što su snimci poziva i poruke iz četa); profesionalne podatke (kao što su naziv firme i uloga); i zaključke izvedene iz korišćenja proizvoda. Odeljak 3 ih detaljno opisuje, a odeljak 3.8 navodi njihove izvore.`,
        `17.3 Ove kategorije koristimo u poslovne svrhe navedene u odeljku 4 i u te svrhe ih otkrivamo pružaocima usluga iz odeljka 9.1. Čuvamo ih tokom rokova navedenih u odeljku 12.`,
        `17.4 Ne prodajemo i ne delimo podatke o ličnosti radi bihevioralnog oglašavanja zasnovanog na aktivnostima u različitim kontekstima, niti smo to činili u poslednjih 12 meseci. Nemamo stvarna saznanja o tome da smo prodali ili delili podatke bilo kog lica mlađeg od 16 godina.`,
        `17.5 Osetljive podatke o ličnosti, kao što su akreditivi za prijavu na nalog, koristimo samo u svrhe koje zakon dozvoljava, kao što su pružanje Usluge i održavanje njene bezbednosti. Ne koristimo ih da bismo izvodili zaključke o Vašim karakteristikama.`,
        `17.6 Možete zatražiti informacije o svojim podacima o ličnosti, pristup tim podacima, njihovu ispravku ili brisanje. Nećemo Vas diskriminisati zato što koristite svoja prava.`,
      ],
    },
    {
      id: "callers",
      nav: "Pozivaoci",
      title: "18. Ako ste pozvali firmu ili se s njom dopisivali putem četa",
      blocks: [
        `18.1 Ako ste pozvali firmu koja koristi LobbyStack, dopisivali se s njom putem četa ili od nje primili SMS poruku, ta firma kontroliše Vaše podatke. Zahteve za pristup, ispravku, brisanje i druge zahteve u vezi sa privatnošću najpre uputite toj firmi.`,
        `18.2 Ako se umesto toga obratite nama, prosledićemo Vaš zahtev firmi ili ćemo Vam reći kako da je kontaktirate, i pomoći ćemo firmi da odgovori. Ne možemo postupiti po Vašem zahtevu bez uputstava firme, osim kada to zakon od nas zahteva.`,
        `18.3 Da biste prestali da primate SMS podsetnike ili kodove za proveru, odgovorite <strong>STOP</strong> na bilo koju poruku.`,
      ],
    },
    {
      id: "children",
      nav: "Deca",
      title: "19. Deca",
      blocks: [
        `Usluga je namenjena firmama i nije usmerena na decu. Ne prikupljamo svesno podatke o ličnosti dece mlađe od 16 godina putem našeg sajta ili registracije naloga. Naši Uslovi zabranjuju firmama da Uslugu koriste za usluge namenjene deci. Ako smatrate da nam je dete dalo podatke o ličnosti, kontaktirajte nas i obrisaćemo ih.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Samostalno hostovanje",
      title: "20. Samostalno hostovan LobbyStack",
      blocks: [
        `Izvorni kod softvera LobbyStack je otvoren (open source). Kada neka organizacija pokreće LobbyStack na sopstvenim serverima, ne primamo, ne pristupamo niti obrađujemo bilo kakve podatke iz te instalacije. Organizacija koja je pokreće odgovorna je za svoju praksu zaštite privatnosti. Sa svim pitanjima obratite se toj organizaciji.`,
      ],
    },
    {
      id: "changes",
      nav: "Izmene",
      title: "21. Izmene ove Politike",
      blocks: [
        `Ovu Politiku možemo ažurirati. Novu verziju objavićemo na ovoj stranici i promeniti datum na vrhu. Ako je izmena bitna, obavestićemo nosioce naloga imejlom ili u okviru Usluge pre nego što izmena stupi na snagu i zatražićemo pristanak tamo gde to zakon zahteva.`,
      ],
    },
    {
      id: "contact",
      nav: "Kontakt",
      title: "22. Kontaktirajte nas",
      blocks: [
        `Pitanja, zahteve ili pritužbe u vezi sa ovom Politikom pošaljite kompaniji Lobbystack Inc. na ${support}. Možete nam pisati i na adresu 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canada. Vaše korišćenje Usluge uređuju i naši <a href="/sr/terms/">Uslovi korišćenja</a>.`,
      ],
    },
  ],
}
