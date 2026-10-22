---
title: "Kako napraviti AI recepcionera sa glasom ChatGPT-a"
description: "Kako napraviti AI recepcionera, virtuelnog asistenta za pozive, na GPT-Live modelu iz ChatGPT Voice: glasovi API-ja, telefonija, platforme, otvoreni kod i cene."
pubDate: 2026-10-16T09:00:00-04:00
updatedDate: 2026-10-16T09:00:00-04:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/how-to-build-an-ai-receptionist-hero.webp"
coverImageAlt: "Svetla bež kartica sa sitnim uzorkom tačaka i crnim naslovom na engleskom: How to build an AI receptionist with the ChatGPT voice"
locale: "sr"
canonicalSlug: "how-to-build-an-ai-receptionist"
---

Da biste napravili AI recepcionera, odnosno virtuelnog asistenta za pozive koji zvuči kao ChatGPT, povežite OpenAI GPT-Live API sa telefonskom linijom preko SIP trunka ili partnera kao što je Twilio, pa modelu dajte alate za zakazivanje, poruke i prebacivanje poziva. Dobijate model koji pokreće ChatGPT Voice, `gpt-live-1`. Ne dobijate imena glasova iz aplikacije: API ima sopstvenu listu, a podrazumevani glas je `marin`.

Ostaje da odlučite koliki deo sistema želite da vodite sami. U nastavku je pet načina da počnete, koliko svaki košta na dan 16. oktobra 2026. i koji posao Vam svaki ostavlja.

## Koji glas je „glas ChatGPT-a“?

