import { Check, ChevronDown, PhoneCall } from "lucide-react"

import { Badge, Connector, Place, Scene, Tile, type Tilt } from "@/marketing/components/system/art"

export type TranscriptLine = {
  at: string
  speaker: "caller" | "lobbystack"
  text: string
  /** What LobbyStack did on this line, shown as a done step. */
  note?: string
}

const lineHeight = 92

/**
 * A call drawn as a chain of tiles stepping down the plane, like GitBook's
 * change-request card: the caller's opening line, then each step LobbyStack
 * took. Pass three or four lines; long calls belong in TranscriptText.
 */
export function TranscriptScene({ lines, tilt = "right", width = 560 }: { lines: TranscriptLine[]; tilt?: Tilt; width?: number }) {
  const shown = lines.slice(0, 4)
  return (
    <Scene width={width} height={shown.length * lineHeight + 40} tilt={tilt}>
      {shown.map((line, index) => {
        const x = index * 44
        const y = index * lineHeight
        const isCaller = line.speaker === "caller"
        return (
          <div key={`${line.at}-${index}`}>
            {index > 0 && (
              <>
                <Connector x={x - 20} y={y - lineHeight + 64} length={lineHeight - 30} vertical />
                <Connector x={x - 20} y={y + 34} length={20} />
              </>
            )}
            <Place x={x} y={y}>
              <div className="relative">
                <Tile accent={index === shown.length - 1} className="w-[22rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3.5 py-2.5">
                  <span className="flex items-start gap-2.5">
                    {isCaller ? (
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-beige-strong text-[0.625rem] font-semibold text-foreground/70">
                        {line.at}
                      </span>
                    ) : (
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <PhoneCall className="size-3" strokeWidth={2} />
                      </span>
                    )}
                    <span className="min-w-0 text-[0.8125rem] leading-snug">{line.note ?? line.text}</span>
                  </span>
                </Tile>
                {line.note && (
                  <Badge className="absolute top-1/2 -right-3 size-7 -translate-y-1/2 ring-4">
                    <Check className="size-3.5" strokeWidth={2.5} />
                  </Badge>
                )}
              </div>
            </Place>
          </div>
        )
      })}
    </Scene>
  )
}

/**
 * The full call as text, folded under a summary line so the scene stays the
 * picture while every word stays on the page for readers and search engines.
 */
export function TranscriptText({
  summary,
  lines,
  speakerLabels,
  outcome,
  footnote,
  className,
}: {
  summary: string
  lines: TranscriptLine[]
  speakerLabels: { caller: string; lobbystack: string }
  outcome?: string
  footnote?: string
  className?: string
}) {
  return (
    <details className={`group rounded-2xl border border-border/60 bg-background ${className ?? ""}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-medium text-foreground transition-colors hover:bg-beige focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="space-y-4 border-t border-border/60 px-5 py-5">
        {lines.map((line, index) => (
          <li key={`${line.at}-${index}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3">
            <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">{line.at}</span>
            <div>
              <p className="text-xs font-medium text-foreground">{speakerLabels[line.speaker]}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{line.text}</p>
              {line.note && <p className="mt-1.5 text-xs font-medium text-beige-foreground">{line.note}</p>}
            </div>
          </li>
        ))}
      </ol>
      {(outcome || footnote) && (
        <div className="border-t border-border/60 bg-beige px-5 py-4 text-sm text-foreground">
          {outcome}
          {footnote && <span className="mt-1 block text-xs text-muted-foreground">{footnote}</span>}
        </div>
      )}
    </details>
  )
}
