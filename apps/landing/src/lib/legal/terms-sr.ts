import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const termsSr: LegalDocument = {
  updated: "Poslednje ažuriranje: 26. septembar 2026.",
  h1: "Uslovi korišćenja",
  intro: `Ovi Uslovi korišćenja („Uslovi“) uređuju Vaše korišćenje hostovane usluge, sajtova i podrške kompanije LobbyStack. Pročitajte ih pre nego što počnete da koristite LobbyStack. Oni ograničavaju našu odgovornost, čine Vas odgovornim za pristanak na snimanje poziva i za usklađenost SMS poruka sa propisima i utvrđuju način na koji rešavamo sporove.`,
  sections: [
    {
      id: "agreement",
      nav: "Ugovor",
      title: "1. Ugovor i uslovi za korišćenje",
      blocks: [
        `1.1 Ovi Uslovi predstavljaju ugovor između Vas i kompanije Lobbystack Inc. („LobbyStack“, „mi“, „naš“ ili „nas“). Prihvatate ih kada otvorite nalog, označite polje ili kliknete na dugme koje upućuje na njih, kupite paket ili koristite Uslugu. Ako se ne slažete, nemojte koristiti Uslugu.`,
        `1.2 LobbyStack je namenjen isključivo firmama. Potvrđujete da Uslugu koristite za posao, delatnost ili profesiju, a ne u lične, porodične ili kućne svrhe. Kada koristite Uslugu, niste potrošač u smislu kvebečkog Zakona o zaštiti potrošača (Consumer Protection Act) ili bilo kog sličnog zakona.`,
        `1.3 Ako ove Uslove prihvatate u ime kompanije ili druge organizacije, potvrđujete da ste ovlašćeni da je obavežete. „Vi“ i „Klijent“ u tom slučaju označavaju tu organizaciju. Morate imati najmanje 18 godina i biti punoletni prema propisima mesta u kome živite.`,
        `1.4 Ako Vi i LobbyStack potpišete obrazac porudžbine ili drugi pisani ugovor za Uslugu („Porudžbina“), Porudžbina ima prednost u odnosu na ove Uslove ako su međusobno u suprotnosti, ali samo u pogledu predmeta koji Porudžbina obuhvata.`,
      ],
    },
    {
      id: "definitions",
      nav: "Definicije",
      title: "2. Definicije",
      blocks: [
        {
          ul: [
            `<strong>Usluga</strong> označava hostovanog AI recepcionera kompanije LobbyStack, kontrolnu tablu, vidžet za čet i pozive na sajtu, naše sajtove, naše API-je i povezanu podršku koju Vam pružamo.`,
            `<strong>Ovlašćeni korisnici</strong> označavaju Vaše zaposlene i spoljne saradnike kojima dozvolite da koriste Vaš nalog.`,
            `<strong>Pozivaoci</strong> označavaju lica koja komuniciraju sa Vašim AI recepcionerom putem telefonskog poziva, poziva iz pregledača ili četa na sajtu, kao i lica koja primaju SMS poruke poslate putem Usluge.`,
            `<strong>Podaci Klijenta</strong> označavaju podatke koje Vi ili Vaši Pozivaoci dostavite Usluzi, uključujući podatke o firmi, sadržaj znanja, zvuk poziva, snimke, transkripte, poruke, razgovore u četu, kontakt podatke i evidencije o terminima.`,
            `<strong>AI rezultat</strong> označava sve što Usluga generiše pomoću veštačke inteligencije, uključujući izgovorene odgovore, odgovore u četu, rezimee i radnje zakazivanja.`,
            `<strong>Usluge trećih lica</strong> označavaju proizvode i usluge koje ne posedujemo i ne kontrolišemo, kao što su telefonski operateri, pružaoci AI modela, kalendari i pružaoci usluga obrade plaćanja.`,
          ],
        },
      ],
    },
    {
      id: "service",
      nav: "Usluga",
      title: "3. Usluga",
      blocks: [
        `3.1 LobbyStack je AI recepcioner za mala preduzeća. U zavisnosti od Vašeg paketa i podešavanja, Usluga može da odgovara na dolazne telefonske pozive i pozive iz pregledača pomoću AI glasovnog agenta, odgovara na pitanja u četu na sajtu, zakazuje, otkazuje i pomera termine nakon provere Pozivaoca, prima poruke, preusmerava pozive Vašim zaposlenima, snima i transkribuje pozive, šalje SMS obaveštenja Vašem timu i šalje opcioni SMS podsetnik za termin Pozivaocima koji pristanu da ga prime.`,
        `3.2 Funkcije, ograničenja i uključena potrošnja razlikuju se u zavisnosti od paketa. Opisani su na <a href="/sr/pricing/">stranici sa cenama</a> ili u Vašoj Porudžbini. Možemo dodavati, menjati ili uklanjati funkcije. Ako uklonimo bitnu funkciju iz plaćenog paketa koji koristite, obavestićemo Vas u razumnom roku. Ne obećavamo nikakve buduće funkcije i ne bi trebalo da kupujete paket oslanjajući se na neku od njih.`,
        `3.3 Dajemo Vam ograničeno, neisključivo i neprenosivo pravo, bez prava na podlicenciranje, da koristite Uslugu za svoje interne poslovne potrebe tokom trajanja pretplate, u skladu sa ovim Uslovima. Ovo uključuje pravo da naš vidžet postavite na sajtove koje kontrolišete.`,
      ],
    },
    {
      id: "accounts",
      nav: "Nalozi",
      title: "4. Nalozi i bezbednost",
      blocks: [
        `4.1 Dužni ste da nam dostavite tačne podatke o nalogu, firmi i naplati i da ih redovno ažurirate.`,
        `4.2 Odgovorni ste za svoje Ovlašćene korisnike i za sve što se dešava na Vašem nalogu. Čuvajte lozinke i pristup na bezbedan način. Odmah nas obavestite na ${support} ako sumnjate na neovlašćeni pristup.`,
        `4.3 Možemo odbiti, suspendovati ili zatvoriti nalog koji koristi lažne podatke, za koji se čini da je duplikat otvoren radi sticanja dodatne besplatne potrošnje ili koji stvara rizik za LobbyStack, naše pružaoce usluga ili druga lica.`,
      ],
    },
    {
      id: "ai",
      nav: "AI rezultat",
      title: "5. AI recepcioner i AI rezultat",
      blocks: [
        `5.1 Usluga koristi veštačku inteligenciju, uključujući OpenAI modele. AI rezultat može biti netačan, nepotpun, nedosledan ili neprikladan. AI recepcioner može pogrešno razumeti Pozivaoca, dati odgovor koji Vaša firma ne bi dala, navesti pogrešnu cenu ili pravilo, zakazati pogrešan termin, ne uspeti da preusmeri poziv ili propustiti poruku.`,
        `5.2 Vi kontrolišete šta AI recepcioner zna i radi. Odgovorni ste za podatke o svojoj firmi, sadržaj znanja, uputstva, pozdrave, cene, radno vreme, usluge, pravila zakazivanja, brojeve za preusmeravanje i podešavanja obaveštenja. Morate testirati Uslugu pre nego što se na nju oslonite i nadzirati je dok je koristite.`,
        `5.3 Odgovorni ste za svaku izjavu, ponudu cene, obećanje ili zakazivanje koje AI recepcioner napravi u ime Vaše firme, kao i za njihovo ispunjavanje ili ispravljanje prema Vašim Pozivaocima. LobbyStack nije strana u Vašim odnosima sa Pozivaocima.`,
        `5.4 Usluga ne pruža medicinske, pravne, finansijske, poreske, bezbednosne ili druge stručne savete. Nemojte je podešavati tako da pruža takve savete ili donosi odluke za koje je potreban kvalifikovani stručnjak ili provera od strane čoveka.`,
        `5.5 Neki zakoni zahtevaju da obavestite ljude da razgovaraju sa AI sistemom. Dužni ste da pružite ta obaveštenja. AI recepcioner ne sme da tvrdi da je čovek kada ga Pozivalac to iskreno pita.`,
      ],
    },
    {
      id: "emergencies",
      nav: "Hitni slučajevi",
      title: "6. Usluga nije namenjena hitnim slučajevima",
      blocks: [
        `<strong>6.1 LobbyStack nije služba za hitne slučajeve i ne podržava pozive na brojeve 911, 999, 112 ili bilo koji drugi broj za hitne slučajeve.</strong> Usluga ne može da uputi pomoć, utvrdi lokaciju Pozivaoca niti da bilo koji poziv tretira kao hitan.`,
        `6.2 Nemojte koristiti Uslugu, niti dozvoliti Pozivaocima da se na nju oslanjaju, za hitne slučajeve, krizne linije ili situacije u kojima su ugroženi životi. Ako Vaša firma može primati hitne pozive, Vaš pozdrav ili uputstva treba da upute Pozivaoce da prekinu vezu i pozovu lokalni broj za hitne slučajeve, a Vi morate imati postupak u kome takve pozive obrađuju ljudi.`,
      ],
    },
    {
      id: "recording",
      nav: "Snimanje poziva",
      title: "7. Snimanje poziva, transkripcija i obaveštenja Pozivaocima",
      blocks: [
        `7.1 Usluga snima i transkribuje pozive, čuva razgovore iz četa na sajtu i koristi AI za obradu onoga što Pozivaoci kažu. Vi odlučujete da koristite ove funkcije i Vi ih primenjujete prema svojim Pozivaocima.`,
        `7.2 <strong>Isključivo ste Vi odgovorni za davanje svih obaveštenja i pribavljanje svih pristanaka koje zakon zahteva</strong> pre nego što se poziv ili čet snimi, transkribuje ili obradi pomoću AI. Ovo uključuje zakone koji zahtevaju pristanak svih učesnika u pozivu, kao što su zakoni Kalifornije, Floride, Ilinoisa, Merilenda, Masačusetsa, Pensilvanije i Vašingtona, kao i kanadske i kvebečke zakone o privatnosti. Ovo uključuje i zakone o presretanju komunikacija, prisluškivanju i obaveštavanju o upotrebi AI u svakom mestu u kome se nalazite Vi ili Vaši Pozivaoci.`,
        `7.3 Usluga ne koristi glasove Pozivalaca da bi ih identifikovala. Ako Vaše korišćenje Usluge podleže zakonima o privatnosti biometrijskih podataka, kao što su Zakon države Ilinois o privatnosti biometrijskih informacija (Illinois Biometric Information Privacy Act) ili slični zakoni u Teksasu i Vašingtonu, odgovorni ste za usklađenost sa njima, uključujući sva obaveštenja, pisane pristanke i politike čuvanja koje oni zahtevaju.`,
        `7.4 Dužni ste da podesite svoj pozdrav ili obaveštenja na sajtu tako da Pozivaoci, pre početka razgovora, saznaju da poziv ili čet može biti snimljen i obrađen od strane AI sistema. Podrazumevani pozdrav ili šablon kompanije LobbyStack ne prenosi ovu odgovornost na nas. Ako naš vidžet postavite na svoj sajt, odgovorni ste i za sva obaveštenja i pristanke u vezi sa kolačićima ili skladištem pregledača koji su Vašem sajtu potrebni, jer vidžet čuva nasumični identifikator posetioca u pregledaču posetioca.`,
        `7.5 Ne smete koristiti Uslugu za prikupljanje brojeva platnih kartica, brojeva državnih identifikacionih dokumenata, zdravstvenih podataka ili drugih osetljivih podataka, osim ako to zakon dozvoljava i ako imate sve potrebne mere zaštite i pristanke. LobbyStack nije namenjen obradi zaštićenih zdravstvenih informacija u smislu zakona HIPAA. Ne potpisujemo ugovore sa poslovnim saradnicima (business associate agreements), osim ako se na takav ugovor ne saglasimo u potpisanoj pisanoj formi.`,
      ],
    },
    {
      id: "telephony",
      nav: "Brojevi telefona",
      title: "8. Brojevi telefona i telefonija",
      blocks: [
        `8.1 Brojeve telefona i pozive obezbeđujemo preko telefonskih operatera koji su treća lica, trenutno preko usluge Twilio. Paketi Starter i Pro uključuju jedan poslovni broj. Paket Free uključuje samo pozive iz pregledača i ne uključuje broj telefona.`,
        `8.2 Broj telefona koji Vam obezbedimo nije Vaše vlasništvo. Imate pravo da ga koristite dok je Vaša plaćena pretplata aktivna i uredno izmirena. Operateri, regulatorni organi ili naši pružaoci usluga mogu od nas zahtevati da broj promenimo, povučemo ili ograničimo, i mi za to nismo odgovorni.`,
        `8.3 Ne garantujemo da je određeni broj, pozivni broj područja ili zemlja dostupna, niti da se broj može preneti u Uslugu ili iz nje. Tamo gde podržavamo prenos broja iz Usluge, morate to zatražiti pre zatvaranja naloga i platiti sve naknade operatera.`,
        `8.4 Kada Vaša pretplata prestane, bude prebačena na paket Free ili suspendovana zbog neplaćanja, možemo osloboditi Vaš broj. Oslobođeni broj može biti dodeljen nekom drugom. Nismo odgovorni za pozive ili SMS poruke koje stignu na broj nakon što je oslobođen.`,
        `8.5 Kvalitet poziva, uspostavljanje veze, ID pozivaoca i preusmeravanja zavise od operatera i mreža koje ne kontrolišemo. Odgovorni ste za prosleđivanje poziva sa svojih postojećih linija, za navođenje tačnih brojeva za preusmeravanje i za to da na tim brojevima ima ko da se javi. Preusmeravanja mogu da ne uspeju i Usluga ne garantuje da će se neko javiti na preusmereni poziv.`,
      ],
    },
    {
      id: "sms",
      nav: "SMS poruke",
      title: "9. SMS poruke",
      blocks: [
        { h3: "SMS program LobbyStack" },
        `9.1 Naziv programa: LobbyStack. LobbyStack šalje nemarketinške, transakcione SMS poruke za firme koje koriste Uslugu. To uključuje obaveštenja zaposlenima firme o pozivima, porukama i zakazivanjima; jedan podsetnik za termin poslat oko 24 sata pre termina, isključivo Pozivaocima koji su prilikom zakazivanja pristali da ga prime; i jednokratne kodove kojima se potvrđuje broj telefona neke osobe ili identitet Pozivaoca pre izmene termina. LobbyStack ne šalje marketinške SMS poruke i ne odgovara na SMS poruke pomoću AI.`,
        `9.2 Učestalost poruka zavisi od Vaše aktivnosti. Mogu se primeniti troškovi slanja poruka i prenosa podataka. Odgovorite <strong>STOP</strong> da biste prestali da primate poruke i <strong>HELP</strong> za pomoć, ili pišite na ${support}. Nakon što odgovorite STOP, možete primiti jednu poruku potvrde, a nakon toga na taj broj nećemo slati poruke osim ako se ponovo ne prijavite. Operateri nisu odgovorni za zakasnele ili neisporučene poruke.`,
        { h3: "Vaše obaveze" },
        `9.3 Kao primaoce obaveštenja smete dodati samo svoje zaposlene ili spoljne saradnike koji su pristali da primaju SMS obaveštenja. Odgovorni ste za svaku SMS poruku poslatu na broj koji unesete u Uslugu.`,
        `9.4 Odgovorni ste za usklađenost sa Zakonom o zaštiti korisnika telefonskih usluga (Telephone Consumer Protection Act, TCPA), kanadskim zakonom protiv neželjenih poruka (Canada's Anti-Spam Legislation, CASL), smernicama organizacije CTIA, pravilima operatera, zahtevima za registraciju A2P 10DLC i svim drugim zakonima koji se primenjuju na SMS poruke poslate za Vašu firmu. Dužni ste da nam dostavite istinite podatke za registraciju kod operatera. Operateri mogu filtrirati, odlagati ili blokirati poruke, a mi možemo privremeno obustaviti slanje poruka dok je registracija u postupku ili ako je odbijena.`,
      ],
    },
    {
      id: "acceptable-use",
      nav: "Prihvatljivo korišćenje",
      title: "10. Prihvatljivo korišćenje",
      blocks: [
        `10.1 Ne smete koristiti Uslugu, niti dozvoliti bilo kome drugom da je koristi, da biste:`,
        {
          ul: [
            `upućivali ili pokušavali da uputite nezatražene pozive ili SMS poruke, automatizovane pozive (robocalls) ili telemarketing;`,
            `slali neželjene poruke (spam), sadržaj za fišing ili prevarni sadržaj;`,
            `se lažno predstavljali kao neka osoba, firma ili državni organ ili obmanjivali Pozivaoce o tome s kim razgovaraju;`,
            `kršili bilo koji zakon, uključujući zakone o privatnosti, zaštiti potrošača, telemarketingu, suzbijanju neželjenih poruka, snimanju, diskriminaciji i intelektualnoj svojini;`,
            `uznemiravali, pretili ili zlostavljali bilo koga ili promovisali nasilje ili mržnju;`,
            `nudili ili promovisali nezakonitu robu ili usluge;`,
            `obrađivali hitne slučajeve ili krizne linije, pružali medicinske, pravne ili finansijske savete ili donosili odluke o kreditima, zapošljavanju, stanovanju, osiguranju, obrazovanju ili pristupu osnovnim uslugama;`,
            `nudili uslugu namenjenu deci mlađoj od 16 godina;`,
            `otpremali sadržaj koji nemate pravo da koristite ili kojim se povređuju tuđa prava;`,
            `slali zlonamerni softver, ispitivali ili testirali bezbednost Usluge bez našeg pisanog odobrenja ili ometali njen rad;`,
            `zaobilazili ograničenja potrošnje, limite potrošnje, naplatu, registraciju kod operatera ili bezbednosne kontrole;`,
            `prikupljali podatke iz Usluge automatizovanim putem (scraping), sprovodili testove opterećenja nad njom ili joj pristupali automatizovanim sredstvima osim putem naših objavljenih interfejsa;`,
            `preprodavali, iznajmljivali ili nudili hostovanu Uslugu trećim licima bez pisanog ugovora sa nama; ili`,
            `kršili pravila korišćenja kompanija OpenAI, Twilio ili bilo koje druge Usluge trećeg lica koja se koristi za pružanje Usluge.`,
          ],
        },
        `10.2 Možemo istraživati sumnje na kršenja. Možemo ukloniti sadržaj, blokirati brojeve, onemogućiti funkcije ili suspendovati naloge kako bismo zaustavili kršenje ili postupili u skladu sa zahtevom operatera, pružaoca usluga ili zakona. Nismo dužni da nadziremo Vaše korišćenje i nismo odgovorni za sadržaj koji Vi ili Vaši Pozivaoci dostavite.`,
      ],
    },
    {
      id: "third-party",
      nav: "Treća lica",
      title: "11. Usluge trećih lica",
      blocks: [
        `11.1 Usluga se oslanja na Usluge trećih lica, uključujući OpenAI za AI glas i tekst, Twilio za brojeve telefona, pozive i SMS poruke, Google Calendar kada ga povežete, Polar za naplatu i Firecrawl kada uvezete svoj sajt. <a href="/sr/privacy/">Politika privatnosti</a> navodi pružaoce usluga koji obrađuju podatke o ličnosti.`,
        `11.2 Kada povežete ili koristite Uslugu trećeg lica, na Vas se primenjuju i njeni uslovi i pravila. Odgovorni ste za njihovo poštovanje i za svaki nalog koji imate kod tog pružaoca usluga.`,
        `11.3 Ne kontrolišemo Usluge trećih lica i nismo odgovorni za njihovu dostupnost, tačnost, bezbednost, cene ili izmene. Ako pružalac usluga izmeni ili ukine uslugu na koju se oslanjamo, možemo izmeniti ili ukloniti odgovarajuću funkciju.`,
      ],
    },
    {
      id: "billing",
      nav: "Naknade i naplata",
      title: "12. Paketi, naknade i naplata",
      blocks: [
        `12.1 <strong>Paketi.</strong> Nudimo paket Free, plaćene pakete Starter i Pro i pakete Enterprise na osnovu Porudžbine. <a href="/sr/pricing/">Stranica sa cenama</a>, proces kupovine ili Vaša Porudžbina utvrđuju važeće cene, uključenu potrošnju i cene prekoračenja.`,
        `12.2 <strong>Plaćanje.</strong> Naš pružalac usluga obrade plaćanja, trenutno Polar, obrađuje kupovinu i naplatu. Ovlašćujete nas i kompaniju Polar da o dospeću teretimo Vaše sredstvo plaćanja za naknade za pretplatu, troškove potrošnje i poreze. Na Vašu kupovinu se primenjuju i uslovi kompanije Polar.`,
        `12.3 <strong>Automatsko obnavljanje.</strong> Plaćeni paketi se automatski obnavljaju na kraju svakog mesečnog ili godišnjeg perioda po tada važećoj ceni, sve dok ih ne otkažete. Možete ih otkazati na kontrolnoj tabli ili kontaktiranjem podrške. Otkazivanje proizvodi dejstvo na kraju tekućeg perioda.`,
        `12.4 <strong>Troškovi potrošnje.</strong> Plaćeni paketi uključuju utvrđene količine potrošnje, kao što su minuti razgovora i SMS obaveštenja. Potrošnja iznad tih količina naplaćuje se kao prekoračenje po cenama prikazanim na stranici sa cenama ili u Vašoj Porudžbini. Merodavne su naše evidencije o potrošnji i evidencije naših pružalaca usluga, osim ako sadrže očiglednu grešku.`,
        `12.5 <strong>Limiti potrošnje.</strong> Na paketima Starter i Pro možete postaviti limit potrošnje za prekoračenje. Kada ga dostignete, Usluga zaustavlja funkcije koje bi stvorile dodatne troškove prekoračenja do sledećeg obračunskog perioda ili dok ne povećate limit. <strong>To znači da AI recepcioner može prestati da odgovara na pozive.</strong> Limit ograničava samo troškove prekoračenja. Ne ograničava naknade za pretplatu niti poreze. Nismo odgovorni za pozive propuštene zbog limita ili zato što ste iskoristili uključenu potrošnju.`,
        `12.6 <strong>Porezi.</strong> Cene ne uključuju poreze, osim ako je drugačije navedeno. Plaćate sve poreze na promet, upotrebu, robu i usluge, dodatu vrednost i slične poreze, osim poreza na naš prihod.`,
        `12.7 <strong>Zakasnelo ili neuspelo plaćanje.</strong> Ako plaćanje ne uspe, mi ili Polar možemo ponovo pokušati naplatu. Ako iznos ostane neplaćen, možemo suspendovati Vaš nalog ili ga prebaciti na niži paket, osloboditi Vaš broj telefona ili zatvoriti Vaš nalog.`,
        `12.8 <strong>Povraćaj novca.</strong> Naknade se ne vraćaju, uključujući slučajeve delimičnih perioda, neiskorišćene potrošnje, prelaska na niži paket i otkazivanja, osim ako zakon zahteva drugačije ili se pisanim putem drugačije ne saglasimo.`,
        `12.9 <strong>Izmene cena.</strong> Možemo menjati cene i uključenu potrošnju. Za aktivan plaćeni paket obavestićemo Vas najmanje 30 dana unapred, a izmena se primenjuje od Vašeg sledećeg obnavljanja. Ako se ne slažete, otkažite paket pre obnavljanja.`,
        `12.10 <strong>Sporovi oko naplate.</strong> Dužni ste da nas o sporu oko naplate obavestite u roku od 60 dana od zaduženja. Kontaktirajte nas pre nego što pokrenete osporavanje transakcije kod izdavaoca kartice (chargeback).`,
        `12.11 <strong>Paket Free.</strong> Paket Free uključuje ograničen broj minuta poziva iz pregledača i ne uključuje broj telefona. Možemo u bilo kom trenutku izmeniti njegova ograničenja ili ga ukinuti. Možemo zatvoriti besplatne naloge koji duže vreme ostanu neaktivni. Za paket Free ne preuzimamo nikakvu obavezu pružanja podrške.`,
      ],
    },
    {
      id: "affiliate-program",
      nav: "Partnerski program",
      title: "13. Partnerski program",
      blocks: [
        `13.1 LobbyStack može nuditi partnerski program u okviru kog se isplaćuju provizije za preporuku novih klijenata. Ako učestvujete, ovaj odeljak se primenjuje pored ostalih odredbi ovih Uslova.`,
        `13.2 Osim ako Usluga ne navodi drugačije, partneri koji ispunjavaju uslove ostvaruju proviziju od 20% na kvalifikovana plaćanja koja preporučeni klijent izvrši tokom prvih 12 meseci nakon pripisivanja. Preporuke pratimo putem linkova ili kodova koje obezbeđujemo. Naše evidencije su odlučujuće za pripisivanje, ispunjenost uslova i iznose provizija.`,
        `13.3 Provizije podležu periodu zadržavanja od 30 dana. Provizija postaje plativa tek kada plaćanje preporučenog klijenta prođe taj period bez povraćaja novca, osporavanja transakcije (chargeback), spora, storniranja, knjižnog odobrenja ili otkazivanja. Možemo poništiti, umanjiti, zadržati ili stornirati neisplaćene provizije za plaćanja ili preporuke koje ne ispunjavaju uslove.`,
        `13.4 Partnerima isplaćujemo provizije putem usluge PayPal, na PayPal imejl adresu sačuvanu na partnerskoj kontrolnoj tabli. Minimalni iznos isplate je 100 USD u neisplaćenim provizijama koje ispunjavaju uslove. Vreme isplate može varirati u zavisnosti od provere, provere prevara, dostupnosti pružaoca usluga obrade plaćanja i tačnosti podataka za isplatu. Odgovorni ste za svoje poreze, prijavljivanje, naknade, konverziju valute i svoj platni nalog.`,
        `13.5 Ne smete preporučivati sami sebe, otvarati lažne naloge, iznositi obmanjujuće tvrdnje, slati neželjene poruke, lažno se predstavljati kao LobbyStack, licitirati za žigove kompanije LobbyStack ili slične pojmove u plaćenoj pretrazi, objavljivati lažne recenzije, zloupotrebljavati popuste, generisati veštački saobraćaj ili promovisati LobbyStack na način kojim se krše zakon, pravila platformi ili ovi Uslovi. Kada preporučujete LobbyStack, morate jasno navesti da za to možete dobiti naknadu.`,
        `13.6 Možemo odbiti, suspendovati ili okončati Vaše učešće i zadržati neisplaćene provizije u slučaju prevare, zloupotrebe, neusklađenosti ili rizika. Možemo u bilo kom trenutku izmeniti, privremeno obustaviti ili ukinuti program, njegove stope, pravila pripisivanja, periode zadržavanja, pragove za isplatu ili načine isplate, u skladu sa važećim propisima.`,
      ],
    },
    {
      id: "data",
      nav: "Podaci Klijenta",
      title: "14. Podaci Klijenta",
      blocks: [
        `14.1 <strong>Vlasništvo.</strong> U odnosu između Vas i kompanije LobbyStack, Vi ste vlasnik Podataka Klijenta.`,
        `14.2 <strong>Naša licenca.</strong> Dajete nam svetsku, neisključivu licencu bez naknade da hostujemo, kopiramo, obrađujemo, prenosimo, prikazujemo i prilagođavamo Podatke Klijenta u meri potrebnoj za pružanje, zaštitu, podršku, otklanjanje problema i unapređenje Usluge, za sprečavanje zloupotreba, za postupanje u skladu sa zakonom i za sprovođenje ovih Uslova. Naši pružaoci usluga mogu koristiti ovu licencu u naše ime samo da bi nam pomogli u tome.`,
        `14.3 <strong>Vaše garancije.</strong> Potvrđujete da imate sva prava, da ste dali sva obaveštenja i pribavili sve pristanke potrebne da bismo obrađivali Podatke Klijenta u skladu sa ovim Uslovima i <a href="/sr/privacy/">Politikom privatnosti</a>, kao i da se Podacima Klijenta ne povređuju ničija prava i ne krši nijedan zakon.`,
        `14.4 <strong>Naša uloga.</strong> U pogledu podataka o ličnosti Vaših Pozivalaca, postupamo kao Vaš pružalac usluga ili obrađivač. Obrađujemo ih u Vaše ime i prema Vašim uputstvima, kako je opisano u Politici privatnosti. Odgovorni ste za sopstvena obaveštenja o privatnosti namenjena Pozivaocima i za odgovaranje na njihove zahteve.`,
        `14.5 <strong>Bez treniranja modela.</strong> Ne koristimo Podatke Klijenta za treniranje AI modela. Naši pružaoci AI usluga obrađuju Podatke Klijenta prema poslovnim uslovima koji, na dan donošenja ovih Uslova, ne dozvoljavaju da na njima treniraju svoje modele.`,
        `14.6 <strong>Pristup zaposlenih.</strong> Naši zaposleni pristupaju Podacima Klijenta samo kada je to potrebno za pružanje podrške koju zatražite, održavanje rada Usluge, istraživanje bezbednosnih problema ili zloupotreba ili postupanje u skladu sa zakonom.`,
        `14.7 <strong>Podaci o korišćenju i deidentifikovani podaci.</strong> Prikupljamo podatke o radu i korišćenju Usluge, kao što su broj poziva, trajanje, stope grešaka i korišćenje funkcija. Iz Podataka Klijenta možemo stvarati i agregirane ili deidentifikovane podatke. Mi smo vlasnici tih podataka i možemo ih koristiti za rad, naplatu, zaštitu, analizu i unapređenje Usluge. Ti podaci neće identifikovati Vas, Vaše Ovlašćene korisnike ni Vaše Pozivaoce.`,
      ],
    },
    {
      id: "retention",
      nav: "Čuvanje",
      title: "15. Čuvanje, izvoz i brisanje podataka",
      blocks: [
        `15.1 Usluga automatski briše snimke, transkripte, poruke i sličan sadržaj nakon isteka roka čuvanja za Vaš paket. <a href="/sr/privacy/#retention">Politika privatnosti</a> navodi važeće rokove. Obrisani sadržaj se ne može povratiti.`,
        `15.2 LobbyStack nije usluga za izradu rezervnih kopija ili arhiviranje. Odgovorni ste za izvoz i čuvanje svih evidencija koje su Vam potrebne, uključujući evidencije koje ste po zakonu dužni da čuvate.`,
        `15.3 Nakon zatvaranja Vašeg naloga možemo obrisati Podatke Klijenta bez daljeg obaveštenja. Kopije mogu ostati u rezervnim kopijama dok ne isteknu u svom redovnom ciklusu, a možemo zadržati evidencije koje su nam potrebne iz pravnih, poreskih, bezbednosnih razloga, razloga naplate ili radi rešavanja sporova.`,
      ],
    },
    {
      id: "feedback",
      nav: "Povratne informacije",
      title: "16. Povratne informacije",
      blocks: [
        `Ako nam pošaljete ideje, predloge ili druge povratne informacije, možemo ih koristiti u bilo koju svrhu, bez plaćanja naknade i bez ikakvih obaveza prema Vama. Nećemo Vas javno navesti kao izvor bez Vaše dozvole.`,
      ],
    },
    {
      id: "open-source",
      nav: "Otvoreni kod",
      title: "17. Otvoreni kod i žigovi",
      blocks: [
        `17.1 Izvorni kod softvera LobbyStack objavljen u našem javnom repozitorijumu licenciran je pod licencom MIT (MIT License). Ta licenca uređuje Vaše korišćenje, kopiranje, menjanje i distribuciju tog koda. Ovi Uslovi ne ograničavaju Vaša prava iz te licence.`,
        `17.2 Licenca MIT obuhvata samo kod. Ona Vam ne daje nikakva prava na hostovanu Uslugu, naše servere, naloge, brojeve telefona, aranžmane sa pružaocima usluga ili podatke, niti pravo na podršku.`,
        `17.3 Naziv, logotipi i brend LobbyStack su naši žigovi. Licenca MIT ne daje licencu za njih. Ne smete ih koristiti na način koji sugeriše da smo mi napravili, odobrili ili da podržavamo Vaš proizvod ili uslugu, uključujući izmenjenu ili hostovanu kopiju softvera LobbyStack, bez našeg pisanog odobrenja. Možete tačno i činjenično upućivati na LobbyStack.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Samostalno hostovanje",
      title: "18. Samostalno hostovane instalacije",
      blocks: [
        `18.1 Ako LobbyStack pokrećete na sopstvenoj infrastrukturi, to činite na osnovu licence MIT, a ne ovih Uslova. Nemamo pristup Vašoj instalaciji ni njenim podacima, ne obrađujemo te podatke i nismo odgovorni za njih.`,
        `18.2 Odgovorni ste za svoje servere, bezbednost, rezervne kopije, ažuriranja, naloge kod pružalaca usluga, brojeve telefona, registracije kod operatera, obaveštenja, pristanke i usklađenost sa propisima. Vaše korišćenje usluga OpenAI, Twilio i drugih pružalaca usluga predmet je odnosa između Vas i njih.`,
        `18.3 Za samostalno hostovane instalacije ne pružamo podršku, garanciju niti obavezu u pogledu usluge, osim ako se na to ne saglasimo u potpisanoj pisanoj formi.`,
      ],
    },
    {
      id: "ip",
      nav: "Intelektualna svojina",
      title: "19. Intelektualna svojina",
      blocks: [
        `19.1 Osim Podataka Klijenta i otvorenog koda opisanog u odeljku 17, LobbyStack i njegovi davaoci licence poseduju sva prava na Uslugu, naše sajtove, dokumentaciju, dizajn, promptove, šablone i brend. Ovi Uslovi Vam daju samo prava koja su u njima navedena.`,
        `19.2 Ne smete kopirati, menjati ili stvarati izvedena dela hostovane Usluge, niti je podvrgavati obrnutom inženjeringu ili dekompilovati, osim u meri u kojoj to licenca MIT dozvoljava za naš objavljeni kod ili u kojoj to zakon dozvoljava uprkos ovom ograničenju.`,
      ],
    },
    {
      id: "confidentiality",
      nav: "Poverljivost",
      title: "20. Poverljivost",
      blocks: [
        `20.1 Svaka strana može od druge strane primiti nejavne informacije koje su označene kao poverljive ili koje bi razumno lice smatralo poverljivim („Poverljive informacije“). Podaci Klijenta su Vaše Poverljive informacije. Nejavne informacije o cenama, bezbednosti i proizvodu su naše.`,
        `20.2 Strana koja prima Poverljive informacije koristiće ih samo radi izvršavanja obaveza iz ovih Uslova, štitiće ih s razumnom pažnjom i deliće ih samo sa svojim zaposlenima, savetnicima i pružaocima usluga kojima su potrebne i koji su vezani sličnim obavezama.`,
        `20.3 Ove obaveze se ne odnose na informacije koje jesu ili postanu javne bez krivice strane koja ih prima, koje su joj već bile poznate ili koje je samostalno razvila, ili koje je zakonito primila od nekog drugog. Strana može otkriti Poverljive informacije kada to zakon zahteva, nakon što o tome obavesti drugu stranu tamo gde zakon to dozvoljava.`,
      ],
    },
    {
      id: "beta",
      nav: "Beta funkcije",
      title: "21. Beta funkcije",
      blocks: [
        `Možemo nuditi funkcije označene kao beta, pregled (preview), rani pristup ili slično. Možete odlučiti da ih koristite. One mogu biti nepouzdane, menjati se ili prestati da postoje bez obaveštenja i mogu imati dodatna ograničenja. Pružamo ih „takve kakve jesu“, bez ikakve garancije ili obaveze, i možemo prestati da ih nudimo u bilo kom trenutku.`,
      ],
    },
    {
      id: "availability",
      nav: "Dostupnost",
      title: "22. Dostupnost i podrška",
      blocks: [
        `22.1 Trudimo se da Usluga bude dostupna, ali ne obećavamo da će raditi bez prekida i bez grešaka niti da će biti dostupna u bilo kom određenom trenutku. Nemamo ugovor o nivou usluge, osim ako ga Porudžbina ne sadrži.`,
        `22.2 Možemo sprovoditi održavanje, koje može prekinuti rad Usluge. Rad Usluge mogu prekinuti i prekidi kod operatera, pružalaca AI usluga, pružalaca usluga hostinga ili drugih Usluga trećih lica.`,
        `22.3 Podršku pružamo putem imejla na ${support}. Radno vreme podrške, vreme odziva i kanali zavise od Vašeg paketa i nisu zagarantovani, osim ako Porudžbina ne predviđa drugačije.`,
      ],
    },
    {
      id: "termination",
      nav: "Raskid",
      title: "23. Suspenzija i raskid",
      blocks: [
        `23.1 Možete prestati da koristite Uslugu i otkazati svoj paket u bilo kom trenutku. Već plaćene ili dugovane naknade ostaju plative.`,
        `23.2 Možemo odmah suspendovati ili ograničiti Uslugu, uz obaveštenje kada je to izvodljivo, ako prekršite ove Uslove, ne izvršite plaćanje, stvorite bezbednosni, pravni rizik ili rizik u odnosu sa operaterima, ili ako to zahteva pružalac usluga, operater ili nadležni organ. Pristup ćemo vratiti kada se problem reši, osim ako ne raskinemo ugovor u skladu sa odeljkom 23.3.`,
        `23.3 Možemo raskinuti ove Uslove ili zatvoriti Vaš nalog iz bilo kog razloga uz obaveštenje od 30 dana, ili odmah ako bitno prekršite ove Uslove. Ako raskinemo bez navođenja razloga, vratićemo unapred plaćene naknade za pretplatu za neiskorišćeni deo perioda.`,
        `23.4 Kada se Vaš nalog zatvori, prestaje Vaše pravo da koristite Uslugu, dužni ste da platite sve dugovane iznose, možemo osloboditi Vaš broj telefona, a na Vaše podatke se primenjuje odeljak 15. Odredbe koje po svojoj prirodi treba da ostanu na snazi ostaju na snazi, uključujući odeljke 5, 7, 9.3, 9.4, 12, od 14 do 20 i od 24 do 32.`,
      ],
    },
    {
      id: "disclaimers",
      nav: "Odricanje od garancija",
      title: "24. Odricanje od garancija",
      blocks: [
        `<strong>24.1 U najvećoj meri koju zakon dozvoljava, Usluga se pruža „takva kakva jeste“ i „kako je dostupna“. LobbyStack se odriče svih garancija i uslova, bilo izričitih, prećutnih ili zakonskih, uključujući garancije podobnosti za prodaju, podobnosti za određenu namenu, prava svojine, nepovređivanja prava trećih lica i kvaliteta.</strong>`,
        `24.2 Ne ograničavajući odeljak 24.1, ne garantujemo da će AI rezultat biti tačan ili primeren, da će svaki poziv biti ispravno prihvaćen, obrađen, snimljen ili preusmeren, da će SMS poruke biti isporučene, da će zakazivanja odgovarati Vašem kalendaru niti da će Usluga doneti bilo kakav poslovni rezultat.`,
      ],
    },
    {
      id: "liability",
      nav: "Odgovornost",
      title: "25. Ograničenje odgovornosti",
      blocks: [
        `<strong>25.1 U najvećoj meri koju zakon dozvoljava, ni LobbyStack ni njegova povezana lica, rukovodioci, direktori, zaposleni, spoljni saradnici ili dobavljači neće biti odgovorni za bilo kakvu posrednu, slučajnu, posebnu, posledičnu, primernu ili kaznenu štetu, niti za bilo kakav gubitak dobiti, prihoda, poslovanja, klijenata, ugleda ili podataka, niti za troškove zamenskih usluga. Ovo uključuje gubitke nastale usled propuštenih, prekinutih, pogrešno usmerenih ili nepravilno obrađenih poziva, pogrešnih odgovora, pogrešnih ili propuštenih zakazivanja i neisporučenih SMS poruka.</strong>`,
        `<strong>25.2 U najvećoj meri koju zakon dozvoljava, ukupna odgovornost kompanije LobbyStack za sve zahteve u vezi sa ovim Uslovima ili Uslugom ograničena je na veći od sledećih iznosa: (a) iznos koji ste platili kompaniji LobbyStack za Uslugu u 12 meseci pre događaja iz kog je zahtev proistekao i (b) 100 CAD.</strong>`,
        `25.3 Ova ograničenja se primenjuju na sve vrste zahteva, bilo da su zasnovani na ugovoru, vanugovornoj odgovornosti, deliktu, nepažnji ili bilo kom drugom pravnom osnovu, čak i ako smo bili obavešteni da je gubitak moguć i čak i ako pravno sredstvo ne ostvari svoju suštinsku svrhu.`,
        `25.4 Ništa u ovim Uslovima ne ograničava odgovornost koju zakon ne dozvoljava da strana ograniči, kao što je odgovornost za nameru ili krajnju nepažnju ili za telesnu ili moralnu štetu prouzrokovanu licu.`,
      ],
    },
    {
      id: "indemnity",
      nav: "Obeštećenje",
      title: "26. Obeštećenje",
      blocks: [
        `26.1 Branićete LobbyStack i njegova povezana lica, rukovodioce, direktore, zaposlene i spoljne saradnike od svakog zahteva, istrage ili postupka trećeg lica i platiti nastalu štetu, novčane kazne, druge kazne, iznose poravnanja i razumne troškove pravnog zastupanja, u meri u kojoj proističu iz:`,
        {
          ul: [
            `Podataka Klijenta ili podataka o Vašoj firmi, Vaših uputstava i konfiguracije;`,
            `Vašeg propusta da date obaveštenja ili pribavite pristanke za snimanje, transkripciju, AI obradu ili SMS poruke;`,
            `zahteva po osnovu zakona TCPA, CASL ili zakona o presretanju komunikacija, prisluškivanju, biometriji, privatnosti ili zaštiti potrošača u vezi sa Vašim korišćenjem Usluge;`,
            `izjava, ponuda cena, zakazivanja ili drugih odnosa između Vas i Vaših Pozivalaca;`,
            `Vašeg kršenja ovih Uslova ili uslova Usluge trećeg lica; ili`,
            `zloupotrebe Usluge od strane Vas ili Vaših Ovlašćenih korisnika.`,
          ],
        },
        `26.2 Odmah ćemo Vas obavestiti o zahtevu, prepustiti Vam vođenje odbrane i pružiti razumnu pomoć o Vašem trošku. Ne smete zaključiti poravnanje kojim se nama nameće obaveza ili priznanje bez našeg pisanog pristanka. Možemo učestvovati sa sopstvenim pravnim zastupnikom o sopstvenom trošku.`,
      ],
    },
    {
      id: "force-majeure",
      nav: "Viša sila",
      title: "27. Viša sila",
      blocks: [
        `Nijedna strana nije odgovorna za kašnjenje ili neizvršenje prouzrokovano događajima izvan njene razumne kontrole, uključujući prekide kod operatera, pružalaca AI usluga, pružalaca usluga hostinga ili interneta, prirodne katastrofe, epidemije, rat, terorizam, radne sporove, mere državnih organa i sajber napade. Ovaj odeljak ne oslobađa od obaveza plaćanja.`,
      ],
    },
    {
      id: "export",
      nav: "Izvoz i sankcije",
      title: "28. Kontrola izvoza i sankcije",
      blocks: [
        `Dužni ste da poštujete zakone Kanade, Sjedinjenih Američkih Država i druge primenljive zakone o kontroli izvoza i sankcijama. Potvrđujete da se ne nalazite u zemlji ili regionu koji podleže sveobuhvatnim sankcijama, da niste osnovani po zakonima takve zemlje ili regiona i da niste u vlasništvu ili pod kontrolom bilo koga u takvoj zemlji ili regionu, kao i da se ne nalazite ni na jednoj državnoj listi lica pod ograničenjima. Ne smete koristiti Uslugu za bilo koga na koga se to odnosi.`,
      ],
    },
    {
      id: "changes",
      nav: "Izmene",
      title: "29. Izmene ovih Uslova",
      blocks: [
        `29.1 Ove Uslove možemo ažurirati. Novu verziju objavićemo na ovoj stranici i promeniti datum na vrhu.`,
        `29.2 Ako je izmena bitna, obavestićemo Vas imejlom ili u okviru Usluge najmanje 30 dana pre nego što stupi na snagu, osim ako je izmena potrebna ranije iz pravnih ili bezbednosnih razloga ili zbog zahteva operatera. Ako se ne slažete sa izmenom, prestanite da koristite Uslugu i otkažite je pre nego što izmena stupi na snagu. Ako nastavite da koristite Uslugu nakon tog datuma, prihvatate ažurirane Uslove.`,
      ],
    },
    {
      id: "law",
      nav: "Merodavno pravo",
      title: "30. Merodavno pravo i sporovi",
      blocks: [
        `30.1 Na ove Uslove primenjuju se zakoni provincije Kvebek i savezni zakoni Kanade koji se tamo primenjuju, bez obzira na kolizione norme. Konvencija Ujedinjenih nacija o ugovorima o međunarodnoj prodaji robe se ne primenjuje.`,
        `30.2 Pre pokretanja sudskog postupka, strana se najpre mora pisanim putem obratiti drugoj strani i u dobroj veri pokušati da reši spor tokom najmanje 30 dana. Svaka strana i dalje može tražiti hitnu privremenu meru (sudsku zabranu).`,
        `30.3 Ne dirajući u prava kojih se nije moguće odreći, sudovi sa sedištem u provinciji Kvebek u Kanadi imaju isključivu nadležnost za sve sporove u vezi sa ovim Uslovima ili Uslugom, i svaka strana prihvata njihovu nadležnost.`,
        `30.4 U najvećoj meri koju zakon dozvoljava, svaka strana može podneti zahteve protiv druge strane samo u svoje ime, a ne kao tužilac ili član grupe u kolektivnoj tužbi ili drugom predstavničkom postupku.`,
      ],
    },
    {
      id: "general",
      nav: "Opšte odredbe",
      title: "31. Opšte odredbe",
      blocks: [
        `31.1 <strong>Celokupan ugovor.</strong> Ovi Uslovi, Politika privatnosti, svaka Porudžbina i dokumenti na koje oni upućuju čine celokupan ugovor između Vas i kompanije LobbyStack u vezi sa Uslugom. Oni zamenjuju svaki raniji ugovor o tom predmetu. Uslovi u Vašim narudžbenicama ili drugim dokumentima se ne primenjuju.`,
        `31.2 <strong>Ustupanje.</strong> Ne smete ustupiti niti preneti ove Uslove bez našeg pisanog pristanka. Mi ih možemo ustupiti povezanom licu ili pravnom sledbeniku u slučaju spajanja, preuzimanja, reorganizacije ili prodaje imovine.`,
        `31.3 <strong>Deljivost odredbi i odricanje od prava.</strong> Ako sud utvrdi da je deo ovih Uslova neizvršiv, taj deo će se primeniti u meri u kojoj je to moguće, a ostatak ostaje na snazi. Nesprovođenje nekog prava ne predstavlja odricanje od tog prava.`,
        `31.4 <strong>Odnos strana.</strong> Strane su nezavisni ugovorni partneri. Ovi Uslovi ne stvaraju ortakluk, zajednički poduhvat, radni odnos niti odnos zastupanja i ne daju prava trećim licima kao korisnicima.`,
        `31.5 <strong>Obaveštenja.</strong> Obaveštenja Vam možemo slati na imejl adresu povezanu sa Vašim nalogom ili putem Usluge. Pravna obaveštenja morate slati na ${support}. Obaveštenja poslata imejlom proizvode dejstvo u trenutku slanja.`,
        `31.6 <strong>Jezik.</strong> Ove Uslove objavljujemo na engleskom i na francuskom jeziku, na adresi <a href="/fr/terms/">lobbystack.com/fr/terms/</a>. Obe verzije imaju istu vrednost.`,
        `31.7 <strong>Tumačenje.</strong> Naslovi služe samo radi preglednosti. „Uključujući“ znači „uključujući, bez ograničenja“.`,
      ],
    },
    {
      id: "contact",
      nav: "Kontakt",
      title: "32. Kontakt",
      blocks: [
        `Pitanja o ovim Uslovima pošaljite kompaniji Lobbystack Inc. na ${support}.`,
      ],
    },
  ],
}
