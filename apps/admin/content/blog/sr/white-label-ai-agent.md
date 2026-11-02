---
title: "White label AI agent: prodajte ga pod svojim brendom"
seoTitle: "White label AI agent: prodajte ga pod svojim brendom"
description: "White label AI agent vam omogućava da prodajete AI pod svojim brendom. Tri načina sa recepcionerom: kontrolna tabla sa brendom, vaš UI ili vaši serveri."
pubDate: 2026-11-01T11:00:00-05:00
updatedDate: 2026-11-01T11:00:00-05:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/white-label-ai-agent-hero.webp"
coverImageAlt: "Bež LobbyStack naslovna kartica sa naslovom White label AI agent: sell one under your own brand"
locale: "sr"
canonicalSlug: "white-label-ai-agent"
---

**White label AI agent** je AI agent koji jedna kompanija pravi, a druga prodaje pod svojim imenom, logom i cenama. Vaš klijent vidi vaš brend, a dobavljač vodi model i infrastrukturu. Telefonski recepcioner je jedan od agenata koje je najlakše prodavati na ovaj način, jer svaka lokalna firma već razume taj posao.

Ovaj vodič pokriva tri načina da ga prodajete na LobbyStack-u, od kontrolne table sa brendom koju možete da podesite danas do recepcionera unutar vašeg proizvoda. Ako još upoređujete dobavljače, počnite od našeg [poređenja platformi za white-label AI glasovne agente](/sr/blog/white-label-ai-voice-agent-platforms/).

## Koji white label put vam odgovara?

Izaberite put tako što ćete se zapitati gde će se vaš klijent prijavljivati.

| | Kontrolna tabla sa brendom | Vaš sopstveni UI | Vaši sopstveni serveri |
| --- | --- | --- | --- |
| Vaš klijent se prijavljuje na | Vaš poddomen, pod vašim brendom | Vaš proizvod | Bilo koje od ta dva |
| Najbolje za | Agencije i preprodavce | SaaS kompanije | Timove kojima treba kontrola nad podacima i troškovima |
| Ko naplaćuje klijentu | Vi, preko svog Stripe naloga | Vi, u svojoj naplati | Vi |
| Potrebno kodiranje | Nije potrebno | Da, preko API-ja | Administracija servera |
| Šta plaćate LobbyStack-u | Nivo, od $0 | Plaćeni nivo za brojeve | Sopstvene provajdere, plus opcionu podršku |

## Put 1: Prodajte kontrolnu tablu sa brendom

