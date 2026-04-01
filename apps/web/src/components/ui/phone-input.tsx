import * as React from "react";
import PhoneNumberInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input/input";

import { inputClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getDefaultPhoneCountry, getPhonePlaceholder } from "@/lib/phone";

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "defaultValue" | "onChange" | "value"
> & {
  defaultCountry?: Country;
  locale?: string | null;
  onChange?: (value?: string) => void;
  value?: string | undefined;
};

const PhoneNumberTextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputClassName, className)}
      {...props}
    />
  ),
);

PhoneNumberTextInput.displayName = "PhoneNumberTextInput";

export function PhoneInput({
  defaultCountry,
  disabled,
  locale,
  onChange,
  value,
  ...props
}: PhoneInputProps) {
  const resolvedDefaultCountry = defaultCountry ?? getDefaultPhoneCountry(locale);
  const resolvedPlaceholder = props.placeholder ?? getPhonePlaceholder(locale, {
    defaultCountry: resolvedDefaultCountry,
  });

  return (
    <div className="w-full">
      <PhoneNumberInput
        {...props}
        autoComplete={props.autoComplete ?? "tel"}
        defaultCountry={resolvedDefaultCountry as Country}
        disabled={disabled}
        inputMode={props.inputMode ?? "tel"}
        inputComponent={PhoneNumberTextInput}
        onChange={(nextValue) => onChange?.(nextValue)}
        placeholder={resolvedPlaceholder}
        type={props.type ?? "tel"}
        {...(value !== undefined ? { value } : {})}
      />
    </div>
  );
}
