import type { InterfaceLocale } from "./locales";

// Ready-made prompts people paste into an AI assistant to set up LobbyStack.
// This file is their only source. Each one stays in English, so assistants get
// the same instructions on every page and in every language. Only the title and
// description on the button's card are translated.
//
// The Help Center's snippets come from here: run pnpm docs:setup-prompts after a
// change. Mintlify parses a prompt as Markdown and copies what it prints back, so
// each prompt uses the form that survives unchanged: * bullets, a blank line
// before a list, URLs in inline code, and no brackets or braces outside it.
// setupPrompts.test.ts checks these.

export const setupPromptIds = ["no-code", "saas", "white-label", "partner", "self-host"] as const;

export type SetupPromptId = (typeof setupPromptIds)[number];

const docs = (...paths: string[]) => paths.map((path) => `* \`https://docs.lobbystack.com/${path}\``);

const openApiSpec = "* `https://app.lobbystack.com/api/v1/openapi.json`";

const sourceOfTruth = "Treat the OpenAPI spec as the source of truth. If a page and the spec disagree, follow the spec. Don't use an endpoint or field that isn't in it.";

const keepKeysOnTheServer = "Keep keys on the server. Read them from an environment variable or a secrets manager, and never put one in browser code, a mobile app, a commit, a log or this chat.";

const apiConnection = [
  "* Base URL: `https://app.lobbystack.com/api/v1`",
  "* Send `Authorization: Bearer $LOBBYSTACK_API_KEY` with an `lsp_` platform key.",
  "* Send the `LobbyStack-Business` header on per-business requests. Requests under `/partner` don't take it.",
  `* ${keepKeysOnTheServer}`,
];

const apiLimits = [
  "* The API can't send texts, and no webhook reports incoming texts. The AI doesn't reply to texts.",
  "* `GET /messages` returns only the messages the receptionist took for the team. It isn't a text inbox.",
  "* Hosted plans use Twilio numbers.",
  "* Website chat isn't part of the hosted plans, so `POST /widget-keys` returns `403` there.",
  "* LobbyStack has no voice cloning. Pick one of GPT-Live's voices with `voice` on `PATCH /receptionist`.",
];