Vaši klijenti se prijavljuju na vašu adresu, vide vaš logo i plaćaju vama. LobbyStack ostaje iza vašeg brenda. Podešavanje ima [pet koraka](https://docs.lobbystack.com/white-label/overview), a prvom klijentu možete da naplatite sami pre nego što povežete plaćanja:

1. **Prijavite se kao partner.** Izaberite ime kompanije i poddomen kao što je `acme.receptionistportal.com`. Poddomen kasnije ne možete da promenite u konzoli.
2. **Dodajte svoj brend.** Podesite ime, logo, favikon i boju brenda, plus linkove za uslove, privatnost i podršku. Vaše stranice prikazuju promene u roku od jednog minuta.
3. **Napravite demo.** Unesite ime firme i sajt potencijalnog klijenta, a LobbyStack pravi recepcionera kog potencijalni klijent može da pozove preko bezbednog linka na vašoj adresi.
4. **Napravite ponudu.** Povežite svoj Stripe nalog, pa podesite mesečnu cenu, opcionu naknadu za podešavanje i minute koje svaki mesec uključuje. LobbyStack ne uzima deo tih uplata.
5. **Dodajte plaćeni nivo kada budete spremni.** Plaćeni nivoi dodaju brojeve telefona, više minuta u fondu i poddomen vašeg sajta, kao što je `app.acmeagency.com`.

Naš vodič za [pokretanje AI agencije za recepcionere](/sr/blog/start-ai-receptionist-business/) pokriva niše, cene i podršku kada ovo proradi.

### Može li AI asistent da uradi ovo umesto vas?

Može, za veći deo posla u konzoli. Posle prijave [povežite Claude ili ChatGPT sa svojim partnerskim nalogom](https://docs.lobbystack.com/white-label/mcp-for-agencies) preko LobbyStack MCP servera, pa tražite običnim jezikom:

```text
Podesi boju našeg brenda na #0f766e, a imejl za podršku na help@acmeagency.example.

Napravi demo za joesplumbing.example sa ovim predloženim pitanjima:
„Možete li mi dati ponudu za bojler?“ i „Da li primate hitne pozive?“
Javi mi kada bude spreman, pa ga objavi.

Napravi ponudu pod imenom Starter Answering za $149 mesečno sa 200 minuta.
```

Asistent poziva iste operacije koje koristi konzola, uz iste dozvole. Ne može da vas prijavi, a Stripe i dalje traži da podatke o svojoj kompaniji unesete sami. Te linkove otvarate u svom pregledaču.

## Put 2: Stavite recepcionera u svoj UI

SaaS kompanije često žele recepcionera kao funkciju, bez druge prijave. To omogućava [platformski ključ](https://docs.lobbystack.com/white-label/api-keys#run-businesses-from-your-own-product). Izostavite `owner_email` iz `POST /businesses`, i niko ne dobija pozivnicu. Vaš ključ podešava firmu, kupuje joj broj na plaćenom nivou i čita pozive preko API-ja i webhook-ova.

Ekrane pravite vi. Vaš kupac vidi vašu stranicu sa podešavanjima, vašu listu poziva i vaš račun. Naš [vodič za API za AI recepcionera](/sr/blog/ai-receptionist-api/) ima svaki zahtev po redu.

Ovim putem se odričete tri stvari:

- Kupcima naplaćujete sami, jer ponudi treba vlasnik na stranici za plaćanje.
- Firmu ne možete kasnije da predate, jer ključ ne može da pozove vlasnika.
- Operativna upozorenja, na primer o neuspelom prebacivanju, dobija vaš tim.

Koristite `owner_email` za svakog kupca koji bi mogao da želi sopstvenu prijavu. Partnerska konzola tada tu firmu tretira kao na putu 1.

## Put 3: Pokrenite ga na svojim serverima

[Izvorni kod](https://github.com/lobbystack/lobbystack) LobbyStack-a je pod MIT licencom, pa možete da pokrenete ceo proizvod, sa partnerskim funkcijama. [Railway šablon](https://docs.lobbystack.com/self-hosting/overview) postavlja admin, worker i migracione servise sa PostgreSQL-om, Redis-om i skladištem. Unosite OpenAI API ključ i svoje Twilio pristupne podatke, a Railway generiše tajne ključeve.

Probni pozivi u pregledaču rade čim se postavljanje završi. Imejl, telefonski pozivi i uvoz sajta traže dodatno podešavanje, koje vodič navodi. Zatim vi vodite rezervne kopije, nadogradnje i praćenje, a OpenAI-ju i Twilio-u plaćate direktno. [Samostalno vođenje White Label programa](https://docs.lobbystack.com/self-hosting/white-label) dodaje wildcard DNS i opcioni Stripe Connect i naplatu nivoa.

Naš [tekst o MIT licenci](/sr/blog/lobbystack-mit-license-ai-receptionist-resellers/) objašnjava šta smete da menjate i prodajete. [Stranica o samostalnom hostovanju](/sr/solutions/self-hosted-ai-receptionist/) daje kratak pregled.

## Koliko košta white label AI agent?

Na LobbyStack cloud-u plaćate jedan nivo, a svaki klijent troši njegov zajednički fond minuta. Možete da imate koliko god želite firmi na svakom nivou.

| Nivo | Mesečna cena | Fond | Brojevi telefona | Dodatni minut |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minuta | 1 probni broj na 14 dana | Nema |
| Starter | $49 | 250 minuta | 2 | $0.20 |
| Growth | $199 | 1,300 minuta | 10 | $0.15 |
| Scale | $499 | 4,000 minuta | 25 | $0.12 |

Godišnja naplata je 20% jeftinija. Cene su u američkim dolarima, prema stanju od 1. novembra 2026.

Deset klijenata koji troše po 100 minuta traži 1,000 minuta, što staje u Growth po ceni od oko $20 po klijentu. Vi određujete koliko vam svaki klijent plaća.

Klijent se računa i prema svojoj ponudi, pa staje na onom limitu koji prvi dostigne. Pozivi preko limita idu na broj za prebacivanje firme ili na telefon njenog vlasnika.

## Šta ne možete da stavite pod svoj brend?

Nekoliko mesta navodi LobbyStack jer rade na njegovim nalozima:

- Vaše stranice za prijavu nude imejl i lozinku, bez opcije **Nastavi sa Google nalogom**.
- Ekrani za saglasnost za Google Calendar i Instagram navode LobbyStack kada ih firma povezuje.
- SMS poruke stižu sa verifikovanog LobbyStack broja. Prva poruka kupcu o terminu i odgovor na HELP navode LobbyStack i firmu.

Na pozivu recepcioner odgovara u ime firme.

## Česta pitanja

### Koja je razlika između white label AI agenta i programa za preprodavce?

Preprodavac je širi pojam: neki programi zadržavaju brend dobavljača na proizvodu. White label AI agent radi pod vašim brendom, a vi određujete cenu i naplaćujete klijentu. LobbyStack ima i [program preporuka](/sr/affiliate-program/) ako želite samo da preporučujete firme.

### Da li moram da znam programiranje?

Za kontrolnu tablu sa brendom ne morate. API vam treba samo da biste stavili recepcionera u svoj proizvod, a administrator servera samo ako želite sami da ga hostujete.

### Mogu li da uskladim recepcionera sa bojama klijenta?

Kontrolna tabla koristi jednu boju brenda: vašu. Recepcioner odgovara glasom, pa pozivaoci čuju ime firme i pozdrav. LobbyStack vidžet za sajt ima sopstveno podešavanje boje, ali čet na sajtu nije deo hostovanih paketa. Na samostalno hostovanoj instalaciji možete da uključite ključeve za vidžet.

### Može li agent da koristi prilagođen ili kloniran glas?

Ne može. Izaberite jedan od glasova GPT-Live modela za svaku firmu. LobbyStack ne klonira glasove.

### Da li odgovara na SMS poruke?

Ne. Recepcioner odgovara na pozive. LobbyStack šalje upozorenja i SMS poruke o terminima, i ne odgovara AI-jem na dolazne SMS poruke.

## Počnite na nivou Free

[Napravite partnerski nalog](/sr/white-label/) bez kartice, dodajte svoj brend i pošaljite jednom potencijalnom klijentu demo. Ako prvo želite da pročitate kod, [GitHub repozitorijum](https://github.com/lobbystack/lobbystack) ima sve.
