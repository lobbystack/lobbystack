export default {
  title: "Wissensvorlage",
  intro: [
    "Füllen Sie aus, was auf Ihr Unternehmen zutrifft, und lassen Sie den Rest leer. Laden Sie diese Datei unter Wissen und Wissen hinzufügen hoch. Ihre Rezeptionistin liest Ihre Antworten und ignoriert graue Hinweise wie diesen.",
    "Schreiben Sie vollständige Sätze, die das Thema nennen: „Eine 60-minütige Massage kostet 90 €“, nicht „90 €“. Geben Sie Zahlen mit Einheiten an und ein Datum für alles, was abläuft. Verzichten Sie auf Tabellen, Bilder und „siehe unsere Website“. Geben Sie den Inhalt hier ein.",
  ],
  sections: {
    about: {
      title: "Über das Unternehmen",
      hint: "Sagen Sie in einfachen Worten, wer Sie sind. Anrufer hören das, wenn sie fragen, was Sie tun.",
      prompts: [
        "Name des Unternehmens",
        "Was macht Ihr Unternehmen, und für wen ist es gedacht?",
        "Welche Städte oder Gebiete bedienen Sie?",
        "Wie lange gibt es Ihr Unternehmen, und was hebt Sie laut Kunden ab?",
        "Welche Sprachen spricht Ihr Team?",
        "Wie erreichen Kunden Sie außer per Anruf (E-Mail, Website, soziale Medien)?",
      ],
    },
    location: {
      title: "Standort und Zugang",
      hint: "Öffnungszeiten und Schließtage stehen in Ihrem Dashboard. Ergänzen Sie hier die Details, nach denen Anrufer zusätzlich fragen.",
      prompts: [
        "Wie lautet Ihre vollständige Adresse, und welche Orientierungspunkte oder Kreuzungen helfen beim Finden?",
        "Wo können Kunden parken, und was kostet es?",
        "Ist der Standort barrierefrei (stufenloser Eingang, Aufzug, barrierefreie Toilette)?",
        "Haben Sie mehr als einen Standort? Nennen Sie die Adresse jedes Standorts.",
        "Kommen Sie zu den Kunden? Nennen Sie die Gebiete und eine eventuelle Anfahrtsgebühr.",
      ],
    },
    services: {
      title: "Leistungen im Detail",
      hint: "Ihre Leistungsliste steht in Ihrem Dashboard. Beschreiben Sie hier jede Leistung. Beginnen Sie jede Antwort mit dem Namen der Leistung, damit sie auch allein verständlich bleibt. Kopieren Sie den Block für jede weitere Leistung.",
      prompts: [
        "Name der Leistung",
        "Was sie umfasst",
        "Wie lange sie dauert",
        "Preis oder Preisspanne",
        "Für wen sie geeignet ist und für wen nicht",
        "Was vorzubereiten oder mitzubringen ist",
        "Was danach geschieht",
      ],
    },
    pricing: {
      title: "Preise und Zahlung",
      prompts: [
        "Welche Zahlungsmethoden akzeptieren Sie?",
        "Verlangen Sie Anzahlungen oder Buchungsgebühren? Nennen Sie den Betrag und die Fälligkeit.",
        "Erstellen Sie Angebote oder kostenlose Kostenvoranschläge? Wie erhält ein Kunde eines?",
        "Welche Versicherungen, Mitgliedschaften oder Finanzierungsmöglichkeiten akzeptieren Sie?",
        "Welche Rabatte, Pakete oder Aktionen laufen gerade? Nennen Sie die Enddaten.",
      ],
    },
    booking: {
      title: "Buchung und Terminvergabe",
      prompts: [
        "Wie buchen Neukunden, und was sollten sie bereithalten?",
        "Wie weit im Voraus sollten Kunden buchen, und wann ist der nächste freie Termin meist?",
        "Nehmen Sie Kunden ohne Termin oder Anfragen für denselben Tag an?",
        "Wie lautet Ihre Stornierungs- und Umbuchungsregel? Nennen Sie die nötige Frist und eine eventuelle Gebühr.",
        "Was passiert, wenn ein Kunde zu spät kommt oder nicht erscheint?",
        "Dürfen Kunden Kinder, Begleitpersonen oder Haustiere mitbringen?",
        "Nehmen Sie Gruppen-, Serien- oder Buchungen außerhalb der Öffnungszeiten an?",
      ],
    },
    policies: {
      title: "Richtlinien",
      prompts: [
        "Wie lautet Ihre Erstattungs-, Rückgabe- oder Garantieregelung?",
        "Welche Anforderungen an Ausweis, Alter oder Berechtigung gelten?",
        "Welche Gesundheits-, Sicherheits- oder Verhaltensregeln müssen Kunden kennen?",
      ],
    },
    team: {
      title: "Team",
      hint: "Ihre Teammitglieder stehen in Ihrem Dashboard. Ergänzen Sie, wonach Anrufer mit Namen oder nach Bedarf fragen.",
      prompts: [
        "Nach wem sollen Anrufer in bestimmten Situationen fragen? Beispiel: Für Hochzeitsbuchungen nach Maria fragen.",
        "Welche Teammitglieder haben Spezialgebiete oder Zertifikate, nach denen Kunden fragen?",
      ],
    },
    urgent: {
      title: "Dringende Fälle und Anrufe außerhalb der Öffnungszeiten",
      prompts: [
        "Was gilt als dringend oder als Notfall, und was sollten Anrufer zuerst tun?",
        "Was soll die Rezeptionistin Anrufern sagen, die außerhalb der Öffnungszeiten anrufen?",
      ],
    },
    limits: {
      title: "Grenzen und Weiterleitung",
      hint: "Sagen Sie der Rezeptionistin, wo sie aufhören soll. Nennen Sie das Thema und den Grund.",
      prompts: [
        "Welche Anliegen müssen an eine Person gehen? Beispiel: Beschwerden, Streit um Rechnungen, rechtliche oder medizinische Fragen.",
        "Was darf die Rezeptionistin nie versprechen oder nennen? Beispiel: genaue Preise am Telefon, garantierte Ergebnisse.",
        "Was müssen Sie von einem Anrufer wissen, bevor Sie helfen können (Name, Adresse, Fahrzeug, Bestellnummer)?",
        "Wie soll die Rezeptionistin Verkaufs- und Lieferantenanrufe behandeln?",
      ],
    },
    terms: {
      title: "Namen, Begriffe und Aussprache",
      prompts: [
        "Welche Firmen-, Team- oder Produktnamen sind schwer auszusprechen? Schreiben Sie auf, wie man jeden spricht.",
        "Welche Fachbegriffe oder Abkürzungen verwenden Kunden, und was bedeuten sie?",
        "Mit welchen anderen Unternehmen oder Marken verwechseln Kunden Ihres?",
      ],
    },
    news: {
      title: "Aktuelles",
      hint: "Entfernen Sie jeden Eintrag, sobald er veraltet ist.",
      prompts: [
        "Was hat sich kürzlich geändert oder ändert sich bald (neue Leistungen, Bauarbeiten, saisonale Änderungen, Wartezeiten)? Nennen Sie Daten.",
      ],
    },
    faq: {
      title: "Häufig gestellte Fragen",
      hint: "Schreiben Sie die 10 Fragen auf, die Anrufer am häufigsten stellen, und beantworten Sie jede in vollständigen Sätzen. Löschen Sie die Paare, die Sie nicht brauchen.",
    },
  },
};
