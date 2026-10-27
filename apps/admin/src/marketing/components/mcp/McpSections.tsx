import { BookOpen, CalendarCheck, Check, PhoneIncoming, UserRound, type LucideIcon } from "lucide-react"
import { Fragment } from "react"

import { FaqSection } from "@/marketing/components/FaqSection"
import {
  BookingAskScene,
  CallsAskScene,
  ConnectedAppsScene,
  ConnectScene,
  ConsentChainScene,
  HubScene,
  McpScene,
} from "@/marketing/components/mcp/McpScenes"
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
  MCP_SERVER_URL,
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
        footnote={
          <>
            {t.urlLabel}: <Code>{MCP_SERVER_URL}</Code>
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
        <p className="fine-print mt-4 text-center">{t.madeUp}</p>
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

export function McpConnect({ locale }: SectionProps) {
  const copy = getMcpCopy(locale)
  const t = copy.connect
  return (
    <section className="pt-20 md:pt-30" id="connect">
      <div className={container}>
        <SplitCard
          headingLevel="h2"
          columns="md:grid-cols-[1fr_1.1fr]"
          mediaClassName="min-h-[20rem] md:min-h-[30rem]"
          media={
            <McpScene fit="panel">
              <ConnectScene locale={locale} art={copy.art} />
            </McpScene>
          }
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
          action={
            <>
              <ButtonLink href={mcpDocsUrl(locale, "connect-claude")} variant="secondary" size="sm">
                {t.guides.claude}
              </ButtonLink>
              <ButtonLink href={mcpDocsUrl(locale, "connect-chatgpt")} variant="secondary" size="sm">
                {t.guides.chatgpt}
              </ButtonLink>
              <ButtonLink href={mcpDocsUrl(locale, "connect-other-clients")} variant="secondary" size="sm">
                {t.guides.other}
              </ButtonLink>
            </>
          }
        >
          <ol className="mt-6 space-y-3">
            {t.steps.map((step, index) => (
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
        </SplitCard>
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
