import type { Locale } from "@/marketing/i18n"
import type { FaqItem } from "@/marketing/lib/seo"

// The questions under the self-hosted plans on /pricing/self-hosted/.

const en: FaqItem[] = [
  {
    question: "Do I need a support plan to self-host LobbyStack?",
    answer:
      "No. The Complete edition is free under the MIT license and includes every feature. You pay your hosting provider, Twilio and OpenAI on your own accounts. A support plan adds help from our team.",
  },
  {
    question: "What does a support plan cover?",
    answer:
      "Questions about installing, configuring and upgrading the LobbyStack releases we publish, and bugs you find in them. That includes Docker, the Twilio SIP trunk, OpenAI, and your email and calendar providers. Enterprise support adds a guided install call, upgrades with you on a call and a monthly check-in.",
  },
  {
    question: "What isn't covered?",
    answer:
      "Your servers, network, security and backups, outages or account problems at Twilio, OpenAI and other providers, and code you changed or added. We don't log in to your servers. On a call, you run the commands while we guide you.",
  },
  {
    question: "How does pricing per business work?",
    answer:
      "You pay for each business your install runs. Pick the number at checkout, then change it in Polar's customer portal when you add or remove a business, and Polar prorates the difference. Agencies that run the partner program pay one price for all their clients on the white-label page.",
  },
  {
    question: "How do I reach support after I buy?",
    answer:
      "Your Polar receipt explains it. Email support@lobbystack.com from the address you bought with, and we answer Monday to Friday, 9:00 to 17:00 Eastern. With Enterprise support, your named engineer emails you within 1 business day to set up your Slack channel and book your install call.",
  },
  {
    question: "Can you help me move from LobbyStack Cloud to my own servers?",
    answer:
      "Yes, with Enterprise support. We plan the move with you and walk through each step on a call. On Premium support, you can ask us questions about the move by email.",
  },
  {
    question: "Can I cancel?",
    answer:
      "Yes, any time from the link in your Polar receipt. Your plan runs until the end of the period you paid for. Payments aren't refunded, so email us before you buy if you're unsure which plan fits.",
  },
]

const fr: FaqItem[] = [
  {
    question: "Faut-il un forfait de support pour auto-héberger LobbyStack ?",
    answer:
      "Non. L'Édition complète est gratuite sous licence MIT et comprend toutes les fonctionnalités. Vous payez votre hébergeur, Twilio et OpenAI avec vos propres comptes. Un forfait de support ajoute l'aide de notre équipe.",
  },
  {
    question: "Que couvre un forfait de support ?",
    answer:
      "Les questions sur l'installation, la configuration et la mise à jour des versions de LobbyStack que nous publions, et les bogues que vous y trouvez. Cela comprend Docker, le trunk SIP Twilio, OpenAI et vos fournisseurs de courriel et d'agenda. Le Support Enterprise ajoute un appel d'installation guidée, des mises à jour faites avec vous en appel et un suivi mensuel.",
  },
  {
    question: "Qu'est-ce qui n'est pas couvert ?",
    answer:
      "Vos serveurs, votre réseau, votre sécurité et vos sauvegardes, les pannes ou problèmes de compte chez Twilio, OpenAI et les autres fournisseurs, et le code que vous avez modifié ou ajouté. Nous ne nous connectons pas à vos serveurs. En appel, vous lancez les commandes et nous vous guidons.",
  },
  {
    question: "Comment fonctionne le prix par entreprise ?",
    answer:
      "Vous payez pour chaque entreprise que votre installation fait tourner. Choisissez le nombre au paiement, puis modifiez-le dans le portail client de Polar quand vous ajoutez ou retirez une entreprise. Polar calcule la différence au prorata. Les agences qui font tourner le programme partenaire paient un seul prix pour tous leurs clients, sur la page marque blanche.",
  },
  {
    question: "Comment joindre le support après l'achat ?",
    answer:
      "Votre reçu Polar l'explique. Écrivez à support@lobbystack.com depuis l'adresse utilisée pour l'achat. Nous répondons du lundi au vendredi, de 9 h à 17 h, heure de l'Est. Avec le Support Enterprise, votre ingénieur attitré vous écrit en 1 jour ouvrable pour ouvrir votre canal Slack et fixer votre appel d'installation.",
  },
  {
    question: "Pouvez-vous m'aider à passer de LobbyStack Cloud à mes propres serveurs ?",
    answer:
      "Oui, avec le Support Enterprise. Nous planifions le passage avec vous et parcourons chaque étape en appel. Avec le Support Premium, vous pouvez nous poser vos questions sur le passage par courriel.",
  },
  {
    question: "Puis-je annuler ?",
    answer:
      "Oui, en tout temps, depuis le lien de votre reçu Polar. Votre forfait reste actif jusqu'à la fin de la période payée. Les paiements ne sont pas remboursés, alors écrivez-nous avant d'acheter si vous hésitez entre deux forfaits.",
  },
]

