import { CodeBlock, CopyCommandButtons, externalLink } from "@/marketing/components/solution-layouts/self-hosting/parts"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"

// Steps and requirements match mintlify/self-hosting/docker-compose.mdx.
const steps: Array<{ title: string; body: string; code: string }> = [
  {
    title: "Clone the repository",
    body: "Get the code from GitHub and open its folder.",
    // Joined at render time, so link checkers don't read the newline as part of the URL.
    code: ["git clone https://github.com/lobbystack/lobbystack.git", "cd lobbystack"].join("\n"),
  },
  {
    title: "Generate the secrets",
    body: "The script creates .env and fills each database password and internal secret with a random value.",
    code: "node scripts/generate-env.mjs",
  },
  {
    title: "Add your provider keys",
    body: "Open .env and set your dashboard's address, your OpenAI key and your Twilio credentials.",
    code: ["APP_BASE_URL=https://your_domain", "OPENAI_API_KEY=", "TWILIO_ACCOUNT_SID=", "TWILIO_AUTH_TOKEN="].join("\n"),
  },
  {
    title: "Start the stack",
    body: "The migrator updates the database, then the dashboard and worker start.",
    code: "docker compose --env-file .env up -d --build\ndocker compose ps",
  },
]

const requirements = [
  "Docker Engine 24 or later with Compose v2",
  "Node.js 22 or later, to generate secrets",
  "2 vCPU, 4 GB of RAM and persistent disk",
  "A domain with HTTPS for the dashboard",
]

const guideUrl = "https://docs.lobbystack.com/self-hosting/docker-compose"

/** The Docker Compose install, step by step, with commands you can copy. */
export function WhatYouRun() {
  return (
    <section className="pt-20 md:pt-30" id="install">
      <div className="mx-auto w-full max-w-site px-6">
        <SectionTitle
          centered
          eyebrow="Install"
          intro="The official setup runs on one server. Check that you have these four things, then run the steps below."
          className="max-w-3xl"
        >
          Install with Docker Compose
        </SectionTitle>
        <FactStrip className="mt-12" facts={requirements} />
        <ol className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="flex min-w-0 flex-col bg-background p-6">
              <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="card-heading mt-6">{step.title}</h3>
              <p className="mt-3 mb-5 text-base leading-6 text-pretty text-muted-foreground">{step.body}</p>
              <CodeBlock className="mt-auto" code={step.code} copyLabel={`Copy step ${index + 1}`} />
            </li>
          ))}
        </ol>
        <CopyCommandButtons />
        <div className="mt-8 flex flex-col items-center gap-4 text-center">
          <ButtonLink href={guideUrl} variant="secondary" {...externalLink(guideUrl, "self_hosted_install", "read_compose_guide")}>
            Read the full Docker Compose guide
          </ButtonLink>
          <p className="fine-print max-w-[40rem]">
            Browser test calls work as soon as the stack is up. Phone calls also need a Twilio Elastic SIP trunk and an OpenAI
            webhook, which the guide sets up.
          </p>
        </div>
      </div>
    </section>
  )
}
