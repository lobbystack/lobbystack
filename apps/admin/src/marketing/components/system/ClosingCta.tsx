import { PlaneGrid } from "@/marketing/components/system/art"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"

type CtaLink = {
  label: string
  href: string
  /** Analytics attributes and link targets for the button. */
  attributes?: Record<string, string | boolean | undefined>
}

type ClosingCtaProps = {
  /** Each line breaks onto its own row from md up. */
  titleLines: readonly string[]
  body?: string
  primary: CtaLink
  secondary?: CtaLink
  footnote?: string
}

/** The beige band that closes a page with its main call to action. */
export function ClosingCta({ titleLines, body, primary, secondary, footnote }: ClosingCtaProps) {
  return (
    <section className="relative mt-24 overflow-hidden bg-beige">
      <PlaneGrid />
      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center md:py-44">
        <h2 className="display-heading">
          {titleLines.map((line, index) => (
            <span key={line}>
              {index > 0 && " "}
              <span className="md:block">{line}</span>
            </span>
          ))}
        </h2>
        {body && <p className="mx-auto mt-6 max-w-[40rem] text-base leading-6 text-muted-foreground">{body}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <ButtonLink href={primary.href} {...primary.attributes}>
            {primary.label}
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} variant="secondary" {...secondary.attributes}>
              {secondary.label}
            </ButtonLink>
          )}
        </div>
        {footnote && <p className="fine-print mt-4">{footnote}</p>}
      </div>
    </section>
  )
}
