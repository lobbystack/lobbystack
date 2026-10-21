import { ChevronDown, FileCode, Folder, KeyRound } from "lucide-react"

import { InstallCommand } from "@/marketing/components/solutions/self-hosted/InstallCommand"
import { buttonVariants } from "@/marketing/components/ui/button"
import { cn } from "@/marketing/lib/utils"

type SelfHostedHeroProps = {
  h1: string
  intro: string
  guideHref: string
}

// Real paths from the repository root.
const tree = [
  { depth: 1, icon: FileCode, name: "docker-compose.yml" },
  { depth: 1, icon: KeyRound, name: ".env" },
  { depth: 1, icon: Folder, name: "apps/" },
  { depth: 2, icon: Folder, name: "admin/" },
  { depth: 2, icon: Folder, name: "worker/" },
]

// Faint outlines around the card, faded at their outer edges.
const outlines = [
  "left-0 top-[8%] h-10 w-[46%] [mask-image:linear-gradient(to_right,transparent,black_40%)]",
  "right-0 top-[8%] h-10 w-[30%] [mask-image:linear-gradient(to_left,transparent,black_50%)]",
  "left-0 top-[36%] h-10 w-[22%] [mask-image:linear-gradient(to_right,transparent,black_60%)]",
  "right-0 top-[36%] h-10 w-[22%] [mask-image:linear-gradient(to_left,transparent,black_60%)]",
  "left-[4%] top-[62%] h-10 w-[24%] [mask-image:linear-gradient(to_right,transparent,black_70%)]",
  "right-[4%] top-[62%] h-10 w-[24%] [mask-image:linear-gradient(to_left,transparent,black_70%)]",
]

export function SelfHostedHero({ h1, intro, guideHref }: SelfHostedHeroProps) {
  return (
    <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-8">
      <div className="min-w-0">
        <h1 className="display-heading">{h1}</h1>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <InstallCommand />
          <a href={guideHref} className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-6 text-sm font-medium")}>
            Read the guide
          </a>
        </div>
        <p className="body-copy mt-6 max-w-[52ch] md:text-lg">{intro}</p>
      </div>

      <div className="relative mx-auto hidden h-[380px] w-full max-w-[560px] sm:block" aria-hidden="true">
        {outlines.map((position) => (
          <span key={position} className={cn("absolute border border-foreground/15", position)} />
        ))}
        <div className="absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2">
          <div className="rounded-xl border border-border/80 bg-background px-3 py-3 shadow-[0_1px_2px_oklch(0_0_0/4%),0_12px_32px_oklch(0_0_0/6%)]">
            <p className="flex items-center justify-between px-1 py-1.5 text-sm text-foreground">
              <span className="flex items-center gap-2.5">
                <Folder className="size-4" strokeWidth={1.75} />
                lobbystack/
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </p>
            <ul>
              {tree.map((item) => {
                const Icon = item.icon
                return (
                  <li
                    key={item.name}
                    className={cn(
                      "flex items-center gap-2.5 py-1.5 text-sm text-foreground",
                      item.depth === 1 ? "pl-6" : "pl-11"
                    )}
                  >
                    <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    {item.name}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="mt-3 rounded-xl border border-border/80 bg-background px-4 py-3 font-mono text-sm text-foreground shadow-[0_1px_2px_oklch(0_0_0/4%),0_12px_32px_oklch(0_0_0/6%)] [font-variant-ligatures:none]">
            <span className="text-muted-foreground">$ </span>docker compose up -d
          </div>
        </div>
      </div>
    </div>
  )
}
