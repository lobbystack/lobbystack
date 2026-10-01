---
title: "Naš AI glasovni agent sada radi na GPT-Live, modelu koji pokreće ChatGPT Voice"
seoTitle: "AI glasovni agent na GPT-Live, modelu ChatGPT Voice"
description: "LobbyStack AI glasovni agent sada radi na OpenAI modelu GPT-Live, koji pokreće ChatGPT Voice. Nastavlja razgovor dok zakazuje, proverava radno vreme i prima poruke."
pubDate: 2026-09-26T21:00:00-04:00
author: "LobbyStack tim"
category: "Novosti o proizvodu"
featured: false
coverImage: "/illustrations/ai-voice-agent-gpt-live-hero.webp"
coverImageAlt: "Svetleći talasni oblik glasa iznad diska recepcionera, povezan sa kalendarom sa zakazanim danom, beleškom sa porukom i telefonskom slušalicom"
locale: "sr"
canonicalSlug: "ai-voice-agent-gpt-live"
---

Pozivalac pita da li imate nešto slobodno u utorak ujutru. Kod većine AI glasovnih agenata linija utihne dok softver proverava kalendar. LobbyStack AI glasovni agent nastavlja razgovor dok proverava, jer sada radi na GPT-Live, glasovnom modelu koji je OpenAI napravio za ChatGPT Voice.

Svaki LobbyStack poziv sada radi na GPT-Live, i na telefonu i u pregledaču. U ovom tekstu objašnjavamo šta je GPT-Live, kako smo ga povezali sa recepcionerom koji izvršava stvarne radnje i šta smo naučili tokom prelaska.

## Šta je GPT-Live

