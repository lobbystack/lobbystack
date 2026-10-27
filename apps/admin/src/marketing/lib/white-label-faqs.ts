import type { Locale } from "@/marketing/i18n"
import type { FaqItem } from "@/marketing/lib/seo"

const EN_FAQS: FaqItem[] = [
  {
    question: "What is a white-label AI receptionist?",
    answer:
      "It's an AI receptionist you sell to your clients under your own name. It answers their calls and website chats, books appointments and transfers urgent calls to their team. Your clients sign in at your address, see your logo and pay the prices you set. Some agencies call it a white-label AI voice agent.",
  },
  {
    question: "Who is the partner program for?",
    answer:
      "Agencies, consultants, IT providers and phone companies that set up software for small businesses and want to sell a receptionist under their own name. You keep the client relationship, the billing and the front-line support.",
  },
  {
    question: "Will my clients see the LobbyStack name?",
    answer:
      "Sign-in, the dashboard, emails and the website widget's script all carry your brand. A few places still name LobbyStack: the Google Calendar and Instagram consent screens, and texts, which come from our verified toll-free number. Carriers require the first text and the HELP and STOP replies to name LobbyStack next to the business. Every other text names only the business.",
  },
  {
    question: "How do I charge my clients?",
    answer:
      "Connect your Stripe account from the console. Clients subscribe to your packages at a checkout in your name, Stripe sends the invoices and retries failed cards, and refunds and disputes stay in your Stripe dashboard. LobbyStack never holds your clients' money. For a client you bill another way, mark the business billed outside LobbyStack.",
  },
  {
    question: "What happens when a client runs out of minutes?",
    answer:
      "With overage off, or once the client reaches its cap, calls forward to the business's transfer number or the owner's verified phone, and website chat tells visitors it can't reply right now. You and the client get alerts at 80% and 100%, so you can raise the allowance first. If your own pool runs out with overage off, all your businesses fall back the same way.",
  },
  {
    question: "Can a client leave and keep their receptionist?",
    answer:
      "Only you can release a business. Its owner then pays LobbyStack directly and keeps the setup. A business that already pays LobbyStack directly can't be moved under a partner.",
  },
  {
    question: "What if I stop paying for my tier?",
    answer:
      "Your businesses keep answering for 30 days, and you can release them to their owners during that time. After that they pause, and LobbyStack deletes them 90 days after the tier ended.",
  },
  {
    question: "Can I run the partner program on my own server?",
    answer:
      "Yes. LobbyStack is MIT licensed, and every partner feature works on a self-hosted deployment. Each part turns on when you configure it: Stripe Connect for packages, Polar for tiers, a base domain for partner subdomains, and on-demand TLS for custom domains.",
  },
  {
    question: "What does self-hosted support cost an agency?",
    answer:
      "One monthly price covers your agency and every client business on your install, so adding clients doesn't raise it. Premium support adds email answers within 1 business day. Enterprise support adds replies within 4 business hours, a named engineer on Slack and help moving clients off the hosted program. Open the self-hosted plans under the partner tiers to see the prices.",
  },
  {
    question: "Who do my clients contact for help?",
    answer:
      "You. Your clients see your brand and reach your team. With a support plan, your team brings us the questions it can't answer.",
  },
  {
    question: "Do I need a card to start?",
    answer:
      "No. The free tier needs no card and includes 30 voice minutes, 50 chats and one 14-day trial number, so you can set up your brand and show a prospect a real call.",
  },
]

