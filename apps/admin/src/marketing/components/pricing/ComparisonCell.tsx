import type { ComparisonValue } from "@lobbystack/shared/plan-comparison"
import { Check, Minus } from "lucide-react"

/**
 * One cell of a plan comparison table: a check, a dash, or the plan's words.
 * The check's label for screen readers is absolutely positioned, so its span
 * is relative: otherwise the label escapes the table's scroll box and widens
 * the page on a narrow screen.
 */
export function ComparisonCell({
  includedLabel,
  notIncludedLabel,
  value,
}: {
  includedLabel: string
  notIncludedLabel: string
  value: ComparisonValue
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="relative inline-flex items-center justify-center">
        <Check
          className="mx-auto size-4 text-beige-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">{includedLabel}</span>
      </span>
    ) : (
      <span className="relative inline-flex items-center justify-center">
        <Minus
          className="mx-auto size-4 text-muted-foreground/30"
          aria-hidden="true"
        />
        <span className="sr-only">{notIncludedLabel}</span>
      </span>
    )
  }

  if (typeof value === "string") {
    return (
      <span
        className={
          value === "-" ? "text-muted-foreground/40" : "text-muted-foreground"
        }
      >
        {value}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then && (
        <span className="text-xs text-muted-foreground">{value.then}</span>
      )}
    </span>
  )
}
