import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL, CAL_DEMO_TRIGGER_ATTRIBUTES } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight, CalendarDays } from "lucide-react"

export function CtaSection() {
  return (
    <section className="flex min-h-[360px] items-center bg-background py-16 md:min-h-[440px] md:py-20 lg:min-h-[500px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="section-heading">
          Never miss a ready-to-book{" "}
          <span className="underline decoration-2 underline-offset-4">
            caller
          </span>
        </h2>
        <p className="section-intro mx-auto max-w-[56ch]">
          Start with 10 included voice minutes on Free, then upgrade to Pro for
          80 included voice minutes.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
          <a
            href={APP_SIGNUP_URL}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-full px-7 text-sm"
            )}
            data-ph-signup-cta
            data-ph-capture-attribute-section="final_cta"
            data-ph-capture-attribute-action="try_for_free"
            data-ph-capture-attribute-destination={APP_SIGNUP_URL}
          >
            Try for free
            <ArrowRight className="ml-1 size-4" />
          </a>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 cursor-pointer rounded-full px-7 text-sm"
            )}
            data-ph-capture-attribute-section="final_cta"
            data-ph-capture-attribute-action="book_demo"
            data-ph-capture-attribute-destination="cal.com/raphaelm/lobbystack"
            {...CAL_DEMO_TRIGGER_ATTRIBUTES}
          >
            <CalendarDays className="mr-1 size-4" />
            Book a Demo
          </button>
        </div>
        <p className="fine-print mt-3">
          No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  )
}
