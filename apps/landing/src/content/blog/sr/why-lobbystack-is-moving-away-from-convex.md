---
title: "Zašto LobbyStack napušta Convex"
seoTitle: "Zašto LobbyStack napušta Convex"
description: "LobbyStack napušta Convex da bi olakšao samostalno hostovanje i doprinose uz stek koji mnogi timovi poznaju: Next.js, PostgreSQL, Drizzle i Redis."
pubDate: 2026-09-04T10:00:00-04:00
author: "LobbyStack tim"
category: "Novosti o proizvodu"
featured: false
coverImage: "/illustrations/why-lobbystack-is-moving-away-from-convex-hero.webp"
coverImageAlt: "Modularni servisi aplikacije povezani sa centralnom PostgreSQL bazom i glasovnim kanalom u realnom vremenu"
locale: "sr"
canonicalSlug: "why-lobbystack-is-moving-away-from-convex"
---

Convex nam je pomogao da LobbyStack od ideje pretvorimo u funkcionalnog AI recepcionera brzinom koju ne bismo dostigli sa backendom napravljenim od nule. On i danas pokreće proizvod koji koriste naši klijenti koji plaćaju, i dobro ih je služio.

LobbyStack prebacujemo na uobičajen TypeScript stek zasnovan na Next.js-u, PostgreSQL-u i Drizzle-u. Prenos koda aplikacije je završen. Migracija produkcionih podataka i saobraćaja obaviće se tek kada prođu sve provere uvoza, usklađivanja, skladištenja i vraćanja na staro stanje.

Ovu odluku smo doneli jer LobbyStack treba šire da prihvate i korisnici proizvoda i saradnici na kodu. Convex nam je dao pouzdan proizvod, ali LobbyStack je rastao sporije nego što smo očekivali.

## Convex nam je pomogao da izbacimo prvi proizvod

Prvo smo morali da utvrdimo da li LobbyStack može da odgovara na stvarne pozive, razume firmu, zakazuje termine, šalje poruke i vrati posao čoveku kada je to potrebno. Convex nam je dao produktivan način da napravimo takav sistem.

Brinuo je o trajnim podacima, poslovnoj logici, tokovima rada, autentifikaciji, zakazanim zadacima i ažuriranjima u realnom vremenu. Mogli smo da promenimo šemu, dodamo operaciju i vidimo rezultat na kontrolnoj tabli, bez prethodnog sklapanja svakog sloja backenda. Ta brzina je bila važna dok se proizvod menjao svake nedelje.

Glasovnu putanju, osetljivu na kašnjenje, držali smo u zasebnom Fastify gatewayu. Na početku poziva, gateway je učitavao snimak stanja firme i njenih uputstava. Backendu se vraćao za radnje koje traže ovlašćenje, kao što su zakazivanje termina ili čuvanje ishoda poziva. Ta arhitektura je radila za klijente uživo.

Convex nam je dao snažnu prvu fazu i nastavlja pouzdano da služi našim klijentima dok pripremamo produkcionu migraciju.

## Naše ograničenje više nije isporuka, već prihvatanje

LobbyStack sada treba više firmi koje koriste proizvod i više programera spremnih da ga pokreću, pregledaju i proširuju. Ni u jednoj od te dve grupe nismo videli prihvatanje kojem smo se nadali.

Tehnička procena stvarala je otpor kod nekih ljudi do kojih smo želeli da dopremo. Saradnik je morao da razume naš proizvod i da sistemima koje treba da nauči doda Convex. Neko ko sam hostuje morao je da održava LobbyStack servise i zaseban Convex backend. Agencija koja je razmatrala primenu za klijenta morala je tu arhitekturu da objasni svom timu i klijentu.

Timovi su trošili više vremena na procenu i učenje infrastrukture pre nego što su mogli da usvoje proizvod.

Verujemo da poznat stek većem broju timova skraćuje put od otvaranja repozitorijuma do pokretanja LobbyStacka. Agencijama takođe daje veći izbor programera i operatera koji mogu da održavaju primene kod klijenata. To je poslovna prednost za proizvod otvorenog koda koji zavisi od korišćenja u zajednici i komercijalnih implementacija.

## Novi LobbyStack stek

Zamena zadržava delove arhitekture koji su već radili, a trajni backend čini poznatijim.

- **Next.js** pokreće kontrolnu tablu za operatere, autentifikaciju i HTTP API.
- **PostgreSQL** čuva trajne poslovne podatke uz konekcije vezane za uloge i bezbednost na nivou redova.
- **Drizzle** definiše šemu i eksplicitne migracije baze podataka.
- **Redis i BullMQ** pokreću poslove u redu, ograničenja broja zahteva i koordinaciju u realnom vremenu.
- **Fastify** i dalje obrađuje usku glasovnu putanju za Twilio i OpenAI Realtime.

