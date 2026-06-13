import * as React from "react";
import PhoneNumberInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input/input";

import { inputClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getDefaultPhoneCountry,
  getPhoneNationalDigitLimit,
  getPhonePlaceholder,
} from "@/lib/phone";

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "defaultValue" | "onChange" | "value"
> & {
  containerClassName?: string;
  country?: Country;
  defaultCountry?: Country;
  locale?: string | null;
  limitNationalDigits?: boolean;
  onChange?: (value?: string) => void;
  onRawValueChange?: (value: string) => void;
  value?: string | undefined;
};

type PhoneNumberTextInputProps = React.ComponentProps<"input"> & {
  nationalDigitLimitCountry?: Country;
  onRawValueChange?: (value: string) => void;
};

function getDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function exceedsNationalDigitLimit(
  value: string,
  country: Country | undefined,
): boolean {
  if (!country || value.trim().startsWith("+")) {
    return false;
  }

  const nextDigits = getDigits(value);
  const limit = getPhoneNationalDigitLimit(country, nextDigits);

  return limit !== undefined && nextDigits.length > limit;
}

const PhoneNumberTextInput = React.forwardRef<HTMLInputElement, PhoneNumberTextInputProps>(
  (
    {
      className,
      nationalDigitLimitCountry,
      onChange,
      onRawValueChange,
      value,
      ...props
    },
    ref,
  ) => (
    <input
      ref={ref}
      className={cn(inputClassName, className)}
      onChange={(event) => {
        if (exceedsNationalDigitLimit(event.target.value, nationalDigitLimitCountry)) {
          const previousValue = typeof value === "string" ? value : "";
          event.currentTarget.value = previousValue;
          event.currentTarget.setSelectionRange(previousValue.length, previousValue.length);
          return;
        }

        onRawValueChange?.(event.target.value);
        onChange?.(event);
      }}
      value={value}
      {...props}
    />
  ),
);

PhoneNumberTextInput.displayName = "PhoneNumberTextInput";

export function PhoneInput({
  containerClassName,
  country,
  defaultCountry,
  disabled,
  limitNationalDigits,
  locale,
  onChange,
  onRawValueChange,
  value,
  ...props
}: PhoneInputProps) {
  const resolvedDefaultCountry = country ?? defaultCountry ?? getDefaultPhoneCountry(locale);
  const resolvedPlaceholder = props.placeholder ?? getPhonePlaceholder(locale, {
    defaultCountry: resolvedDefaultCountry,
  });
  const inputComponent = React.useMemo(() => {
    if (!limitNationalDigits) {
      return PhoneNumberTextInput;
    }

    const nationalDigitLimitCountry = resolvedDefaultCountry as Country;
    const LimitedPhoneNumberTextInput = React.forwardRef<
      HTMLInputElement,
      PhoneNumberTextInputProps
    >((inputProps, ref) => (
      <PhoneNumberTextInput
        {...inputProps}
        ref={ref}
        nationalDigitLimitCountry={nationalDigitLimitCountry}
      />
    ));
    LimitedPhoneNumberTextInput.displayName = "LimitedPhoneNumberTextInput";

    return LimitedPhoneNumberTextInput;
  }, [limitNationalDigits, resolvedDefaultCountry]);

  return (
    <div className={cn("w-full", containerClassName)}>
      <PhoneNumberInput
        {...props}
        autoComplete={props.autoComplete ?? "tel"}
        disabled={disabled}
        inputMode={props.inputMode ?? "tel"}
        inputComponent={inputComponent}
        onChange={(nextValue) => onChange?.(nextValue)}
        onRawValueChange={onRawValueChange}
        placeholder={resolvedPlaceholder}
        smartCaret={false}
        type={props.type ?? "tel"}
        {...(country !== undefined ? { country } : {})}
        {...(country === undefined ? { defaultCountry: resolvedDefaultCountry as Country } : {})}
        {...(value !== undefined ? { value } : {})}
      />
    </div>
  );
}