const FR_FAQS: FaqItem[] = [
  {
    question: "Qu'est-ce qu'une réceptionniste IA en marque blanche ?",
    answer:
      "C'est une réceptionniste IA que vous vendez à vos clients sous votre propre nom. Elle répond à leurs appels et aux clavardages de leur site, prend des rendez-vous et transfère les appels urgents à leur équipe. Vos clients se connectent à votre adresse, voient votre logo et paient les prix que vous fixez. Certaines agences parlent d'agent vocal IA en marque blanche.",
  },
  {
    question: "À qui s'adresse le programme partenaire ?",
    answer:
      "Aux agences, consultants, fournisseurs informatiques et compagnies de téléphone qui installent des logiciels pour les petites entreprises et veulent vendre une réceptionniste sous leur propre nom. Vous gardez la relation client, la facturation et le soutien de premier niveau.",
  },
  {
    question: "Mes clients verront-ils le nom LobbyStack ?",
    answer:
      "La connexion, le tableau de bord, les courriels et le script du widget du site portent votre marque. Quelques endroits nomment encore LobbyStack : les écrans d'autorisation de Google Agenda et d'Instagram, et les textos, envoyés depuis notre numéro sans frais vérifié. Les opérateurs exigent que le premier texto et les réponses à HELP et STOP nomment LobbyStack à côté de l'entreprise. Tous les autres textos ne nomment que l'entreprise.",
  },
  {
    question: "Comment est-ce que je facture mes clients ?",
    answer:
      "Connectez votre compte Stripe depuis la console. Vos clients s'abonnent à vos formules sur une page de paiement à votre nom, Stripe envoie les factures et relance les cartes refusées, et les remboursements et litiges restent dans votre tableau de bord Stripe. LobbyStack ne détient jamais l'argent de vos clients. Pour un client que vous facturez autrement, indiquez que l'entreprise est facturée hors de LobbyStack.",
  },
  {
    question: "Que se passe-t-il quand un client n'a plus de minutes ?",
    answer:
      "Si le dépassement est désactivé, ou une fois le plafond du client atteint, les appels vont au numéro de transfert de l'entreprise ou au téléphone vérifié du propriétaire, et le clavardage du site indique aux visiteurs qu'il ne peut pas répondre pour l'instant. Vous et votre client recevez une alerte à 80 % et à 100 %, ce qui vous laisse le temps d'augmenter le forfait. Si votre propre réserve s'épuise avec le dépassement désactivé, toutes vos entreprises passent au même mode.",
  },
  {
    question: "Un client peut-il partir et garder sa réceptionniste ?",
    answer:
      "Vous seul pouvez céder une entreprise. Son propriétaire paie alors LobbyStack directement et garde sa configuration. Une entreprise qui paie déjà LobbyStack directement ne peut pas passer sous un partenaire.",
  },
  {
    question: "Et si j'arrête de payer mon palier ?",
    answer:
      "Vos entreprises continuent de répondre pendant 30 jours, et vous pouvez les céder à leurs propriétaires pendant ce temps. Ensuite, elles sont mises en pause, et LobbyStack les supprime 90 jours après la fin du palier.",
  },
  {
    question: "Puis-je faire tourner le programme partenaire sur mon propre serveur ?",
    answer:
      "Oui. LobbyStack est sous licence MIT, et chaque fonction partenaire marche sur un déploiement auto-hébergé. Chaque partie s'active quand vous la configurez : Stripe Connect pour les formules, Polar pour les paliers, un domaine de base pour les sous-domaines des partenaires et le TLS à la demande pour les domaines personnalisés.",
  },
  {
    question: "Combien coûte le support auto-hébergé pour une agence ?",
    answer:
      "Un seul prix mensuel couvre votre agence et chaque entreprise cliente de votre installation, donc ajouter des clients ne le fait pas monter. Le Support Premium ajoute des réponses par courriel en 1 jour ouvrable. Le Support Enterprise ajoute des réponses en 4 heures ouvrables, un ingénieur attitré sur Slack et de l'aide pour sortir vos clients du programme hébergé. Ouvrez les forfaits auto-hébergés sous les paliers partenaires pour voir les prix.",
  },
  {
    question: "Qui mes clients contactent-ils pour obtenir de l'aide ?",
    answer:
      "Vous. Vos clients voient votre marque et joignent votre équipe. Avec un forfait de support, votre équipe nous apporte les questions auxquelles elle ne sait pas répondre.",
  },
  {
    question: "Ai-je besoin d'une carte pour commencer ?",
    answer:
      "Non. Le palier gratuit ne demande aucune carte et comprend 30 minutes vocales, 50 clavardages et un numéro d'essai de 14 jours. Vous pouvez installer votre marque et faire entendre un vrai appel à un prospect.",
  },
]

