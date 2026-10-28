---
title: "Kako smo napravili white-label AI recepcionera otvorenog koda"
seoTitle: "Kako smo napravili white-label AI recepcionera"
description: "White-label AI recepcioner omogućava agenciji da prodaje odgovaranje na pozive pod svojim brendom. Evo odluka iza LobbyStack verzije i kompromisa koje smo prihvatili."
pubDate: 2026-10-27T10:00:00-04:00
author: "LobbyStack tim"
category: "Novosti o proizvodu"
featured: false
coverImage: "/illustrations/white-label-ai-receptionist-hero.webp"
coverImageAlt: "Bež LobbyStack naslovna kartica sa naslovom How we built an open source white label AI receptionist"
locale: "sr"
canonicalSlug: "white-label-ai-receptionist"
---

**White-label AI recepcioner** je AI telefonski recepcioner koji agencija prodaje svojim klijentima pod sopstvenim imenom. Odgovara na pozive klijenta, zakazuje termine i prebacuje hitne pozive. Klijent se prijavljuje na adresi agencije, vidi njen logo i plaća cenu koju agencija odredi. LobbyStack verzija, [White Label](/sr/white-label/), izašla je 27. oktobra 2026, a njen kod je pod MIT licencom.

Pre nego što smo ga napravili, tražili smo white-label AI recepcionera otvorenog koda iz kog bismo učili, i nismo ga našli. Proizvodi koje smo proučili bili su hostovane platforme, a dobavljači glasovne infrastrukture upućivali su agencije na posebne alate za kontrolne table. Zato smo usput zapisivali svoje odluke, u [ADR dokumentima](https://github.com/lobbystack/lobbystack/tree/main/docs/adr) i u [dokumentu o arhitekturi partnera](https://github.com/lobbystack/lobbystack/blob/main/docs/architecture/partners.md). U nastavku su odluke koje su oblikovale proizvod, zajedno sa mestima gde smo se nečega odrekli.

## Šta je potrebno white-label AI recepcioneru?

Pre prve linije koda proučili smo 30 white-label i preprodajnih programa. Većina je prodavala isti model: mesečnu naknadu za platformu, paket minuta, jedan pod-nalog po klijentu, šablon za kopiranje podešavanja koje radi i naplatu klijentima preko Stripe naloga agencije. Zadržali smo taj model i dodali tri stvari za koje smo mislili da su agencijama važne:

- jedan fond minuta i četova za sve klijente, bez naknade po firmi
- zapis o svakom otvaranju kontrolne table klijenta od strane osoblja agencije
- ceo program u repozitorijumu otvorenog koda, da radi na vašim serverima

## Partneri i firme su odvojeni zapisi

Prva odluka bio je model podataka. **Partner** je agencija. **Firma** je jedan od njenih klijenata. Svako ima svoj tim, i ta dva tima se ne mešaju.

Tim partnera ima tri uloge:

| Uloga | Šta može |
| --- | --- |
| Vlasnik | Sve što može administrator, plus naplata, Stripe veza i drugi vlasnici |
| Administrator | Firme, ponude, šabloni, brend, domen, API ključevi, podešavanja i administratori i članovi tima |
| Član | Radi unutar firmi partnera i vidi njihovu potrošnju |

Prvo smo pokušali da pristup agencije vežemo za obične korisničke naloge, a onda smo to odbacili u [ADR 0010](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0010-partners-make-their-own-platform-keys.md). Pristup vezan za osobu prestaje da radi kada ta osoba ode, a agenciju bi ograničio na 10 firmi koliko jedan korisnički nalog može da ima. Partner je zapis u bazi koji poseduje svoje ključeve, osoblje, brend, domen, Stripe nalog i nivo, pa promena u osoblju ništa ne kvari.

Članovi partnera nikada ne ulaze u tim klijenta. Do firme dolaze kroz „otvaranje" koje traje osam sati, a svako otvaranje upisuje red u dnevnik revizije te firme sa imenom osobe. Vlasnici i administratori firme vide svaku posetu na kartici **Partner access**. Agencija može da sredi podešavanja klijenta bez pozajmljivanja njegove lozinke, a klijent vidi ko je gledao.

## Svaki zahtev pripada jednom brendu

Druga odluka bila je brend, i ona je dotakla više koda od bilo čega drugog. Svaki zahtev i svaki imejl sada pripadaju jednom brendu: brendu hosta (LobbyStack na našem cloudu) ili brendu partnera.

Partner podešava ime, logo, favikon, boju brenda i sopstvene linkove za uslove, privatnost i podršku. Oni se pojavljuju na:

- stranicama za prijavu, registraciju i resetovanje lozinke
- kontrolnoj tabli klijenta
- pozivnicama, upozorenjima i drugim imejlovima, koji stižu pod imenom partnera
- skripti vidžeta za sajt, koja se učitava sa domena partnera

Svaki partner počinje na poddomenu `receptionistportal.com`, neutralnog domena bez imena LobbyStack. Na plaćenom nivou partner može da poveže poddomen svog sajta, na primer `app.acmeagency.com`. Na našem cloudu ti domeni idu preko Cloudflare for SaaS: partner dodaje CNAME i TXT zapis, a Cloudflare izdaje sertifikat. Samostalno hostovana instalacija umesto toga koristi Caddy on-demand TLS. Pre izdavanja sertifikata Caddy pita jednu adresu u aplikaciji, koja odobrava samo domen hosta i verifikovane domene partnera.

Na nekoliko mesta i dalje piše LobbyStack, i odlučili smo da to kažemo na [White Label stranici](/sr/white-label/) umesto da to krijemo:

- **SMS poruke.** Svaka firma šalje poruke sa našeg verifikovanog besplatnog broja. Operateri očekuju verifikovani brend tog broja u prvoj poruci i u odgovorima na HELP, pa te poruke navode LobbyStack pored firme. Sve ostale poruke navode samo firmu.
- **Prijava preko Google naloga.** Prikazala bi ime naše Google aplikacije, pa domeni partnera nude samo prijavu imejlom i lozinkom.
- **Google Calendar i Instagram.** Njihovi ekrani za odobrenje prikazuju ime naše aplikacije. Povratni poziv se vraća na domen partnera.

## Jedan fond minuta za sve klijente

Treća odluka ticala se potrošnje. Partner od nas kupuje **nivo**, a svaki nivo uključuje mesečni fond minuta razgovora i četova sa sajta koji dele sve njegove firme. Klijent sa malo poziva pokriva onog sa mnogo, a dodavanje firme ne košta ništa dodatno.

| Nivo | Mesečna cena | Fond mesečno | Brojevi telefona | Prekoračenje posle fonda |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minuta, 50 četova | Jedan probni broj na 14 dana | Isključeno |
| Starter | $49 | 250 minuta, 1,000 četova | 2 uključena | $0.20 po minutu, $0.02 po četu |
| Growth | $199 | 1,300 minuta, 5,000 četova | 10 uključenih | $0.15 po minutu, $0.015 po četu |
| Scale | $499 | 4,000 minuta, 10,000 četova | 25 uključenih | $0.12 po minutu, $0.01 po četu |

Cene važe za oktobar 2026. Godišnja naplata je 20% jeftinija.

Najteži deo bilo je merenje. Svaki poziv sada proverava dva limita: koliko firmi ostaje u njenom paketu i koliko partneru ostaje u fondu. Poziv dobija manju od te dve vrednosti. Da dva poziva ne bi istovremeno potrošila isti fond, kod svuda prvo zaključava firmu, pa tek onda fond, uvek tim redom.

Tokom izrade odbacili smo i jednu ideju. Rane verzije ograničavale su broj istovremenih poziva po nivou. Pozivaoci sami biraju kada zovu, pa bi takav limit petog pozivaoca poslao na signal zauzeća. Nivoi nemaju ograničenje istovremenih poziva.

Kada firmi ili fondu ponestane minuta dok je prekoračenje isključeno, pozivi idu na broj za prebacivanje firme ili na verifikovani telefon vlasnika, a čet na sajtu javlja da trenutno ne može da odgovori. Partner i firma dobijaju upozorenja na 80% i 100%. Zbog ovoga smo promenili ceo proizvod: direktne firme na limitu ranije su dobijale signal zauzeća, a sada se i njihovi pozivi prosleđuju.

## Klijenti plaćaju partneru preko Stripe Connect-a

Naplata ima sopstveni zapis, [ADR 0009](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0009-partners-bill-through-their-own-stripe.md). Postoje dva računa:

1. **Mi naplaćujemo partneru** nivo i eventualno prekoračenje fonda, preko Polara, isto kao direktnim korisnicima.
2. **Partner naplaćuje svojim klijentima** preko svog Stripe naloga, povezanog kroz Stripe Connect. Ponude, pretplate i naplate prekoračenja su direktne naplate na nalogu partnera. Klijenti plaćaju na Stripe stranici za plaćanje pod imenom partnera, Stripe šalje račune i ponovo pokušava odbijene kartice, a povraćaji ostaju u Stripe nalogu partnera.

Razmatrali smo još dva modela. U prvom proizvod ne šalje račune klijentima, a agencije fakturišu svojim alatima. To je nama jednostavnije, ali bi maloj agenciji trebao softver za naplatu pre nego što bilo šta proda. U drugom mi naplaćujemo klijentima i agencijama isplaćujemo njihov deo. Tada bismo bili odgovorni za porez, povraćaje i neuspela plaćanja svakog klijenta. Polar prodaje kao merchant of record, pa račun iz Polara ionako ne može da nosi ime agencije.

**Ponuda** partnera ima ime, mesečnu cenu, paket minuta i četova i opcionu jednokratnu naknadu za podešavanje. Za svakog klijenta partner može da uključi prekoračenje po sopstvenoj ceni po minutu i po četu, do mesečnog limita. Partner može i da označi firmu kao „naplaćuje se van LobbyStack-a" i da joj fakturiše kako želi.

Kompromis: pretplata klijenta živi na Stripe nalogu partnera. Ako partner prekine Stripe vezu, ne možemo da premestimo te pretplate, a partner sam podešava naplatu poreza.

## Šabloni, demo verzije i ključevi za posao koji se ponavlja

Agencije isto podešavanje prodaju mnogo puta, pa smo napravili tri alata za posao koji se ponavlja.

**Šabloni** kopiraju podešavanja recepcionera, radno vreme, usluge, pravila, česta pitanja, SMS poruke i dokumente jedne firme. Izostavljaju ono što pripada samo toj firmi: ime, sajt, brojeve telefona, vlasnika i pozdrav koji pominje ime. Šabloni koriste isti format fajla kao `lobbystack onboard`, naš alat za komandnu liniju, pa održavamo samo jedan format.

**Demo verzije** prave recepcionera od sajta potencijalnog klijenta. Agencija ga objavljuje, šalje bezbedan link na svom domenu, a potencijalni klijent razgovara sa recepcionerom koji već zna njegov posao. Kada potencijalni klijent preuzme demo, on postaje jedna od firmi partnera, a potencijalni klijent njen vlasnik. Pozivi u demo verziji troše fond partnera kao i pozivi bilo kog klijenta, pa partner na nivou Free može da pokrene nekoliko demo verzija sa svojih 30 minuta.

**Platformski ključevi** omogućavaju kodu agencije da pravi firme preko [v1 API-ja](/sr/docs/api/). Partner pravi ključeve u svojoj konzoli, a ključ dopire samo do firmi tog partnera. Isti ključ radi sa `lobbystack onboard`, koji pravi firmu iz jednog YAML fajla i pri ponovnom pokretanju menja samo ono što se razlikuje.

## Predaja firme njenom vlasniku

Agencija mora da veruje da joj platforma neće uzeti klijente. Zato firma ostaje kod svog partnera, i samo partner može da je preda.

Kada partner preda firmu, njen vlasnik zadržava podešavanja i počinje da plaća LobbyStack direktno, na našem paketu Free. Predaja takođe:

- završava svako otvaranje koje je osoblje partnera imalo u firmi
- isključuje webhook-ove koje su podesili ključevi ili ljudi partnera, pa pozivi i kontakti prestaju da stižu agenciji
- poništava pozivnice u tim koje je poslao bilo ko van sopstvenog tima firme

Poslednja dva propusta našli smo pre lansiranja. Predata firma je slala webhook-ove agenciji sve dok se server ne bi restartovao, a pozivnice poslate ključem partnera preživljavale su predaju zbog SQL uslova `NOT IN` koji nikad ne pogađa null. Oba propusta su ispravljena i beleže se u dnevniku revizije.

Ako partner prestane da plaća, njegove firme nastavljaju da odgovaraju 30 dana, a partner u tom roku može da ih preda. Posle toga se pauziraju, a brišemo ih 90 dana posle isteka nivoa. Nikada sami ne kontaktiramo klijente partnera.

## White Label ostaje otvorenog koda

Svaka partnerska funkcija nalazi se u [javnom repozitorijumu](https://github.com/lobbystack/lobbystack) pod MIT licencom, i svaka radi na samostalno hostovanoj instalaciji. Svaki deo se uključuje kada host podesi ono što mu treba:

| Deo | Šta podešava onaj ko sam hostuje |
| --- | --- |
| Naplata klijentima | Stripe Connect ključeve. Bez njih se svaka firma naplaćuje van LobbyStack-a. |
| Naplata nivoa | Polar proizvode. Bez njih host može da podesi fond svakog partnera komandom `pnpm partner-pool:set` ili da ga ostavi neograničenim. |
| Poddomeni partnera | Osnovni domen za partnere |
| Sopstveni domeni | Caddy on-demand TLS ili Cloudflare for SaaS |

To nas je koštalo vremena. Svaka funkcija je morala da ima put za slučaj „ovaj dobavljač nije podešen", i test za taj put. Mislimo da se isplatilo: agencija koja preraste naš cloud, ili kojoj trebaju zapisi poziva klijenata u sopstvenoj bazi, može ceo program da preseli na svoje servere. [Vodič za samostalno hostovanje White Label programa](https://docs.lobbystack.com/self-hosting/white-label) opisuje podešavanje, a [tekst o MIT licenci](/sr/blog/lobbystack-mit-license-ai-receptionist-resellers/) objašnjava šta licenca dozvoljava da radite sa kodom.

## Šta White Label još ne radi

Ovo je na listi posle verzije 1:

- webhook-ovi za celog partnera (sada su webhook-ovi po firmi)
- godišnje ponude za klijente
- izveštaji o prihodu i marži
- prijava preko Google naloga na domenima partnera

## Česta pitanja

### Šta je white-label AI recepcioner?

To je AI recepcioner koji agencija ili preprodavac prodaje klijentima pod svojim brendom. Klijent se prijavljuje na adresi agencije, vidi njen logo i plaća agenciji, a platforma u pozadini vodi pozive.

### Koliko košta LobbyStack White Label?

Nivo Free košta $0 i uključuje 30 minuta razgovora, 50 četova i jedan probni broj na 14 dana. Plaćeni nivoi koštaju $49, $199 i $499 mesečno, prema cenama iz oktobra 2026, i svaki ima veći zajednički fond i uključene brojeve telefona.

### Mogu li sam da hostujem LobbyStack White Label?

Možete. Kod je pod MIT licencom, a svaka partnerska funkcija radi na vašim serverima kada podesite Stripe Connect, domen za partnere i TLS za sopstvene domene. LobbyStack ne naplaćuje licencu.

### Da li moji klijenti ikada vide ime LobbyStack?

Na prijavi, kontrolnoj tabli, u imejlovima i u vidžetu vide vaš brend. Prva SMS poruka svakom kupcu i odgovori na HELP navode LobbyStack, kako operateri zahtevaju, a ekrani za odobrenje Google Calendar-a i Instagrama prikazuju ime naše aplikacije.

## Isprobajte

[Počnite na nivou Free](/sr/white-label/) da podesite svoj brend i pokrenete demo za potencijalnog klijenta, ili pogledajte kod na [GitHub-u](https://github.com/lobbystack/lobbystack). Ako upoređujete programe, naše [poređenje platformi za white-label AI glasovne agente](/sr/blog/white-label-ai-voice-agent-platforms/) stavlja LobbyStack pored pet drugih, a [vodič za pokretanje AI agencije za recepcionere](/sr/blog/start-ai-receptionist-business/) pokriva nišu, cene i uvođenje klijenata.
