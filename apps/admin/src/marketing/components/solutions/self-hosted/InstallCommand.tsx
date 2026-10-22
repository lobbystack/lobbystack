import { Check, Copy } from "lucide-react"

import { CopyCommandButtons } from "@/marketing/components/solutions/self-hosted/CopyCommandButtons"

const command = "git clone https://github.com/lobbystack/lobbystack.git"

export function InstallCommand() {
  return (
    <div className="flex h-11 max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/40 pr-1.5 pl-4 font-mono text-xs [font-variant-ligatures:none]">
      <span className="text-muted-foreground select-none" aria-hidden="true">
        $
      </span>
      <code className="min-w-0 flex-1 truncate text-foreground">{command}</code>
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        data-copy-command={command}
        aria-label="Copy the git clone command"
      >
        <Copy className="size-4" data-copy-idle aria-hidden="true" />
        <Check className="hidden size-4" data-copy-done aria-hidden="true" />
      </button>
      <CopyCommandButtons />
    </div>
  )
}