OpenAI je pokrenuo GPT-Live u ChatGPT-u u julu 2026. i otvorio ga za programere 10. septembra. To je [podrazumevani glasovni model za korisnike plaćenog ChatGPT-a](https://deploymentsafety.openai.com/gpt-live), pa ako ste koristili ChatGPT Voice na plaćenom paketu, već ste ga čuli.

OpenAI ga opisuje kao full-duplex: sluša i govori u isto vreme, kao dvoje ljudi u telefonskom razgovoru. Pozivalac to primećuje na tri mesta:

- Kada upadne u reč, model staje i sluša umesto da završi rečenicu.
- Razlikuje pozivaoca koji razmišlja od pozivaoca koji je završio.
- Kratko „aha“ ili „tako je“ ga ne izbacuje iz ritma.

OpenAI u [objavi za programere](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) poredi ga sa svojim prethodnim realtime glasovnim modelom. Smenjivanje u razgovoru je oko 43% brže, a udeo zadataka iz testova koji su urađeni iz prvog pokušaja skoro se udvostručio.

## Glasovni model koji radi za Vašu firmu

ChatGPT Voice odgovara na pitanja. Recepcioner mora da obavi posao: da proveri kalendar, zakaže termin, zapiše poruku i prebaci poziv čoveku kada je to važno.

GPT-Live to rešava onim što OpenAI naziva delegiranjem. Kada pozivalac zatraži nešto za šta su potrebni podaci Vaše firme, GPT-Live predaje zadatak softveru koji Vi kontrolišete i [nastavlja da govori dok se taj posao izvršava](https://developers.openai.com/api/docs/guides/live-delegation). Pozivalac čuje recepcionera koji ostaje na liniji sa njim.

U LobbyStack-u ti zadaci idu jednom agentu koji ima alate za:

- Vaše radno vreme, usluge i odgovore iz znanja koje ste dodali
- pronalaženje slobodnih termina i zakazivanje, ili primanje zahteva koji Vaš tim treba da potvrdi
- pronalaženje, pomeranje ili otkazivanje termina posle provere identiteta pozivaoca
- primanje poruke za Vaš tim
- preusmeravanje poziva čoveku

Model za rezonovanje bira pravi alat i prati Vaša pravila, kao što su način zakazivanja, broj za preusmeravanje i kada pozivaoca treba proveriti. Glasovni model vodi razgovor.

Čet na Vašem sajtu koristi istog agenta. Posetilac koji kuca na sajtu dobija iste odgovore, iste slobodne termine i ista pravila zakazivanja kao neko ko zove.

## Kako se promenila naša arhitektura

Pre prelaska, zvuk iz telefona je išao dužim putem. Twilio je svaki poziv strimovao do glasovnog gatewaya koji smo sami održavali, a gateway je prosleđivao zvuk do OpenAI Realtime API-ja i nazad. Svaka reč je dva puta prolazila kroz naše servere.

Sada zvuk hostuje OpenAI. Telefonski pozivi stižu do njega preko Twilio SIP trunka, a pozivi iz pregledača se povezuju preko WebRTC-a. Naša aplikacija pokreće svaki poziv, a pozadinski worker odgovara na zahteve agenta, čuva transkript i snimak.

Time je jedan servis uklonjen iz putanje poziva i sa liste stvari koje održavamo. Pošto su svi brojevi prebačeni, gasimo gateway, što LobbyStack čini jednostavnijim i za timove koji ga [hostuju sami](/solutions/self-hosted-ai-receptionist/).

## Šta smo naučili tokom prelaska

Pokretali smo GPT-Live u test okruženju, zatim na pravim pozivima iz pregledača, a onda smo prebacili sopstveni broj telefona pre brojeva bilo kog klijenta. Izdvojilo se nekoliko lekcija.

**Pozivi deluju brže.** Bez našeg posrednog servera i uz model napravljen za smenjivanje u razgovoru, recepcioner odgovara ranije i ređe priča preko pozivalaca. Primetili smo to već na prvom probnom pozivu.

**Odgovori su postali bolji kada smo razdvojili govor i razmišljanje.** Naša stara postavka je tražila od jednog modela da istovremeno vodi razgovor i izvršava poslovnu logiku. Sada glasovni model pravi društvo pozivaocu dok model za rezonovanje sa pravim alatima dolazi do odgovora. U našim testovima pouzdanije je birao pravi alat u pravom trenutku i proverava svaki odgovor u odnosu na ono što nam je firma rekla.

**Recepcioner treba da progovori prvi.** GPT-Live podrazumevano čeka da pozivalac progovori. Recepcija pozdravlja pozivaoca, pa šaljemo pozdrav čim sesija počne i pozivaoci odmah čuju ime Vaše firme. Ako gradite na GPT-Live, testirajte prve tri sekunde svakog poziva.

**Brojevi telefona stižu u neočekivanom zaglavlju.** Uz Twilio SIP trunk, broj koji je pozivalac okrenuo stiže u SIP zaglavlju `Diversion`, a ne `To`. Naši prvi pozivi u test okruženju nisu uspevali dok ga nismo čitali odatle.

**I kratki pozivi nešto koštaju.** OpenAI naplaćuje kratak minimum kada pravi sesiju u pregledaču. Zadržali smo pravilo da su pozivi kraći od 10 sekundi besplatni za klijente, a sada pratimo koliko nas ti pozivi koštaju kako se pogrešni brojevi nikada ne bi pojavili na računu.

**Jedan agent se isplati.** Pošto čet i pozivi dele iste alate, svaka ispravka i svaka nova mogućnost stižu do oba odjednom.

## Šta to znači za Vašu firmu

Pozivaoci ocenjuju AI glasovnog agenta po tome da li su dobili ono zbog čega su zvali. Uz GPT-Live, LobbyStack zvuči više kao dobra recepcija:

- Pozivaoci dobijaju odgovore i termine bez muzike na čekanju i dugih tišina.
- Vi birate da li agent zakazuje direktno, prima zahteve koje Vaš tim potvrđuje ili uopšte ne zakazuje.
- Vaša telefonska linija i Vaš sajt daju iste odgovore.
- Uz svaki poziv dobijate transkript, snimak i rezime na kontrolnoj tabli.

LobbyStack je open-source projekat pod MIT licencom. Možete ga pokretati sami ili prepustiti nama da ga hostujemo. U oba slučaja dobijate istog AI telefonskog recepcionera.

## Pitanja o GPT-Live i LobbyStack-u

### Da li je ovo isti model kao ChatGPT Voice?

GPT-Live-1 je model koji ChatGPT Voice podrazumevano koristi za plaćene korisnike. LobbyStack ga povezuje sa Vašom firmom kroz delegiranje, pa može da proveri Vaš kalendar i zakaže termine, što ChatGPT sam ne može da uradi za Vaše klijente.

### Šta je AI glasovni agent?

AI glasovni agent je softver koji odgovara na pozive prirodnim govorom i tokom poziva obavlja zadatke, kao što su zakazivanje termina ili primanje poruke. LobbyStack AI glasovni agent radi kao recepcioner za male firme koje propuštaju pozive dok su zauzete klijentima.

### Da li treba da promenim broj telefona?

Ne. Starter i Pro uključuju poseban LobbyStack broj. Preusmerite svoj postojeći broj na njega ili mu šaljite samo pozive van radnog vremena i pozive kada su svi zauzeti.

## Poslušajte sami

Najbrži način da procenite glasovni model je da razgovarate sa njim. Isprobajte dugme za poziv na [našoj početnoj stranici](/sr/) i pitajte ga o LobbyStack-u ili [napravite besplatan nalog](https://app.lobbystack.com/signup) i za nekoliko minuta testirajte svog recepcionera iz pregledača. Pogledajte [cene](/sr/pricing/) kada budete spremni da ga stavite na svoju telefonsku liniju.
