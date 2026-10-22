import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const privacyEn: LegalDocument = {
  updated: "Last updated: October 8, 2026",
  h1: "Privacy Policy",
  intro: `This Privacy Policy explains how Lobbystack Inc. ("LobbyStack," "we," "our," or "us") collects, uses, shares, and protects personal information when you visit our websites, use the hosted LobbyStack service, call or chat with a business that uses LobbyStack, receive a text sent through LobbyStack, or contact us.`,
  sections: [
    {
      id: "scope",
      nav: "Scope",
      title: "1. Who we are and what this Policy covers",
      blocks: [
        `1.1 LobbyStack is an AI receptionist for small businesses. Businesses use it to answer phone calls and browser calls, chat with website visitors, book appointments, take messages, and transfer calls to their staff. We are based in Canada.`,
        `1.2 This Policy covers our websites, including lobbystack.com, the hosted LobbyStack service (the "Service"), our support, and our affiliate program.`,
        `1.3 This Policy does not cover copies of LobbyStack that other people run on their own servers. See section 20.`,
      ],
    },
    {
      id: "roles",
      nav: "Our role",
      title: "2. Our role",
      blocks: [
        `2.1 <strong>When we decide how data is used.</strong> We are responsible, as a controller or business, for personal information about our website visitors, account holders, Authorized Users of customer accounts, billing contacts, affiliates, and people who contact us.`,
        `2.2 <strong>When a business decides how data is used.</strong> When a business uses LobbyStack to talk with its callers, website visitors, or customers ("Callers"), that business decides why and how their information is processed. We act as its service provider or processor and handle Callers' information on its behalf, under our <a href="/terms/">Terms of Service</a>. That business's own privacy notice applies. If you are a Caller, see section 18.`,
      ],
    },
    {
      id: "collect",
      nav: "What we collect",
      title: "3. Information we collect",
      blocks: [
        { h3: "3.1 Account and business information" },
        `Names, email addresses, phone numbers, business names and addresses, roles, passwords (stored as hashes), login and security records, account settings, and the Authorized Users you invite. When you verify a phone number during setup, we record the number and the verification result.`,
        { h3: "3.2 Business knowledge and configuration" },
        `Information you give the AI receptionist so it can serve your Callers: services, prices, hours, locations, policies, FAQs, documents, greetings, instructions, booking rules, transfer numbers, alert recipients, and content imported from your website.`,
        { h3: "3.3 Caller and conversation information" },
        {
          ul: [
            `phone numbers, caller ID, and call details such as time, duration, outcome, and transfer destination;`,
            `call audio and call recordings;`,
            `transcripts of calls and AI-generated summaries;`,
            `website chat messages and browser call sessions, with a random visitor identifier;`,
            `messages Callers leave, and the names and contact details they give;`,
            `appointment details, such as the service, date, time, and changes or cancellations;`,
            `verification records used to confirm a Caller's identity before an appointment change;`,
            `text message records, such as reminder consent, opt-out status, message content, and delivery status.`,
          ],
        },
        { h3: "3.4 Billing information" },
        `Plan, billing interval, usage, invoices, tax details, payment status, and spending cap settings. Our payment processor, Polar, collects payment card details directly. We do not receive or store full card numbers.`,
        { h3: "3.5 Website, device, and usage information" },
        `IP address, browser and device type, pages viewed, referring pages, clicks, approximate location derived from IP address, error logs, and how you use the dashboard. With your consent, we also collect session recordings of our website, with form inputs masked. See section 10 and our <a href="/cookie-policy/">Cookie Policy</a>.`,
        { h3: "3.6 Communications and support" },
        `Emails, support requests, feedback, and survey answers you send us.`,
        { h3: "3.7 Affiliate and referral information" },
        `Referral codes, click times, referring pages, signup attribution, commission records, and the PayPal email used for payouts.`,
        { h3: "3.8 Sources" },
        `We collect information directly from you, from Callers through a business's use of the Service, from your connected Google Calendar, from your website when you import it, from our providers (for example, payment status from Polar and call status from Twilio), and automatically from your device.`,
      ],
    },
    {
      id: "use",
      nav: "How we use it",
      title: "4. How we use information",
      blocks: [
        `We use personal information to:`,
        {
          ul: [
            `provide the Service, including answering calls and chats, booking appointments, taking messages, transferring calls, recording and transcribing calls, and sending alerts and reminders;`,
            `create and manage accounts, verify identities, and authenticate users;`,
            `bill for plans and usage, enforce spending caps, and handle taxes;`,
            `provide support and answer requests;`,
            `send service, security, billing, and administrative messages;`,
            `monitor, troubleshoot, and improve the Service's quality and reliability;`,
            `detect and prevent fraud, spam, abuse, and security incidents;`,
            `run the affiliate program;`,
            `understand how people use our website and product, with consent where the law requires it;`,
            `comply with law, carrier rules, and legal requests, and enforce our Terms.`,
          ],
        },
        `We process Callers' information only to provide the Service to the business that uses it, and for security, abuse prevention, billing, and legal compliance.`,
      ],
    },
    {
      id: "legal-bases",
      nav: "Legal bases",
      title: "5. Legal bases for processing",
      blocks: [
        `Where the EU or UK General Data Protection Regulation applies, we rely on these legal bases for the processing we control:`,
        {
          ul: [
            `<strong>Contract:</strong> to provide the Service, manage accounts, bill, and give support;`,
            `<strong>Legitimate interests:</strong> to secure and improve the Service, prevent abuse, run basic website analytics, and communicate with business contacts, where those interests are not overridden by your rights;`,
            `<strong>Consent:</strong> for optional analytics cookies and session recordings, which you can withdraw at any time;`,
            `<strong>Legal obligation:</strong> to keep tax and accounting records and answer lawful requests.`,
          ],
        },
        `For Callers' information, the business that uses LobbyStack is responsible for choosing and documenting its legal basis.`,
      ],
    },
    {
      id: "ai",
      nav: "AI processing",
      title: "6. AI processing",
      blocks: [
        `6.1 The Service handles phone calls and browser calls with OpenAI's GPT-Live voice model. Call audio goes to OpenAI in real time so the model can listen and reply. OpenAI stores a recording of each call, and we copy it to our own storage, where our copy follows the retention periods in section 12. OpenAI keeps its copy for 30 days under its own policies. We cannot delete OpenAI's copy sooner, even after you delete the call or our retention period ends.`,
        `6.2 Website chat, business knowledge search, and other text features use OpenAI models. We create embeddings of your business knowledge so the AI receptionist can find relevant answers.`,
        `6.3 We send AI providers only the information needed for the task, such as the conversation, your business knowledge and instructions, and whether an appointment slot is free.`,
        `6.4 We do not use personal information or Customer Data to train AI models. OpenAI processes this data under its business API terms, which, as of the date of this Policy, do not allow it to train its models on that data. OpenAI may keep API data for a limited time under its own policies, for example to detect abuse.`,
        `6.5 The AI receptionist makes some decisions on its own during a conversation, such as whether a time is available, whether a Caller passed verification for an appointment change, or when to transfer a call. These decisions follow the business's settings. A Caller who disagrees with one can contact the business and ask for a person to review it.`,
      ],
    },
    {
      id: "google-oauth-calendar",
      nav: "Google Calendar",
      title: "7. Google Calendar integration",
      blocks: [
        `7.1 When you connect a Google account in LobbyStack, we use Google OAuth to manage bookings on the calendar you select. We request these permissions:`,
        {
          ul: [
            `<strong>openid</strong> and <strong>email</strong>, to identify the connected Google account;`,
            `<strong>calendar.calendarlist.readonly</strong>, to list your calendars so you can pick the one LobbyStack should use;`,
            `<strong>calendar.events</strong>, to read events on the selected calendar to find busy times, and to create, update, and delete the appointment events that LobbyStack books, reschedules, or cancels.`,
          ],
        },
        `7.2 <strong>Data we access.</strong> Your Google account identifier and email address, the list of your calendars, and event times on the selected calendar.`,
        `7.3 <strong>Storage and protection.</strong> We store the OAuth tokens needed to keep the connection working. We encrypt them at rest. When you disconnect Google Calendar, we stop syncing, delete the stored tokens, and delete the busy times we copied from your calendar. Appointment events we already created stay on your Google Calendar; you can delete them there.`,
        `7.4 <strong>Sharing.</strong> We share Google user data only with the Google Calendar API to complete the actions you asked for, and with our hosting providers that store it for us.`,
        `7.5 <strong>AI processing.</strong> We do not send the titles or descriptions of your Google Calendar events to AI providers. The AI receptionist receives only derived scheduling facts, such as whether a time is free and whether a booking succeeded.`,
        `7.6 <strong>Limited Use.</strong> LobbyStack's use and transfer of information received from Google APIs follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements. We do not sell Google user data, use it for advertising, or use it to train or improve general AI or machine learning models.`,
      ],
    },
    {
      id: "sms",
      nav: "Text messages",
      title: "8. Text messages",
      blocks: [
        `8.1 LobbyStack sends non-marketing texts through Twilio: alerts to a business's staff, one appointment reminder about 24 hours before an appointment to Callers who agreed during booking, and one-time verification codes. Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for help, or contact ${support}.`,
        `8.2 We keep records of phone numbers, consent, opt-outs, message content, and delivery status to send texts, honor opt-outs, and meet carrier requirements.`,
        `<strong>8.3 We do not sell, rent, or share mobile phone numbers, text message opt-in data, or consent information with third parties or affiliates for their marketing or promotional purposes.</strong>`,
      ],
    },
    {
      id: "share",
      nav: "Sharing",
      title: "9. How we share information",
      blocks: [
        `9.1 <strong>Service providers.</strong> We use these providers (subprocessors) to run the Service. Each may process personal information only to provide its service to us.`,
        {
          ul: [
            `<strong>OpenAI:</strong> AI voice conversations, chat replies, summaries, embeddings, and storage of call recordings for 30 days;`,
            `<strong>Twilio:</strong> phone numbers, call routing and transfers, and text messages;`,
            `<strong>Railway:</strong> application hosting, databases, and file storage, including recordings;`,
            `<strong>Cloudflare:</strong> website hosting, content delivery, security, and bot protection at signup;`,
            `<strong>PostHog:</strong> website and product analytics and, with consent, website session recordings;`,
            `<strong>Polar:</strong> checkout, subscriptions, usage billing, and payment processing;`,
            `<strong>Google:</strong> calendar access, only when you connect Google Calendar;`,
            `<strong>Firecrawl:</strong> reading your public website, only when you import it into your business knowledge;`,
            `<strong>Resend:</strong> account and notification emails;`,
            `<strong>PayPal:</strong> affiliate payouts;`,
            `monitoring and logging providers that help us detect errors and keep the Service running.`,
          ],
        },
        `9.2 <strong>The business you contact.</strong> When you call or chat with a business that uses LobbyStack, we make your information available to that business in its dashboard, alerts, and connected calendar.`,
        `9.3 <strong>Legal and safety reasons.</strong> We may disclose information to comply with law, a court order, or a lawful request from authorities, to enforce our Terms, or to protect the rights, property, or safety of LobbyStack, our customers, or others.`,
        `9.4 <strong>Business transfers.</strong> We may share information with a buyer, investor, or successor in a merger, acquisition, financing, reorganization, or sale of assets, under confidentiality terms. We will tell you if your information becomes subject to a different privacy policy.`,
        `9.5 <strong>With your consent.</strong> We may share information for other purposes when you ask us to or agree.`,
        `9.6 <strong>No sale.</strong> We do not sell personal information, and we do not share it for cross-context behavioral advertising.`,
      ],
    },
    {
      id: "cookies",
      nav: "Cookies",
      title: "10. Cookies and analytics",
      blocks: [
        `10.1 We use necessary cookies and browser storage to run our website, remember your cookie choice, and protect against abuse. We use PostHog analytics cookies and session recordings only after you accept them in our cookie banner. Before you choose, we count page views without storing anything on your device. If you reject optional cookies, we stop analytics on our website.`,
        `10.2 You can change your choice at any time with the <strong>Cookie preferences</strong> link in the footer. Our <a href="/cookie-policy/">Cookie Policy</a> lists the cookies we use.`,
        `10.3 The LobbyStack dashboard uses PostHog to understand how signed-in users use the product, only while product analytics is turned on in your settings. It does not collect analytics on pages marked sensitive.`,
      ],
    },
    {
      id: "transfers",
      nav: "Transfers",
      title: "11. International transfers",
      blocks: [
        `11.1 We are based in Canada. We and our providers process personal information in Canada, the United States, and other countries where our providers operate. These countries may have different privacy laws from where you live, and authorities there may be able to access the information under their laws.`,
        `11.2 Before we send personal information outside Quebec or Canada, we assess the risks and use contracts and other safeguards to protect it. Where the GDPR applies, we rely on adequacy decisions or on standard contractual clauses approved by the European Commission or the UK.`,
      ],
    },
    {
      id: "retention",
      nav: "Retention",
      title: "12. Retention",
      blocks: [
        `12.1 By default, the hosted Service deletes Caller content automatically after these periods:`,
        {
          ul: [
            `<strong>Free plan:</strong> recordings, transcripts, messages, and follow-up items after 30 days;`,
            `<strong>Starter and Pro plans:</strong> recordings and transcripts after 90 days, and messages and follow-up items after 365 days;`,
            `<strong>Enterprise plans:</strong> the same periods as Starter and Pro, unless an Order sets different ones.`,
          ],
        },
        `12.2 A business can delete some records sooner, such as contacts, from its dashboard, and can ask us to delete other content.`,
        `12.3 We keep account information while the account is open. After it closes, we delete or de-identify it, except for records we must keep for legal, tax, accounting, security, or dispute purposes, which we keep only as long as needed for those purposes.`,
        `12.4 Deleted data may remain in backups until the backups expire on their normal cycle. We do not restore it to active use.`,
        `12.5 OpenAI and our other providers may keep data for limited periods under their own policies. For example, OpenAI keeps call recordings for 30 days (see section 6.1).`,
      ],
    },
    {
      id: "security",
      nav: "Security",
      title: "13. Security",
      blocks: [
        `13.1 We use administrative, technical, and physical safeguards to protect personal information. They include encryption in transit, encryption at rest for sensitive credentials such as calendar tokens, database access rules that keep each business's data separate, role-based access, restricted staff access, and logging.`,
        `13.2 No system is completely secure, and we cannot guarantee the security of information. You are responsible for keeping your password safe and managing who can access your account.`,
        `13.3 If a security incident creates a risk of serious harm to you, we will notify you and the relevant authorities as the law requires. When the incident involves Callers' information, we will notify the affected business so it can meet its own obligations.`,
      ],
    },
    {
      id: "rights",
      nav: "Your rights",
      title: "14. Your privacy rights",
      blocks: [
        `14.1 Depending on where you live, you may have the right to:`,
        {
          ul: [
            `know what personal information we hold about you and get a copy;`,
            `correct inaccurate information;`,
            `delete your information;`,
            `receive your information in a portable format;`,
            `object to or restrict some processing;`,
            `withdraw consent, without affecting processing done before;`,
            `file a complaint with a privacy regulator.`,
          ],
        },
        `14.2 To make a request, email ${support}. We will verify your identity before we act, and we may ask for more information to do so. You may use an authorized agent where the law allows, and we may ask for proof of the agent's authority.`,
        `14.3 We will answer within the time the law requires, usually 30 days. If we deny your request, we will explain why and tell you how to appeal or complain.`,
        `14.4 If your request is about information we process for a business, we will send it to that business or ask you to contact it. See section 18.`,
      ],
    },
    {
      id: "canada",
      nav: "Canada and Quebec",
      title: "15. Canada and Quebec",
      blocks: [
        `15.1 We handle personal information under the Personal Information Protection and Electronic Documents Act (PIPEDA) and Quebec's Act respecting the protection of personal information in the private sector, as amended by Law 25.`,
        `15.2 Our person in charge of the protection of personal information is Raphaël Morency, the person with the highest authority at Lobbystack Inc. You can reach him at ${support} or by mail at 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canada.`,
        `15.3 You may ask to access or correct your information, withdraw consent, or, in Quebec, ask for your computerized information in a structured, commonly used technological format. If the AI receptionist makes a decision about you based only on automated processing, you may ask the business to tell you what information was used and to have a person review the decision.`,
        `15.4 If you are not satisfied with our answer, you may contact the Commission d'accès à l'information du Québec or the Office of the Privacy Commissioner of Canada.`,
      ],
    },
    {
      id: "gdpr",
      nav: "EU and UK",
      title: "16. European Economic Area and United Kingdom",
      blocks: [
        `16.1 If the GDPR or UK GDPR applies to you, you have the rights listed in section 14, and you may complain to the data protection authority where you live or work, or where you believe a breach happened.`,
        `16.2 Our legal bases are listed in section 5, and our transfer safeguards in section 11.`,
      ],
    },
    {
      id: "us-states",
      nav: "US state rights",
      title: "17. United States state privacy rights",
      blocks: [
        `17.1 If the California Consumer Privacy Act, as amended by the CPRA, or a similar US state law applies to us and to you, this section applies.`,
        `17.2 In the past 12 months we collected these categories of personal information: identifiers (such as name, email, phone number, and IP address); customer records (such as billing details); commercial information (such as plans and purchases); internet and network activity; approximate geolocation; audio and electronic information (such as call recordings and chat messages); professional information (such as business name and role); and inferences drawn from product usage. Section 3 describes these in detail and section 3.8 lists their sources.`,
        `17.3 We use these categories for the business purposes in section 4, and we disclose them to the service providers in section 9.1 for those purposes. We keep them for the periods in section 12.`,
        `17.4 We do not sell or share personal information for cross-context behavioral advertising, and we have not done so in the past 12 months. We have no actual knowledge of selling or sharing information of anyone under 16.`,
        `17.5 We use sensitive personal information, such as account login credentials, only for purposes the law allows, such as providing the Service and keeping it secure. We do not use it to infer characteristics about you.`,
        `17.6 You may ask to know, access, correct, or delete your personal information. We will not discriminate against you for using your rights.`,
      ],
    },
    {
      id: "callers",
      nav: "Callers",
      title: "18. If you called or chatted with a business",
      blocks: [
        `18.1 If you called, chatted with, or received a text from a business that uses LobbyStack, that business controls your information. Please send access, correction, deletion, and other privacy requests to that business first.`,
        `18.2 If you contact us instead, we will send your request to the business or tell you how to reach it, and we will help the business respond. We cannot act on your request without the business's instructions, except where the law requires us to.`,
        `18.3 To stop reminder texts or verification codes, reply <strong>STOP</strong> to any message.`,
      ],
    },
    {
      id: "children",
      nav: "Children",
      title: "19. Children",
      blocks: [
        `The Service is for businesses and is not directed to children. We do not knowingly collect personal information from children under 16 through our website or account signup. Our Terms prohibit businesses from using the Service for services directed at children. If you think a child has given us personal information, contact us and we will delete it.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Self-hosting",
      title: "20. Self-hosted LobbyStack",
      blocks: [
        `LobbyStack's source code is open source. When an organization runs LobbyStack on its own servers, we do not receive, access, or process any data from that deployment. The organization that runs it is responsible for its privacy practices. Contact that organization with any questions.`,
      ],
    },
    {
      id: "changes",
      nav: "Changes",
      title: "21. Changes to this Policy",
      blocks: [
        `We may update this Policy. We will post the new version on this page and change the date at the top. If a change is material, we will notify account holders by email or in the Service before it takes effect, and we will ask for consent where the law requires it.`,
      ],
    },
    {
      id: "contact",
      nav: "Contact",
      title: "22. Contact us",
      blocks: [
        `Send questions, requests, or complaints about this Policy to Lobbystack Inc. at ${support}. You can also write to us at 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canada. Our <a href="/terms/">Terms of Service</a> also govern your use of the Service.`,
      ],
    },
  ],
}
