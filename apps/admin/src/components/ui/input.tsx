import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

export const inputClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-input/30 px-3 py-2 text-base shadow-xs transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

/** What an empty password field shows: eight bullets, the character browsers mask typed passwords with, so no field needs its own wording. */
export const PASSWORD_PLACEHOLDER = "\u2022".repeat(8);

const DATE_TIME_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);

/**
 * iOS Safari draws date and time fields as native buttons with their own minimum width, wider than a phone's
 * field, and centers the value. Dropping the native look lets them take the field's width and height, value on the left.
 */
const dateTimeClassName = "appearance-none text-left [&::-webkit-date-and-time-value]:min-h-[1lh] [&::-webkit-date-and-time-value]:text-left"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const password = type === "password";
  const dateTime = type !== undefined && DATE_TIME_TYPES.has(type);
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      // Geist Sans draws small password bullets; monospace keeps them an even size, and the placeholder uses the same bullet.
      className={cn(inputClassName, password && "font-mono", dateTime && dateTimeClassName, className)}
      {...(password ? { placeholder: PASSWORD_PLACEHOLDER } : {})}
      {...props}
    />
  )
}

export { Input }
