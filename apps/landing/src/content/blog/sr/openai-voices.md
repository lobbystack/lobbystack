---
title: "OpenAI glasovi: cela lista za GPT-Live, TTS i ChatGPT"
seoTitle: "OpenAI glasovi: cela lista za GPT-Live, TTS i ChatGPT"
description: "OpenAI glasovi u oktobru 2026: tabela glasova za GPT-Live, liste za Realtime i pretvaranje teksta u govor, devet glasova iz ChatGPT-a i šta API prihvata."
pubDate: 2026-10-16T10:00:00-04:00
updatedDate: 2026-10-16T10:00:00-04:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/openai-voices-hero.webp"
coverImageAlt: "Svetla bež kartica sa sitnim uzorkom tačaka i crnim naslovom na engleskom: OpenAI voices: the full list for GPT-Live, TTS and ChatGPT"
locale: "sr"
canonicalSlug: "openai-voices"
---

OpenAI glasovi postoje u četiri liste, po jedna za svaki proizvod. Na dan 16. oktobra 2026, GPT-Live podrazumevano koristi `marin`, a njegova tabela glasova dodaje još 21. Realtime API ima 10 glasova, a servis za pretvaranje teksta u govor 13. ChatGPT aplikacija ima devet imenovanih glasova, kao što su Juniper i Cove, i nijedan proizvod iz API-ja ih ne nudi.

Naš telefonski recepcioner radi na GPT-Live modelu, pa pratimo ove liste. Tabele ispod potiču iz OpenAI dokumentacije i SDK-a na taj dan.

## OpenAI glasovi po proizvodu

| Proizvod | Model | Glasovi | Podrazumevan ili preporučen |
| --- | --- | --- | --- |
| GPT-Live | `gpt-live-1` | `marin` plus 21 u tabeli | `marin` je podrazumevan |
| Realtime API | `gpt-realtime` modeli | 10 | OpenAI preporučuje `marin` ili `cedar` |
| Tekst u govor | `gpt-4o-mini-tts` | 13 | OpenAI preporučuje `marin` ili `cedar` |
| Tekst u govor, stariji modeli | `tts-1`, `tts-1-hd` | 9 | Nije navedeno |
| ChatGPT aplikacija | GPT-Live-1 i GPT-Live-1 mini | 9 imenovanih glasova | Birate ga u podešavanjima |

Glas sa jedne liste ne mora da radi na drugoj. `fable`, `nova` i `onyx` postoje samo za pretvaranje teksta u govor, a 21 glas iz sledeće tabele postoji samo u GPT-Live modelu.

## GPT-Live glasovi

GPT-Live je OpenAI full-duplex glasovni model, onaj na kome radi ChatGPT Voice. Glas zadajete sa `audio.output.voice` pri pokretanju sesije, a za promenu Vam treba nova sesija. [OpenAI tabela glasova](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) navodi ove glasove pored podrazumevanog `marin`:

| Glas | Ime u API-ju | Jezik | Regionalni uticaj | Prezentacija | Izvor |
| --- | --- | --- | --- | --- | --- |
| Quartz | `quartz` | Engleski | Australijski | Ženski | Generisan |
| Ripple | `ripple` | Engleski | Australijski | Muški | Prirodan |
| Vesper | `vesper` | Engleski | Britanski | Muški | Prirodan |
| Willow | `willow` | Engleski | Irski | Ženski | Prirodan |
| Stone | `stone` | Engleski | Irski | Muški | Prirodan |
| Gleam | `gleam` | Engleski | Severnoamerički | Ženski | Prirodan |
| Meridian | `meridian` | Engleski | Severnoamerički | Muški | Prirodan |
| Bossa | `bossa` | Portugalski | Brazilski | Ženski | Prirodan |
| Tempo | `tempo` | Portugalski | Brazilski | Muški | Prirodan |
| Beacon | `beacon` | Engleski | Filipinski | Muški | Generisan |
| Delta | `delta` | Engleski | Jug SAD | Ženski | Generisan |
| Cinder | `cinder` | Engleski | Jug SAD | Muški | Generisan |
| Nuri | `nuri` | Nemački | Nije naveden | Ženski | Prirodan |
| Juni | `juni` | Nemački | Nije naveden | Ženski | Prirodan |
| Flitz | `flitz` | Nemački | Nije naveden | Muški | Prirodan |
| Brise | `brise` | Francuski | Nije naveden | Ženski | Prirodan |
| Sillage | `sillage` | Francuski | Nije naveden | Muški | Prirodan |
| Nira | `nira` | Hindi | Nije naveden | Ženski | Prirodan |
| Harema | `harema` | Japanski | Nije naveden | Ženski | Prirodan |
| Shida | `shida` | Japanski | Nije naveden | Muški | Prirodan |
| Noeul | `noeul` | Korejski | Nije naveden | Ženski | Prirodan |