const ES_FAQS: FaqItem[] = [
  {
    question: "¿Qué es una recepcionista con IA de marca blanca?",
    answer:
      "Es una recepcionista con IA que usted vende a sus clientes con su propio nombre. Atiende sus llamadas y los chats de su sitio web, reserva citas y transfiere las llamadas urgentes a su equipo. Sus clientes inician sesión en su dirección, ven su logotipo y pagan los precios que usted fija. Algunas agencias la llaman agente de voz con IA de marca blanca.",
  },
  {
    question: "¿Para quién es el programa de socios?",
    answer:
      "Para agencias, consultores, proveedores de TI y compañías telefónicas que configuran software para pequeños negocios y quieren vender una recepcionista con su propio nombre. Usted conserva la relación con el cliente, la facturación y el soporte de primera línea.",
  },
  {
    question: "¿Verán mis clientes el nombre de LobbyStack?",
    answer:
      "El inicio de sesión, el panel, los correos y el script del widget del sitio llevan su marca. Algunos lugares siguen nombrando a LobbyStack: las pantallas de permiso de Google Calendar e Instagram, y los SMS, que salen de nuestro número gratuito verificado. Las operadoras exigen que el primer SMS y las respuestas a HELP y STOP nombren a LobbyStack junto al negocio. Los demás SMS solo nombran al negocio.",
  },
  {
    question: "¿Cómo cobro a mis clientes?",
    answer:
      "Conecte su cuenta de Stripe desde la consola. Sus clientes se suscriben a sus paquetes en un checkout a su nombre, Stripe envía las facturas y reintenta las tarjetas rechazadas, y los reembolsos y disputas se quedan en su panel de Stripe. LobbyStack nunca retiene el dinero de sus clientes. Para un cliente al que cobra de otra forma, marque el negocio como facturado fuera de LobbyStack.",
  },
  {
    question: "¿Qué pasa cuando un cliente se queda sin minutos?",
    answer:
      "Con el excedente desactivado, o cuando el cliente llega a su tope, las llamadas se desvían al número de transferencia del negocio o al teléfono verificado del propietario, y el chat del sitio avisa a los visitantes de que no puede responder ahora. Usted y su cliente reciben avisos al 80 % y al 100 %, así que puede ampliar la asignación antes. Si su propia bolsa se agota con el excedente desactivado, todos sus negocios pasan a ese mismo modo.",
  },
  {
    question: "¿Puede un cliente irse y conservar su recepcionista?",
    answer:
      "Solo usted puede ceder un negocio. Su propietario paga entonces a LobbyStack directamente y conserva la configuración. Un negocio que ya paga a LobbyStack directamente no puede pasar a un socio.",
  },
  {
    question: "¿Qué pasa si dejo de pagar mi nivel?",
    answer:
      "Sus negocios siguen atendiendo durante 30 días, y en ese tiempo puede cederlos a sus propietarios. Después se pausan, y LobbyStack los elimina 90 días después de que terminó el nivel.",
  },
  {
    question: "¿Puedo usar el programa de socios en mi propio servidor?",
    answer:
      "Sí. LobbyStack tiene licencia MIT, y cada función de socio funciona en una instalación autoalojada. Cada parte se activa cuando la configura: Stripe Connect para los paquetes, Polar para los niveles, un dominio base para los subdominios de socios y TLS bajo demanda para los dominios propios.",
  },
  {
    question: "¿Cuánto cuesta el soporte autoalojado para una agencia?",
    answer:
      "Un solo precio mensual cubre su agencia y cada negocio cliente de su instalación, así que sumar clientes no lo sube. El Soporte Premium añade respuestas por correo en 1 día hábil. El Soporte Enterprise añade respuestas en 4 horas hábiles, un ingeniero asignado en Slack y ayuda para sacar a sus clientes del programa alojado. Abra los planes autoalojados bajo los niveles de socio para ver los precios.",
  },
  {
    question: "¿A quién contactan mis clientes cuando necesitan ayuda?",
    answer:
      "A usted. Sus clientes ven su marca y contactan a su equipo. Con un plan de soporte, su equipo nos trae las preguntas que no puede responder.",
  },
  {
    question: "¿Necesito una tarjeta para empezar?",
    answer:
      "No. El nivel gratuito no pide tarjeta e incluye 30 minutos de voz, 50 chats y un número de prueba de 14 días, para que configure su marca y muestre a un prospecto una llamada real.",
  },
]