const prompts: Record<SetupPromptId, string[]> = {
  "no-code": [
    "Set up an AI receptionist on LobbyStack for a business, so it answers the phone. I don't code, so do everything you can yourself. Explain only what I have to do, such as signing in or paying, one step at a time and in plain words.",
    "",
    "Read these first:",
    "",
    ...docs("quickstart", "agent/ai-settings/overview", "ai/mcp", "billing/plans"),
    openApiSpec,
    "",
    sourceOfTruth,
    "",
    "Start here:",
    "",
    "1. Ask me for the business's name, website, opening hours, main services, callers' language and the phone number that should take urgent calls. Read the website first and ask only for what's missing.",
    "2. Ask whether the business is mine or someone else's. If it's someone else's, ask whether they'll sign up themselves, or I'll set it up and add them from Settings > Team.",
    "3. Reply with a short plan: what you'll do, what I'll do and what it costs. Wait for my OK.",
    "",
    "Then:",
    "",
    "1. Guide me through signing up at `https://app.lobbystack.com/signup` and finishing the onboarding steps. Write the greeting and the business details for me to paste. Only I can create the account, verify my mobile and pay.",
    "2. Connect to the business. If you can add MCP servers, add `https://app.lobbystack.com/api/mcp`, and I'll sign in and pick the business. It lets you read calls, change opening hours and add knowledge.",
    "3. For the greeting, services and rules, use the API with a key I create under Settings > API keys, if you can send web requests. Have me save the key where you can read it, such as an environment variable. I won't paste it into this chat, and it never goes into a website.",
    "4. If you can't do a step, tell me exactly where to click in the dashboard.",
    "",
    "Treat this as a test business until I approve it. Stay on the free trial and have me run a browser test call. Fix what I don't like. Don't forward the real phone line, buy a plan or buy a number until I say so.",
    "",
    "If I want the business's own logo and colors, that's white label. Read `https://docs.lobbystack.com/white-label/overview` and `https://docs.lobbystack.com/white-label/branding`, and I'll sign up at `https://app.lobbystack.com/partner/signup` instead. The logo shows on the sign-in page, the dashboard and emails. Callers never see it.",
    "",
    "Tell me about these limits before I count on them:",
    "",
    "* The receptionist doesn't reply to text messages.",
    "* It can't copy someone's voice. I pick one of the voices in AI settings.",
    "* Website chat isn't part of the hosted plans.",
  ],
  saas: [
    "Add an AI receptionist to our product using LobbyStack as the backend. Our customers should stay in our UI and never need to open LobbyStack.",
    "",
    "Read these first:",
    "",
    ...docs("api/overview", "api/authentication", "api/webhooks", "white-label/api-keys"),
    openApiSpec,
    "",
    sourceOfTruth,
    "",
    "Connect:",
    "",
    ...apiConnection,
    "",
    "Build:",
    "",
    "1. A typed server client for the API, generated from the spec or checked against it.",
    "2. One LobbyStack business per customer. Call `POST /businesses` with an `Idempotency-Key`, and save the returned ID with the customer. Leave out `owner_email`, so nobody gets an invitation.",
    "3. A settings page for greeting, hours, services and knowledge, using `PATCH /receptionist`, `PATCH /business`, `/services`, `/knowledge` and `/knowledge/sources`.",
    "4. Pages for calls, transcripts, messages taken, contacts and appointments.",
    "5. A `transfer_number` for each business, set with `PATCH /receptionist`. Without one, LobbyStack refuses the calls the receptionist can't take. Finish onboarding with `POST /onboarding/complete`, and send `skip_number: true` if the business has no number.",
    "6. Phone numbers, if our customers need them: `POST /phone-numbers/search`, then `POST /phone-numbers/claims` with an `Idempotency-Key`, then poll `GET /phone-numbers/claims/{claim_id}` until it's `claimed` or `failed`. This needs a paid tier and a key with `phone_numbers:manage` and `phone_numbers:purchase`. Ask before you buy one.",
    "7. A verified, duplicate-safe webhook endpoint for `call.completed`, `appointment.booked`, `appointment.rescheduled`, `appointment.cancelled`, `message.taken` and `contact.created`. Subscribe each business with `POST /webhooks` and store its secret. Verify the signature against the raw body, skip a `webhook-id` you've already processed, and answer `2xx` within 10 seconds.",
    "",
    "Limits:",
    "",
    ...apiLimits,
    "",
    "Start with a test business, and run the whole flow on it before you touch real customers. `DELETE /partner/businesses/{business_id}` removes it afterwards and needs `partner.businesses:write`. Ask me first.",
    "",
    "Only I can sign up as a partner at `https://app.lobbystack.com/partner/signup`, make the platform key on the partner console's API keys page, and pay for a tier.",
    "",
    "Before you change any code, reply with a short plan: what you'll build, which access the key needs, what I have to do and what will cost money. Wait for my OK.",
  ],
  "white-label": [
    "Set up a white-label AI receptionist on LobbyStack with our name, logo and colors. Do everything you can yourself, and ask me only for what you can't do, such as signing up, adding DNS records or paying.",
    "",
    "Read these first:",
    "",
    ...docs("white-label/overview", "white-label/sign-up", "white-label/branding", "white-label/api-keys", "api/authentication"),
    openApiSpec,
    "",
    sourceOfTruth,
    "",
    "Connect:",
    "",
    "* I sign up at `https://app.lobbystack.com/partner/signup`, then make a platform key on the partner console's API keys page. Tell me which access to turn on.",
    ...apiConnection,
    "* If you can't send web requests, connect to `https://app.lobbystack.com/api/mcp` as the partner. `https://docs.lobbystack.com/white-label/mcp-for-agencies` lists what that connection can do. Tell me which steps then stay for me in the console.",
    "",
    "Do this:",
    "",
    "1. Ask me for our name, logo, favicon, brand color, support email, and our terms, privacy and support links.",
    "2. Set them with `PATCH /partner/brand`. Send the logo and favicon in base64: PNG, JPEG, WebP or SVG, up to 256 KB each. Then give me our dashboard address to check.",
    "3. Start with a test business. Create it with `POST /businesses` and an `Idempotency-Key`, and leave out `owner_email`. Set its greeting, hours, services and knowledge, then finish onboarding with `POST /onboarding/complete`.",
    "4. Have me open it from the partner console's Businesses page and run a browser test call.",
    "5. If we want our own domain, check that we're on a paid tier, call `POST /partner/domain` with a subdomain such as `app.example.com`, and give me the DNS records to add. Check `GET /partner/domain` until the domain is live.",
    "",
    "Facts to plan around:",
    "",
    "* A partner has one brand, and all its businesses share it. A business that needs its own logo needs its own partner.",
    "* Callers hear the business's name. They never see the logo.",
    "* LobbyStack's name still appears in a few places, listed in the white label overview. Tell me about them.",
    "* A key can buy numbers only on a paid tier, with `phone_numbers:manage` and `phone_numbers:purchase`. Ask before you buy one.",
    ...apiLimits,
    "",
    "Before you do anything, reply with a short plan: what you'll do, which access the key needs, what I have to do and what will cost money. Wait for my OK.",
  ],
  partner: [
    "Set us up to sell an AI receptionist to the businesses we serve, under our own brand, with LobbyStack's white label. We set our own prices, and those businesses pay us. Do everything you can yourself, and ask me only for what you can't do.",
    "",
    "Read these first:",
    "",
    ...docs("white-label/overview", "white-label/sign-up", "white-label/branding", "white-label/tiers", "white-label/packages", "white-label/templates", "white-label/demos", "white-label/businesses", "white-label/api-keys", "api/authentication"),
    openApiSpec,
    "",
    sourceOfTruth,
    "",
    "Connect:",
    "",
    "* I sign up at `https://app.lobbystack.com/partner/signup`, then make a platform key on the partner console's API keys page. Tell me which access to turn on. Only an owner can give a key billing access.",
    ...apiConnection,
    "* If you can't send web requests, connect to `https://app.lobbystack.com/api/mcp` as the partner. `https://docs.lobbystack.com/white-label/mcp-for-agencies` lists its tools.",
    "",
    "Do this:",
    "",
    "1. Set our name, logo, color and links with `PATCH /partner/brand`.",
    "2. Start with a test business. Create it with `POST /businesses` and an `Idempotency-Key`, leave out `owner_email`, and set it up the way we'd set up a typical business. Have me open it from the console and run a browser test call.",
    "3. Save that setup as a template with `POST /partner/templates`.",
    "4. Compare the tiers with me against the number of businesses we expect. If we choose a paid one, start `POST /partner/billing/checkout` and I'll pay.",
    "5. Get a link from `POST /partner/stripe/onboarding-link`, and I'll connect our Stripe account.",
    "6. Ask me for our prices, then create packages with `POST /partner/packages`.",
    "7. Make a demo for a prospect: `POST /partner/demos`, poll `GET /partner/demos/{demo_id}` until it's ready, then `POST /partner/demos/{demo_id}/publish`.",
    "8. Set up the first real business with `POST /businesses`, sending `owner_email`, `template_id`, `package_id` and `access_level`. This emails the owner, so confirm the details with me first.",
    "",
    "Facts to plan around:",
    "",
    "* A partner has one brand, and all its businesses share it.",
    "* A package needs an owner, because the checkout opens from their invitation. A business created without `owner_email` can't get one later.",
    "* A key acts as an admin, so inviting an owner to our own team stays with me in the console.",
    "* A key can buy numbers only on a paid tier, with `phone_numbers:manage` and `phone_numbers:purchase`. Ask before you buy one.",
    ...apiLimits,
    "",
    "Before you do anything, reply with a short plan: what you'll do, which access the key needs, what I have to do and what will cost money. Wait for my OK.",
  ],
  "self-host": [
    "Deploy LobbyStack, the open-source AI receptionist, on our own infrastructure, and get it to a working browser test call.",
    "",
    "Read these first:",
    "",
    ...docs("self-hosting/overview", "self-hosting/docker-compose", "self-hosting/environment-variables", "self-hosting/providers"),
    "* `https://github.com/lobbystack/lobbystack`",
    "* `https://app.lobbystack.com/api/v1/openapi.json`, which your deployment also serves at `/api/v1/openapi.json`",
    "",
    "Treat the OpenAPI spec your deployment serves as the source of truth for its API. Don't use an endpoint, field or setting that the docs and the spec don't list.",
    "",
    "Start by asking me:",
    "",
    "1. Railway template or Docker Compose on one server?",
    "2. Which domain will the dashboard use?",
    "3. Which of these accounts do we already have: OpenAI, Twilio or Telnyx, and an SMTP email provider?",
    "",
    "Then reply with a short plan: what you'll run, what I have to do and what it will cost. Wait for my OK.",
    "",
    "Do this:",
    "",
    "1. On Railway, use `https://railway.com/deploy/lobbystack`. With Docker Compose, clone the repository, run `node scripts/generate-env.mjs`, set `APP_BASE_URL`, `OPENAI_API_KEY` and our Twilio credentials in `.env`, then run `docker compose --env-file .env up -d --build`.",
    "2. Keep every secret in `.env` or the platform's variables. Never commit one, paste one into this chat or put one in browser code. Don't expose a stack that still has example passwords or `change-me` secrets.",
    "3. Serve the dashboard over HTTPS, as the docs describe for the path we chose.",
    "4. With Docker Compose, check `curl -fsS http://127.0.0.1:3000/api/health/ready` and `curl -fsS http://127.0.0.1:3002/health/ready`.",
    "5. Set up email, because verification codes, password resets and invitations need it.",
    "6. Start with a test business. Have me create an account on the dashboard, set up the business and run a browser test call.",
    "7. Then set up phone calls: the OpenAI webhook, `OPENAI_WEBHOOK_SECRET`, and a Twilio Elastic SIP trunk with `TWILIO_SIP_TRUNK_SID`. Make one real test call before we move any real number.",
    "8. Go through the production checklist in the Docker Compose guide, including off-host backups and a restore drill.",
    "",
    "Only I can create provider accounts, pay them, and add DNS records. Tell me exactly what you need from each one.",
  ],
};

