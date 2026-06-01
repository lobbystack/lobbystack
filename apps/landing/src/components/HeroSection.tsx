import { buttonVariants } from "@/components/ui/button"
import { GithubIcon } from "@/components/GithubIcon"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

export function HeroSection({ children }: { children?: ReactNode }) {
  return (
    <section
      className="relative grid min-h-[calc(100svh-4rem)] items-center overflow-hidden"
      id="hero"
    >
      <div className="mx-auto w-full max-w-7xl px-6 pt-14 pb-10 md:pt-10 md:pb-20 lg:pt-12 lg:pb-24">
        <div className="grid min-w-0 items-center gap-6 md:gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-3xl min-w-0 text-left">
            <a
              href="https://github.com/lobbystack/lobbystack"
              target="_blank"
              rel="noopener noreferrer"
              className="animate-fade-up mb-6 inline-flex h-9 items-center gap-2 rounded-full border border-border/70 bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              data-ph-capture-attribute-section="hero"
              data-ph-capture-attribute-action="view_github"
              data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            >
              <GithubIcon className="size-4" />
              Star us on GitHub
              <ArrowRight className="size-4" />
            </a>

            <h1 className="animate-fade-up display-heading delay-100">
              Stop losing revenue to{" "}
              <span className="underline decoration-2 underline-offset-4">
                missed calls
              </span>
              .
            </h1>

            <p className="animate-fade-up body-copy mt-6 max-w-[65ch] delay-200 md:text-lg">
              LobbyStack answers calls, qualifies leads, replies by SMS, and
              books appointments 24/7. Use it for every inbound call, or just
              the ones you miss when your team is busy.
            </p>

            <div className="animate-fade-up mt-8 flex items-center gap-4 delay-300">
              <a
                href={APP_SIGNUP_URL}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full max-w-80 rounded-full px-16 text-sm md:w-96 md:max-w-none"
                )}
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={APP_SIGNUP_URL}
              >
                Try for free
                <ArrowRight className="ml-1 size-4" />
              </a>
            </div>

            {/* Micro-copy */}
            <p className="animate-fade-up fine-print mt-5 delay-400">
              No credit card required
            </p>
          </div>

          <div className="animate-fade-up mx-auto flex w-full max-w-[22rem] min-w-0 justify-center delay-500 md:max-w-[30rem] lg:max-w-none lg:justify-end">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
