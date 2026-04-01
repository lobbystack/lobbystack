import * as React from "react";
import PhoneNumberInput from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  getDefaultPhoneCountry,
  getPhoneCountryOptions,
  getPhoneLabels,
  inferPhoneCountry,
} from "@/lib/phone";

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
  (props, ref) => <Input ref={ref} {...props} />,
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
  const labels = React.useMemo(() => getPhoneLabels(locale), [locale]);
  const countryOptions = React.useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const [selectedCountry, setSelectedCountry] = React.useState<Country>(
    inferPhoneCountry(value, resolvedDefaultCountry) ?? resolvedDefaultCountry,
  );

  React.useEffect(() => {
    const inferredCountry = inferPhoneCountry(value, undefined);
    if (inferredCountry) {
      setSelectedCountry(inferredCountry);
    }
  }, [value]);

  React.useEffect(() => {
    if (!value) {
      setSelectedCountry(resolvedDefaultCountry);
    }
  }, [resolvedDefaultCountry, value]);

  return (
    <div className="flex w-full items-center gap-2">
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => setSelectedCountry(nextValue as Country)}
        value={selectedCountry}
      >
        <SelectTrigger
          aria-label={labels.country ?? "Country"}
          className="w-24 shrink-0"
        >
          <SelectValue>
            {selectedCountry
              ? `${selectedCountry} ${
                  countryOptions.find((option) => option.code === selectedCountry)?.callingCode ?? ""
                }`
              : labels.ZZ ?? "International"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {countryOptions.map((countryOption) => (
            <SelectItem key={countryOption.code} value={countryOption.code}>
              {countryOption.label} ({countryOption.callingCode})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <PhoneNumberInput
        {...props}
        autoComplete={props.autoComplete ?? "tel"}
        defaultCountry={selectedCountry}
        disabled={disabled}
        inputMode={props.inputMode ?? "tel"}
        inputComponent={PhoneNumberTextInput}
        onChange={(nextValue) => onChange?.(nextValue)}
        type={props.type ?? "tel"}
        {...(value !== undefined ? { value } : {})}
      />
    </div>
  );
}