export const setupPrompts = Object.fromEntries(setupPromptIds.map((id) => [id, prompts[id].join("\n")])) as Record<SetupPromptId, string>;

type SetupPromptCopy = { title: string; description: string };

/** The title and description on each prompt's card. Not the prompt itself, which stays in English. */
export const setupPromptCopy: Record<InterfaceLocale, Record<SetupPromptId, SetupPromptCopy>> = {
  en: {
    "no-code": { title: "No coding", description: "Your assistant sets up a receptionist for your business or a friend's, and tells you when it needs you." },
    saas: { title: "Add it to your product", description: "Build an AI receptionist into your SaaS through the API. Your customers stay in your UI." },
    "white-label": { title: "Your logo and colors", description: "Your assistant sets up a white-label receptionist under your brand." },
    partner: { title: "Sell it under your brand", description: "Your assistant sets up demos, packages and your first business, and you keep what they pay." },
    "self-host": { title: "Run it yourself", description: "Your assistant deploys LobbyStack on your servers and gets it to a test call." },
  },
  fr: {
    "no-code": { title: "Sans coder", description: "Votre assistant configure une réceptionniste pour votre entreprise ou celle d'un ami, et vous dit quand il a besoin de vous." },
    saas: { title: "Ajoutez-la à votre produit", description: "Intégrez une réceptionniste IA à votre SaaS avec l'API. Vos clients restent dans votre interface." },
    "white-label": { title: "Votre logo et vos couleurs", description: "Votre assistant configure une réceptionniste en marque blanche à votre image." },
    partner: { title: "Vendez-la sous votre marque", description: "Votre assistant prépare les démos, les formules et votre première entreprise, et vous gardez ce qu'elles paient." },
    "self-host": { title: "Hébergez-la vous-même", description: "Votre assistant déploie LobbyStack sur vos serveurs, jusqu'à un appel test." },
  },
  es: {
    "no-code": { title: "Sin programar", description: "Su asistente configura una recepcionista para su negocio o el de un amigo, y le avisa cuando lo necesita." },
    saas: { title: "Agréguela a su producto", description: "Integre una recepcionista con IA en su SaaS mediante la API. Sus clientes se quedan en su interfaz." },
    "white-label": { title: "Su logotipo y sus colores", description: "Su asistente configura una recepcionista de marca blanca con su marca." },
    partner: { title: "Véndala con su marca", description: "Su asistente prepara las demos, los paquetes y su primer negocio, y usted se queda con lo que pagan." },
    "self-host": { title: "Ejecútela usted mismo", description: "Su asistente despliega LobbyStack en sus servidores, hasta una llamada de prueba." },
  },
  sr: {
    "no-code": { title: "Bez programiranja", description: "Vaš asistent podešava recepcionera za vašu firmu ili firmu prijatelja i javlja vam kada ste mu potrebni." },
    saas: { title: "Dodajte ga u svoj proizvod", description: "Ugradite AI recepcionera u svoj SaaS preko API-ja. Vaši korisnici ostaju u vašem interfejsu." },
    "white-label": { title: "Vaš logo i vaše boje", description: "Vaš asistent podešava white-label recepcionera pod vašim brendom." },
    partner: { title: "Prodajte ga pod svojim brendom", description: "Vaš asistent priprema demo pozive, pakete i vašu prvu firmu, a vi zadržavate ono što plaćaju." },
    "self-host": { title: "Pokrenite ga sami", description: "Vaš asistent postavlja LobbyStack na vaše servere i dovodi ga do probnog poziva." },
  },
};
