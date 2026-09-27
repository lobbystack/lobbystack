import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const termsEn: LegalDocument = {
  updated: "Last updated: September 26, 2026",
  h1: "Terms of Service",
  intro: `These Terms of Service ("Terms") govern your use of LobbyStack's hosted service, websites, and support. Please read them before you use LobbyStack. They limit our liability, make you responsible for call recording consent and text message compliance, and set out how we handle disputes.`,
  sections: [
    {
      id: "agreement",
      nav: "Agreement",
      title: "1. Agreement and eligibility",
      blocks: [
        `1.1 These Terms form a contract between you and Lobbystack Inc. ("LobbyStack," "we," "our," or "us"). You accept them when you create an account, check a box or click a button that refers to them, buy a plan, or use the Service. If you do not agree, do not use the Service.`,
        `1.2 LobbyStack is for businesses only. You confirm that you use the Service for a business, trade, or profession, and not for personal, family, or household purposes. You are not a consumer under the Quebec Consumer Protection Act or any similar law when you use the Service.`,
        `1.3 If you accept these Terms for a company or other organization, you confirm that you have authority to bind it. "You" and "Customer" then mean that organization. You must be at least 18 years old and have reached the age of majority where you live.`,
        `1.4 If you and LobbyStack sign an order form or other written agreement for the Service ("Order"), the Order controls over these Terms where the two conflict, but only for the subject the Order covers.`,
      ],
    },
    {
      id: "definitions",
      nav: "Definitions",
      title: "2. Definitions",
      blocks: [
        {
          ul: [
            `<strong>Service</strong> means LobbyStack's hosted AI receptionist, the dashboard, the website chat and call widget, our websites, our APIs, and related support we provide to you.`,
            `<strong>Authorized Users</strong> means your employees and contractors whom you allow to use your account.`,
            `<strong>Callers</strong> means people who interact with your AI receptionist by phone call, browser call, or website chat, and people who receive texts sent through the Service.`,
            `<strong>Customer Data</strong> means the data you or your Callers submit to the Service, including business information, knowledge content, call audio, recordings, transcripts, messages, chat conversations, contact details, and appointment records.`,
            `<strong>AI Output</strong> means anything the Service generates with artificial intelligence, including spoken replies, chat replies, summaries, and booking actions.`,
            `<strong>Third-Party Services</strong> means products and services that we do not own or control, such as telephone carriers, AI model providers, calendars, and payment processors.`,
          ],
        },
      ],
    },
    {
      id: "service",
      nav: "Service",
      title: "3. The Service",
      blocks: [
        `3.1 LobbyStack is an AI receptionist for small businesses. Depending on your plan and settings, the Service can answer inbound phone calls and browser calls with an AI voice agent, answer questions in website chat, book, cancel, and reschedule appointments after verifying the Caller, take messages, transfer calls to your staff, record and transcribe calls, send alert texts to your team, and send an optional appointment reminder text to Callers who agree to receive one.`,
        `3.2 Features, limits, and included usage vary by plan. The <a href="/pricing/">pricing page</a> or your Order describes them. We may add, change, or remove features. If we remove a material feature from a paid plan you use, we will give you reasonable notice. We do not promise any future feature, and you should not buy a plan based on one.`,
        `3.3 We grant you a limited, non-exclusive, non-transferable, non-sublicensable right to use the Service for your internal business purposes during your subscription, subject to these Terms. This includes the right to place our website widget on sites you control.`,
      ],
    },
    {
      id: "accounts",
      nav: "Accounts",
      title: "4. Accounts and security",
      blocks: [
        `4.1 You must give us accurate account, business, and billing information and keep it current.`,
        `4.2 You are responsible for your Authorized Users and for everything that happens under your account. Keep passwords and access secure. Tell us at ${support} right away if you suspect unauthorized access.`,
        `4.3 We may refuse, suspend, or close an account that uses false information, appears to be a duplicate created to get more free usage, or creates risk for LobbyStack, our providers, or others.`,
      ],
    },
    {
      id: "ai",
      nav: "AI output",
      title: "5. AI receptionist and AI Output",
      blocks: [
        `5.1 The Service uses artificial intelligence, including OpenAI models. AI Output can be wrong, incomplete, inconsistent, or inappropriate. The AI receptionist may misunderstand a Caller, give an answer your business would not give, quote a wrong price or policy, book the wrong time, fail to transfer a call, or miss a message.`,
        `5.2 You control what the AI receptionist knows and does. You are responsible for your business information, knowledge content, instructions, greetings, prices, hours, services, booking rules, transfer numbers, and alert settings. You must test the Service before you rely on it and monitor it while you use it.`,
        `5.3 You are responsible for any statement, quote, promise, or booking the AI receptionist makes for your business, and for honoring or correcting it with your Callers. LobbyStack is not a party to your dealings with Callers.`,
        `5.4 The Service does not give medical, legal, financial, tax, safety, or other professional advice. Do not configure it to give such advice or to make decisions that need a qualified professional or a human review.`,
        `5.5 Some laws require you to tell people that they are speaking with an AI system. You must make those disclosures. The AI receptionist must not claim to be a human when a Caller sincerely asks.`,
      ],
    },
    {
      id: "emergencies",
      nav: "No emergencies",
      title: "6. No emergency services",
      blocks: [
        `<strong>6.1 LobbyStack is not an emergency service and does not support calls to 911, 999, 112, or any other emergency number.</strong> The Service cannot dispatch help, locate a Caller, or treat any call as urgent.`,
        `6.2 Do not use the Service, or let Callers rely on it, for emergencies, crisis lines, or life-safety situations. If your business may receive urgent calls, your greeting or instructions should tell Callers to hang up and dial their local emergency number, and you must keep a human process for those calls.`,
      ],
    },
    {
      id: "recording",
      nav: "Call recording",
      title: "7. Call recording, transcription, and Caller notices",
      blocks: [
        `7.1 The Service records and transcribes calls, stores website chat conversations, and uses AI to process what Callers say. You decide to use these features, and you are the one who deploys them to your Callers.`,
        `7.2 <strong>You alone are responsible for giving every notice and getting every consent that the law requires</strong> before a call or chat is recorded, transcribed, or processed by AI. This includes laws that require the consent of all parties to a call, such as those of California, Florida, Illinois, Maryland, Massachusetts, Pennsylvania, and Washington, as well as Canadian and Quebec privacy laws. It also includes wiretap, eavesdropping, and AI disclosure laws in every place where you or your Callers are located.`,
        `7.3 The Service does not use Callers' voices to identify them. If your use of the Service is subject to biometric privacy laws, such as the Illinois Biometric Information Privacy Act or similar laws in Texas and Washington, you are responsible for complying with them, including any notice, written consent, and retention policy they require.`,
        `7.4 You must configure your greeting or website notices so that Callers learn, before the conversation starts, that the call or chat may be recorded and handled by an AI system. A default greeting or template from LobbyStack does not move this responsibility to us. If you place our widget on your website, you are also responsible for any cookie or browser storage notice and consent your website needs, because the widget stores a random visitor identifier in the visitor's browser.`,
        `7.5 You must not use the Service to collect payment card numbers, government identification numbers, health information, or other sensitive information unless the law allows it and you have all required safeguards and consents. LobbyStack is not designed to process protected health information under HIPAA. We do not sign business associate agreements unless we agree to one in a signed writing.`,
      ],
    },
    {
      id: "telephony",
      nav: "Phone numbers",
      title: "8. Phone numbers and telephony",
      blocks: [
        `8.1 We provide phone numbers and calling through third-party carriers, currently Twilio. Starter and Pro plans include one business phone number. The Free plan includes browser calls only and no phone number.`,
        `8.2 You do not own a phone number we provide. You get the right to use it while your paid subscription is active and in good standing. Carriers, regulators, or our providers may require us to change, reclaim, or restrict a number, and we are not responsible for that.`,
        `8.3 We do not guarantee that a specific number, area code, or country is available, or that a number can be ported into or out of the Service. Where we support porting out, you must ask before your account closes and pay any carrier fees.`,
        `8.4 When your subscription ends, is downgraded to the Free plan, or is suspended for non-payment, we may release your number. A released number may be assigned to someone else. We are not liable for calls or texts that reach a number after its release.`,
        `8.5 Call quality, connection, caller ID, and transfers depend on carriers and networks we do not control. You are responsible for forwarding calls from your existing lines, for giving accurate transfer numbers, and for staffing them. Transfers can fail, and the Service does not guarantee that a transferred call will be answered.`,
      ],
    },
    {
      id: "sms",
      nav: "Text messages",
      title: "9. Text messages",
      blocks: [
        { h3: "LobbyStack SMS program" },
        `9.1 Program name: LobbyStack. LobbyStack sends non-marketing, transactional text messages for businesses that use the Service. These include alerts to a business's staff about calls, messages, and bookings; one appointment reminder sent about 24 hours before an appointment, only to Callers who agreed to receive it while booking; and one-time codes that verify a person's phone number or a Caller's identity before an appointment change. LobbyStack does not send marketing texts and does not reply to texts with AI.`,
        `9.2 Message frequency varies with your activity. Message and data rates may apply. Reply <strong>STOP</strong> to stop receiving texts and <strong>HELP</strong> for help, or contact ${support}. After you reply STOP, you may receive one confirmation text, and we will send no more texts to that number unless you opt in again. Carriers are not liable for delayed or undelivered messages.`,
        { h3: "Your responsibilities" },
        `9.3 You must only add alert recipients who are your staff or contractors and who agreed to receive alert texts. You are responsible for any text sent to a number you enter in the Service.`,
        `9.4 You are responsible for complying with the Telephone Consumer Protection Act (TCPA), Canada's Anti-Spam Legislation (CASL), CTIA guidelines, carrier rules, A2P 10DLC registration requirements, and any other law that applies to texts sent for your business. You must give us truthful information for carrier registration. Carriers may filter, delay, or block texts, and we may pause texting while a registration is pending or rejected.`,
      ],
    },
    {
      id: "acceptable-use",
      nav: "Acceptable use",
      title: "10. Acceptable use",
      blocks: [
        `10.1 You must not use the Service, or let anyone else use it, to:`,
        {
          ul: [
            `place or attempt to place unsolicited calls or texts, robocalls, or telemarketing;`,
            `send spam, phishing, or fraudulent content;`,
            `impersonate a person, business, or government agency, or mislead Callers about who they are speaking with;`,
            `break any law, including privacy, consumer protection, telemarketing, anti-spam, recording, discrimination, and intellectual property laws;`,
            `harass, threaten, or abuse anyone, or promote violence or hate;`,
            `offer or promote illegal goods or services;`,
            `handle emergencies or crisis lines, give medical, legal, or financial advice, or make decisions about credit, employment, housing, insurance, education, or access to essential services;`,
            `offer a service directed at children under 16;`,
            `upload content that you do not have the right to use or that infringes someone else's rights;`,
            `send malware, probe or test the Service's security without our written permission, or interfere with its operation;`,
            `get around usage limits, spending caps, billing, carrier registration, or security controls;`,
            `scrape the Service, run load tests against it, or access it by automated means other than our published interfaces;`,
            `resell, rent, or offer the hosted Service to third parties without a written agreement with us; or`,
            `break the usage policies of OpenAI, Twilio, or any other Third-Party Service used to provide the Service.`,
          ],
        },
        `10.2 We may investigate suspected violations. We may remove content, block numbers, disable features, or suspend accounts to stop a violation or to comply with a carrier, provider, or legal requirement. We do not have to monitor your use, and we are not responsible for content that you or your Callers submit.`,
      ],
    },
    {
      id: "third-party",
      nav: "Third parties",
      title: "11. Third-Party Services",
      blocks: [
        `11.1 The Service relies on Third-Party Services, including OpenAI for AI voice and text, Twilio for phone numbers, calls, and texts, Google Calendar when you connect it, Polar for billing, and Firecrawl when you import your website. The <a href="/privacy/">Privacy Policy</a> lists the providers that process personal information.`,
        `11.2 When you connect or use a Third-Party Service, its own terms and policies also apply to you. You are responsible for following them and for any account you hold with that provider.`,
        `11.3 We do not control Third-Party Services and are not responsible for their availability, accuracy, security, pricing, or changes. If a provider changes or stops a service we rely on, we may change or remove the related feature.`,
      ],
    },
    {
      id: "billing",
      nav: "Fees and billing",
      title: "12. Plans, fees, and billing",
      blocks: [
        `12.1 <strong>Plans.</strong> We offer a Free plan, paid Starter and Pro plans, and Enterprise plans under an Order. The <a href="/pricing/">pricing page</a>, checkout, or your Order sets out current prices, included usage, and overage rates.`,
        `12.2 <strong>Payment.</strong> Our payment processor, currently Polar, handles checkout and charges. You authorize us and Polar to charge your payment method for subscription fees, usage charges, and taxes when due. Polar's own terms apply to your purchase.`,
        `12.3 <strong>Auto-renewal.</strong> Paid plans renew automatically at the end of each monthly or annual term at the then-current price, until you cancel. You can cancel from the dashboard or by contacting support. Cancellation takes effect at the end of the current term.`,
        `12.4 <strong>Usage charges.</strong> Paid plans include set amounts of usage, such as voice minutes and alert texts. Usage beyond those amounts is billed as overage at the rates shown on the pricing page or in your Order. Our usage records, and those of our providers, control unless they contain an obvious error.`,
        `12.5 <strong>Spending caps.</strong> On Starter and Pro, you can set an overage spending cap. When you reach it, the Service stops the features that would create more overage charges until the next billing period or until you raise the cap. <strong>This means the AI receptionist may stop answering calls.</strong> A cap limits overage charges only. It does not limit subscription fees or taxes. We are not liable for calls missed because of a cap or because you used up your included usage.`,
        `12.6 <strong>Taxes.</strong> Prices exclude taxes unless stated otherwise. You pay all sales, use, goods and services, value-added, and similar taxes, except taxes on our income.`,
        `12.7 <strong>Late or failed payment.</strong> If a payment fails, we or Polar may retry it. We may suspend or downgrade your account, release your phone number, or close your account if the amount remains unpaid.`,
        `12.8 <strong>Refunds.</strong> Fees are non-refundable, including for partial terms, unused usage, downgrades, and cancellations, except where the law requires otherwise or we agree in writing.`,
        `12.9 <strong>Price changes.</strong> We may change prices and included usage. For an active paid plan, we will give you at least 30 days' notice, and the change applies from your next renewal. If you do not agree, cancel before the renewal.`,
        `12.10 <strong>Billing disputes.</strong> You must tell us about a billing dispute within 60 days of the charge. Please contact us before starting a chargeback.`,
        `12.11 <strong>Free plan.</strong> The Free plan includes limited browser call minutes and no phone number. We may change its limits, or end it, at any time. We may close free accounts that stay inactive for a long period. We offer no support commitment for the Free plan.`,
      ],
    },
    {
      id: "affiliate-program",
      nav: "Affiliate program",
      title: "13. Affiliate program",
      blocks: [
        `13.1 LobbyStack may offer an affiliate program that pays commissions for referring new customers. If you take part, this section applies in addition to the rest of these Terms.`,
        `13.2 Unless the Service states otherwise, eligible affiliates earn a 20% commission on qualifying payments made by a referred customer during the first 12 months after attribution. We track referrals through the links or codes we provide. Our records decide attribution, eligibility, and commission amounts.`,
        `13.3 Commissions have a 30-day holding period. A commission becomes payable only after the referred customer's payment clears that period without a refund, chargeback, dispute, reversal, credit, or cancellation. We may void, reduce, withhold, or reverse unpaid commissions on payments or referrals that do not qualify.`,
        `13.4 We pay affiliates through PayPal, using the PayPal email saved in the affiliate dashboard. The minimum payout is USD $100 in eligible unpaid commissions. Payout timing may vary with review, fraud checks, payment processor availability, and accurate payout details. You are responsible for your taxes, reporting, fees, currency conversion, and payment account.`,
        `13.5 You must not refer yourself, create fake accounts, make misleading claims, send spam, impersonate LobbyStack, bid on LobbyStack trademarks or similar terms in paid search, post fake reviews, abuse discounts, generate artificial traffic, or promote LobbyStack in a way that breaks the law, platform rules, or these Terms. You must clearly disclose that you may be paid when you recommend LobbyStack.`,
        `13.6 We may reject, suspend, or end your participation and withhold unpaid commissions for fraud, abuse, non-compliance, or risk. We may change, pause, or end the program, its rates, attribution rules, holding periods, payout thresholds, or payout methods at any time, subject to applicable law.`,
      ],
    },
    {
      id: "data",
      nav: "Customer Data",
      title: "14. Customer Data",
      blocks: [
        `14.1 <strong>Ownership.</strong> As between you and LobbyStack, you own Customer Data.`,
        `14.2 <strong>Our license.</strong> You grant us a worldwide, non-exclusive, royalty-free license to host, copy, process, transmit, display, and adapt Customer Data as needed to provide, secure, support, troubleshoot, and improve the Service, to prevent abuse, to comply with law, and to enforce these Terms. Our providers may exercise this license on our behalf only to help us do those things.`,
        `14.3 <strong>Your promises.</strong> You confirm that you have all rights, notices, and consents needed for us to process Customer Data under these Terms and the <a href="/privacy/">Privacy Policy</a>, and that Customer Data does not infringe anyone's rights or break any law.`,
        `14.4 <strong>Our role.</strong> For personal information about your Callers, we act as your service provider or processor. We process it on your behalf and according to your instructions, as described in the Privacy Policy. You are responsible for your own privacy notices to Callers and for answering their requests.`,
        `14.5 <strong>No model training.</strong> We do not use Customer Data to train AI models. Our AI providers process Customer Data under business terms that, as of the date of these Terms, do not allow them to train their models on it.`,
        `14.6 <strong>Staff access.</strong> Our staff access Customer Data only when needed to provide support you request, keep the Service running, investigate security issues or abuse, or comply with law.`,
        `14.7 <strong>Usage and de-identified data.</strong> We collect data about how the Service performs and how it is used, such as call counts, durations, error rates, and feature use. We may also create aggregated or de-identified data from Customer Data. We own this data and may use it to operate, bill for, secure, analyze, and improve the Service. It will not identify you, your Authorized Users, or your Callers.`,
      ],
    },
    {
      id: "retention",
      nav: "Retention",
      title: "15. Data retention, export, and deletion",
      blocks: [
        `15.1 The Service deletes recordings, transcripts, messages, and similar content automatically after the retention period for your plan. The <a href="/privacy/#retention">Privacy Policy</a> lists the current periods. Deleted content cannot be recovered.`,
        `15.2 LobbyStack is not a backup or archiving service. You are responsible for exporting and keeping any records you need, including records the law requires you to keep.`,
        `15.3 After your account closes, we may delete Customer Data without further notice. Copies may stay in backups until they expire on their normal cycle, and we may keep records we need for legal, tax, billing, security, or dispute purposes.`,
      ],
    },
    {
      id: "feedback",
      nav: "Feedback",
      title: "16. Feedback",
      blocks: [
        `If you send us ideas, suggestions, or other feedback, we may use them for any purpose without paying you or owing you anything. We will not name you publicly as the source without your permission.`,
      ],
    },
    {
      id: "open-source",
      nav: "Open source",
      title: "17. Open-source code and trademarks",
      blocks: [
        `17.1 The LobbyStack source code published in our public repository is licensed under the MIT License. That license governs your use, copying, modification, and distribution of that code. These Terms do not limit your rights under it.`,
        `17.2 The MIT License covers the code only. It gives you no rights to the hosted Service, our servers, accounts, phone numbers, provider arrangements, or data, and no right to support.`,
        `17.3 The LobbyStack name, logos, and brand are our trademarks. The MIT License does not license them. You may not use them in a way that suggests we made, endorse, or support your product or service, including a modified or hosted copy of LobbyStack, without our written permission. You may make accurate, factual references to LobbyStack.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Self-hosting",
      title: "18. Self-hosted deployments",
      blocks: [
        `18.1 If you run LobbyStack on your own infrastructure, you do so under the MIT License, not these Terms. We have no access to your deployment or its data, we do not process that data, and we are not responsible for it.`,
        `18.2 You are responsible for your servers, security, backups, updates, provider accounts, phone numbers, carrier registrations, notices, consents, and legal compliance. Your use of OpenAI, Twilio, and other providers is between you and them.`,
        `18.3 We provide no support, warranty, or service commitment for self-hosted deployments unless we agree to one in a signed writing.`,
      ],
    },
    {
      id: "ip",
      nav: "Intellectual property",
      title: "19. Intellectual property",
      blocks: [
        `19.1 Except for Customer Data and the open-source code described in section 17, LobbyStack and its licensors own all rights in the Service, our websites, documentation, designs, prompts, templates, and brand. These Terms give you only the rights they state.`,
        `19.2 You may not copy, modify, or create derivative works of the hosted Service, or reverse engineer or decompile it, except as the MIT License allows for our published code or as the law allows despite this restriction.`,
      ],
    },
    {
      id: "confidentiality",
      nav: "Confidentiality",
      title: "20. Confidentiality",
      blocks: [
        `20.1 Each party may receive non-public information from the other that is marked confidential or that a reasonable person would treat as confidential ("Confidential Information"). Customer Data is your Confidential Information. Non-public pricing, security, and product information is ours.`,
        `20.2 The receiving party will use Confidential Information only to perform under these Terms, protect it with reasonable care, and share it only with its staff, advisers, and providers who need it and are bound by similar duties.`,
        `20.3 These duties do not cover information that is or becomes public through no fault of the receiving party, that it already knew or developed on its own, or that it lawfully received from someone else. A party may disclose Confidential Information when the law requires it, after giving the other party notice where the law allows.`,
      ],
    },
    {
      id: "beta",
      nav: "Beta features",
      title: "21. Beta features",
      blocks: [
        `We may offer features labeled beta, preview, early access, or similar. You may choose to use them. They may be unreliable, change, or end without notice, and they may have extra limits. We provide them "as is," without any warranty or commitment, and we may stop offering them at any time.`,
      ],
    },
    {
      id: "availability",
      nav: "Availability",
      title: "22. Availability and support",
      blocks: [
        `22.1 We work to keep the Service available, but we do not promise that it will be uninterrupted, error-free, or available at any particular time. We have no service level agreement unless an Order includes one.`,
        `22.2 We may perform maintenance, which may interrupt the Service. Outages at carriers, AI providers, hosting providers, or other Third-Party Services may also interrupt it.`,
        `22.3 We provide support by email at ${support}. Support hours, response times, and channels depend on your plan and are not guaranteed unless an Order says otherwise.`,
      ],
    },
    {
      id: "termination",
      nav: "Termination",
      title: "23. Suspension and termination",
      blocks: [
        `23.1 You may stop using the Service and cancel your plan at any time. Fees already paid or owed remain payable.`,
        `23.2 We may suspend or limit the Service right away, with notice where practical, if you break these Terms, fail to pay, create security, legal, or carrier risk, or if a provider, carrier, or authority requires it. We will restore access once the issue is resolved, unless we terminate under section 23.3.`,
        `23.3 We may terminate these Terms or your account for any reason with 30 days' notice, or right away if you materially break these Terms. If we terminate for convenience, we will refund prepaid subscription fees for the unused part of the term.`,
        `23.4 When your account closes, your right to use the Service ends, you must pay all amounts owed, we may release your phone number, and section 15 applies to your data. Sections that by their nature should survive will survive, including sections 5, 7, 9.3, 9.4, 12, 14 to 20, and 24 to 32.`,
      ],
    },
    {
      id: "disclaimers",
      nav: "Disclaimers",
      title: "24. Disclaimers",
      blocks: [
        `<strong>24.1 To the fullest extent the law allows, the Service is provided "as is" and "as available." LobbyStack disclaims all warranties and conditions, whether express, implied, or statutory, including those of merchantability, fitness for a particular purpose, title, non-infringement, and quality.</strong>`,
        `24.2 Without limiting section 24.1, we do not guarantee that AI Output will be accurate or appropriate, that every call will be answered, handled, recorded, or transferred correctly, that texts will be delivered, that bookings will match your calendar, or that the Service will produce any business result.`,
      ],
    },
    {
      id: "liability",
      nav: "Liability",
      title: "25. Limitation of liability",
      blocks: [
        `<strong>25.1 To the fullest extent the law allows, neither LobbyStack nor its affiliates, officers, directors, employees, contractors, or suppliers will be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, business, customers, goodwill, or data, or for the cost of substitute services. This includes losses from missed, dropped, misrouted, or mishandled calls, wrong answers, wrong or missed bookings, and undelivered texts.</strong>`,
        `<strong>25.2 To the fullest extent the law allows, LobbyStack's total liability for all claims relating to these Terms or the Service is limited to the greater of (a) the amounts you paid to LobbyStack for the Service in the 12 months before the event giving rise to the claim and (b) CAD $100.</strong>`,
        `25.3 These limits apply to every type of claim, whether in contract, extra-contractual liability, tort, negligence, or any other theory, even if we were told the loss was possible and even if a remedy fails of its essential purpose.`,
        `25.4 Nothing in these Terms limits liability that the law does not allow a party to limit, such as liability for intentional or gross fault, or for bodily or moral injury caused to a person.`,
      ],
    },
    {
      id: "indemnity",
      nav: "Indemnity",
      title: "26. Indemnification",
      blocks: [
        `26.1 You will defend LobbyStack and its affiliates, officers, directors, employees, and contractors against any third-party claim, investigation, or proceeding, and pay the resulting damages, fines, penalties, settlements, and reasonable legal fees, to the extent they arise from:`,
        {
          ul: [
            `Customer Data, or your business information, instructions, and configuration;`,
            `your failure to give notices or get consents for recording, transcription, AI processing, or texts;`,
            `claims under the TCPA, CASL, wiretap, eavesdropping, biometric, privacy, or consumer protection laws relating to your use of the Service;`,
            `statements, quotes, bookings, or other dealings between you and your Callers;`,
            `your breach of these Terms or of a Third-Party Service's terms; or`,
            `your or your Authorized Users' misuse of the Service.`,
          ],
        },
        `26.2 We will tell you promptly about a claim, let you control its defense, and give reasonable help at your cost. You may not settle a claim that imposes an obligation or admission on us without our written consent. We may take part with our own counsel at our cost.`,
      ],
    },
    {
      id: "force-majeure",
      nav: "Force majeure",
      title: "27. Force majeure",
      blocks: [
        `Neither party is liable for a delay or failure caused by events beyond its reasonable control, including outages at carriers, AI providers, hosting providers, or the internet, natural disasters, epidemics, war, terrorism, labor disputes, government action, and cyberattacks. This section does not excuse payment obligations.`,
      ],
    },
    {
      id: "export",
      nav: "Export and sanctions",
      title: "28. Export controls and sanctions",
      blocks: [
        `You must comply with Canadian, United States, and other applicable export control and sanctions laws. You confirm that you are not located in, organized under the laws of, or owned or controlled by anyone in a country or region subject to comprehensive sanctions, and that you are not on any government list of restricted parties. You must not use the Service for anyone who is.`,
      ],
    },
    {
      id: "changes",
      nav: "Changes",
      title: "29. Changes to these Terms",
      blocks: [
        `29.1 We may update these Terms. We will post the new version on this page and change the date at the top.`,
        `29.2 If a change is material, we will give you at least 30 days' notice by email or in the Service before it takes effect, unless the change is needed sooner for legal, security, or carrier reasons. If you do not agree to a change, stop using the Service and cancel before it takes effect. If you keep using the Service after that date, you accept the updated Terms.`,
      ],
    },
    {
      id: "law",
      nav: "Governing law",
      title: "30. Governing law and disputes",
      blocks: [
        `30.1 These Terms are governed by the laws of the Province of Quebec and the federal laws of Canada that apply there, without regard to conflict of law rules. The United Nations Convention on Contracts for the International Sale of Goods does not apply.`,
        `30.2 Before starting a legal proceeding, a party must first contact the other in writing and try in good faith to resolve the dispute for at least 30 days. Either party may still seek urgent injunctive relief.`,
        `30.3 Subject to any rights that cannot be waived, the courts located in the Province of Quebec, Canada have exclusive jurisdiction over any dispute relating to these Terms or the Service, and each party submits to their jurisdiction.`,
        `30.4 To the fullest extent the law allows, each party may bring claims against the other only in its individual capacity, and not as a plaintiff or class member in a class action or other representative proceeding.`,
      ],
    },
    {
      id: "general",
      nav: "General",
      title: "31. General terms",
      blocks: [
        `31.1 <strong>Entire agreement.</strong> These Terms, the Privacy Policy, any Order, and the documents they refer to form the entire agreement between you and LobbyStack about the Service. They replace any earlier agreement on that subject. Terms in your purchase orders or other documents do not apply.`,
        `31.2 <strong>Assignment.</strong> You may not assign or transfer these Terms without our written consent. We may assign them to an affiliate or to a successor in a merger, acquisition, reorganization, or sale of assets.`,
        `31.3 <strong>Severability and waiver.</strong> If a court finds part of these Terms unenforceable, that part will be enforced to the extent possible and the rest will remain in effect. Not enforcing a right is not a waiver of it.`,
        `31.4 <strong>Relationship.</strong> The parties are independent contractors. These Terms create no partnership, joint venture, employment, or agency relationship, and no third-party beneficiaries.`,
        `31.5 <strong>Notices.</strong> We may send notices to the email address on your account or through the Service. You must send legal notices to ${support}. Notices by email take effect when sent.`,
        `31.6 <strong>Language.</strong> We publish these Terms in English and in French at <a href="/fr/terms/">lobbystack.com/fr/terms/</a>. Both versions have the same value.`,
        `31.7 <strong>Interpretation.</strong> Headings are for convenience only. "Including" means "including without limitation."`,
      ],
    },
    {
      id: "contact",
      nav: "Contact",
      title: "32. Contact",
      blocks: [
        `Send questions about these Terms to Lobbystack Inc. at ${support}.`,
      ],
    },
  ],
}
