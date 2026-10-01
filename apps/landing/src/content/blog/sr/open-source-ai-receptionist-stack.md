---
title: "Open-source sistem za AI recepcionera"
description: "LobbyStack je open-source sistem za AI recepcionera: pozivi, zakazivanje, transkripti, kontrolne table, naplata, samostalno hostovanje i postavljanje za klijente."
pubDate: 2026-06-18T10:00:00-04:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/open-source-ai-receptionist-stack-hero.webp"
locale: "sr"
canonicalSlug: "open-source-ai-receptionist-stack"
---

Open-source sistemu za AI recepcionera treba više od glasovnog agenta. Potrebni su mu usmeravanje poziva, glas u realnom vremenu, zakazivanje, transkripti, primanje poruka, upozorenja za osoblje, pregled na kontrolnoj tabli, praćenje potrošnje, naplata, nadzor i način da firma promeni šta AI sme da radi.

To je deo koji mnogi timovi na kraju prave iznova.

[LobbyStack](https://lobbystack.com/) je **open-source sistem za AI recepcionera** za timove koji žele da taj sloj proizvoda već postoji. Koristite hostovanu verziju u oblaku kada želite da ga neko drugi održava ili ga samostalno hostujte uz Docker kada želite infrastrukturu pod svojom kontrolom.

## Sistem koji ljudi stalno prave iznova

Mnogi projekti AI recepcionera počinju istom gomilom alata:

- Retell, Vapi ili Twilio za glas
- n8n, Zapier, Make ili prilagođeni webhookovi za povezivanje
- Google Calendar za zakazivanje
- baza podataka za pozive, kontakte, transkripte, snimke i termine
- logika u promptovima za poslovna pravila, eskalaciju i predaju poziva
- obaveštenja putem SMS-a i e-pošte
- administratorska kontrolna tabla za osoblje
- praćenje potrošnje, naplata, logovi i upozorenja dobavljača

Ti alati mogu da rade. Problem počinje kada demo postane telefonski sistem od kog firma zavisi.

Klinika želi drugačija pravila zakazivanja od estetskog centra. Firmi za kućne usluge trebaju zahtevi za ponude, područja usluge, usmeravanje hitnih poziva i vremenski okviri za povratne pozive. Advokatska kancelarija možda želi prijem novih klijenata, ali ne želi da AI odgovara na pravna pitanja. Agencija koja postavlja sistem za klijente možda treba isti osnovni proizvod, sa drugačijom infrastrukturom i nalozima kod dobavljača za svakog klijenta.

U tom trenutku glasovni agent je samo jedan deo. I dalje Vam treba operativni sistem oko poziva.

## Šta uključuje LobbyStack platforma

[LobbyStack funkcije](/features/) daju Vam gotov sloj recepcije, umesto da ga sklapate od nule.

Obuhvata:

- dolazne AI telefonske pozive
- zakazivanje, pomeranje i otkazivanje termina
- transkripte, snimke, rezimee i ishode poziva
- poslovni kontekst, česta pitanja, usluge, cene, pravila poslovanja i pravila ponašanja
- SMS potvrde i podsetnike za termine, kao i upozorenja e-poštom ili SMS-om za osoblje
- prebacivanje na čoveka, preusmeravanje i poruke
- prikupljanje potencijalnih klijenata sa podacima pozivaoca i razlogom poziva
- kontakte, termine, istoriju poziva, analitiku, potrošnju i naplatu

Poenta nije da zamenite svaki alat koji već koristite. Twilio, kalendari, dobavljači e-pošte, alati za analitiku i dobavljači naplate i dalje su važni. LobbyStack Vam daje proizvod za recepciju koji stoji iznad njih.

Umesto da pravite krhke lance tokova rada za osnovno ponašanje, na običnom jeziku opišete šta recepcioner treba da radi.

Na primer:

```text
Ako pozivalac traži ponudu, prikupi vrstu usluge, lokaciju, rok i budžet.
Navedi odobrene početne cene kada postoje. Ako tačna cena zavisi od posla,
primi poruku za tim.
```

AI može da vodi razgovor, ali i dalje koristi alate za radnje kojima je potrebno ovlašćenje: proveru dostupnosti, zakazivanje termina, čuvanje poruka, preusmeravanje poziva, slanje obaveštenja i uredno završavanje poziva.

## Kako funkcioniše putanja poziva uživo

LobbyStack koristi OpenAI Realtime za glasovni razgovor uživo i Twilio Voice sa Media Streams za telefonsku putanju.

Glasovni gateway ima uzak zadatak. Obrađuje poziv uživo, strimuje zvuk, upravlja realtime sesijom, izvršava alate tokom poziva, prikuplja transkripte i šalje snimke tamo gde treba.

PostgreSQL je trajni izvor istine. Next.js aplikacija obrađuje saobraćaj operatera i API-ja, a worker obrađuje asinhrone poslove i transakcione outbox događaje.

Ta podela je važna. Telefonski poziv traži malo kašnjenje, ali o poslovnoj radnji konačnu odluku mora da donese pozadinski sistem. LobbyStack na početku poziva učitava snimak poslovnog konteksta, a zatim poziva alate u pozadinskom sistemu kada AI treba da zakaže, preusmeri, sačuva poruku ili izmeni termin.

Recepcioner može da zvuči prirodno u razgovoru, a da pritom ne improvizuje važne delove.

## Hostovani oblak ili samostalno hostovan Docker

Neki timovi žele upravljani proizvod. Za njih je [LobbyStack Cloud](/pricing/). Napravite nalog, podesite firmu, povežite delove i počnite da testirate pozive bez održavanja infrastrukture.

Drugi timovi žele sistem na sopstvenoj infrastrukturi. LobbyStack podržava i to.

Putanja za [samostalno hostovanog AI recepcionera](/solutions/self-hosted-ai-receptionist/) koristi Docker Compose kao osnovu na jednom serveru. Dokumentovana postavka pokreće PostgreSQL, Redis, Next.js aplikaciju, pozadinski worker, glasovni gateway i Caddy koji usmerava saobraćaj ka njima. Vi postavljate HTTPS ispred Caddyja. Donosite naloge dobavljača koje želite da kontrolišete, uključujući Twilio, AI kompatibilan sa OpenAI-jem, Google Calendar, e-poštu, analitiku i pristupne podatke za naplatu.

Tako agencije i tehnički operateri imaju jasniju priču za klijente. Ako klinika, estetski centar, firma za kućne usluge ili advokatska kancelarija želi sistem na sopstvenim serverima ili nalogu u oblaku, možete ga postaviti tamo, umesto da firmu terate u zatvorenu hostovanu aplikaciju.

Samostalno hostovanje i dalje traži nekoga ko je odgovoran. Neko mora da upravlja tajnim ključevima, DNS-om, pristupnim podacima dobavljača, rezervnim kopijama, nadogradnjama, nadzorom i testiranjem poziva. Vrednost je u tome što počinjete od funkcionalnog [open-source AI recepcionera](/solutions/open-source-ai-receptionist/), a ne od praznog repozitorijuma.

## Bolja osnova za projekte za klijente

Ako pravite AI recepcionere za klijente, zarada retko leži u ponovnom pravljenju transkripata, kontrolnih tabli, merača potrošnje, tokova zakazivanja i evidencije poziva.

Zarada je u razumevanju posla:

- Koji pozivi treba da završe zakazivanjem?
- Koji pozivi treba da završe porukom za osoblje?
- Kojim pozivima odmah treba čovek?
- Koje podatke osoblje treba da vidi posle poziva?
- Koja pravila su važna za tu nišu?
- Koje naloge kod dobavljača i koju infrastrukturu klijent treba da poseduje?

LobbyStack Vam daje osnovu koju prilagođavate oko tih pitanja.

Možete ga koristiti za sopstvenu firmu, postaviti ga za klijenta ili koristiti hostovanu verziju u oblaku kada kontrola nad infrastrukturom nije glavna briga. Kada hostujete sami, možete koristiti sopstvene ključeve dobavljača i držati sistem unutar okruženja koje firma kontroliše.

## Kada je LobbyStack dobar izbor

LobbyStack je dobar izbor kada želite AI recepcionera koji radi više od pukog javljanja na poziv.

Posebno je koristan ako Vam trebaju:

- open-source kod koji možete da pregledate i prilagodite
- samostalno hostovanje zasnovano na Dockeru
- hostovana verzija u oblaku kada je brzina važna
- sopstveni nalozi kod dobavljača kada hostujete sami
- zakazivanje i izmene termina
- transkripti, snimci, rezimei i ishodi poziva
- upozorenja za osoblje e-poštom i SMS-om
- infrastruktura pod kontrolom klijenta za agencije ili regulisane delatnosti

To nije način da izbegnete održavanje. Telefonske sisteme i dalje treba testirati. Ponašanje AI-ja i dalje treba pregledati. Nalozi kod dobavljača i dalje traže pažnju.

To je način da preskočite mesece tehničke infrastrukture proizvoda pre nego što se posvetite poslovnim tokovima.

Ako prvo upoređujete open-source opcije za odgovaranje na pozive, pogledajte vodič za [najbolje open-source AI servise za odgovaranje na pozive](/sr/blog/best-open-source-ai-phone-answering-services/). Agencijama koje postavljaju sistem za klijente može biti zanimljiv i [LobbyStack partnerski program](/sr/blog/ai-receptionist-affiliate-program/). Za dizajn tokova rada, pogledajte [tokovi rada AI recepcionera bez dijagrama toka](/sr/blog/ai-receptionist-workflows/).

## Isprobajte ga ili ga hostujte sami

Počnite sa [LobbyStack Cloud](https://lobbystack.com/) ako želite da isprobate proizvod bez upravljanja infrastrukturom.

Koristite [pregled samostalnog hostovanja](https://docs.lobbystack.com/self-hosting/overview) i [Docker Compose vodič](https://docs.lobbystack.com/self-hosting/docker-compose) ako želite da sistem pokrećete sami.

Kod je javno dostupan na [GitHubu](https://github.com/lobbystack/lobbystack). Ako bi open-source sistem za AI recepcionera pomogao Vašoj firmi ili radu sa klijentima, zvezdica pomaže da ga pronađe više ljudi.
