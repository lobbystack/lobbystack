---
title: "Najbolji open-source AI servisi za pozive"
description: "Uporedite open-source AI servise za odgovaranje na telefonske pozive koje možete samostalno hostovati: Asterisk agenti, LiveKit glasovni sistemi i kompletne platforme za recepciju."
pubDate: 2026-07-08T10:00:00-04:00
author: "LobbyStack tim"
category: "Vodiči"
featured: false
coverImage: "/illustrations/best-open-source-ai-phone-answering-services-hero.webp"
locale: "sr"
canonicalSlug: "best-open-source-ai-phone-answering-services"
---

Većina firmi koja traži **open-source AI servis za odgovaranje na telefonske pozive** ne traži projekat za vikend hakaton. Žele manje propuštenih poziva, urednije predavanje zakazivanja i sistem koji mogu da pregledaju, hostuju i menjaju bez čekanja na plan razvoja nekog dobavljača.

Open-source deo ovog tržišta deli se na dva tabora. Neki projekti Vam daju glasovnog agenta koga povezujete sa Asteriskom ili LiveKitom. Drugi su bliži open-source virtuelnom recepcioneru: transkripti, kontrolne table, zakazivanje, obaveštenja i poslovna pravila. Izbor pogrešnog tabora je uobičajena greška. Preuzmete glasovni repozitorijum, dobijete pristojan demo, a onda shvatite da Vam i dalje trebaju kalendari, evidencija poziva, pregled od strane osoblja i logika eskalacije pre nego što mu iko poveri pravu telefonsku liniju.

Ovaj vodič poredi najjače open-source opcije sredinom 2026. godine, uz jednostavne kriterijume, kako biste projekat uskladili sa svojim telefonskim sistemom i sa tim koliko je Vaš tim spreman da se bavi održavanjem.

## Kako proceniti open-source sistem za odgovaranje na pozive

Pre liste, odlučite šta Vam zaista treba tokom poziva uživo.

**Uklapanje u telefoniju.** Da li već koristite Asterisk ili FreePBX? Želite li Twilio ili Telnyx SIP? Možete li za sada da prihvatite glas samo u pregledaču? Projekat koji se bori sa Vašim telefonskim sistemom potrošiće vreme pre nego što AI uopšte kaže „zdravo“.

**Glasovna arhitektura.** Speech-to-speech modeli (OpenAI Realtime, Google Live) zvuče prirodno i smanjuju kašnjenje. STT + LLM + TTS lanci daju timovima više kontrole nad dobavljačima i mogu biti jeftiniji pri većem obimu, posebno sa lokalnim modelima. Nijedan pristup nije automatski bolji. Zauzetim uslužnim firmama su važni upadanje u reč i brzina predaje poziva. Timovima osetljivim na privatnost važno je da zvuk ostane na sopstvenim serverima.

**Dubina proizvoda.** Primanje poruka je osnovni minimum. Zakazivanje, upis u CRM, SMS praćenje, upozorenja za osoblje i pregled posle poziva razlikuju telefonsku igračku od nečega što će recepcija zaista koristiti.

**Teret održavanja.** Samostalno hostovanje znači Docker, tajne ključeve, nadogradnje, rezervne kopije i testiranje poziva. „Bez SaaS pretplate“ ne znači „bez rada“.

**Licenca.** MIT i licence tipa Apache dozvoljavaju internu upotrebu i rad za klijente. AGPL projekti mogu da posluže, ali pročitajte copyleft uslove pre nego što rešenje prodate klijentima pod svojim brendom.

Za svakog finalistu napravite pravi test poziva: zahtev za zakazivanje, pitanje o ceni, ljut pozivalac, pogrešan broj i poziv van radnog vremena. Repozitorijum sa najboljim README fajlom retko pobedi na tom testu.

## Najbolje open-source opcije, po nameni

### LobbyStack: najbolja kompletna platforma za recepciju (u oblaku ili samostalno hostovana)

