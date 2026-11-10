export default {
  title: "Kennissjabloon",
  intro: [
    "Vul in wat voor uw bedrijf geldt en laat de rest leeg. Upload dit bestand bij Kennis, onder Kennis toevoegen. Uw receptionist leest uw antwoorden en negeert grijze opmerkingen zoals deze.",
    "Schrijf volledige zinnen die het onderwerp noemen: ‘Een massage van 60 minuten kost € 90’, niet ‘€ 90’. Geef getallen met eenheden en een datum bij alles wat verloopt. Vermijd tabellen, afbeeldingen en ‘zie onze website’. Typ de inhoud hier.",
  ],
  sections: {
    about: {
      title: "Over het bedrijf",
      hint: "Zeg in gewone woorden wie u bent. Bellers horen dit als ze vragen wat u doet.",
      prompts: [
        "Bedrijfsnaam",
        "Wat doet uw bedrijf, en voor wie is het bedoeld?",
        "Welke steden of regio's bedient u?",
        "Hoe lang bestaat uw bedrijf, en wat onderscheidt u volgens klanten?",
        "Welke talen spreekt uw team?",
        "Hoe kunnen klanten u bereiken behalve telefonisch (e-mail, website, sociale media)?",
      ],
    },
    location: {
      title: "Locatie en bereikbaarheid",
      hint: "Openingstijden en sluitingsdagen staan in uw dashboard. Voeg hier de details toe waar bellers daarnaast naar vragen.",
      prompts: [
        "Wat is uw volledige adres, en welke herkenningspunten of kruispunten helpen mensen u te vinden?",
        "Waar kunnen klanten parkeren, en wat kost het?",
        "Is de locatie toegankelijk (drempelloze ingang, lift, toegankelijk toilet)?",
        "Heeft u meer dan één locatie? Geef het adres van elke locatie.",
        "Komt u bij klanten aan huis? Noem de gebieden en eventuele voorrijkosten.",
      ],
    },
    pricing: {
      title: "Prijzen en betaling",
      prompts: [
        "Welke betaalmethoden accepteert u?",
        "Vraagt u een aanbetaling of reserveringskosten? Noem het bedrag en wanneer het verschuldigd is.",
        "Maakt u offertes of gratis prijsopgaven? Hoe krijgt een klant er een?",
        "Welke verzekeringen, lidmaatschappen of financieringsopties accepteert u?",
        "Welke kortingen, pakketten of acties lopen er? Noem de einddatum.",
      ],
    },
    booking: {
      title: "Reserveren en afspraken",
      prompts: [
        "Hoe boeken nieuwe klanten, en wat moeten ze bij de hand hebben?",
        "Hoe ver van tevoren moeten klanten boeken, en hoe snel is de volgende plek meestal vrij?",
        "Neemt u klanten zonder afspraak of aanvragen voor dezelfde dag aan?",
        "Wat is uw annulerings- en verplaatsingsbeleid? Noem de benodigde opzegtermijn en eventuele kosten.",
        "Wat gebeurt er als een klant te laat komt of niet komt opdagen?",
        "Mogen klanten kinderen, gasten of huisdieren meenemen?",
        "Neemt u groeps-, terugkerende of boekingen buiten openingstijd aan?",
      ],
    },
    policies: {
      title: "Beleid",
      prompts: [
        "Wat is uw beleid voor terugbetaling, retour of garantie?",
        "Welke eisen voor identiteitsbewijs, leeftijd of toelating gelden?",
        "Welke gezondheids-, veiligheids- of gedragsregels moeten klanten kennen?",
      ],
    },
    team: {
      title: "Team",
      hint: "Uw teamleden staan in uw dashboard. Voeg toe waar bellers op naam of op behoefte naar vragen.",
      prompts: [
        "Naar wie moeten bellers in bepaalde situaties vragen? Voorbeeld: voor bruidsafspraken vraagt u naar Maria.",
        "Welke teamleden hebben specialiteiten of certificeringen waar klanten naar vragen?",
      ],
    },
    urgent: {
      title: "Spoed en situaties buiten openingstijd",
      prompts: [
        "Wat geldt als spoed of noodgeval, en wat moeten bellers eerst doen?",
        "Wat moet de receptionist zeggen tegen bellers buiten openingstijd?",
      ],
    },
    limits: {
      title: "Grenzen en doorverbinden",
      hint: "Zeg de receptionist waar die moet stoppen. Noem het onderwerp en de reden.",
      prompts: [
        "Welke verzoeken moeten naar een persoon? Voorbeeld: klachten, betwiste facturen, juridische of medische vragen.",
        "Wat mag de receptionist nooit beloven of noemen? Voorbeeld: exacte prijzen per telefoon, gegarandeerde resultaten.",
        "Wat moet u van een beller weten voordat u kunt helpen (naam, adres, voertuig, bestelnummer)?",
        "Hoe moet de receptionist omgaan met verkoop- en leverancierstelefoontjes?",
      ],
    },
    terms: {
      title: "Namen, termen en uitspraak",
      prompts: [
        "Welke bedrijfs-, team- of productnamen zijn moeilijk uit te spreken? Schrijf op hoe elk wordt uitgesproken.",
        "Welke vaktermen of afkortingen gebruiken klanten, en wat betekenen ze?",
        "Met welke andere bedrijven of merken verwarren klanten het uwe?",
      ],
    },
    news: {
      title: "Actueel",
      hint: "Verwijder elk punt zodra het verouderd is.",
      prompts: [
        "Wat is er onlangs veranderd of gaat binnenkort veranderen (nieuwe diensten, werkzaamheden, seizoenswijzigingen, wachttijden)? Noem data.",
      ],
    },
    faq: {
      title: "Veelgestelde vragen",
      hint: "Schrijf de 10 vragen op die bellers het vaakst stellen en beantwoord elk in volledige zinnen. Verwijder de paren die u niet gebruikt.",
    },
  },
};
