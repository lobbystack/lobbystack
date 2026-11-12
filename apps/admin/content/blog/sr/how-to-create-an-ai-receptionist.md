---
title: "Kako napraviti AI agenta za recepciju uz Claude ili ChatGPT"
seoTitle: "Kako napraviti AI recepcionera bez kodiranja"
description: "Napravite AI recepcionera, AI agenta za vaš telefon, bez koda: uvezite sajt, testirajte ga u pregledaču, a Claude ili ChatGPT neka dopune česta pitanja i radno vreme."
pubDate: 2026-11-01T13:00:00-05:00
updatedDate: 2026-11-01T13:00:00-05:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/how-to-create-an-ai-receptionist-hero.webp"
coverImageAlt: "Bež LobbyStack naslovna kartica sa naslovom How to create an AI receptionist with Claude or ChatGPT"
locale: "sr"
canonicalSlug: "how-to-create-an-ai-receptionist"
---

Da biste bez koda **napravili AI recepcionera**, AI agenta koji kao virtuelni asistent odgovara na vaše pozive, prijavite se na uslugu za recepcionere, dajte joj svoj sajt, testirajte recepcionera u pregledaču i povežite Claude ili ChatGPT da podešavanje završite običnim jezikom. Na LobbyStack-u prvi prolaz traje oko 10 minuta i za početak vam ne treba kartica.

Vaš asistent ne može sam da se javlja na vaš telefon. LobbyStack odgovara na pozive na GPT-Live modelu, onom iza ChatGPT Voice, a vaš asistent radi na podešavanju: čita vaše pozive, piše česta pitanja i menja radno vreme. Ako biste radije pravili od nule, pročitajte [kako napraviti AI recepcionera](/sr/blog/how-to-build-an-ai-receptionist/).

## Šta vam treba pre nego što napravite AI agenta?

- adresa vašeg sajta, ako ga imate
- mobilni telefon koji može da primi SMS, jer LobbyStack ne može da verifikuje internet (VoIP) brojeve
- Claude ili ChatGPT nalog za korake 5 i 6

## Korak 1: Napravite nalog i uvezite sajt

[Prijavite se besplatno](/sr/pricing/) i unesite ime firme. Unesite adresu sajta, i LobbyStack počinje da čita vaše javne stranice, kao što su usluge, o nama, česta pitanja, radno vreme i kontakt. Čitanje radi u pozadini, pa možete da nastavite dok traje.

Nemate sajt? Izaberite **Nemam sajt**, pa otpremite dokumente ili nalepite tekst o svojoj firmi.

## Korak 2: Podesite pozdrav i jezik

Napišite prvu rečenicu koju pozivaoci čuju, na primer „Hvala što ste pozvali Northside Dental, kako mogu da pomognem?“ Izaberite jezik na kom pozivi počinju: engleski, francuski, španski, srpski, nemački, portugalski, italijanski ili holandski. Recepcioner menja jezik kada pozivalac to zatraži ili govori drugi jezik.

Nove firme počinju sa glasom Marin, a kasnije možete da izaberete neki drugi od [GPT-Live glasova](/sr/blog/openai-voices/). LobbyStack ne klonira glasove.

## Korak 3: Pozovite ga iz pregledača

Započnite probni poziv i govorite kao što bi pozivalac govorio. Pitajte za cene, radno vreme i ono što kupci uvek pogrešno razumeju. Svaki pogrešan odgovor vam govori šta treba da dodate u koraku 6.

Probni pozivi se računaju u 30 minuta razgovora iz paketa Free, pa neka budu kratki.

## Korak 4: Nabavite broj telefona

Verifikujte svoj mobilni šestocifrenim kodom, pa izaberite broj. LobbyStack prodaje brojeve u Sjedinjenim Državama, Kanadi i Portoriku, a bez plaćenog paketa vaš broj je besplatan 14 dana. Tokom probnog perioda recepcioner prebacuje pozive samo na mobilni koji ste verifikovali. Pozovite broj sa bilo kog telefona da čujete svoj pozdrav.

## Korak 5: Povežite Claude ili ChatGPT

LobbyStack ima MCP server, standardan način na koji AI asistenti koriste spoljne alate. [Stranica o MCP-u](/sr/features/mcp/) navodi šta asistent može da uradi. Adresa servera je `https://app.lobbystack.com/api/mcp`. Za ova dva asistenta ne morate ništa da instalirate:

