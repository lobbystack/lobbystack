import { ChevronRight } from "lucide-react"

import { afterHoursIndustries } from "@/marketing/lib/solution-details"

export function AfterHoursIndustries() {
  return (
    <section className="border-t border-border/40 py-20 md:py-28" id="industries">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">After-hours answering by industry</h2>
          <p className="section-intro">See how LobbyStack handles night and weekend calls in your line of work.</p>
        </div>
        <ul className="mt-12 grid border-t border-border/70 sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-4 lg:gap-x-8">
          {afterHoursIndustries.map((industry) => (
            <li key={industry.href} className="border-b border-border/70">
              <a
                href={industry.href}
                className="group flex items-start justify-between gap-3 rounded-xl px-2 py-5 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{industry.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{industry.detail}</span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
