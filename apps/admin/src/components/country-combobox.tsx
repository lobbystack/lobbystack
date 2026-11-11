"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Flag } from "@/components/flag";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import type { PhoneCountryOption } from "@/lib/phone";

/** Matches the country's name, its ISO code or its calling code, so "serb", "rs" and "381" all find Serbia. */
function matchesCountry(option: PhoneCountryOption, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/^\+/, "");
  return option.label.toLocaleLowerCase().includes(needle)
    || option.code.toLowerCase() === needle
    || (/^\d+$/.test(digits) && option.callingCode.replace(/^\+/, "").startsWith(digits));
}

/**
 * A country chosen as its own field. The field is the search box: closed, it
 * shows the chosen country's flag and name, and typing in it filters the list
 * that opens under it. A compact calling-code button beside a phone number
 * uses PhoneCountrySelect instead.
 */
export function CountryCombobox({ countries, id, onChange, placeholder, value }: {
  countries: readonly PhoneCountryOption[];
  id: string;
  onChange: (country: PhoneCountryOption["code"]) => void;
  placeholder: string;
  value: PhoneCountryOption["code"] | null;
}) {
  const { t } = useTranslation("common");
  const selected = countries.find((option) => option.code === value) ?? null;
  // The flag stands for the chosen country, so it steps aside while the owner types another.
  const [typed, setTyped] = useState<string | null>(null);
  const showsFlag = selected !== null && (typed === null || typed === selected.label);
  return (
    <Combobox
      autoHighlight
      filter={matchesCountry}
      isItemEqualToValue={(item: PhoneCountryOption, other: PhoneCountryOption) => item.code === other.code}
      items={countries}
      itemToStringLabel={(option: PhoneCountryOption) => option.label}
      onInputValueChange={(next) => setTyped(next)}
      onOpenChange={(open) => { if (!open) setTyped(null); }}
      onValueChange={(option: PhoneCountryOption | null) => { if (option && option.code !== value) onChange(option.code); }}
      value={selected}
    >
      <ComboboxInput autoComplete="off" id={id} onFocus={(event) => event.currentTarget.select()} placeholder={placeholder}>
        {showsFlag ? <InputGroupAddon align="inline-start"><Flag region={selected.code} /></InputGroupAddon> : null}
      </ComboboxInput>
      <ComboboxContent>
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