const SR_FAQS: FaqItem[] = [
  {
    question: "Šta je white-label AI recepcioner?",
    answer:
      "To je AI recepcioner kog prodajete klijentima pod svojim imenom. Odgovara na njihove pozive i četove sa sajta, zakazuje termine i prebacuje hitne pozive njihovom timu. Klijenti se prijavljuju na vašoj adresi, vide vaš logo i plaćaju cene koje vi odredite. Neke agencije ga zovu white-label AI glasovnim agentom.",
  },
  {
    question: "Kome je namenjen partnerski program?",
    answer:
      "Agencijama, konsultantima, IT firmama i telefonskim kompanijama koje podešavaju softver za male firme i žele da prodaju recepcionera pod svojim imenom. Vi zadržavate odnos sa klijentom, naplatu i prvu liniju podrške.",
  },
  {
    question: "Da li će moji klijenti videti ime LobbyStack?",
    answer:
      "Prijava, kontrolna tabla, imejlovi i skripta vidžeta na sajtu nose vaš brend. Na nekoliko mesta i dalje piše LobbyStack: na ekranima za odobrenje Google Calendar-a i Instagrama, i u SMS porukama, koje stižu sa našeg verifikovanog besplatnog broja. Operateri zahtevaju da prva poruka i odgovori na HELP i STOP navedu LobbyStack pored firme. Sve ostale poruke navode samo firmu.",
  },
  {
    question: "Kako naplaćujem klijentima?",
    answer:
      "Povežite svoj Stripe nalog iz konzole. Klijenti se pretplaćuju na vaše ponude na stranici za plaćanje pod vašim imenom, Stripe šalje račune i ponovo pokušava odbijene kartice, a povraćaji i sporovi ostaju u vašem Stripe nalogu. LobbyStack nikada ne drži novac vaših klijenata. Za klijenta kog naplaćujete na drugi način, označite da se firma naplaćuje van LobbyStack-a.",
  },
  {
    question: "Šta se dešava kada klijent potroši minute?",
    answer:
      "Kada je prekoračenje isključeno ili klijent dostigne limit, pozivi idu na broj za prebacivanje firme ili na verifikovani telefon vlasnika, a čet na sajtu javlja posetiocima da trenutno ne može da odgovori. Vi i klijent dobijate upozorenje na 80% i 100%, pa možete ranije da povećate paket. Ako vaš fond istekne dok je prekoračenje isključeno, sve vaše firme rade na isti način.",
  },
  {
    question: "Može li klijent da ode i zadrži recepcionera?",
    answer:
      "Samo vi možete da predate firmu. Njen vlasnik tada plaća LobbyStack direktno i zadržava podešavanja. Firma koja već plaća LobbyStack direktno ne može da pređe kod partnera.",
  },
  {
    question: "Šta ako prestanem da plaćam nivo?",
    answer:
      "Vaše firme nastavljaju da odgovaraju 30 dana, a u tom periodu možete da ih predate vlasnicima. Posle toga se pauziraju, a LobbyStack ih briše 90 dana nakon što je nivo istekao.",
  },
  {
    question: "Mogu li da pokrenem partnerski program na svom serveru?",
    answer:
      "Da. LobbyStack je pod MIT licencom i svaka partnerska funkcija radi i kada ga sami hostujete. Svaki deo se uključuje kada ga podesite: Stripe Connect za ponude, Polar za nivoe, osnovni domen za partnerske poddomene i TLS na zahtev za sopstvene domene.",
  },
  {
    question: "Koliko košta podrška za samostalno hostovanje za agenciju?",
    answer:
      "Jedna mesečna cena pokriva Vašu agenciju i svaku firmu klijenta na Vašoj instalaciji, pa se ne povećava kada dodate klijente. Premium podrška donosi odgovore putem e-pošte za 1 radni dan. Enterprise podrška donosi odgovore za 4 radna sata, zaduženog inženjera na Slacku i pomoć pri prelasku klijenata iz hostovanog programa. Otvorite pakete za samostalno hostovanje ispod partnerskih nivoa da vidite cene.",
  },
  {
    question: "Kome se moji klijenti obraćaju za pomoć?",
    answer:
      "Vama. Vaši klijenti vide Vaš brend i javljaju se Vašem timu. Uz paket podrške, Vaš tim nama donosi pitanja na koja ne zna odgovor.",
  },
  {
    question: "Da li mi treba kartica za početak?",
    answer:
      "Ne. Besplatni nivo ne traži karticu i uključuje 30 minuta razgovora, 50 četova i jedan probni broj na 14 dana, pa možete da podesite brend i pokažete potencijalnom klijentu pravi poziv.",
  },
]

const FAQS_BY_LOCALE = {
  en: EN_FAQS,
  fr: FR_FAQS,
  es: ES_FAQS,
  sr: SR_FAQS,
} satisfies Record<Locale, FaqItem[]>

export function getWhiteLabelFaqs(locale: Locale): FaqItem[] {
  return FAQS_BY_LOCALE[locale]
}
