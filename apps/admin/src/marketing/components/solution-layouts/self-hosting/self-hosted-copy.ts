// The English self-hosted page's own words, around its entry in the SEO
// landing page data. Facts come from mintlify/self-hosting/.

export const selfHostedLayoutCopy = {
  heroFootnote: "Free to self-host under the MIT License. You pay your host, Twilio and OpenAI directly.",
  deploy: {
    eyebrow: "Deploy",
    title: "Two ways to run a self-hosted AI receptionist",
    intro:
      "Both install the same open-source code and use your own Twilio and OpenAI accounts. Pick Docker Compose for a server you already run, or Railway if you'd rather not set one up.",
    composeCta: "Read the Docker Compose guide",
    railwayCta: "Deploy on Railway",
  },
  architecture: { eyebrow: "Your data", cta: "Read the self-hosting overview" },
  code: { eyebrow: "Open source", cta: "View the code on GitHub" },
  run: {
    eyebrow: "What you run",
    title: "Four jobs your team takes on",
    intro: "Self-hosting moves these jobs from LobbyStack to you. The production checklist in the Docker Compose guide covers each one.",
    cards: [
      {
        title: "Backups and restores",
        body: "Back up PostgreSQL and the storage volume off the server, and run a restore drill before you take live calls.",
      },
      {
        title: "Upgrades",
        body: "Back up, pull the new release, review its migrations and variables, then rebuild. You pick the day.",
      },
      {
        title: "Domain and HTTPS",
        body: "Point a domain at the server. Caddy can issue the certificate, or you can put the stack behind your own proxy.",
      },
      {
        title: "Accounts and secrets",
        body: "Keep the Twilio, OpenAI, email and calendar keys in .env with tight file permissions, and rotate them on your schedule.",
      },
    ],
  },
} as const