const es: FaqItem[] = [
  {
    question: "¿Necesito un plan de soporte para autoalojar LobbyStack?",
    answer:
      "No. La Edición completa es gratuita con licencia MIT e incluye todas las funciones. Usted paga su hosting, Twilio y OpenAI con sus propias cuentas. Un plan de soporte suma la ayuda de nuestro equipo.",
  },
  {
    question: "¿Qué cubre un plan de soporte?",
    answer:
      "Preguntas sobre la instalación, la configuración y la actualización de las versiones de LobbyStack que publicamos, y los errores que encuentre en ellas. Eso incluye Docker, el trunk SIP de Twilio, OpenAI y sus proveedores de correo y calendario. El Soporte Enterprise añade una llamada de instalación guiada, actualizaciones hechas con usted en una llamada y un seguimiento mensual.",
  },
  {
    question: "¿Qué no cubre?",
    answer:
      "Sus servidores, su red, su seguridad y sus copias de seguridad, las caídas o problemas de cuenta en Twilio, OpenAI y otros proveedores, y el código que usted haya cambiado o añadido. No entramos en sus servidores. En una llamada, usted ejecuta los comandos y nosotros le guiamos.",
  },
  {
    question: "¿Cómo funciona el precio por negocio?",
    answer:
      "Paga por cada negocio que ejecute su instalación. Elija el número al pagar y cámbielo en el portal de clientes de Polar cuando añada o quite un negocio. Polar prorratea la diferencia. Las agencias que ejecutan el programa de socios pagan un solo precio por todos sus clientes, en la página de marca blanca.",
  },
  {
    question: "¿Cómo contacto al soporte después de comprar?",
    answer:
      "Su recibo de Polar lo explica. Escriba a support@lobbystack.com desde la dirección con la que compró. Respondemos de lunes a viernes, de 9:00 a 17:00, hora del Este. Con el Soporte Enterprise, su ingeniero asignado le escribe en 1 día hábil para abrir su canal de Slack y agendar su llamada de instalación.",
  },
  {
    question: "¿Pueden ayudarme a pasar de LobbyStack Cloud a mis propios servidores?",
    answer:
      "Sí, con el Soporte Enterprise. Planificamos el paso con usted y recorremos cada etapa en una llamada. Con el Soporte Premium, puede hacernos preguntas sobre el paso por correo.",
  },
  {
    question: "¿Puedo cancelar?",
    answer:
      "Sí, cuando quiera, desde el enlace de su recibo de Polar. Su plan sigue activo hasta el final del periodo pagado. Los pagos no se reembolsan, así que escríbanos antes de comprar si no sabe qué plan elegir.",
  },
]

const sr: FaqItem[] = [
  {
    question: "Da li mi treba paket podrške da bih sam hostovao LobbyStack?",
    answer:
      "Ne. Kompletno izdanje je besplatno pod MIT licencom i ima sve funkcije. Hosting, Twilio i OpenAI plaćate preko svojih naloga. Paket podrške Vam daje pomoć našeg tima.",
  },
  {
    question: "Šta pokriva paket podrške?",
    answer:
      "Pitanja o instalaciji, podešavanju i ažuriranju LobbyStack izdanja koja objavljujemo, i greške koje u njima pronađete. To uključuje Docker, Twilio SIP trunk, OpenAI i Vaše dobavljače e-pošte i kalendara. Enterprise podrška dodaje poziv za vođenu instalaciju, ažuriranja koja radimo zajedno u pozivu i mesečnu proveru.",
  },
  {
    question: "Šta nije pokriveno?",
    answer:
      "Vaši serveri, mreža, bezbednost i rezervne kopije, prekidi ili problemi sa nalozima kod Twilio-a, OpenAI-a i drugih dobavljača, i kod koji ste promenili ili dodali. Ne prijavljujemo se na Vaše servere. U pozivu Vi pokrećete komande, a mi Vas vodimo.",
  },
  {
    question: "Kako funkcioniše cena po firmi?",
    answer:
      "Plaćate za svaku firmu koju Vaša instalacija pokreće. Izaberite broj pri plaćanju, pa ga promenite u Polarovom portalu za kupce kada dodate ili uklonite firmu. Polar srazmerno obračunava razliku. Agencije koje pokreću partnerski program plaćaju jednu cenu za sve klijente, na stranici bele etikete.",
  },
  {
    question: "Kako da dobijem podršku posle kupovine?",
    answer:
      "Polarov račun to objašnjava. Pišite na support@lobbystack.com sa adrese sa koje ste kupili. Odgovaramo od ponedeljka do petka, od 9:00 do 17:00 po istočnom vremenu (ET). Uz Enterprise podršku, Vaš zaduženi inženjer Vam piše u roku od 1 radnog dana da otvori Slack kanal i zakaže poziv za instalaciju.",
  },
  {
    question: "Možete li da mi pomognete da pređem sa LobbyStack Cloud-a na svoje servere?",
    answer:
      "Da, uz Enterprise podršku. Prelazak planiramo zajedno i prolazimo kroz svaki korak u pozivu. Uz Premium podršku, pitanja o prelasku možete da nam pošaljete e-poštom.",
  },
  {
    question: "Mogu li da otkažem?",
    answer:
      "Da, u bilo kom trenutku, preko linka u Polarovom računu. Paket traje do kraja plaćenog perioda. Uplate se ne vraćaju, pa nam pišite pre kupovine ako niste sigurni koji paket Vam odgovara.",
  },
]

const faqs: Record<Locale, FaqItem[]> = { en, fr, es, sr }

export const getSelfHostedPricingFaqs = (locale: Locale) => faqs[locale]
