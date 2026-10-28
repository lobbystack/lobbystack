"use client"

import { Check, Copy } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"

import { cn } from "@/marketing/lib/utils"
import type { McpClientKey } from "@/marketing/lib/mcp-page-copy"

type McpInstallProps = {
  url: string
  urlLabel: string
  copyLabel: string
  copiedLabel: string
  clients: { key: McpClientKey; label: string; panel: ReactNode }[]
}

/** Client tabs, the server URL with a copy button, and the selected client's steps. */
export function McpInstall({ url, urlLabel, copyLabel, copiedLabel, clients }: McpInstallProps) {
  const [selected, setSelected] = useState<McpClientKey>(clients[0]?.key ?? "claude")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // The URL stays visible and selectable when the clipboard is blocked.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col items-center gap-5">
      <div
        className="grid w-full grid-cols-3 gap-1 rounded-3xl border border-border bg-input/30 p-1 sm:grid-cols-5 sm:rounded-full"
        role="tablist"
      >
        {clients.map((client) => (
          <button
            aria-controls={`mcp-install-${client.key}`}
            aria-selected={selected === client.key}
            className={cn(
              "min-h-10 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected === client.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
            id={`mcp-install-tab-${client.key}`}
            key={client.key}
            onClick={() => setSelected(client.key)}
            role="tab"
            type="button"
          >
            {client.label}
          </button>
        ))}
      </div>

      <div className="flex max-w-full items-center gap-1 rounded-full border border-border bg-background py-1 pr-1 pl-4">
        <span className="sr-only">{urlLabel}</span>
        <code className="min-w-0 truncate font-mono text-sm text-foreground">{url}</code>
        <button
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={copy}
          type="button"
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>

      {clients.map((client) => (
        <div
          aria-labelledby={`mcp-install-tab-${client.key}`}
          className="w-full"
          hidden={selected !== client.key}
          id={`mcp-install-${client.key}`}
          key={client.key}
          role="tabpanel"
        >
          {client.panel}
        </div>
      ))}
    </div>
  )
}
