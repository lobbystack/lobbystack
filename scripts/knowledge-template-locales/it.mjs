export default {
  title: "Modello di conoscenza",
  intro: [
    "Compili ciò che riguarda la sua attività e lasci vuoto il resto. Carichi questo file in Conoscenza, sotto Aggiungi conoscenza. La sua receptionist legge le sue risposte e ignora le note grigie come questa.",
    "Scriva frasi complete che nominino l'argomento: «Un massaggio di 60 minuti costa 90 €», non «90 €». Indichi i numeri con le unità e una data per tutto ciò che scade. Eviti tabelle, immagini e «vedi il nostro sito». Digiti qui il contenuto.",
  ],
  sections: {
    about: {
      title: "Informazioni sull'attività",
      hint: "Dica chi è con parole semplici. Chi chiama lo sente quando chiede di cosa vi occupate.",
      prompts: [
        "Nome dell'attività",
        "Di cosa si occupa la sua attività e a chi si rivolge?",
        "Quali città o zone servite?",
        "Da quanto tempo siete in attività e cosa vi distingue secondo i clienti?",
        "Quali lingue parla il vostro team?",
        "Come possono contattarvi i clienti oltre alla telefonata (e-mail, sito web, social)?",
      ],
    },
    location: {
      title: "Sede e accesso",
      hint: "Orari e chiusure sono nella sua dashboard. Aggiunga qui i dettagli che chi chiama chiede in più.",
      prompts: [
        "Qual è il vostro indirizzo completo e quali punti di riferimento o incroci aiutano a trovarvi?",
        "Dove possono parcheggiare i clienti e quanto costa?",
        "La sede è accessibile (ingresso senza gradini, ascensore, bagno accessibile)?",
        "Avete più di una sede? Indichi l'indirizzo di ciascuna.",
        "Vi recate dai clienti? Indichi le zone e l'eventuale costo di trasferta.",
      ],
    },
    services: {
      title: "Servizi nel dettaglio",
      hint: "L'elenco dei servizi è nella sua dashboard. Descriva qui ogni servizio. Inizi ogni risposta con il nome del servizio, così resta chiara anche da sola. Copi il blocco per ogni servizio in più.",
      prompts: [
        "Nome del servizio",
        "Cosa include",
        "Quanto dura",
        "Prezzo o fascia di prezzo",
        "A chi è adatto e a chi no",
        "Cosa preparare o portare",
        "Cosa succede dopo",
      ],
    },
    pricing: {
      title: "Prezzi e pagamento",
      prompts: [
        "Quali metodi di pagamento accettate?",
        "Richiedete acconti o costi di prenotazione? Indichi l'importo e la scadenza.",
        "Fate preventivi o stime gratuite? Come ne ottiene uno il cliente?",
        "Quali assicurazioni, abbonamenti od opzioni di finanziamento accettate?",
        "Quali sconti, pacchetti o promozioni sono attivi? Indichi le date di fine.",
      ],
    },
    booking: {
      title: "Prenotazioni e appuntamenti",
      prompts: [
        "Come prenotano i nuovi clienti e cosa devono avere a portata di mano?",
        "Con quanto anticipo devono prenotare i clienti e tra quanto c'è di solito il prossimo posto libero?",
        "Accettate clienti senza appuntamento o richieste per lo stesso giorno?",
        "Qual è la vostra politica di cancellazione e di spostamento? Indichi il preavviso richiesto e l'eventuale penale.",
        "Cosa succede quando un cliente arriva in ritardo o non si presenta?",
        "I clienti possono portare bambini, accompagnatori o animali?",
        "Accettate prenotazioni di gruppo, ricorrenti o fuori orario?",
      ],
    },
    policies: {
      title: "Politiche",
      prompts: [
        "Qual è la vostra politica di rimborso, reso o garanzia?",
        "Quali requisiti di documento, età o idoneità si applicano?",
        "Quali regole di salute, sicurezza o comportamento devono conoscere i clienti?",
      ],
    },
    team: {
      title: "Team",
      hint: "I membri del team sono nella sua dashboard. Aggiunga ciò che chi chiama chiede per nome o per esigenza.",
      prompts: [
        "Chi devono chiedere i chiamanti in situazioni specifiche? Esempio: per le prenotazioni di nozze, chiedere di Maria.",
        "Quali membri del team hanno specializzazioni o certificazioni su cui i clienti chiedono?",
      ],
    },
    urgent: {
      title: "Situazioni urgenti e fuori orario",
      prompts: [
        "Cosa conta come urgenza o emergenza e cosa deve fare per prima cosa chi chiama?",
        "Cosa deve dire la receptionist a chi chiama fuori orario?",
      ],
    },
    limits: {
      title: "Limiti e passaggi a una persona",
      hint: "Dica alla receptionist dove fermarsi. Indichi l'argomento e il motivo.",
      prompts: [
        "Quali richieste devono passare a una persona? Esempio: reclami, contestazioni di fatturazione, domande legali o mediche.",
        "Cosa non deve mai promettere o indicare la receptionist? Esempio: prezzi esatti al telefono, risultati garantiti.",
        "Cosa deve sapere da chi chiama prima di poter aiutare (nome, indirizzo, veicolo, numero d'ordine)?",
        "Come deve trattare la receptionist le chiamate commerciali e dei fornitori?",
      ],
    },
    terms: {
      title: "Nomi, termini e pronunce",
      prompts: [
        "Quali nomi di attività, di team o di prodotto sono difficili da pronunciare? Scriva come si dice ciascuno.",
        "Quali termini o abbreviazioni del settore usano i clienti e cosa significano?",
        "Con quali altre attività o marchi i clienti confondono la vostra?",
      ],
    },
    news: {
      title: "Novità",
      hint: "Rimuova ogni voce quando non è più attuale.",
      prompts: [
        "Cosa è cambiato di recente o sta per cambiare (nuovi servizi, lavori, cambi stagionali, tempi di attesa)? Indichi le date.",
      ],
    },
    faq: {
      title: "Domande frequenti",
      hint: "Scriva le 10 domande che chi chiama pone più spesso e risponda a ciascuna con frasi complete. Elimini le coppie che non usa.",
    },
  },
};
