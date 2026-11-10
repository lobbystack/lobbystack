---
title: "Kako da dodate AI recepcionera u svoj SaaS preko API-ja"
seoTitle: "API za AI recepcionera: javljanje na pozive u vašem SaaS-u"
description: "API za AI recepcionera daje svakom kupcu vašeg SaaS-a recepcionera i broj telefona. Vodič sa curl primerima za podešavanje, brojeve, webhook-ove i limite."
pubDate: 2026-11-01T09:00:00-05:00
updatedDate: 2026-11-01T09:00:00-05:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/ai-receptionist-api-hero.webp"
coverImageAlt: "Bež LobbyStack naslovna kartica sa naslovom How to add an AI receptionist to your SaaS with an API"
locale: "sr"
canonicalSlug: "ai-receptionist-api"
---

**API za AI recepcionera** omogućava vašem softveru da napravi recepcionera za svakog vašeg kupca, kupi mu broj telefona i čita svaki poziv iz vašeg koda. Sa LobbyStack-om jedan platformski ključ radi sve to preko v1 API-ja, a vaši kupci ostaju u vašem proizvodu.

Ovaj vodič redom prolazi kroz zahteve. Odgovara alatu za zakazivanje, sistemu za vođenje ordinacije, aplikaciji za terenski servis ili bilo kom SaaS-u čiji kupci propuštaju pozive. Treba vam server koji može da šalje HTTPS zahteve i prima webhook.

## Šta treba da pokrije API za AI recepcionera?

API za glasovne agente daje vam agenta koji govori, a posao oko njega pravite sami. API za recepcionera počinje stepenicu više: posao već postoji, a vi ga podešavate za svakog kupca.

| Treba vam | API za glasovne agente | LobbyStack v1 API |
| --- | --- | --- |
| Razgovor | Vaš prompt, alati i logika poziva | Recepcioner na [GPT-Live](/sr/blog/ai-voice-agent-gpt-live/) modelu, podešen pozdravom, pravilima i znanjem |
| Šta zna | Vaša sopstvena pretraga podataka | Čitanje sajta, fajlovi, česta pitanja i beleške preko `/knowledge` |
| Zakazivanje | Vaši alati za kalendar | Usluge, dostupnost i termini, sa Google Calendar-om, Cal.com-om ili Calendly-jem |
| Brojevi telefona | Nalog kod vašeg operatera, ili kod dobavljača | `POST /phone-numbers/search` i `POST /phone-numbers/claims` |
| Podaci svakog kupca | Vaš model za odvajanje kupaca | Jedna firma po kupcu, kojoj pristupate zaglavljem `LobbyStack-Business` |
| Šta se desilo na pozivu | Vaše sopstveno beleženje | Rezimei, ishodi i transkripti preko `/calls` i webhook-ova |

Ako vam trebaju odlazne kampanje ili prilagođen tok poziva, bolje odgovara API za glasovne agente. Naše [poređenje sa Vapi-jem](/sr/blog/vapi-alternative/) pokriva taj izbor.

## Korak 1: Nabavite platformski ključ

