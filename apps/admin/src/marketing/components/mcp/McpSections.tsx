import { BookOpen, CalendarCheck, Check, PhoneIncoming, UserRound, type LucideIcon } from "lucide-react"
import { Fragment } from "react"

import { FaqSection } from "@/marketing/components/FaqSection"
import {
  BookingAskScene,
  CallsAskScene,
  ConnectedAppsScene,
  ConsentChainScene,
  HubScene,
  McpScene,
} from "@/marketing/components/mcp/McpScenes"
import { McpInstall } from "@/marketing/components/mcp/McpInstall"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { IconCards } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PageHero } from "@/marketing/components/system/PageHero"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import {
  getMcpCopy,
  mcpAgencyDocsUrl,
  MCP_SERVER_URL,
  mcpClientOrder,
  mcpDocsUrl,
  mcpToolGroupOrder,
  mcpToolGroups,
  type McpToolGroupKey,
} from "@/marketing/lib/mcp-page-copy"
import { getMcpFaqs } from "@/marketing/lib/mcp-page-faqs"

type SectionProps = { locale: Locale }

const container = "mx-auto w-full max-w-site px-6"

const groupIcons: Record<McpToolGroupKey, LucideIcon> = {
  calls: PhoneIncoming,
  contacts: UserRound,
  appointments: CalendarCheck,
  business: BookOpen,
}

function signupAttributes(locale: Locale, section: string) {
  const href = appSignupUrl(locale)
  return {
    href,
    "data-ph-signup-cta": true,
    "data-ph-capture-attribute-section": section,
    "data-ph-capture-attribute-action": "try_for_free",
    "data-ph-capture-attribute-destination": href,
  }
}

/** Inline code. A URL may wrap after a slash on narrow screens, never inside a word. */
function Code({ children }: { children: string }) {
  const parts = children.split(/(?<=\/)(?=[^/])/)
  return (
    <code className="rounded-md bg-beige-strong/70 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </code>
  )
}

