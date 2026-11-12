"use client";

import { useTranslation } from "react-i18next";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxSearch, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { Flag } from "@/components/flag";
import { cn } from "@/lib/utils";
import type { PhoneCountryOption } from "@/lib/phone";

/** Shows the calling code, like the field's "+1"; the list underneath is searchable by country name or code. */
const TRIGGER_CLASS = "flex h-10 w-fit shrink-0 items-center justify-center gap-2.5 rounded-xl border border-input bg-input/30 px-3 py-2 type-body whitespace-nowrap [&_svg]:shrink-0 transition-colors outline-none enabled:hover:bg-input/50 group-has-[[data-slot=field-label]:hover]/field:enabled:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function PhoneCountrySelect({ ariaLabel, className, countries, disabled = false, onChange, value }: {
  ariaLabel: string;
  /** Sizing and corners of the trigger, which sits flush against the phone input. */
  className?: string;
  countries: PhoneCountryOption[];
  disabled?: boolean;
  onChange: (country: PhoneCountryOption["code"]) => void;
  value: PhoneCountryOption["code"] | null;
}) {
  const { t } = useTranslation("common");
  const selected = countries.find((option) => option.code === value) ?? null;
  return (
    <Combobox
      disabled={disabled}
      isItemEqualToValue={(item: PhoneCountryOption, other: PhoneCountryOption) => item.code === other.code}
      items={countries}
      // Searches the name and the code, so "serb" and "381" both find Serbia.
      itemToStringLabel={(option: PhoneCountryOption) => `${option.label} ${option.callingCode}`}
      onValueChange={(option: PhoneCountryOption | null) => { if (option && option.code !== value) onChange(option.code); }}
      value={selected}
    >
      <ComboboxTrigger aria-label={ariaLabel} className={cn(TRIGGER_CLASS, className)} data-phone-country-prefix>
        {selected ? <Flag region={selected.code} /> : null}
        <span>{selected?.callingCode ?? ""}</span>
      </ComboboxTrigger>
      <ComboboxContent className="min-w-72">
        <ComboboxSearch clearSearchLabel={t("accessibility.clearSearch")} placeholder={t("phoneCountry.search")} />
        <ComboboxEmpty>{t("phoneCountry.noResults")}</ComboboxEmpty>
        <ComboboxList>
          {(option: PhoneCountryOption) => (
            <ComboboxItem key={option.code} value={option}>
              <Flag region={option.code} />
              <span>{option.label}</span>
              <span className="text-muted-foreground">{option.callingCode}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