**Claude.** Idite na **Customize** > **Connectors**, kliknite **+ Add**, zatim **Add custom connector**. Nazovite ga LobbyStack, nalepite adresu i prođite kroz prijavu. Izaberite svoju firmu i isključite sve što Claude ne treba da radi. Claude paket Free dozvoljava jedan prilagođeni konektor. [Cela uputstva](https://docs.lobbystack.com/ai/connect-claude) pokrivaju pakete Team i Enterprise.

**ChatGPT.** Idite na **Plugins**, kliknite **+**, zatim **Add custom MCP server**. Nazovite ga LobbyStack, nalepite adresu i izaberite OAuth. ChatGPT može da menja vaše podatke na paketima Business, Enterprise i Edu. Na paketu Pro može samo da čita, pa ne može da dodaje česta pitanja. [Cela uputstva](https://docs.lobbystack.com/ai/connect-chatgpt) pokazuju svaki ekran.

## Korak 6: Neka asistent završi podešavanje

Počnite ovim promptom. Kopirajte ga, popunite zagrade i pošaljite:

```text
Pomažeš mi da podesim mog LobbyStack AI recepcionera. Prvo pozovi get_business
i reci mi šta vidiš, pa navedi moje usluge.

Zatim me pitaj, jedno po jedno, 10 pitanja koja mi pozivaoci najčešće postavljaju.
Vodim [vrsta firme] u [grad]. Svaki odgovor napiši kao često pitanje mojim rečima,
pokaži mi ga i dodaj ga sa add_knowledge kada ga odobrim.

Dodaj samo činjenice koje ti ja navedem. Ne nagađaj cene.
```

Kada počnu da stižu pravi pozivi, ovi promptovi drže recepcionera u formi:

```text
Pročitaj mojih poslednjih 10 poziva. Navedi svako pitanje na koje recepcioner nije
umeo da odgovori i pripremi često pitanje za svako. Sačekaj moje odgovore pre nego
što ih dodaš.
```

```text
Ko je juče zvao, a nije zakazao? Pokaži mi poruke na koje još dugujem odgovor.
```

```text
Od sada ne radimo subotom. Pokaži mi novo radno vreme pre nego što ga promeniš.
```

Vaš asistent radi sa dozvolama koje ste odobrili, a LobbyStack svaku njegovu promenu beleži u vašem dnevniku revizije. Možete da ga isključite u bilo kom trenutku u **Podešavanja** > **API ključevi**.

## Šta asistent može da menja, a šta ostaje na vama?

| Posao | Ko ga radi |
| --- | --- |
| Dodavanje čestih pitanja i beleški | Vaš asistent |
| Promena radnog vremena | Vaš asistent |
| Čitanje poziva, transkripata i poruka | Vaš asistent |
| Pronalaženje kontakata i zakazivanje ili pomeranje termina | Vaš asistent |
| Pravljenje naloga i verifikacija mobilnog | Vi |
| Izbor ili kupovina broja telefona | Vi, na kontrolnoj tabli |
| Promena pozdrava, glasa, pravila i usluga | Vi, u delu **Agent** na kontrolnoj tabli |
| Povezivanje kalendara | Vi, jer Google traži vašu saglasnost u pregledaču |

## Korak 7: Pošaljite mu prave pozive

Otvorite **Agent** na kontrolnoj tabli i poslednji put proverite **AI podešavanja**, **Znanje**, **Usluge** i **Pravila**. Da biste zadržali broj koji vaši kupci već biraju, [preusmerite poslovnu liniju](/sr/blog/how-to-forward-business-calls/) na svoj LobbyStack broj. Prvo preusmerite pozive koje propuštate, a na sve pozive pređite kada mu budete verovali.

## Može li da koristi boje vašeg brenda?

Pozivaoci čuju ime vaše firme i pozdrav, pa boje do njih ne dopiru. Važne su na dva druga mesta:

- **Vaša kontrolna tabla, ako je prodajete drugima.** Sa programom [White Label](/sr/white-label/) podešavate ime, logo, favikon i boju brenda, a vaši klijenti ih vide na vašoj adresi. Povežite Claude sa svojim partnerskim nalogom i zatražite „Podesi boju našeg brenda na #0f766e.“ Naš vodič za [prodaju white label AI agenta](/sr/blog/white-label-ai-agent/) ima ostatak.
- **Vidžet za sajt.** Vidžet ima sopstveno podešavanje boje, ali čet na sajtu nije deo hostovanih paketa. Možete da ga uključite kada sami hostujete.

## Koliko košta?

| Paket | Mesečna cena | Minuti razgovora | Dodatni minut |
| --- | --- | --- | --- |
| Free | $0 | 30 | Nema |
| Starter | $30 | 150 | $0.20 |
| Pro | $100 | 500 | $0.18 |

Godišnja naplata je 20% jeftinija. Starter i Pro uključuju jedan broj. Cene su u američkim dolarima, prema stanju od 1. novembra 2026. Pogledajte [koliko košta AI recepcioner](/sr/blog/ai-receptionist-savings/) da vidite kako stoje drugi dobavljači.

## Česta pitanja

### Koliko traje pravljenje AI recepcionera?

Oko 10 minuta za prvi prolaz na LobbyStack-u. Veliki sajt se i dalje čita u pozadini, a česta pitanja iz koraka 6 traju koliko i vaši odgovori.

### Može li ChatGPT da se javlja na telefon moje firme?

Ne može sam. ChatGPT nema telefonsku liniju za vašu firmu. Usluga kao što je LobbyStack drži broj i odgovara na GPT-Live modelu, a vi možete da povežete ChatGPT ili Claude da njome upravljate.

### Da li moram da znam programiranje?

Ne morate. Svaki korak u ovom vodiču odvija se na sajtu ili u četu. Ako želite da asistent za kodiranje gradi na [API-ju](https://docs.lobbystack.com/api/overview), to možete da uradite kasnije.

### Može li da zakazuje termine?

Može. Dodajte svoje usluge, povežite Google Calendar, Cal.com ili Calendly i podesite **Termini** na **Zakazuje termine**. I vaš asistent može da zakazuje i pomera termine.

### Može li da odgovara na SMS poruke?

Ne može. LobbyStack šalje upozorenja i SMS poruke o terminima, i ne odgovara AI-jem na dolazne SMS poruke.

## Napravite svog sada

[Počnite na paketu Free](/sr/pricing/) bez kartice, uvezite sajt i pozovite svog recepcionera iz pregledača. [Vodič za podešavanje](https://docs.lobbystack.com/quickstart) pokriva svaki ekran.