Poslovne operacije smo premestili u zajedničke domenske module koje koriste i Next.js aplikacija i worker. Tako zakazivanje, naplata, znanje, poruke i ponašanje poziva ostaju dosledni u oba okruženja.

Dodali smo i transakcioni outbox. Kada LobbyStack menja poslovne podatke i zakazuje sporedni efekat, PostgreSQL oba zapisa potvrđuje u jednoj transakciji. Worker može ponovo da pokuša isporuku, a da ne izgubi vezu između prvobitne radnje i posla u redu.

Oni koji sami hostuju sada dobijaju standardan skup servisa: PostgreSQL, Redis, Next.js aplikaciju, worker, glasovni gateway i skladište fajlova. Timovi kojima treba objektno skladište mogu da povežu provajdera kompatibilnog sa S3. Kroz ceo stek mogu da koriste poznate alate za rezervne kopije, migracije, nadzor i kontrolu pristupa.

## PostgreSQL čini važne operacije eksplicitnim

Upravljane platforme skidaju posao sa tima u ranim fazama proizvoda. Infrastruktura otvorenog koda ima drugačiji zahtev. Operateri moraju da vide kako se podaci kreću, kako rade dozvole i kako da oporave sistem koji je pod njihovom kontrolom.

PostgreSQL daje LobbyStacku eksplicitne migracije šeme, postupke za pravljenje rezervnih kopija i vraćanje podataka, uloge sa najmanjim potrebnim ovlašćenjima i obaveznu bezbednost na nivou redova. Drizzle čuva te definicije u repozitorijumu. Naši alati za proveru mogu da testiraju izolaciju između firmi i da provere da uloge aplikacije ne mogu da zaobiđu pravila.

Ista jasnoća pomaže i tokom pregleda kod klijenata. Agencija može da objasni gde su podaci, koji servis može da ih čita i kako će ih tim vratiti. Saradnik može da pregleda šemu bez prethodnog učenja modela podataka specifičnog za jednu platformu.

Ove mogućnosti su u starom steku postojale u drugačijim oblicima. Sada ih izlažemo kroz PostgreSQL i standardne operativne alate. Verujemo da tako više timova može da primeni iskustvo koje već ima.

## Migracija klijenata dolazi poslednja

Završili smo prenos koda aplikacije i uklonili Convex iz aktivnog okruženja koje ga zamenjuje. Podaci klijenata koji plaćaju i produkcioni saobraćaj i dalje prolaze kroz postojeću Convex instancu.

Tako će ostati dok produkciona migracija ne prođe sve kontrolne tačke. Proces zahteva konačan nepromenljiv izvoz, idempotentan uvoz, potpuno usklađivanje zapisa, kontrolne zbirove fajlova, zamrzavanje upisa i uvežbano vraćanje na staro stanje. Postojeći heševi lozinki zahtevaju kontrolisan prelaz, webhookovima provajdera treba plan za saobraćaj, a svaki potreban tok rada mora da prođe bez pozivanja starog backenda.

Convex ćemo držati dostupnim tokom perioda za vraćanje na staro stanje posle prelaska. Ovo izdanje donosi kod koji ga zamenjuje. Produkciona migracija klijenata ostaje zaseban korak pod kontrolom operatera, koji sam po sebi ne premešta ni saobraćaj ni podatke.

Ove kontrolne tačke koristimo da zaštitimo pozive, naloge i podatke klijenata tokom celog prelaska.

## Platforma na kojoj više timova može da gradi

LobbyStack ostaje isti proizvod: AI recepcioner za pozive, poruke, zakazivanje, znanje i predaju razgovora čoveku. Novi backend daje većem broju programera poznato mesto za doprinos, a većem broju agencija stek koji mogu da vode za klijente.

I licenca sada podržava taj cilj. LobbyStack smo prebacili sa AGPL na MIT licencu kako bi komercijalni graditelji mogli da prilagođavaju kod, dalje ga licenciraju i prodaju proizvode zasnovane na njemu. Pročitajte [zašto je LobbyStack sada pod MIT licencom](/sr/blog/lobbystack-mit-license-ai-receptionist-resellers/) da biste videli poslovne razloge i dozvole koje nova licenca donosi.

Možete da [pregledate platformu na GitHubu](https://github.com/lobbystack/lobbystack), pratite [pregled samostalnog hostovanja](https://docs.lobbystack.com/self-hosting/overview) ili koristite [Docker Compose vodič](https://docs.lobbystack.com/self-hosting/docker-compose) da je sami pokrenete.

Ako želite recepcionera bez održavanja infrastrukture, [napravite LobbyStack Cloud nalog](https://app.lobbystack.com/signup) i testirajte ga sa svojom firmom.
