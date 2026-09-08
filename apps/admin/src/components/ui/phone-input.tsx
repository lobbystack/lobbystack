import * as React from "react";
import PhoneNumberInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input/input";

import { inputClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatPhoneNationalInput,
  getDefaultPhoneCountry,
  getPhoneNationalDigits,
  getPhoneNationalInputValue,
  getPhoneNationalDigitLimit,
  getPhonePlaceholder,
  normalizePhoneNumber,
} from "@/lib/phone";

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "defaultValue" | "onChange" | "value"
> & {
  containerClassName?: string | undefined;
  country?: Country | undefined;
  defaultCountry?: Country | undefined;
  locale?: string | null | undefined;
  limitNationalDigits?: boolean | undefined;
  onChange?: ((value?: string) => void) | undefined;
  onRawValueChange?: ((value: string) => void) | undefined;
  value?: string | undefined;
};

type PhoneNumberTextInputProps = React.ComponentProps<"input"> & {
  onRawValueChange?: (value: string) => void;
};

const PhoneNumberTextInput = React.forwardRef<HTMLInputElement, PhoneNumberTextInputProps>(
  (
    {
      className,
      onChange,
      onRawValueChange,
      ...props
    },
    ref,
  ) => {
    return (
      <input
        ref={ref}
        className={cn(inputClassName, className)}
        onChange={(event) => {
          onRawValueChange?.(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
    );
  },
);

PhoneNumberTextInput.displayName = "PhoneNumberTextInput";

function NationalPhoneInput({
  className,
  containerClassName,
  country,
  disabled,
  onChange,
  onRawValueChange,
  value,
  ...props
}: PhoneInputProps & { country: Country }) {
  const [rawValue, setRawValue] = React.useState(() =>
    getPhoneNationalInputValue(value, country),
  );
  const lastCountryRef = React.useRef(country);
  const lastEmittedValueRef = React.useRef(value ?? "");

  React.useEffect(() => {
    const normalizedPropValue = value ?? "";

    if (lastCountryRef.current !== country) {
      lastCountryRef.current = country;
      lastEmittedValueRef.current = normalizedPropValue;
      setRawValue(getPhoneNationalInputValue(value, country));
      return;
    }

    if (normalizedPropValue !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = normalizedPropValue;
      setRawValue(getPhoneNationalInputValue(value, country));
    }
  }, [country, value]);

  const displayValue = formatPhoneNationalInput(rawValue, country);

  function emitPhoneValue(nextRawValue: string): void {
    const nextPhoneValue =
      normalizePhoneNumber(nextRawValue, { defaultCountry: country }) ?? "";
    lastEmittedValueRef.current = nextPhoneValue;
    onChange?.(nextPhoneValue || undefined);
  }

  return (
    <div className={cn("w-full", containerClassName)}>
      <input
        {...props}
        autoComplete={props.autoComplete ?? "tel"}
        className={cn(inputClassName, className)}
        disabled={disabled}
        inputMode={props.inputMode ?? "tel"}
        onChange={(event) => {
          const nextValue = event.target.value;
          onRawValueChange?.(nextValue);

          if (nextValue.trim().startsWith("+")) {
            const nextPhoneValue =
              normalizePhoneNumber(nextValue, { defaultCountry: country }) ?? "";
            const nextRawValue = getPhoneNationalInputValue(
              nextPhoneValue || nextValue,
              country,
            );

            lastEmittedValueRef.current = nextPhoneValue;
            setRawValue(nextRawValue);
            onChange?.(nextPhoneValue || undefined);
            return;
          }

          const nextDigits = getPhoneNationalDigits(nextValue, country);
          const limit = getPhoneNationalDigitLimit(country, nextDigits);
          const nextRawValue =
            limit !== undefined ? nextDigits.slice(0, limit) : nextDigits;

          setRawValue(nextRawValue);
          emitPhoneValue(nextRawValue);
        }}
        type={props.type ?? "tel"}
        value={displayValue}
      />
    </div>
  );
}

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

  if (limitNationalDigits) {
    return (
      <NationalPhoneInput
        {...props}
        containerClassName={containerClassName}
        country={resolvedDefaultCountry as Country}
        disabled={disabled}
        onChange={onChange}
        onRawValueChange={onRawValueChange}
        placeholder={resolvedPlaceholder}
        value={value}
      />
    );
  }

  return (
    <div className={cn("w-full", containerClassName)}>
      <PhoneNumberInput
        {...props}
        autoComplete={props.autoComplete ?? "tel"}
        disabled={disabled}
        inputMode={props.inputMode ?? "tel"}
        inputComponent={PhoneNumberTextInput}
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
