---
title: "Google Business Profile i pozivi: podešavanje i praćenje"
seoTitle: "Google Business Profile pozivi: broj, radno vreme, praćenje"
description: "Google Business Profile šalje pozive na broj iz profila. Podesite broj i radno vreme, pratite metriku Pozivi i obezbedite da se neko javi i posle radnog vremena."
pubDate: 2026-10-10T09:00:00-04:00
updatedDate: 2026-10-10T09:00:00-04:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/google-business-profile-calls-hero.webp"
coverImageAlt: "Svetla bež naslovna kartica sa sitnim uzorkom tačaka i crnim naslovom na engleskom: Google Business Profile calls: set up, track, answer"
locale: "sr"
canonicalSlug: "google-business-profile-calls"
---

Pozivi sa Vašeg **Google Business Profile-a** (na srpskom: Google profil preduzeća) stižu na broj telefona koji upišete u profil: dugme za poziv u Google pretrazi i mapama bira taj broj. Google broji klikove na to dugme, ali od 31. jula 2024. više ne prikazuje istoriju poziva. Držite broj i radno vreme tačnim i odredite ko se javlja umesto Vas.

Svaku Google funkciju, putanju kroz menije i ograničenje iz ovog vodiča proverili smo na Google stranicama pomoći 10. oktobra 2026. i za svaku dajemo link. Ako se natpis na Vašem ekranu razlikuje, povezana stranica ima Google-ov aktuelni tekst. Natpise iz Google-ovog interfejsa navodimo latinicom. LobbyStack je napisao ovaj vodič i prodaje AI recepcionera, pa navodimo i gde se ne uklapa.

## Odakle dolazi dugme za poziv na Google biznis profilu?

