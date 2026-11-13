"use client"

import * as React from "react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { MinusIcon, PlusIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type NumberFieldProps = Omit<NumberFieldPrimitive.Root.Props, "children" | "render"> & {
  /** Names the field's input; use it when no label points at `id`. */
  "aria-label"?: string
  /** Shown in the empty field. */
  placeholder?: string
  /** Names the buttons that lower and raise the value. */
  decrementLabel: string
  incrementLabel: string
  /** Marks the field as invalid: a red border, and `aria-invalid` for assistive technology. */
  invalid?: boolean
  inputClassName?: string
  /**
   * Only digits can be typed or pasted: no commas, decimal point or sign. The
   * number field accepts those and fixes them when the field loses focus, which
   * lets "1,5" sit in the field meanwhile. Shows the value without separators.
   */
  integer?: boolean
}

/**
 * A number field: the value between a minus and a plus button, in place of the
 * browser's number input with its up and down arrows. Built on Base UI's
 * number field, so the arrow keys step it, Shift steps by the large step, and
 * letters can't be typed. With `allowOutOfRange`, a typed value outside
 * `min` and `max` stays as typed, so the form can say what is wrong with it.
 */
function NumberField({
  className,
  inputClassName,
  id,
  invalid,
  decrementLabel,
  incrementLabel,
  "aria-label": ariaLabel,
  integer = false,
  placeholder,
  format,
  ...props
}: NumberFieldProps) {
  const wholeNumbers: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 0 }
  const typing: React.ComponentProps<"input"> = integer
    ? {
        onKeyDown: (event) => {
          // Single printable keys that aren't digits; arrows, Backspace, Tab and shortcuts pass.
          if (event.key.length === 1 && !/\d/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault()
        },
        onPaste: (event) => {
          const digits = event.clipboardData.getData("text").replace(/\D/g, "")
          event.preventDefault()
          const input = event.currentTarget
          const next = input.value.slice(0, input.selectionStart ?? 0) + digits + input.value.slice(input.selectionEnd ?? 0)
          // Goes through the input's own setter and an input event, so the field sees the change.
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, next)
          input.dispatchEvent(new Event("input", { bubbles: true }))
        },
      }
    : {}
  return (
    <NumberFieldPrimitive.Root data-slot="number-field" className={cn("w-36", className)} format={integer ? { ...wholeNumbers, ...format } : format} {...props}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <NumberFieldPrimitive.Decrement
            aria-label={decrementLabel}
            data-slot="number-field-decrement"
            render={<InputGroupButton size="icon-xs" variant="ghost" />}
          >
            <MinusIcon />
          </NumberFieldPrimitive.Decrement>
        </InputGroupAddon>
        <NumberFieldPrimitive.Input
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          id={id}
          placeholder={placeholder}
          {...typing}
          render={<InputGroupInput className={cn("text-center tabular-nums", inputClassName)} />}
        />
        <InputGroupAddon align="inline-end">
          <NumberFieldPrimitive.Increment
            aria-label={incrementLabel}
            data-slot="number-field-increment"
            render={<InputGroupButton size="icon-xs" variant="ghost" />}
          >
            <PlusIcon />
          </NumberFieldPrimitive.Increment>
        </InputGroupAddon>
      </InputGroup>
    </NumberFieldPrimitive.Root>
  )
}

export { NumberField }
