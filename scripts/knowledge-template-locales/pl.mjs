export default {
  title: "Szablon wiedzy",
  intro: [
    "Wypełnij to, co dotyczy Twojej firmy, a resztę zostaw pustą. Prześlij ten plik w sekcji Wiedza, w Dodaj wiedzę. Twoja recepcjonistka czyta Twoje odpowiedzi i pomija szare uwagi takie jak ta.",
    "Pisz pełnymi zdaniami, które nazywają temat: „Masaż 60-minutowy kosztuje 90 zł”, a nie „90 zł”. Podawaj liczby z jednostkami oraz daty przy wszystkim, co wygasa. Unikaj tabel, obrazów i „zobacz naszą stronę”. Wpisz treść tutaj.",
  ],
  sections: {
    about: {
      title: "O firmie",
      hint: "Powiedz prostymi słowami, kim jesteś. Dzwoniący to usłyszą, gdy zapytają, czym się zajmujesz.",
      prompts: [
        "Nazwa firmy",
        "Czym zajmuje się Twoja firma i dla kogo jest?",
        "Jakie miasta lub obszary obsługujesz?",
        "Od jak dawna działasz i co Cię zdaniem klientów wyróżnia?",
        "Jakimi językami mówi Twój zespół?",
        "Jak klienci mogą się z Tobą skontaktować poza telefonem (e-mail, strona, media społecznościowe)?",
      ],
    },
    location: {
      title: "Lokalizacja i dojazd",
      hint: "Godziny otwarcia i dni zamknięte są w Twoim panelu. Dodaj tu szczegóły, o które dzwoniący pytają dodatkowo.",
      prompts: [
        "Jaki jest Twój pełny adres i jakie punkty orientacyjne lub skrzyżowania pomagają Cię znaleźć?",
        "Gdzie klienci mogą zaparkować i ile to kosztuje?",
        "Czy lokalizacja jest dostępna (wejście bez schodów, winda, dostępna toaleta)?",
        "Czy masz więcej niż jedną lokalizację? Podaj adres każdej.",
        "Czy dojeżdżasz do klientów? Podaj obszary i ewentualną opłatę za dojazd.",
      ],
    },
    services: {
      title: "Usługi szczegółowo",
      hint: "Lista usług jest w Twoim panelu. Opisz tu każdą usługę. Zacznij każdą odpowiedź od nazwy usługi, aby była zrozumiała sama. Skopiuj blok dla każdej dodatkowej usługi.",
      prompts: [
        "Nazwa usługi",
        "Co obejmuje",
        "Ile trwa",
        "Cena lub przedział cen",
        "Dla kogo jest, a dla kogo nie",
        "Co przygotować lub zabrać",
        "Co dzieje się potem",
      ],
    },
    pricing: {
      title: "Ceny i płatności",
      prompts: [
        "Jakie metody płatności akceptujesz?",
        "Czy pobierasz zaliczki lub opłaty rezerwacyjne? Podaj kwotę i termin.",
        "Czy wyceniasz lub robisz bezpłatne kosztorysy? Jak klient je otrzymuje?",
        "Jakie ubezpieczenia, karnety lub opcje finansowania akceptujesz?",
        "Jakie zniżki, pakiety lub promocje obowiązują? Podaj daty zakończenia.",
      ],
    },
    booking: {
      title: "Rezerwacje i terminy",
      prompts: [
        "Jak nowi klienci rezerwują i co powinni mieć pod ręką?",
        "Z jakim wyprzedzeniem klienci powinni rezerwować i jak szybko zwykle jest następny wolny termin?",
        "Czy przyjmujesz klientów bez rezerwacji lub zgłoszenia na ten sam dzień?",
        "Jaka jest Twoja polityka anulowania i przekładania wizyt? Podaj wymagane wyprzedzenie i ewentualną opłatę.",
        "Co się dzieje, gdy klient się spóźni lub nie przyjdzie?",
        "Czy klienci mogą przyprowadzić dzieci, osoby towarzyszące lub zwierzęta?",
        "Czy przyjmujesz rezerwacje grupowe, cykliczne lub poza godzinami pracy?",
      ],
    },
    policies: {
      title: "Zasady",
      prompts: [
        "Jaka jest Twoja polityka zwrotów pieniędzy, zwrotów towaru lub gwarancji?",
        "Jakie wymagania dotyczące dokumentu, wieku lub uprawnień obowiązują?",
        "Jakie zasady zdrowotne, bezpieczeństwa lub zachowania klienci muszą znać?",
      ],
    },
    team: {
      title: "Zespół",
      hint: "Członkowie zespołu są w Twoim panelu. Dodaj to, o co dzwoniący pytają z nazwiska lub według potrzeby.",
      prompts: [
        "O kogo dzwoniący powinni pytać w określonych sytuacjach? Przykład: przy rezerwacjach ślubnych pytać o Marię.",
        "Którzy członkowie zespołu mają specjalizacje lub certyfikaty, o które pytają klienci?",
      ],
    },
    urgent: {
      title: "Pilne sprawy i połączenia po godzinach",
      prompts: [
        "Co uznajesz za pilne lub nagłe i co dzwoniący powinni zrobić najpierw?",
        "Co recepcjonistka ma powiedzieć dzwoniącym po godzinach pracy?",
      ],
    },
    limits: {
      title: "Granice i przekazywanie rozmów",
      hint: "Powiedz recepcjonistce, gdzie ma się zatrzymać. Podaj temat i powód.",
      prompts: [
        "Które sprawy muszą trafić do człowieka? Przykład: skargi, spory o rozliczenia, pytania prawne lub medyczne.",
        "Czego recepcjonistka nigdy nie może obiecywać ani podawać? Przykład: dokładnych cen przez telefon, gwarantowanych wyników.",
        "Co musisz wiedzieć o dzwoniącym, zanim będziesz mógł pomóc (imię, adres, pojazd, numer zamówienia)?",
        "Jak recepcjonistka ma traktować telefony handlowe i od dostawców?",
      ],
    },
    terms: {
      title: "Nazwy, terminy i wymowa",
      prompts: [
        "Które nazwy firm, osób z zespołu lub produktów trudno wymówić? Zapisz, jak się je wymawia.",
        "Jakich terminów branżowych lub skrótów używają klienci i co oznaczają?",
        "Z jakimi innymi firmami lub markami klienci mylą Twoją?",
      ],
    },
    news: {
      title: "Aktualności",
      hint: "Usuń każdą pozycję, gdy się zdezaktualizuje.",
      prompts: [
        "Co się ostatnio zmieniło lub wkrótce się zmieni (nowe usługi, remonty, zmiany sezonowe, czas oczekiwania)? Podaj daty.",
      ],
    },
    faq: {
      title: "Najczęstsze pytania",
      hint: "Zapisz 10 pytań, które dzwoniący zadają najczęściej, i odpowiedz na każde pełnymi zdaniami. Usuń pary, których nie używasz.",
    },
  },
};
