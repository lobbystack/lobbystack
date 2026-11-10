export default {
  title: "Kunskapsmall",
  intro: [
    "Fyll i det som gäller ditt företag och lämna resten tomt. Ladda upp den här filen under Kunskap, vid Lägg till kunskap. Din receptionist läser dina svar och hoppar över grå anteckningar som den här.",
    "Skriv hela meningar som nämner ämnet: ”En 60 minuters massage kostar 900 kr”, inte ”900 kr”. Ange siffror med enheter och datum för allt som går ut. Undvik tabeller, bilder och ”se vår webbplats”. Skriv innehållet här.",
  ],
  sections: {
    about: {
      title: "Om företaget",
      hint: "Berätta vilka ni är med enkla ord. Den som ringer hör det när de frågar vad ni gör.",
      prompts: [
        "Företagets namn",
        "Vad gör ert företag, och för vem är det?",
        "Vilka städer eller områden betjänar ni?",
        "Hur länge har ni funnits, och vad säger kunderna att som skiljer er från andra?",
        "Vilka språk talar ert team?",
        "Hur kan kunder nå er förutom genom att ringa (e-post, webbplats, sociala medier)?",
      ],
    },
    location: {
      title: "Plats och tillgänglighet",
      hint: "Öppettider och stängda dagar finns i din översikt. Lägg till här de detaljer som den som ringer frågar om utöver dem.",
      prompts: [
        "Vad är er fullständiga adress, och vilka landmärken eller korsningar hjälper folk att hitta er?",
        "Var kan kunder parkera, och vad kostar det?",
        "Är platsen tillgänglig (entré utan trösklar, hiss, tillgänglig toalett)?",
        "Har ni fler än en plats? Ange adressen till varje.",
        "Åker ni till kunder? Ange områdena och eventuell resavgift.",
      ],
    },
    services: {
      title: "Tjänster i detalj",
      hint: "Din tjänstelista finns i din översikt. Beskriv varje tjänst här. Börja varje svar med tjänstens namn så att det går att förstå på egen hand. Kopiera blocket för varje extra tjänst.",
      prompts: [
        "Tjänstens namn",
        "Vad den innehåller",
        "Hur lång tid den tar",
        "Pris eller prisintervall",
        "Vem den passar och vem den inte passar",
        "Vad man ska förbereda eller ta med",
        "Vad som händer efteråt",
      ],
    },
    pricing: {
      title: "Priser och betalning",
      prompts: [
        "Vilka betalningssätt tar ni emot?",
        "Tar ni ut handpenning eller bokningsavgift? Ange belopp och när det ska betalas.",
        "Ger ni offerter eller kostnadsfria uppskattningar? Hur får en kund en?",
        "Vilka försäkringar, medlemskap eller finansieringsalternativ tar ni emot?",
        "Vilka rabatter, paket eller kampanjer pågår? Ange slutdatum.",
      ],
    },
    booking: {
      title: "Bokning och tider",
      prompts: [
        "Hur bokar nya kunder, och vad bör de ha till hands?",
        "Hur långt i förväg bör kunder boka, och hur snart finns nästa lediga tid vanligtvis?",
        "Tar ni emot kunder utan bokning eller förfrågningar samma dag?",
        "Vad är er avboknings- och ombokningspolicy? Ange den förvarning ni kräver och eventuell avgift.",
        "Vad händer när en kund kommer sent eller inte dyker upp?",
        "Får kunder ta med barn, gäster eller husdjur?",
        "Tar ni emot grupp-, återkommande eller bokningar utanför öppettid?",
      ],
    },
    policies: {
      title: "Policyer",
      prompts: [
        "Vad är er policy för återbetalning, retur eller garanti?",
        "Vilka krav på legitimation, ålder eller behörighet gäller?",
        "Vilka hälso-, säkerhets- eller uppförandregler behöver kunder känna till?",
      ],
    },
    team: {
      title: "Team",
      hint: "Dina teammedlemmar finns i din översikt. Lägg till det som den som ringer frågar efter med namn eller behov.",
      prompts: [
        "Vem ska den som ringer fråga efter i vissa situationer? Exempel: för brudbokningar, fråga efter Maria.",
        "Vilka teammedlemmar har specialiteter eller certifieringar som kunder frågar om?",
      ],
    },
    urgent: {
      title: "Brådskande lägen och utanför öppettid",
      prompts: [
        "Vad räknas som brådskande eller akut, och vad ska den som ringer göra först?",
        "Vad ska receptionisten säga till den som ringer utanför öppettid?",
      ],
    },
    limits: {
      title: "Gränser och vidarekoppling",
      hint: "Tala om för receptionisten var hen ska stanna. Ange ämnet och skälet.",
      prompts: [
        "Vilka ärenden måste gå till en person? Exempel: klagomål, fakturatvister, juridiska eller medicinska frågor.",
        "Vad får receptionisten aldrig lova eller uppge? Exempel: exakta priser i telefon, garanterade resultat.",
        "Vad behöver ni veta om den som ringer innan ni kan hjälpa till (namn, adress, fordon, ordernummer)?",
        "Hur ska receptionisten hantera försäljnings- och leverantörssamtal?",
      ],
    },
    terms: {
      title: "Namn, termer och uttal",
      prompts: [
        "Vilka företags-, team- eller produktnamn är svåra att uttala? Skriv hur varje namn sägs.",
        "Vilka branschtermer eller förkortningar använder kunderna, och vad betyder de?",
        "Vilka andra företag eller varumärken blandar kunderna ihop med ert?",
      ],
    },
    news: {
      title: "Aktuellt",
      hint: "Ta bort varje punkt när den är inaktuell.",
      prompts: [
        "Vad har förändrats på sistone eller kommer att förändras (nya tjänster, byggarbeten, säsongsändringar, väntetider)? Ange datum.",
      ],
    },
    faq: {
      title: "Vanliga frågor",
      hint: "Skriv de 10 frågor som den som ringer ställer oftast och svara på varje med hela meningar. Ta bort de par du inte använder.",
    },
  },
};
