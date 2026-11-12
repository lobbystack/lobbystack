"use client";

import { useMemo, useRef, useState } from "react";
import type { Country } from "react-phone-number-input/input";
import { useTranslation } from "react-i18next";

import { PhoneCountrySelect } from "@/components/phone-country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { getDefaultPhoneCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

/** What a phone field holds: the E.164 number, empty until it's complete, and whether digits were typed without making one. */
export type PhoneFieldValue = { phone: string; incomplete: boolean };

/**
 * A phone number with its country: the calling-code picker against the
 * number. Typing a "+" number switches the country to match.
 */
export function PhoneField({ id, countryLabel, value, onChange, errorId }: { id: string; countryLabel: string; value: string; onChange: (value: PhoneFieldValue) => void; errorId?: string | undefined }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const countries = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const [country, setCountry] = useState<Country>(() => (value ? inferPhoneCountry(value, getDefaultPhoneCountry(locale)) : getDefaultPhoneCountry(locale)) as Country);
  // What was typed, read when the number changes, so a blank field can be told apart from an incomplete one.
  const draft = useRef("");
  return (
    <div className="flex min-w-0">
      <PhoneCountrySelect ariaLabel={countryLabel} className="rounded-r-none px-4 font-medium" countries={countries} onChange={(next) => { setCountry(next as Country); draft.current = ""; onChange({ phone: "", incomplete: false }); }} value={country} />
      <PhoneInput
        aria-describedby={errorId}
        aria-invalid={errorId ? true : undefined}
        className="ph-mask rounded-l-none border-l-0"
        containerClassName="min-w-0 flex-1"
        country={country}
        id={id}
        limitNationalDigits
        locale={locale}
        onChange={(next) => onChange({ phone: next ?? "", incomplete: /\d/.test(draft.current) && !next })}
        onRawValueChange={(raw) => {
          draft.current = raw;
          if (raw.trim().startsWith("+")) { const inferred = inferPhoneCountry(raw, country); if (inferred && inferred !== country) setCountry(inferred as Country); }
        }}
        value={value}
      />
    </div>
  );
}