Glas koji ljudi čuju kad razgovaraju sa ChatGPT-om u aplikaciji, i u svim onim TikTok snimcima razgovora sa njim, jedan je od devet glasova. Birate ga u ChatGPT-u pod Settings, pa Voice. [OpenAI centar za pomoć](https://help.openai.com/en/articles/20001274-chatgpt-voice) ih opisuje ovako (opisi prevedeni sa engleskog):

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

OpenAI je 8. jula 2026. prebacio ChatGPT Voice na GPT-Live, model koji sluša i govori u isto vreme, kao dvoje ljudi u telefonskom razgovoru. GPT-Live-1 je postao [podrazumevani glasovni model za korisnike plaćenog ChatGPT-a](https://deploymentsafety.openai.com/gpt-live), a GPT-Live-1 mini za besplatne korisnike. Svih devet glasova je ostalo. Svaki TikTok autor je izabrao svoj glas sa te liste, pa nijedno ime samo po sebi nije „glas ChatGPT-a“.

### Možete li da koristite ChatGPT glas preko API-ja?

Ne pod tim imenom. Na dan 16. oktobra 2026, nijedno od devet imena iz ChatGPT-a nije među [opcijama glasa za GPT-Live](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) niti na listi glasova u OpenAI Node SDK-u (verzija 7.35.0). Neki spoljni katalozi modela navode Juniper ili Breeze kao glasove API-ja. OpenAI dokumentacija ih ne navodi.

Umesto toga, API Vam daje tri stvari:

- **Istu porodicu modela.** [OpenAI najava za programere](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) od 10. septembra 2026. kaže da GPT-Live-1 donosi ChatGPT-ove „full-duplex“ glasovne razgovore u API.
- **Sopstvene glasove.** `marin` je podrazumevani glas. OpenAI tabela dodaje još 21, među njima engleske glasove sa australijskim, britanskim, irskim, severnoameričkim i filipinskim naglaskom ili naglaskom juga SAD, kao i glasove za brazilski portugalski, francuski, nemački, hindi, japanski i korejski. Tabela nema srpski glas.
- **Prilagođene glasove.** Funkcija [prompt-to-voice](https://developers.openai.com/api/docs/guides/custom-voices) pravi glas iz pisanog opisa. Pravljenje glasa je besplatno, a glas radi samo sa GPT-Live modelom. OpenAI pravila traže da se ne predstavljate lažno kao neko drugi, zato opišite glas koji Vašoj firmi treba umesto da kopirate ChatGPT glas.

Naša [lista OpenAI glasova](/sr/blog/openai-voices/) navodi svaki glas iz API-ja i proizvod koji ga prihvata.

## Opcija 1: gradite na GPT-Live API-ju

GPT-Live razgovara sa pozivaocem i sve što traži podatke predaje serveru kojim Vi upravljate. OpenAI to zove [delegiranje](https://developers.openai.com/api/docs/guides/live-delegation). Kod recepcionera, Vaš server čuva podatke o firmi: radno vreme, usluge, slobodne termine, zakazivanje i broj za prebacivanje.

Za telefonske pozive pišete:

- webhook koji prima `live.transport.incoming`, prihvata ili odbija svaki poziv i pri prihvatanju zadaje model, uputstva i glas
- „sideband“ WebSocket vezu za svaku sesiju, koja prima delegirane zahteve, transkripte i pritiske tastera
- same alate: proveru i zakazivanje u kalendaru, poruke, proveru pozivaoca, prebacivanje preko OpenAI `refer` endpointa i prekid poziva
- čuvanje transkripata i snimaka, plus ekran na kome vlasnik može da ih pročita

[Stranica modela GPT-Live-1](https://developers.openai.com/api/docs/models/gpt-live-1) naplaćuje glasovne sesije $0.05 po minutu, obračunato po sekundi. Model na serveru i njegovi alati plaćaju se posebno, po redovnim cenama. Besplatni nivo API-ja nema pristup GPT-Live modelu, a nivo Build dozvoljava 50 istovremenih poziva.

Ovaj put Vam daje punu kontrolu, i nijedna platforma ne uzima deo cene po minutu. Ostavlja Vam i svaki granični slučaj. Primer iz naših logova: GPT-Live čeka da pozivalac progovori prvi, pa svaki poziv počinjemo komandom za pozdrav. Od 3. do 8. oktobra 2026. pozdravio je na osnovu te komande u 24 od 40 poziva u kojima je zvuk bio povezan. Naše [beleške o glasovnom sistemu](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md) opisuju ponovne pokušaje koje smo dodali za ostale pozive.

## Opcija 2: povežite GPT-Live sa brojem telefona

OpenAI ne daje brojeve telefona, pa Vam treba operater. [OpenAI vodič za telefoniju](https://developers.openai.com/api/docs/guides/voice-sip) opisuje dva načina povezivanja:

- **Direktan SIP.** Operater šalje zvuk poziva pravo u OpenAI preko SIP trunka, sa TLS signalizacijom i SRTP zvukom. Vaš server obrađuje samo webhookove, podešavanja sesije i alate. LobbyStack koristi ovaj put sa Twilio Elastic SIP trunkom. [Bandwidth](https://dev.bandwidth.com/docs/voice/integrations/openai/live/sip/) objavljuje vodič za dolazne pozive preko SIP-a.
- **Audio most na Vašem serveru.** Vaš server prenosi zvuk između operatera i GPT-Live modela preko WebRTC-a ili WebSocket-a. [Twilio Agent Connect](https://www.twilio.com/en-us/blog/developers/twilio-openai-gpt-live-1-api-resources) ima `GPTLiveProvider` koji povezuje Twilio Media Streams sa GPT-Live-1 modelom. [Telnyx](https://developers.telnyx.com/docs/voice/sip-trunking/gpt-live-configuration-guide) dokumentuje odlazne pozive preko svog Voice API-ja.

Direktan SIP traži manje koda, jer OpenAI hostuje zvuk. Most Vam daje audio tok ako želite sami da ga obrađujete; Vaš server tada vodi obe veze i ceo tok poziva.

Cene operatera dodaju se na cene kompanije OpenAI. Proverite ih na stranici operatera, na primer u [cenovniku za Twilio Voice](https://www.twilio.com/en-us/voice/pricing/us), za svoju zemlju i vrstu broja.

## Opcija 3: koristite platformu za glasovne agente bez kodiranja

Hostovane platforme za glasovne agente vode zvuk, brojeve i model, a Vi agenta podešavate u njihovom panelu. [Vapi podržava GPT-Live](https://docs.vapi.ai/gpt-live/overview), a njegova [beta verzija je od 2. oktobra 2026. otvorena za sve Vapi korisnike](https://vapi.ai/blog/gpt-live-beta). Vapi navodi da postojeći brojevi, alati i testovi ostaju.

[Retell AI](https://www.retellai.com/use-cases/receptionists) i druge platforme takođe prodaju glasovne agente u ulozi recepcionera. Ako Vam je zvuk ChatGPT-a razlog za kupovinu, pitajte svaku platformu da li koristi `gpt-live-1`. [OpenAI vodič za partnere](https://developers.openai.com/api/docs/guides/live-partner-integrations) upozorava da integracija sa Realtime API-jem nije sama po sebi kompatibilna sa GPT-Live modelom.

Platforma Vas najbrže dovodi do prvog probnog poziva. Plaćate njene cene povrh modela, ili sa modelom u paketu, i pravila za zakazivanje, prebacivanja i praćenja pravite ponovo u njenom editoru. Ako kasnije odete, sve to pravite još jednom.

## Opcija 4: krenite od glasovnog frameworka otvorenog koda

Frameworkovi otvorenog koda vode zvuk, smenu govornika i vezu sa modelom, a Vi ih hostujete:

- [LiveKit Agents](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live) ima GPT-Live u svom OpenAI dodatku kao `GPTLiveModel`. Podešavanje `voice` je podrazumevano `marin`.
- [Pipecat](https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live) ima servis OpenAI Live.

Kod je Vaš i nema naknada platforme. I dalje pišete recepcionera povrh toga: alate za kalendar, pravila prebacivanja, istoriju poziva i panel za firmu. Naš vodič [napraviti ili kupiti AI recepcionera](/sr/blog/build-or-buy-ai-receptionist/) detaljno opisuje taj posao.

## Opcija 5: krenite od AI recepcionera otvorenog koda

AI recepcioner otvorenog koda donosi delove koje Vam opcije od 1 do 4 ostavljaju. [LobbyStack](/sr/solutions/self-hosted-ai-receptionist/) vodi svaki poziv, telefonom ili u pregledaču, na `gpt-live-1` modelu, a njegov agent već ima alate za:

- radno vreme, usluge i odgovore iz Vašeg sajta, PDF fajlova i čestih pitanja
- pronalaženje slobodnih termina i zakazivanje u Google kalendaru, ili prijem zahteva za termin koji Vaš tim potvrđuje
- pomeranje ili otkazivanje termina posle provere pozivaoca
- primanje poruka i prebacivanje poziva na osobu

Svaki poziv dolazi sa transkriptom, snimkom i rezimeom u panelu. Prelazak smo opisali u [našem tekstu o GPT-Live modelu](/sr/blog/ai-voice-agent-gpt-live/).

## Pet opcija na jednom mestu

| Put | Glasovni model | Šta još pravite | Cena koju možete da proverite |
| --- | --- | --- | --- |
| GPT-Live API | `gpt-live-1`, podrazumevano `marin` | Upravljanje pozivima, alate, čuvanje, panel | $0.05 po minutu, plus model na serveru i operater |
| Operater i GPT-Live | `gpt-live-1` | Alate, čuvanje, panel | Cene operatera plus OpenAI |
| Vapi | `gpt-live-1` (beta) | Logiku recepcionera u njihovom editoru | Vapi cenovnik |
| LiveKit ili Pipecat | `gpt-live-1` preko dodatka | Alate, čuvanje, panel, hosting | Hosting, OpenAI i operater |
| LobbyStack na Vašem serveru | `gpt-live-1`, `marin` | Naloge kod dobavljača i podešavanje | Hosting, OpenAI i Twilio |
| LobbyStack Cloud | `gpt-live-1`, `marin` | Podatke o Vašoj firmi | Paket Free sa 30 minuta razgovora mesečno; $30 mesečno za 150 minuta |

Cene proverene 16. oktobra 2026.

## Koliko košta da napravite AI recepcionera?

Na putu preko API-ja saberite tri stavke. OpenAI naplaćuje $0.05 po minutu glasa, pa poziv od 3 minuta košta $0.15 pre svega ostalog. Model na serveru koji odgovara na delegirane zahteve plaća se posebno i zavisi od izabranog modela i od toga koliko radi po pozivu. Operater naplaćuje broj i minute. [OpenAI vodič za troškove](https://developers.openai.com/api/docs/guides/voice-latency-cost) daje formulu: sekunde glasa podeljene sa 60, puta cena glasa, plus troškovi servera.

Taj račun ne uključuje inženjersko vreme: neko mora da napiše alate, testira pozive i ispravi one koji krenu loše. Hostovani recepcioner taj posao sabira u jednu cenu. LobbyStack Starter košta $30 mesečno za 150 minuta, zatim $0.20 po minutu, a pozivi kraći od 10 sekundi i spam pozivi se ne računaju. Naš [vodič o ceni AI recepcionera](/sr/blog/ai-receptionist-savings/) poredi 17 dobavljača.

## Možete li besplatno da napravite AI recepcionera?

Ne preko API-ja: besplatni OpenAI nivo ne uključuje GPT-Live, a operateri naplaćuju brojeve i minute. Slobodan softver pomaže: LobbyStack je pod MIT licencom, pa hostovanje na sopstvenom serveru ne košta ništa osim servera i računa dobavljača.

Da probate bez plaćanja, LobbyStack paket Free Vam daje 30 minuta razgovora mesečno bez kartice, i broj iz SAD ili Kanade besplatno 14 dana. Posle 14 dana broj prestaje da se javlja ako ne pređete na plaćeni paket, a Vi nastavljate da testirate u pregledaču. Sam paket ne ističe.

## Zašto preporučujemo LobbyStack

Mi pravimo LobbyStack, pa ovaj deo čitajte imajući to u vidu. Za recepcionera sa zvukom ChatGPT-a, to je opcija koja Vam štedi najviše posla:

- **Radi na modelu koji pokreće ChatGPT Voice.** Svaki poziv koristi `gpt-live-1` sa podrazumevanim OpenAI glasom, `marin`. Ne koristi nijedan od devet glasova iz ChatGPT aplikacije, jer ih API ne nudi.
- **Glas je jedan red koda.** Na sopstvenoj instalaciji promenite `DEFAULT_VOICE` u [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) u bilo koji GPT-Live glas. Hostovani nalozi koriste `marin`; panel za sada nema izbor glasa.
- **Otvorenog je koda, pod MIT licencom.** Pročitajte [licencu](https://github.com/lobbystack/lobbystack/blob/main/LICENSE), forkujte kod, promenite uputstva ili ga preprodajte.
- **Postavlja se jednim dugmetom na Railway-ju.** [LobbyStack šablon za Railway](https://railway.com/deploy/lobbystack) postavlja admin, worker, servis za migracije, PostgreSQL, Redis i bucket za skladištenje. Railway generiše sve tajne ključeve i lozinke baza. Vi unosite OpenAI API ključ i Twilio pristupne podatke.

Probni pozivi u pregledaču rade čim se postavljanje završi. Email, telefonski pozivi, uvoz sajta i Google kalendar traže dodatna podešavanja. Za telefon Vam trebaju OpenAI webhook, sa njegovom tajnom na adminu, i Twilio Elastic SIP trunk, sa njegovim ID-jem na workeru. [Vodič za hostovanje na sopstvenom serveru](https://docs.lobbystack.com/self-hosting/overview) opisuje oba koraka, a [Docker Compose vodič](https://docs.lobbystack.com/self-hosting/docker-compose) pokriva Vaše servere. Oba vodiča su na engleskom.

## Pitanja o pravljenju AI recepcionera

### Da li je GPT-Live isti model kao ChatGPT Voice?

GPT-Live-1 je podrazumevani glasovni model za korisnike plaćenog ChatGPT-a, a API ga nudi kao `gpt-live-1`. Besplatni korisnici ChatGPT-a dobijaju GPT-Live-1 mini.

### Mogu li da izaberem drugi glas u LobbyStack-u?

Da, ako ga hostujete sami. Promenite `DEFAULT_VOICE` u `packages/agent-core/src/live/session.ts` u drugi GPT-Live glas, na primer `cedar` ili neki od regionalnih glasova. OpenAI zaključava glas za celu sesiju, pa promena važi za nove pozive.

### Da li mi treba Twilio?

Za telefonske pozive na LobbyStack-u, da: pozivi stižu do GPT-Live modela preko Twilio Elastic SIP trunka. Pozivima u pregledaču ne treba operater. Ako gradite sopstveni sistem, rade i Telnyx, Bandwidth i drugi SIP operateri.

### Može li ovako napravljen recepcioner da zakazuje termine?

Samo ako mu date alat za zakazivanje. GPT-Live razgovara; Vaš server proverava kalendar i upisuje termin. LobbyStack zakazuje u Google kalendaru ili prima zahteve koje Vaš tim potvrđuje.

## Čujte glas pre nego što počnete

Najbrži test je poziv. Pritisnite dugme za poziv na [našoj početnoj stranici](/sr/) i pitajte recepcionera o LobbyStack-u. Da ga probate sa svojom firmom, [napravite besplatan nalog](https://app.lobbystack.com/sr/signup), ili postavite [šablon za Railway](https://railway.com/deploy/lobbystack) i hostujte ga sami. Pogledajte [cene](/sr/pricing/) kad Vam zatreba broj telefona.