/** Renders text with `backticked` parts as inline code. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? <Code key={index}>{part.slice(1, -1)}</Code> : part
      )}
    </>
  )
}

function Points({ points }: { points: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-base leading-6 text-foreground/85">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
            <Check className="size-3 text-foreground/80" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="min-w-0">{point}</span>
        </li>
      ))}
    </ul>
  )
}

export function McpHero({ locale }: SectionProps) {
  const copy = getMcpCopy(locale)
  const t = copy.hero
  return (
    <div id="hero">
      <PageHero
        eyebrow={t.eyebrow}
        title={t.title}
        intro={t.intro}
        actions={
          <>
            <ButtonLink {...signupAttributes(locale, "mcp_hero")}>{t.primaryCta}</ButtonLink>
            <ButtonLink href={mcpDocsUrl(locale, "mcp")} variant="secondary">
              {t.secondaryCta}
            </ButtonLink>
          </>
        }
        art={
          <McpScene fit="hero">
            <HubScene art={copy.art} />
          </McpScene>
        }
      />
      <div className={`${container} mt-12 md:mt-16`}>
        <FactStrip facts={copy.facts} />
      </div>
    </div>
  )
}

export function McpAsk({ locale }: SectionProps) {
  const copy = getMcpCopy(locale)
  const t = copy.ask
  return (
    <section className="pt-20 md:pt-30" id="ask">
      <div className={container}>
        <SectionTitle centered eyebrow={t.eyebrow} lines={t.titleLines} intro={t.intro} className="max-w-[46rem]" />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <MediaCard
            media={
              <McpScene fit="wide">
                <CallsAskScene locale={locale} art={copy.art} />
              </McpScene>
            }
            mediaClassName="h-72 sm:h-80"
            eyebrow={t.calls.eyebrow}
            title={t.calls.title}
            body={t.calls.body}
          />
          <MediaCard
            media={
              <McpScene fit="wide">
                <BookingAskScene locale={locale} art={copy.art} />
              </McpScene>
            }
            mediaClassName="h-72 sm:h-80"
            eyebrow={t.booking.eyebrow}
            title={t.booking.title}
            body={t.booking.body}
          />
        </div>
      </div>
    </section>
  )
}

export function McpControl({ locale }: SectionProps) {
  const copy = getMcpCopy(locale)
  return (
    <section className="pt-20 md:pt-30" id="consent">
      <div className={`${container} space-y-6 md:space-y-12`}>
        <SplitCard
          headingLevel="h2"
          mediaClassName="min-h-[20rem] md:min-h-[30rem]"
          media={
            <McpScene fit="panel">
              <ConsentChainScene locale={locale} art={copy.art} />
            </McpScene>
          }
          eyebrow={copy.consent.eyebrow}
          title={copy.consent.title}
          body={copy.consent.body}
        >
          <Points points={copy.consent.points} />
        </SplitCard>
        <div id="control">
          <SplitCard
            reverse
            headingLevel="h2"
            mediaClassName="min-h-[20rem] md:min-h-[30rem]"
            media={
              <McpScene fit="panel">
                <ConnectedAppsScene locale={locale} art={copy.art} />
              </McpScene>
            }
            eyebrow={copy.control.eyebrow}
            title={copy.control.title}
            body={copy.control.body}
          >
            <Points points={copy.control.points} />
          </SplitCard>
        </div>
      </div>
    </section>
  )
}

export function McpTools({ locale }: SectionProps) {
  const t = getMcpCopy(locale).tools
  return (
    <section className="pt-20 md:pt-30" id="tools">
      <div className={container}>
        <SectionTitle centered eyebrow={t.eyebrow} lines={[t.title]} intro={t.intro} className="max-w-[44rem]" />
        <IconCards
          className="mt-12"
          cards={mcpToolGroupOrder.map((key) => ({
            icon: groupIcons[key],
            title: t.groups[key].title,
            body: t.groups[key].body,
            footer: (
              <ul className="flex flex-wrap gap-1.5">
                {mcpToolGroups[key].map((tool) => (
                  <li key={tool.name}>
                    <span
                      className="inline-flex rounded-full bg-beige px-2.5 py-0.5 font-mono text-[0.75rem] text-foreground/80"
                      title={tool.scope}
                    >
                      {tool.name}
                    </span>
                  </li>
                ))}
              </ul>
            ),
          }))}
        />
      </div>
    </section>
  )
}

export function McpAgencies({ locale }: SectionProps) {
  const t = getMcpCopy(locale).agencies
  return (
    <section className="pt-20 md:pt-30" id="agencies">
      <div className={container}>
        <div className="mx-auto max-w-[44rem]">
          <SectionTitle eyebrow={t.eyebrow} lines={[t.title]} intro={t.body} />
          <Points points={t.points} />
          <ButtonLink className="mt-8" href={mcpAgencyDocsUrl(locale)} variant="secondary">
            {t.cta}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

const clientDocs = { claude: "connect-claude", chatgpt: "connect-chatgpt", codex: "connect-chatgpt", cursor: "connect-other-clients", other: "connect-other-clients" } as const

export function McpConnect({ locale }: SectionProps) {
  const copy = getMcpCopy(locale)
  const t = copy.connect
  return (
    <section className="pt-16 md:pt-24" id="install">
      <div className={container}>
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">{t.title}</h2>
        <div className="mt-8">
          <McpInstall
            url={MCP_SERVER_URL}
            urlLabel={copy.hero.urlLabel}
            copyLabel={t.copy}
            copiedLabel={t.copied}
            clients={mcpClientOrder.map((key) => ({
              key,
              label: t.clients[key].label,
              panel: (
                <div className="rounded-2xl border border-border bg-background p-6">
                  <ol className="space-y-3">
                    {t.clients[key].steps.map((step, index) => (
                      <li key={step} className="flex items-start gap-3 text-base leading-6 text-foreground/85">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-semibold text-primary-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <WithCode text={step} />
                        </span>
                      </li>
                    ))}
                  </ol>
                  <ButtonLink className="mt-6" href={mcpDocsUrl(locale, clientDocs[key])} variant="secondary" size="sm">
                    {t.guide}
                  </ButtonLink>
                </div>
              ),
            }))}
          />
        </div>
      </div>
    </section>
  )
}

export function McpFaq({ locale }: SectionProps) {
  return <FaqSection className="pt-20 md:pt-30" heading={getMcpCopy(locale).faqTitle} faqs={getMcpFaqs(locale)} />
}

export function McpClosing({ locale }: SectionProps) {
  const t = getMcpCopy(locale).closing
  const { href, ...attributes } = signupAttributes(locale, "mcp_closing")
  return (
    <ClosingCta
      titleLines={t.titleLines}
      body={t.body}
      primary={{ label: t.primaryCta, href, attributes }}
      secondary={{ label: t.secondaryCta, href: mcpDocsUrl(locale, "mcp") }}
      footnote={getCopy(locale).common.noCreditCardCancelAnytime}
    />
  )
}
