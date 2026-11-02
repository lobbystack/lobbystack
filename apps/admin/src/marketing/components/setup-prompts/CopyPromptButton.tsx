"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/marketing/components/ui/button"

type CopyPromptButtonProps = {
  prompt: string
  copyLabel: string
  copiedLabel: string
  blockedLabel: string
  /** Names the prompt to screen readers, since every card's button reads the same. */
  promptLabel: string
  section: string
  promptId: string
}

/** Copies a prompt that the page doesn't show. If the browser blocks the clipboard, it shows the text to copy by hand. */
export function CopyPromptButton({ prompt, copyLabel, copiedLabel, blockedLabel, promptLabel, section, promptId }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const fallback = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (blocked) fallback.current?.select()
  }, [blocked])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setBlocked(true)
    }
  }

  return (
    <>
      <Button
        aria-label={`${copied ? copiedLabel : copyLabel}: ${promptLabel}`}
        data-ph-capture-attribute-action="copy_prompt"
        data-ph-capture-attribute-destination={promptId}
        data-ph-capture-attribute-section={section}
        onClick={copy}
        size="sm"
        variant="secondary"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </Button>
      {blocked && (
        <label className="grid gap-2 text-sm text-muted-foreground sm:col-span-2">
          {blockedLabel}
          <textarea
            className="h-40 w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-[13px] leading-5 text-foreground"
            readOnly
            ref={fallback}
            value={prompt}
          />
        </label>
      )}
    </>
  )
}