**GitHub:** [lobbystack/lobbystack](https://github.com/lobbystack/lobbystack)

**Licenca:** MIT

**Najbolje za:** Uslužne firme i agencije koje žele pozive, zakazivanje, transkripte, kontrolne table, naplatu i samostalno hostovanje bez sklapanja deset repozitorijuma

[LobbyStack](https://lobbystack.com/) je opcija na ovoj listi koja je najbliža kompletnom proizvodu za **AI recepcionera**. Pokriva dolazne pozive, zakazivanje i izmene termina, transkripte i rezimee, poslovni kontekst i česta pitanja, SMS poruke o zakazivanju, upozorenja e-poštom i SMS-om, prebacivanje na čoveka, kontrolne table za osoblje, praćenje potrošnje i postavke za klijente. Možete koristiti hostovanu verziju u oblaku, koristiti ga kao [open-source AI recepcionera](/solutions/open-source-ai-receptionist/) ili ga [samostalno hostovati uz Docker](/solutions/self-hosted-ai-receptionist/).

Kompromis je obim. Dobijate pravi operativni sloj oko poziva, ali i dalje sami obezbeđujete naloge kod dobavljača (Twilio, OpenAI, kalendar, e-pošta i povezane usluge) i odgovorni ste za postavljanje ako hostujete sami. To je iskrena cena izbegavanja SaaS zaključavanja uz zadržavanje dubine proizvoda.

Izaberite LobbyStack kada je Vaš problem „odgovoriti na pozive i završiti posao“, a ne „dokazati glasovni AI u laboratoriji“.

### AVA (Asterisk AI voice agent): najbolje za postojeća Asterisk / FreePBX okruženja

**GitHub:** [hkjarral/Asterisk-AI-Voice-Agent](https://github.com/hkjarral/Asterisk-AI-Voice-Agent)

**Licenca:** MIT

**Najbolje za:** Timove koji već koriste Asterisk i žele modularnog glasovnog agenta sa lancima u oblaku, hibridnim ili potpuno lokalnim

AVA trenutno ima najaktivniju open-source zajednicu za **Asterisk AI glasovnog agenta**. Povezuje se sa Asteriskom preko ARI, podržava AudioSocket i ExternalMedia RTP i omogućava kombinovanje STT, LLM i TTS dobavljača. Možete koristiti dobavljače u oblaku (OpenAI Realtime, Google Live, Deepgram i druge), lokalnu hibridnu postavku ili potpuno lokalni sistem sa Faster Whisper, llama.cpp i Kokoro TTS.

Šta dobijate: ozbiljnu integraciju sa telefonijom, osnovna podešavanja usmerena na produkciju i detaljno podešavanje za kontekst svakog agenta. Šta ne dobijate odmah: uglađenu kontrolnu tablu recepcije za više klijenata, sloj proizvoda za zakazivanje ili naplatu za agencije. Plaćate fleksibilnost glasovnog lanca, a poslovne tokove posle gradite ili spajate sami.

Izaberite AVA kada je Asterisk već Vaš telefonski sistem i želite maksimalnu kontrolu nad glasovnim lancem.

### Helix AI virtual receptionist: najbolji lokalni Asterisk recepcioner

**GitHub:** [BB-AI-Arena/helix-ai-virtual-receptionist](https://github.com/BB-AI-Arena/helix-ai-virtual-receptionist)

**Licenca:** MIT

**Najbolje za:** Operatere koji žele odgovaranje na pozive preko Asteriska bez slanja govora ili LLM saobraćaja spoljnim API servisima

Helix direktnije cilja posao recepcionera nego običan glasovni agent. Radi na Asterisk ARI uz lokalni Whisper STT, Ollama za prepoznavanje namere, Kokoro TTS, zakazivanje u Google Calendar, govornu poštu, VIP usmeravanje, pravila za radno vreme i operativnu kontrolnu tablu. Projekat je noviji i manji od AVA, ali je pravac jasan: samostalno hostovana višejezična recepcija sa opcionim CRM vezama (Vtiger) i manjom zavisnošću od računa za AI u oblaku koji se plaća po minutu.

Kompromis su hardver i podešavanje. Lokalni glas na procesoru može delovati sporo. Grafička kartica pomaže. Takođe ćete sami morati da doradite veći deo proizvoda.

Izaberite Helix kada su Vam privatnost, predvidivi troškovi i usmeravanje izvorno u Asterisku važniji od povezivanja sa najnovijim hostovanim govornim modelom od prvog dana.

### AIReceptionist: najbolji minimalni OpenAI Realtime + LiveKit sistem

**GitHub:** [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist)

**Licenca:** AGPL-3.0

**Najbolje za:** Programere koji brzo žele speech-to-speech kvalitet, uz YAML konfiguraciju i SIP preko LiveKita

Ovaj projekat je namerno uzak. Povezuje dolazne PSTN pozive (Twilio ili Telnyx) sa LiveKit sobom, koristi OpenAI Realtime API za speech-to-speech razgovor i nudi odgovore na česta pitanja, preusmeravanje, primanje poruka, pravila van radnog vremena i konfiguraciju za više firmi iz YAML fajla. Obrada šuma u telefonskom zvuku je ugrađena.

Menjate širinu za brzinu do linije koja dobro zvuči. Nema kompletne kontrolne table za operatere, sistema za zakazivanje ni sloja naplate. AGPL je važan ako planirate da preprodajete bez objavljivanja svojih izmena.

Izaberite AIReceptionist kada Vam se već dopada LiveKit, želite Realtime kvalitet glasa i poslovni sloj ćete napraviti sami.

### Hearthline: najbolja open-source opcija prilagođena kućnim uslugama

**GitHub:** [codewithmuh/hearthline](https://github.com/codewithmuh/hearthline)

**Licenca:** AGPL-3.0 (dostupna je i komercijalna licenca)

**Najbolje za:** Grejanje i klimatizaciju, vodoinstalatere i slične zanate kojima trebaju pozivi, SMS, ponude i tokovi slični dispečerskim

Hearthline je softver za određenu delatnost, a ne opšti glasovni komplet. Sistem kombinuje Django, Next.js, Postgres, Vapi za glas, Twilio za SMS i šifrovane API ključeve za svaku firmu. Fokusira se na kvalifikaciju potencijalnih klijenata, ponude na osnovu fotografija, cenovnike, CRM konektore i pravila za kanale koje timovi za kućne usluge zaista koriste.

I dalje sami obezbeđujete dobavljače glasa i AI. Zajedničko hostovanje za više klijenata je u planu razvoja; danas je bliže principu jedna firma po instalaciji.

Izaberite Hearthline kada su Vaši pozivi specifični za zanat i želite otvoren kod napravljen za taj tok rada, a ne opšteg recepcionera koga morate da savijate u željeni oblik.

## Uporedite opcije

| Projekat | Ulazna tačka za telefon | Stil glasa | Dubina proizvoda | Znak zrelosti |
| --- | --- | --- | --- | --- |
| LobbyStack | Twilio / glasovni gateway | Realtime glasovni sistem | Kompletna platforma za recepciju | Monorepo usmeren na produkciju |
| AVA | Asterisk / FreePBX | Modularni STT/LLM/TTS ili realtime | Glasovni agent + administratorski interfejs | Velika zajednica, česta izdanja |
| Helix | Asterisk ARI | Lokalni STT/LLM/TTS | Funkcije recepcionera + kontrolna tabla | Noviji, fokus na lokalni rad |
| AIReceptionist | LiveKit + SIP trunk | OpenAI Realtime speech-to-speech | Konfiguracija glasovnog agenta | Mali, fokusiran kod |
| Hearthline | Vapi + Twilio | Glas koji hostuje dobavljač | Recepcija za kućne usluge | Proizvod za određenu delatnost, aktivan razvoj |

## Od čega Vas ovi projekti neće spasti

Otvoren kod uklanja nejasnoće oko licence. Ne uklanja:

- **Rad na promptovima i pravilima.** Radno vreme, usluge, granice cena i pravila eskalacije i dalje moraju imati odgovornu osobu.
- **Testiranje poziva.** Pravi pozivaoci mrmljaju, upadaju u reč i postavljaju pitanja pogrešnim redom.
- **Razmišljanje o usklađenosti sa propisima.** Snimcima, transkriptima i podacima klijenata i dalje trebaju pravila čuvanja i pristupa.
- **Račune dobavljača.** Twilio minuti, OpenAI potrošnja i kalendarski API servisi i dalje se pojavljuju na fakturama, osim ako sve ne radite lokalno.

Ako birate između pravljenja, kupovine i samostalnog hostovanja, uz ovu listu pročitajte i [kako izabrati AI recepcionera](/sr/blog/how-to-choose-an-ai-receptionist/) i [da li napraviti ili kupiti AI recepcionera](/sr/blog/build-or-buy-ai-receptionist/).

## Praktični sledeći koraci

1. **Zapišite pet najčešćih vrsta poziva** (zakazivanje, ponuda, hitan slučaj, postojeći klijent, spam) i ishod koji je potreban za svaku.
2. **Prvo uskladite telefoniju.** Asterisk okruženje → AVA ili Helix. Twilio/LiveKit okruženje → AIReceptionist ili LobbyStack. Kućne usluge → stavite Hearthline u uži izbor.
3. **Uradite test od pet poziva** sa svakim finalistom pre nego što preusmerite broj koji se koristi u produkciji.
4. **Odlučite ko je zadužen za održavanje.** Samostalno hostovanje traži nekoga ko će svake nedelje instalirati zakrpe, pratiti sistem i preslušavati loše pozive.

## Zaključak

Najbolji **open-source AI servis za odgovaranje na telefonske pozive** za Vas je onaj koji se uklapa u Vaš telefonski sistem i završava poziv onako kako bi to uradilo Vaše osoblje.

- Treba Vam kompletan proizvod za recepciju koji možete samostalno hostovati ili koristiti u oblaku → **LobbyStack**
- Treba Vam maksimalna fleksibilnost u Asterisku → **AVA**
- Treba Vam lokalni glas na Asterisku bez zavisnosti od AI u oblaku → **Helix**
- Treba Vam vitak Realtime glasovni agent na LiveKitu → **AIReceptionist**
- Treba Vam recepcija za kućne usluge → **Hearthline**

Ako želite da pregledate kompletan sistem pre nego što preusmerite svoju glavnu liniju, počnite od [LobbyStack GitHub repozitorijuma](https://github.com/lobbystack/lobbystack) ili [pregleda open-source sistema za AI recepcionera](/sr/blog/open-source-ai-receptionist-stack/).
