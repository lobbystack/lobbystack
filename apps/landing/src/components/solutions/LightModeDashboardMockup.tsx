interface Props {
  slug: string
}

/* ───────────────────────────────────────────
   Schematic feature illustrations
   Light theme · abstract UI representations
   ─────────────────────────────────────────── */

export function LightModeDashboardMockup({ slug }: Props) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-background font-sans text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.06)] select-none">
      <div className="flex min-h-0 flex-1 flex-col p-5">
        {slug === "after-hours-answering-service" && <AfterHoursSchematic />}
        {slug === "ai-receptionist-for-dental-offices" && <DentalSchematic />}
        {slug === "ai-receptionist-for-salons-and-spas" && <SalonsSchematic />}
        {slug === "self-hosted-ai-receptionist" && <SelfHostedSchematic />}
      </div>
    </div>
  )
}

/* ── After-hours: continuous coverage rings ── */
function AfterHoursSchematic() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <div className="relative flex size-64 items-center justify-center">
        {/* Outer ring */}
        <div className="absolute size-56 rounded-full border border-dashed border-border/40" />
        {/* Middle ring */}
        <div className="absolute size-40 rounded-full border border-border/30" />
        {/* Inner ring */}
        <div className="absolute size-24 rounded-full border border-foreground/10 bg-muted/30" />

        {/* Center phone indicator */}
        <div className="relative flex flex-col items-center gap-1">
          <svg
            className="size-7 text-foreground/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="text-[11px] font-medium text-foreground/65">
            Live
          </span>
        </div>

        {/* Orbiting call cards, positioned at cardinal directions */}
        <div className="absolute -top-3 rounded-lg border border-border/50 bg-background px-3 py-2 shadow-sm">
          <div className="text-[11px] font-semibold text-foreground/80">
            11:47 PM
          </div>
          <div className="text-[10px] text-foreground/65">Emergency</div>
        </div>

        <div className="absolute top-1/2 -right-4 -translate-y-1/2 rounded-lg border border-border/50 bg-background px-3 py-2 shadow-sm">
          <div className="text-[11px] font-semibold text-foreground/80">
            2:15 AM
          </div>
          <div className="text-[10px] text-foreground/65">Overflow</div>
        </div>

        <div className="absolute -bottom-3 rounded-lg border border-border/50 bg-background px-3 py-2 shadow-sm">
          <div className="text-[11px] font-semibold text-foreground/80">
            6:30 AM
          </div>
          <div className="text-[10px] text-foreground/65">Routine</div>
        </div>
      </div>

      {/* Coverage label */}
      <div className="mt-4 text-center">
        <span className="text-[11px] font-medium text-foreground/70">
          24/7 call coverage
        </span>
        <div className="mt-1 flex items-center justify-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground/40" />
          <span className="text-[11px] text-foreground/65">
            0 missed calls this week
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Dental: calendar grid with AI booking ── */
function DentalSchematic() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Week header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-foreground/80">
          May 19-23
        </span>
        <span className="rounded-full bg-muted px-2 py-px text-[11px] font-medium text-foreground/70">
          4 AI bookings
        </span>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 gap-2">
        {days.map((day) => (
          <div key={day} className="text-center">
            <div className="mb-1 text-[11px] font-medium text-foreground/65">
              {day}
            </div>
            <div className="space-y-1">
              {/* Empty slot */}
              <div className="h-6 rounded border border-border/30 bg-muted/20" />
              {/* Filled slot */}
              <div className="h-6 rounded border border-foreground/10 bg-foreground/[0.04]" />
              {/* AI booked slot */}
              <div
                className={`h-6 rounded border ${day === "Tue" ? "border-foreground/20 bg-foreground/[0.06]" : "border-border/30 bg-muted/20"}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Highlighted appointment */}
      <div className="mt-4 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-bold text-foreground/70">
            SJ
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-foreground/80">
              Sarah Jenkins
            </div>
            <div className="text-[11px] text-foreground/65">
              New patient consult · Tue 9:00 AM
            </div>
          </div>
          <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-medium text-foreground/70">
            AI booked
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 rounded-full bg-foreground/20" />
          <span className="text-[11px] text-foreground/65">
            6 calls handled
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-5 rounded-full bg-foreground/10" />
          <span className="text-[11px] text-foreground/65">2 overflow</span>
        </div>
      </div>
    </div>
  )
}

/* ── Salons: rule card with instruction ── */
function SalonsSchematic() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Rule card */}
      <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded bg-foreground/10 text-[11px] font-bold text-foreground/70">
            R
          </div>
          <span className="text-[10px] font-semibold text-foreground/80">
            Color services
          </span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-foreground/70">
            Active
          </span>
        </div>

        <div className="mt-3 rounded border border-border/40 bg-background p-2.5">
          <p className="text-[10px] leading-relaxed text-foreground/75">
            If a client wants{" "}
            <span className="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/80">
              color
            </span>
            , ask about{" "}
            <span className="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/80">
              single-process
            </span>
            ,{" "}
            <span className="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/80">
              highlights
            </span>
            , or{" "}
            <span className="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/80">
              balayage
            </span>
            . Require{" "}
            <span className="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/80">
              48-hour notice
            </span>{" "}
            for cancellations.
          </p>
        </div>
      </div>

      {/* Toggle row */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium text-foreground/80">
              AI cancellations
            </div>
            <div className="text-[11px] text-foreground/65">
              Verified appointments only
            </div>
          </div>
          <div className="h-4 w-7 rounded-full bg-foreground p-0.5">
            <div className="size-3 translate-x-3 rounded-full bg-background" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium text-foreground/80">
              AI rescheduling
            </div>
            <div className="text-[11px] text-foreground/65">
              After availability check
            </div>
          </div>
          <div className="h-4 w-7 rounded-full bg-foreground p-0.5">
            <div className="size-3 translate-x-3 rounded-full bg-background" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium text-foreground/80">
              Require one-time code
            </div>
            <div className="text-[11px] text-foreground/65">
              For cancellations and reschedules
            </div>
          </div>
          <div className="h-4 w-7 rounded-full border border-border bg-muted p-0.5">
            <div className="size-3 rounded-full bg-background" />
          </div>
        </div>
      </div>

      {/* Trigger count */}
      <div className="mt-auto pt-3 text-center">
        <span className="text-[11px] text-foreground/65">
          Triggered 12 times this week
        </span>
      </div>
    </div>
  )
}

/* ── Self-hosted: privacy shield with nodes ── */
function SelfHostedSchematic() {
  const deploymentItems = [
    { label: "Call data", value: "Private storage" },
    { label: "AI provider", value: "BYO API keys" },
    { label: "Telephony", value: "LobbyStack managed" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 px-2">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-foreground/80">
              Private deployment
            </div>
            <div className="mt-1 text-[10px] text-foreground/65">
              Runs in infrastructure you control
            </div>
          </div>
          <span className="rounded-full bg-foreground/5 px-2 py-1 text-[10px] font-medium text-foreground/70">
            Self-hosted
          </span>
        </div>

        <div className="mt-5 flex items-center gap-4 border-y border-border/50 py-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03]">
            <svg
              className="size-7 text-foreground/35"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-foreground/80">
              Deployment boundary active
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full w-4/5 rounded-full bg-foreground/35" />
            </div>
            <div className="mt-2 text-[10px] text-foreground/60">
              Call records, summaries, and routing rules live in your
              deployment.
            </div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-border/50">
          {deploymentItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-2.5"
            >
              <span className="text-[10px] font-medium text-foreground/65">
                {item.label}
              </span>
              <span className="text-[10px] font-semibold text-foreground/80">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/40" />
          <span className="text-[11px] text-foreground/65">
            847 transcripts processed
          </span>
        </div>
        <div className="h-3 w-px bg-border/40" />
        <span className="text-[11px] text-foreground/65">
          Private records enabled
        </span>
      </div>
    </div>
  )
}