[OpenAI najava za GPT-Live](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) od 10. septembra 2026. predstavila je prvih 12 redova. OpenAI Node SDK (verzija 7.35.0) za Live sesije prihvata i starija Realtime imena: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `sage`, `shimmer` i `verse`.

Tabela nema srpski glas. Ako Vas klijenti zovu na srpskom, probajte nekoliko glasova sa svojim pozdravom pre nego što izaberete. „Regionalni uticaj“ opisuje način govora, pa glas sa irskim uticajem i dalje govori engleski.

GPT-Live sesije koštaju [$0.05 po minutu, obračunato po sekundi](https://developers.openai.com/api/docs/models/gpt-live-1), za bilo koji glas.

## Realtime API glasovi

[Realtime API](https://developers.openai.com/api/docs/guides/realtime-conversations#voice-options) nudi 10 ugrađenih glasova:

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin` i `cedar`

Glas možete da zadate pri pokretanju sesije ili uz odgovor. Kad model jednom progovori u sesiji, glas ostaje isti. OpenAI preporučuje `marin` ili `cedar` za najbolji kvalitet.

## OpenAI glasovi za pretvaranje teksta u govor

Endpoint za govor na modelu `gpt-4o-mini-tts` ima 13 ugrađenih glasova, prema [OpenAI vodiču za tekst u govor](https://developers.openai.com/api/docs/guides/text-to-speech):

`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`, `marin` i `cedar`

Stariji modeli `tts-1` i `tts-1-hd` podržavaju 9 od njih: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage` i `shimmer`. OpenAI navodi da su ovi glasovi optimizovani za engleski. Svaki možete da čujete na [OpenAI.fm](https://www.openai.fm/), OpenAI demo sajtu.

Pretvaranje teksta u govor čita tekst naglas. Ne vodi razgovor, pa telefonskom agentu napravljenom na njemu trebaju posebno prepoznavanje govora i smena govornika. GPT-Live i Realtime API rade oboje.

## Kako se zovu glasovi u ChatGPT-u?

ChatGPT aplikacija ima devet glasova. [OpenAI centar za pomoć](https://help.openai.com/en/articles/20001274-chatgpt-voice) ih opisuje ovako (opisi prevedeni sa engleskog):

| Glas u ChatGPT-u | Opis kompanije OpenAI |
| --- | --- |
| Arbor | Opušten i svestran |
| Breeze | Živahan i iskren |
| Cove | Staložen i direktan |
| Ember | Samouveren i optimističan |
| Juniper | Otvoren i vedar |
| Maple | Veseo i iskren |
| Sol | Snalažljiv i opušten |
| Spruce | Miran i ohrabrujući |
| Vale | Živ i radoznao |

Glas birate u ChatGPT-u pod Settings, pa Voice. Od 8. jula 2026. ChatGPT Voice radi na GPT-Live modelu: [GPT-Live-1 za plaćene korisnike i GPT-Live-1 mini za besplatne](https://deploymentsafety.openai.com/gpt-live).

Jedan stariji glas, Sky, nestao je sa liste u maju 2024. [Bloomberg je objavio](https://www.bloomberg.com/news/articles/2024-05-20/openai-to-pull-johansson-soundalike-sky-s-voice-from-chatgpt) da ga je OpenAI pauzirao pošto su ga slušaoci uporedili sa glasom Skarlet Džohanson.

## Možete li da koristite ChatGPT glasove u API-ju?

Ne pod tim imenima. Na dan 16. oktobra 2026, nijedno od devet imena iz ChatGPT-a nije u tabeli glasova za GPT-Live, na Realtime listi, na listi za tekst u govor niti u tipu glasa u Node SDK-u. Neki spoljni katalozi modela navode Juniper ili Breeze kao glasove GPT-Live API-ja. OpenAI dokumentacija ih ne navodi.

Isti model možete da dobijete. GPT-Live-1 u API-ju je model koji ChatGPT Voice podrazumevano koristi za plaćene korisnike. Za recepcionera koji zvuči kao ChatGPT, krenite od `gpt-live-1` i birajte među ugrađenim glasovima po sluhu. Naš vodič [kako napraviti AI recepcionera sa glasom ChatGPT-a](/sr/blog/how-to-build-an-ai-receptionist/) pokriva telefonski deo.

## Kako napraviti prilagođeni OpenAI glas?

[OpenAI vodič za prilagođene glasove](https://developers.openai.com/api/docs/guides/custom-voices) opisuje dva načina:

- **Iz opisa.** Funkcija prompt-to-voice pravi glas iz tekstualnog opisa. Dostupna je svim korisnicima API-ja, pravljenje glasa je besplatno, a glas radi samo sa GPT-Live modelom. Kad ga koristite, plaćate redovnu cenu sesije.
- **Iz snimka.** Šaljete snimak saglasnosti, u kome osoba čita zadatu rečenicu, plus uzorak glasa. Za to Vam treba pristup API-ju za prilagođene glasove. Glas radi sa GPT-Live modelom, pretvaranjem teksta u govor, Realtime API-jem i zvukom u Chat Completions.

OpenAI pravila traže da ne imitirate nikoga, da koristite samo glasove odraslih i da slušaocima kažete da govor dolazi od veštačke inteligencije.

## Koji OpenAI glas izabrati za poslovnu telefonsku liniju?

Birajte slušanjem, sa sopstvenim tekstom. Nekoliko korisnih provera:

- **Mislite na pozivaoce.** Firma iz Dablina može da proba `willow` ili `stone`. Za pozive na srpskom uporedite nekoliko glasova sa svojim pozdravom.
- **Testirajte pozdrav.** Naziv firme, imena ulica i usluga su mesta gde glas zapinje. Ubacite ih u test.
- **Testirajte telefonom.** Zvuk poziva je tanji od zvučnika na laptopu, pa glas ocenite u pravom pozivu.
- **Računajte na jedan glas po pozivu.** GPT-Live zaključava glas za sesiju; ne menja se usred poziva.

LobbyStack, naš AI recepcioner, vodi svaki poziv na `gpt-live-1` modelu sa podrazumevanim glasom `marin`. Ako ga hostujete sami, promenite `DEFAULT_VOICE` u [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) u bilo koji GPT-Live glas. Kod je [otvoren, pod MIT licencom](/sr/solutions/open-source-ai-receptionist/). Hostovani nalozi koriste `marin`; panel za sada nema izbor glasa.

## Pitanja o OpenAI glasovima

### Koji je podrazumevani OpenAI glas?

`marin` je podrazumevani glas za GPT-Live sesije. Za Realtime API i pretvaranje teksta u govor, OpenAI preporučuje `marin` ili `cedar` za najbolji kvalitet.

### Može li glas da se promeni tokom poziva?

Ne. GPT-Live traži novu sesiju za promenu glasa. U Realtime API-ju glas ostaje isti kad model jednom progovori u sesiji.

### Ima li OpenAI glas na srpskom?

Tabela glasova za GPT-Live na dan 16. oktobra 2026. nema srpski glas, a OpenAI navodi da su glasovi za tekst u govor optimizovani za engleski. Probajte nekoliko glasova sa svojim pozdravom na srpskom pre nego što izaberete.

### Da li je ChatGPT glas sa TikTok-a dostupan programerima?

Snimci koriste jedan od devet glasova iz ChatGPT aplikacije, a API ne nudi ta imena. Programeri dobijaju isti GPT-Live model i njegovu sopstvenu listu glasova. Naš [tekst o GPT-Live modelu](/sr/blog/ai-voice-agent-gpt-live/) objašnjava kako smo taj model povezali sa recepcionerom.

## Čujte GPT-Live glas u pozivu

Pritisnite dugme za poziv na [našoj početnoj stranici](/sr/) i razgovarajte sa LobbyStack recepcionerom na `gpt-live-1` modelu sa glasom `marin`. Da ga čujete kako se javlja za Vašu firmu, [napravite besplatan nalog](https://app.lobbystack.com/sr/signup): paket Free Vam daje 30 minuta razgovora mesečno bez kartice, i broj iz SAD ili Kanade besplatno 14 dana. Pogledajte [cene](/sr/pricing/) plaćenih paketa.