[Prijavite se kao partner](https://docs.lobbystack.com/white-label/sign-up), što je nalog koji LobbyStack daje kompanijama koje opslužuju mnogo firmi. Zatim otvorite stranicu **API ključevi** u partnerskoj konzoli i napravite ključ sa ovim dozvolama:

- `businesses:create`, `business:read` i `business:write`
- `knowledge:read` i `knowledge:write`
- `phone_numbers:manage` i `phone_numbers:purchase`, koje uključujete kao **Pretraga, kupovina i zamena brojeva telefona**
- `calls:read`, `appointments:read`, `messages:read` i `webhooks:manage`

Čuvajte ključ na svom serveru. Nivo Free vam dozvoljava da napravite i testirate svaki korak osim kupovine broja, za koju treba [plaćeni nivo](https://docs.lobbystack.com/white-label/tiers).

## Korak 2: Napravite firmu za svakog kupca

Svaki vaš kupac postaje jedna firma. Izostavite `owner_email`, pa LobbyStack nikome ne šalje pozivnicu, a vaš ključ vodi firmu:

```bash
curl https://app.lobbystack.com/api/v1/businesses \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-business" \
  -H "Content-Type: application/json" \
  -d '{"name":"Harbor Dental","timezone":"America/Toronto","locale":"en"}'
```

`POST /businesses` traži `Idempotency-Key`, a ponovljeni zahtev sa istom vrednošću vraća već napravljenu firmu. Odgovor novu firmu stavlja u `data`. Sačuvajte `data.id` uz zapis o kupcu i šaljite ga kao `LobbyStack-Business` u svakom sledećem zahtevu. `locale` određuje jezik na kom pozivi počinju: `en`, `fr`, `es`, `sr`, `de`, `pt`, `it`, `nl`, `pl`, `tr`, `vi`, `tl`, `sv`, `ru` ili `uk`. Recepcioner menja jezik kada pozivalac to zatraži ili govori drugi jezik.

## Korak 3: Naučite recepcionera o firmi

Uputite ga na sajt kupca. Prvo čitanje uzima uzorak sajta, a `POST /knowledge/sources/{source_id}/expand` čita ostatak:

```bash
curl https://app.lobbystack.com/api/v1/knowledge/sources \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"website","url":"https://harbordental.example"}'
```

Zatim podesite kako odgovara:

```bash
curl -X PATCH https://app.lobbystack.com/api/v1/receptionist \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"greeting":"Thanks for calling Harbor Dental, how can I help?","transfer_mode":"on_urgent","transfer_number":"+14165550100","booking_mode":"request"}'
```

Podesite `transfer_number` na svakoj firmi koju vodi vaš ključ. Firma bez vlasnika nema nikog drugog koga bi recepcioner mogao da dobije, pa kada broj nedostaje, LobbyStack odbija pozive koje recepcioner ne može da preuzme.

Vaš proizvod već čuva veliki deo ovih podataka. Povežite usluge kupca sa `POST /services`, njegova česta pitanja sa `POST /knowledge` i njegova pravila sa `POST /rules`, pa stranica sa podešavanjima u vašoj aplikaciji postaje podešavanje recepcionera.

## Korak 4: Kupite broj telefona

Pretražite, pa preuzmite ponudu u roku od 5 minuta. LobbyStack prodaje brojeve u Sjedinjenim Državama, Kanadi i Portoriku:

```bash
curl https://app.lobbystack.com/api/v1/phone-numbers/search \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"country":"CA","area_code":"416"}'

curl https://app.lobbystack.com/api/v1/phone-numbers/claims \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-number" \
  -H "Content-Type: application/json" \
  -d '{"offer_token":"token_from_the_search"}'
```

Preuzimanje košta, pa traži `Idempotency-Key`. Proveravajte `GET /phone-numbers/claims/{claim_id}` dok status ne bude `claimed` ili `failed`. Vaš kupac zatim može da [preusmeri svoju postojeću liniju](/sr/blog/how-to-forward-business-calls/) na novi broj i zadrži onaj koji njegovi klijenti već biraju.

Završite sa `POST /onboarding/complete`. Pošaljite `{"skip_number":true}` za firmu koja još nema broj.

## Korak 5: Vratite svaki poziv u svoj proizvod

Prijavite endpoint za svaku firmu, pa nikada ne morate da proveravate nove pozive upitima:

```bash
curl https://app.lobbystack.com/api/v1/webhooks \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.yourapp.example/hooks/lobbystack","events":["call.completed","appointment.booked","message.taken"]}'
```

Odgovor samo jednom donosi tajni ključ za potpisivanje, pa ga tada sačuvajte. Sadržaj prati [format Standard Webhooks](https://docs.lobbystack.com/api/webhooks), a `data` za `call.completed` ima isti oblik kao `GET /calls`: `outcome`, `summary`, `caller_phone`, `duration_seconds` i druga polja. `GET /calls/{call_id}` vraća transkript.

Prikažite to na kontrolnoj tabli svog kupca. Saberite `duration_seconds` po firmi ako želite da merite potrošnju na svojim računima.

## Kako naplaćujete svojim kupcima?

Naplaćujete sami, unutar svog SaaS-a. LobbyStack [ponudama](https://docs.lobbystack.com/white-label/packages) treba vlasnik koji plaća na stranici za plaćanje, pa firma bez vlasnika ne može da ima ponudu. LobbyStack-u plaćate jedan [nivo](/sr/white-label/) za fond minuta koji dele sve vaše firme:

| Nivo | Mesečna cena | Fond | Uključeni brojevi | Dodatni minut |
| --- | --- | --- | --- | --- |
| Starter | $49 | 250 minuta | 2 | $0.20 |
| Growth | $199 | 1,300 minuta | 10 | $0.15 |
| Scale | $499 | 4,000 minuta | 25 | $0.12 |

Godišnja naplata je 20% jeftinija. Svaki dodatni broj košta onoliko koliko ga plaća LobbyStack, uz mesečnu naplatu. Cene su u američkim dolarima, prema stanju od 1. novembra 2026.

## Na koja ograničenja treba da računate?

- **Ograničenja broja zahteva.** Svaki ključ šalje 120 zahteva u minuti. Vaši ključevi dele 30 novih firmi na sat i 20 pretraga brojeva na 10 minuta.
- **Ograničenja za brojeve.** Vaše firme kupuju do 2 broja dnevno ili onoliko koliko vaš nivo uključuje, šta god je više. U periodu od 30 dana kupuju do 5, ili dvostruko više od uključenog broja. Firma može da zameni svoj broj jednom.
- **Kalendari.** Google, Cal.com i Calendly traže da osoba da saglasnost u pregledaču, pa API ne može sam da poveže kalendar. `POST /calendars/google/connect` i odgovarajuće `calcom` i `calendly` rute vraćaju link, a ko ga otvori prijavljuje se kao administrator firme. Pozovite tu osobu preko `POST /team/invitations`, za šta treba `team:manage`, ili koristite `booking_mode` `off` ili `request` ako kalendar vodi vaš proizvod.
- **Predaja.** Ključ ne može kasnije da pozove vlasnika, pa firmu koju ste napravili bez vlasnika ne možete da predate. Koristite `owner_email` za kupce koji će možda želeti sopstvenu prijavu.
- **Upozorenja.** Vlasnici i administratori vašeg partnerskog naloga dobijaju operativne imejlove, na primer o neuspelom prebacivanju ili kalendaru koji je prestao da se sinhronizuje. [Centar za pomoć ih navodi](https://docs.lobbystack.com/white-label/api-keys#run-businesses-from-your-own-product).

## Može li asistent za kodiranje da uradi ovo umesto vas?

Može. Držite ključ u svom okruženju i dajte Claude Code-u, Codex-u ili Cursor-u prompt poput ovog:

```text
Pročitaj https://app.lobbystack.com/api/v1/openapi.json i
https://docs.lobbystack.com/white-label/api-keys.

Dodaj LobbyStack klijent na serverskoj strani ove aplikacije. Kada kupac uključi
javljanje na pozive, napravi firmu bez owner_email, pročitaj njegov sajt, podesi
pozdrav i broj za prebacivanje iz njegovih podešavanja i sačuvaj ID firme.
Dodaj webhook rutu koja proverava potpis i čuva call.completed.
Čitaj ključ iz LOBBYSTACK_PLATFORM_KEY. Nikada ga ne šalji pregledaču.
Pokaži mi plan pre nego što napišeš kod.
```

OpenAPI dokumentu ne treba ključ, a LobbyStack ga generiše iz šema po kojima server proverava zahteve. Komanda `lobbystack onboard` takođe pravi firmu iz [jednog YAML ili JSON fajla](https://docs.lobbystack.com/api/cli), što pomaže kada vaš tim ručno podešava kupce.

## Česta pitanja

### Šta je API za AI recepcionera?

API za AI recepcionera je skup HTTP endpointa koji prave i vode telefonskog recepcionera iz vašeg softvera. Podešavate mu znanje, pozdrav i pravila, dajete mu broj i čitate pozive, poruke i termine. LobbyStack API se nalazi na `https://app.lobbystack.com/api/v1`.

### Da li moji kupci vide LobbyStack?

Pozivaoci čuju ime firme, a vaši kupci koriste vaš proizvod. SMS poruke idu sa verifikovanog LobbyStack broja, pa prva poruka kupcu o terminu i odgovor na HELP navode LobbyStack. [Pregled programa White Label](https://docs.lobbystack.com/white-label/overview) navodi svako takvo mesto.

### Mogu li moji kupci da biraju glas?

Mogu, među glasovima GPT-Live modela, preko polja `voice` u `PATCH /receptionist`. LobbyStack ne klonira glasove.

### Da li recepcioner odgovara na SMS poruke ili čet na sajtu?

Ne. LobbyStack šalje upozorenja i SMS poruke o terminima, a njegov recepcioner ne odgovara AI-jem na dolazne SMS poruke. Čet na sajtu nije deo hostovanih paketa, pa `POST /widget-keys` tamo vraća `403`.

### Mogu li umesto toga sam da hostujem?

Možete. LobbyStack je [pod MIT licencom](https://github.com/lobbystack/lobbystack), a [Railway šablon](https://docs.lobbystack.com/self-hosting/overview) postavlja admin, worker i njihova skladišta podataka. Vi unosite OpenAI i Twilio pristupne podatke, pa završavate korake za imejl i telefon koje vodič navodi. Na sopstvenoj instalaciji ključeve hosta pravite komandom `pnpm platform-key:create`.

## Napravite svoju prvu firmu

[Prijavite se kao partner](/sr/white-label/) na nivou Free i pokrenite korake od 1 do 3 na jednoj probnoj firmi, pa je otvorite u konzoli i započnite probni poziv u pregledaču. [Pregled API-ja](https://docs.lobbystack.com/api/overview) i [vodič za platformske ključeve](https://docs.lobbystack.com/white-label/api-keys) pokrivaju ostalo.
