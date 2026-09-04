import * as React from "react";
import PhoneNumberInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input/input";

import { inputClassName } from "./input";
import { cn } from "@/lib/utils";
import { getDefaultPhoneCountry, getPhonePlaceholder } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<"input">, "defaultValue" | "onChange" | "value"> & { containerClassName?: string; country?: Country; defaultCountry?: Country; locale?: string | null; limitNationalDigits?: boolean; onChange?: (value?: string) => void; onRawValueChange?: (value: string) => void; value?: string };
type TextInputProps = React.ComponentProps<"input"> & { onRawValueChange?: (value: string) => void };

const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(({ className, onChange, onRawValueChange, ...props }, ref) => <input ref={ref} className={cn(inputClassName, className)} onChange={(event) => { onRawValueChange?.(event.target.value); onChange?.(event); }} {...props} />);
TextInput.displayName = "PhoneNumberTextInput";

export function PhoneInput({ containerClassName, country, defaultCountry, disabled, locale, onChange, onRawValueChange, value, ...props }: PhoneInputProps) {
  const resolvedCountry = country ?? defaultCountry ?? getDefaultPhoneCountry(locale);
  return <div className={cn("w-full", containerClassName)}><PhoneNumberInput {...props} autoComplete={props.autoComplete ?? "tel"} country={resolvedCountry as Country} disabled={disabled} inputComponent={TextInput} onChange={(nextValue) => onChange?.(nextValue)} onRawValueChange={onRawValueChange} placeholder={props.placeholder ?? getPhonePlaceholder(locale, { defaultCountry: resolvedCountry })} smartCaret={false} type="tel" {...(value !== undefined ? { value } : {})} /></div>;
}