Dugme za poziv koristi broj telefona koji dodate u profil. Google-ov [izveštaj o učinku](https://support.google.com/business/answer/9918094?hl=sr) broji koliko puta klijenti kliknu na to dugme i traži da dodate broj telefona da biste pratili ovu metriku. Otvaranje profila je [besplatno](https://business.google.com/us/business-profile/).

Neki profili su imali Google broj za prosleđivanje iza dugmeta za poziv dok je postojala istorija poziva. Kada je Google 31. jula 2024. ukinuo istoriju poziva i čet, naveo je da će se ti brojevi automatski zameniti brojem koji je preduzeće uneo ([Google](https://support.google.com/business/answer/14919056?hl=sr)). Danas klijent koji dodirne dugme za poziv bira broj koji ste Vi upisali, a ista stranica potvrđuje da i dalje primate pozive sa profila.

Ostalo zavisi od dve stvari koje kontrolišete: broja i radnog vremena u profilu i toga ko se javlja kada Vi ne možete.

## Kako da dodam ili promenim broj telefona u Google Business Profile-u?

Google-ovi [koraci za dodavanje broja](https://support.google.com/business/answer/16750496?hl=sr), u Google pretrazi:

1. Otvorite svoj profil preduzeća.
2. Izaberite **Izmeni profil**, pa **Kontakt**.
3. Pored stavke **Broj telefona** izaberite **Izmeni**.
4. Izaberite zemlju da bi Google postavio pozivni broj.
5. Upišite broj. Google ga sam formatira, pa ne morate da kucate zagrade ni crtice. Za drugi ili treći broj izaberite **Dodaj broj telefona**.
6. Izaberite **Sačuvaj**.

U aplikaciji Google mape dodirnite **Preduzeće** dole desno, pa **Izmeni profil** ([Google](https://support.google.com/business/answer/3039617?hl=sr)).

Google pregleda izmene pre nego što ažurira javni profil i ne objavljuje koliko pregled traje. Ostavite stari broj aktivnim dok se novi ne pojavi na profilu.

### Google-ova pravila za broj

- **Najviše tri broja:** glavni broj i još najviše dva, fiksni ili mobilni. Google ne prihvata brojeve faksa ([dodavanje broja](https://support.google.com/business/answer/16750496?hl=sr)).
- **Lokalni broj umesto pozivnog centra:** kad god možete, koristite lokalni broj umesto linije za pomoć centralnog pozivnog centra ([smernice](https://support.google.com/business/answer/3038177?hl=sr)).
- **Pod Vašom kontrolom:** broj mora biti pod direktnom kontrolom preduzeća.
- **Bez brojeva za preusmeravanje:** ne navodite brojeve koji pozivaoce šalju na odredišne stranice ili na brojeve koji nisu brojevi samog preduzeća.
- **Bez brojeva sa posebnom tarifom**, bez obzira na to koliko pozivalac plaća.

### Može li broj da se sakrije?

Može. Otvorite profil, izaberite **Još**, zatim **Podešavanja profila preduzeća** i **Napredna podešavanja**. Ispod stavke **Broj telefona** uključite **Ne prikazuj** ([Google](https://support.google.com/business/answer/3039617?hl=sr)). Sakrijte ga samo ako ne želite pozive sa Google-a.

## Koje podatke o pozivima Google danas prikazuje?

U profilu Google prikazuje jedan podatak o pozivima: **Pozivi**, u izveštaju o učinku, koji broji klikove na dugme za poziv u periodu koji izaberete. Broj klikova Vam ne govori ko je zvao, da li se neko javio ni koliko je poziv trajao. Istorija poziva, koja je za neke profile prikazivala pojedinačne pozive, ukinuta je 31. jula 2024.

Kako da je otvorite ([Google](https://support.google.com/business/answer/9918094?hl=sr)):

- **U Google pretrazi:** otvorite profil preduzeća, izaberite **Učinak**, izaberite period i zatim **Primeni**.
- **U aplikaciji Google mape:** u odeljku **Preduzeće** dodirnite **Prikaži još** pored stavke Učinak, izaberite period i dodirnite **Primeni**.

Podatke o učinku imaju samo verifikovani profili, a morate biti prijavljeni na Google nalog koji upravlja profilom.

| Podatak o pozivima | Dostupno u oktobru 2026? | Gde |
| --- | --- | --- |
| Klikovi na dugme za poziv | Da | Učinak > **Pozivi** |
| Dnevni klikovi na dugme za poziv, za softver | Da | Business Profile Performance API, metrika [`CALL_CLICKS`](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric) |
| Spisak pojedinačnih poziva (istorija poziva) | Ne. Ukinuto 31. jula 2024. | Preuzimanje starih zapisa preko usluge Google Takeout zatvoreno je 30. avgusta 2024. ([Google](https://support.google.com/business/answer/14919056?hl=sr)) |
| Broj pozivaoca, odgovoren ili propušten poziv, trajanje | Nije u profilu preduzeća | Evidencija poziva kod Vašeg operatera, telefonska centrala ili služba za javljanje na pozive |

## Kako da pratim pozive sa Google Business Profile-a?

Pratite ih na dva mesta. Google-ova metrika Pozivi pokazuje koliko je ljudi kliknulo na dugme za poziv. Vaša telefonska evidencija pokazuje koliko je poziva stiglo i na koliko se neko javio. Uporedite ta dva broja svakog meseca: razlika koja raste može da znači da ljudi prekidaju vezu pre nego što se iko javi, mada neki klikovi nikad ne postanu poziv.

1. **Pročitajte Google-ov broj.** Zapišite broj poziva za prošli mesec iz izveštaja Učinak.
2. **Pročitajte svoj.** Izvucite isti mesec iz evidencije operatera, centrale ili službe za javljanje: primljeni, odgovoreni i propušteni pozivi.
3. **Pitajte nove pozivaoce kako su Vas pronašli.** Ko se javi, upiše "Google" u belešku o pozivu kada pozivalac to kaže.
4. **Automatizujte ako pratite više lokacija.** Performance API vraća dnevni `CALL_CLICKS` za svaki profil, a kontrolna tabla može da ga povlači.

Google-ove stranice pomoći za profil preduzeća ne pominju brojeve za praćenje poziva. Smernice iznad i dalje važe za svaki broj koji navedete: pod Vašom direktnom kontrolom i bez preusmeravanja na broj koji nije broj Vašeg preduzeća. Pročitajte [smernice](https://support.google.com/business/answer/3038177?hl=sr) pre nego što promenite broj. Ako svoj broj prosledite rezervnoj službi, broj u profilu ostaje isti.

Ako pozive prosledite u LobbyStack, svaki poziv na koji se javi dobija rezime, transkript i snimak na kontrolnoj tabli, pa imate evidenciju za korak 2. Potpisani webhookovi za 6 događaja i REST API povezuju LobbyStack sa Vašim drugim alatima.

## Kako radno vreme i filter "otvoreno" utiču na pozive?

Radno vreme govori ljudima koji traže kada uslužujete klijente. Google mape na računaru imaju [filter Radno vreme](https://support.google.com/gmm/answer/2839844?hl=sr) koji proverava mesta koja su trenutno otvorena, pa Vas radno vreme koje kaže da ste zatvoreni može sakriti od nekoga ko koristi taj filter. Redovno, posebno i praznično radno vreme držite tačnim i navodite vreme kada uslužujete klijente.

Google-ovi [koraci za redovno radno vreme](https://support.google.com/business/answer/15300403?hl=sr):

1. Otvorite profil preduzeća i izaberite **Izmeni profil**, pa **Radno vreme**.
2. Pored stavke **Radno vreme** izaberite **Izmeni**, pa **Otvoreno uz glavno radno vreme**. Opcija **Otvoreno bez glavnog radnog vremena** skriva Vaše radno vreme.
3. Označite svaki dan kada radite i podesite sate. Za pauzu za ručak napravite dva unosa za isti dan. Za dan bez zatvaranja izaberite **Otvara se u**, pa **24 sata**.
4. Izaberite **Sačuvaj**.

Kada ažurirate radno vreme, Google na profilu može da prikaže klijentima poruku koja potvrđuje izmenu.

### Praznici i kratka zatvaranja

[Posebno radno vreme](https://support.google.com/business/answer/6303076?hl=sr) pokriva privremene izmene, uključujući zatvaranje do 6 dana zaredom. Za 7 dana ili više, ili za nepoznat period, Google preporučuje da preduzeće označite kao privremeno zatvoreno. Posebno radno vreme se prikazuje samo ako je radno vreme podešeno na **Otvoreno uz glavno radno vreme**. Google savetuje da potvrdite radno vreme za zvanične praznike i kada je isto kao redovno.

[Dodatno radno vreme](https://support.google.com/business/answer/9876800?hl=sr) navodi sate za određene usluge, kao što su isporuka, nošenje, kupovina iz kola i preuzimanje. Prikazuje se tek kada podesite redovno radno vreme.

### Da li da navedete 24 sata zato što se neko javlja noću?

Samo ako klijente uslužujete u svako doba. Google-ove [smernice](https://support.google.com/business/answer/3038177?hl=sr) traže redovno radno vreme za klijente i kažu da preduzeća koja rade samo po zakazivanju ne treba da navode radno vreme. Ako se noću javljate na telefon, a ekipe šaljete ujutru, navedite pravo radno vreme i pustite da noćno javljanje zakaže pozivaoca od 21 h za sutra.

## Kako da obezbedim da se neko javi na pozive sa Google Business Profile-a?

Prosledite broj iz profila rezervnoj službi za pozive koje ne možete da primite: neodgovorene pozive tokom dana, pozive posle radnog vremena ili sve pozive. Rezerva može biti telefon kolege, služba za javljanje na pozive sa ljudima ili AI recepcioner. Broj u profilu ostaje isti, pa na Google-u ništa ne menjate.

### 1. Izaberite ko se javlja

| Rezerva | Šta pozivalac dobija | Za koga |
| --- | --- | --- |
| Govorna pošta | Ostavlja poruku i čeka da ga pozovete | Malo poziva, pozivi koji mogu da sačekaju ([AI recepcioner ili govorna pošta](/sr/blog/ai-receptionist-vs-voicemail/)) |
| Telefon kolege ili dežurni telefon | Osobu, ako je slobodna | Mali timovi u kojima neko može da se javi |
| Služba za javljanje na pozive sa ljudima | Recepcionera na daljinu koji prima poruke, a u mnogim paketima i zakazuje | Pozivi kojima treba ljudska procena ([šta radi služba za javljanje na pozive](/sr/blog/what-is-a-phone-answering-service/)) |
| AI recepcioner | Odgovara na pitanja, zakazuje i preusmerava hitne pozive | Zakazivanje i pozivi posle radnog vremena |

### 2. Prosledite svoj broj

Pravilo podešavate kod operatera: prosleđivanje kada je zauzeto ili nema odgovora za višak poziva, prosleđivanje u vreme zatvaranja za pozive posle radnog vremena ili prosleđivanje svih poziva. [Kako da prosledite poslovne pozive](/sr/blog/how-to-forward-business-calls/) objašnjava podešavanja.

### 3. Podesite recepcionera

Na primeru LobbyStack-a:

- Dobijate LobbyStack broj (dostupan u SAD, Kanadi, Velikoj Britaniji, Australiji i na Novom Zelandu) i na njega prosleđujete poslovni broj. Može da se javlja na sve pozive ili samo na višak poziva i pozive posle radnog vremena.
- Upisuje termine u Google Calendar. Uz pristanak pozivaoca šalje SMS potvrdu i podsetnik 24 sata pre termina na brojeve iz SAD i Kanade.
- Hitne pozive preusmerava na jedan broj po preduzeću. Preusmeravanje je slepo, pa osobu koja se javi ne upoznaje sa pozivom. Ako preusmeravanje ne uspe, kaže to pozivaocu, ponudi da primi poruku, a Vaš tim može da dobije upozorenje o neuspelom preusmeravanju.
- Svaki poziv dobija rezime, transkript i snimak. Kada primi poruku, dobijate upozorenje e-poštom, a SMS upozorenja su opciona.
- Pozivi počinju na podrazumevanom jeziku preduzeća, engleskom ili francuskom, a zatim recepcioner odgovara na jeziku pozivaoca: više od 70 jezika, uključujući srpski i španski.
- LobbyStack ne naplaćuje spam pozive ni pozive kraće od 10 sekundi.

Upoznajte ograničenja pre nego što prosledite liniju: Google Calendar je jedini kalendar, AI ne odgovara na SMS poruke i nema sinhronizacije sa CRM-om ni softverom za terenski servis. Za potpunu pokrivenost posle radnog vremena pogledajte [javljanje posle radnog vremena](/sr/solutions/after-hours-answering-service/).

### 4. Testirajte sa svog profila

Posle radnog vremena pronađite svoje preduzeće na Google-u sa telefona, dodirnite dugme za poziv i proverite da poziv stiže do rezerve. Zakažite probni termin i tražite nešto hitno. Zatim pročitajte zapis poziva. Paket Free u LobbyStack-u daje Vam 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana, bez kartice, pa možete da prosledite liniju i uradite ovaj test pre nego što platite.

## Da li su pozivi od Google-a u vezi sa profilom pravi?

Neki jesu. Google navodi da može da zove ili šalje poruke na broj iz profila da bi potvrdio podatke kao što je radno vreme i da bi pomogao klijentima da zakažu termin, saznaju vreme čekanja ili provere cene i zalihe ([Google](https://support.google.com/business/answer/7690269?hl=sr)). Google nikada ne traži podatke o plaćanju preko telefona i ne obećava posebno mesto u svojim proizvodima ([Google](https://support.google.com/business/answer/6212928?hl=sr)).

- **Isključivanje:** otvorite profil, izaberite **Još**, zatim **Podešavanja profila preduzeća** i **Napredna podešavanja**. U odeljku **Google automatizovani pozivi i poruke** isključite ono što ne želite. Potreban Vam je verifikovan profil, a Google i dalje može ručno da zove radi potvrde podataka. Možete i da zamolite pozivaoca da prestane da zove.
- **Gde rade pozivi za klijente:** pozivi za zakazivanje, vreme čekanja i cene pokrivaju određene regione. U SAD su to sve savezne države osim Indijane, Luizijane, Minesote, Montane i Nebraske.
- **Prijavite prevaru:** u SAD prevaru prijavite FTC-u na ReportFraud.ftc.gov i obavestite Google preko obrasca sa njegove [stranice o prevarama](https://support.google.com/business/answer/6212928?hl=sr).

Ako se na Vašu liniju javlja recepcioner ili AI, i ovi automatizovani pozivi stižu do njega. Google-ov poziv za zakazivanje nosi zahtev pravog klijenta, pa recite recepcioneru da ih očekuje.

## Pitanja o pozivima sa Google Business Profile-a

### Da li Google Business Profile još prikazuje istoriju poziva?

Ne. Google je ukinuo istoriju poziva i čet 31. jula 2024, a preuzimanje starih zapisa preko usluge Google Takeout zatvoreno je 30. avgusta 2024. Klijenti i dalje mogu da Vas pozovu sa profila, a izveštaj Učinak broji klikove na dugme za poziv. Za spisak poziva koristite evidenciju operatera ili službe za javljanje.

### Koliko brojeva telefona može da ima Google Business Profile?

Tri: glavni broj i još najviše dva. Google prihvata fiksne i mobilne brojeve, ali ne i brojeve faksa. Dodajete ih u Izmeni profil, pa Kontakt. Google-ove smernice traže lokalni broj umesto linije pozivnog centra kad god je moguće, a broj mora biti pod direktnom kontrolom preduzeća.

### Da li metrika Pozivi broji odgovorene pozive?

Ne. Google definiše Pozive kao broj puta koliko je klijent kliknuo na dugme za poziv na profilu preduzeća. Klik ne pokazuje da li je poziv uspostavljen ni da li se neko javio. Da biste izbrojali odgovorene i propuštene pozive, uporedite metriku sa evidencijom centrale ili službe za javljanje za iste datume.

### Da li mi treba verifikovan profil da vidim podatke o pozivima?

Da. Google prikazuje podatke o učinku samo za verifikovane profile preduzeća, a morate biti prijavljeni na Google nalog koji upravlja profilom. Vlasnici i menadžeri otvaraju Učinak u Google pretrazi ili u aplikaciji Google mape, biraju period i čitaju broj Poziva za taj period.

### Može li AI recepcioner da se javlja na pozive sa mog Google Business Profile-a?

Može. Zadržite broj u profilu i prosledite ga AI recepcioneru za propuštene pozive, pozive posle radnog vremena ili sve pozive. LobbyStack se javlja na prosleđene pozive, upisuje termine u Google Calendar, hitne pozive preusmerava na jedan broj i čuva rezime, transkript i snimak svakog poziva. Plaćeni paketi kreću od $30 mesečno, ili $24 uz godišnje plaćanje.

## Javite se na pozive koje Vam profil već šalje

Profil stavlja Vaš broj na jedan dodir od ljudi koji Vas traže. Osoba koja se javi odlučuje da li će ti pozivi postati termini. Počnite sa paketom Free u LobbyStack-u: 30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana, bez kartice, dovoljno da čujete kako recepcioner razgovara sa nekim ko Vas je našao na Google-u. Ako želite da zadržite broj, Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu. Nema naknade za aktivaciju. [Počnite besplatno](https://app.lobbystack.com/sr/signup) ili uporedite pakete na [stranici sa cenama](/sr/pricing/).
