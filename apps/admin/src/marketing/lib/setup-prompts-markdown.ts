import { setupPromptCopy, setupPrompts, type SetupPromptId } from "@lobbystack/shared"

import { getCopy, type Locale } from "@/marketing/i18n"

/** The setup prompts as Markdown, for a page's .md twin. Agents read the prompt text the page's button copies. */
export function setupPromptsMarkdown(locale: Locale, prompts: SetupPromptId[]) {
  const t = getCopy(locale).setupPrompts
  const sections = prompts.map((id) => {
    const { title, description } = setupPromptCopy[locale][id]
    return `### ${title}\n\n${description}\n\n\`\`\`text\n${setupPrompts[id]}\n\`\`\``
  })
  return [`## ${t.title}`, t.intro, ...sections].join("\n\n")
}
