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
  onRawValueChange?: (value: string) => void;
  value?: string | undefined;
};

type PhoneNumberTextInputProps = React.ComponentProps<"input"> & {
  onRawValueChange?: (value: string) => void;
};

const PhoneNumberTextInput = React.forwardRef<HTMLInputElement, PhoneNumberTextInputProps>(
  ({ className, onChange, onRawValueChange, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputClassName, className)}
      onChange={(event) => {
        onRawValueChange?.(event.target.value);
        onChange?.(event);
      }}
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
  onRawValueChange,
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
        onRawValueChange={onRawValueChange}
        placeholder={resolvedPlaceholder}
        type={props.type ?? "tel"}
        {...(value !== undefined ? { value } : {})}
      />
    </div>
  );
}
