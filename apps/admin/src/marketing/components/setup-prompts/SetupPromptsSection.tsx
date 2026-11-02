import { setupPromptCopy, setupPrompts, type SetupPromptId } from "@lobbystack/shared"

import { CopyPromptButton } from "@/marketing/components/setup-prompts/CopyPromptButton"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { getCopy, type Locale } from "@/marketing/i18n"

type SetupPromptsSectionProps = {
  locale: Locale
  prompts: SetupPromptId[]
  /** The analytics name of the page section, such as mcp_prompts. */
  section: string
}

/** Cards that copy a ready-made prompt for an AI assistant. The prompts stay in English on every locale. */
export function SetupPromptsSection({ locale, prompts, section }: SetupPromptsSectionProps) {
  const t = getCopy(locale).setupPrompts
  return (
    <section className="pt-16 md:pt-24" id="setup-prompts">
      <div className="mx-auto w-full max-w-site px-6">
        <SectionTitle centered lines={[t.title]} intro={t.intro} className="max-w-[46rem]" />
        <ul className="mx-auto mt-8 grid w-full max-w-[46rem] gap-3">
          {prompts.map((id) => {
            const { title, description } = setupPromptCopy[locale][id]
            return (
              <li className="grid gap-4 rounded-2xl border border-border bg-background p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={id}>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">{description}</p>
                </div>
                <CopyPromptButton
                  blockedLabel={t.blocked}
                  copiedLabel={t.copied}
                  copyLabel={t.copy}
                  prompt={setupPrompts[id]}
                  promptId={id}
                  promptLabel={title}
                  section={section}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
