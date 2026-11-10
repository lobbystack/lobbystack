"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

type SearchInputProps = Omit<React.ComponentProps<"input">, "onChange" | "type" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Sizing of the group around the input. */
  groupClassName?: string;
};

/** A search field with a clear button that appears once something is typed. */
export function SearchInput({ groupClassName, onValueChange, value, ...props }: SearchInputProps) {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <InputGroupInput
      onChange={(event) => onValueChange(event.target.value)}
      ref={inputRef}
      value={value}
      {...props}
    />
  );
  return (
    <InputGroup className={groupClassName}>
      <InputGroupAddon align="inline-start">
        <Search aria-hidden="true" />
      </InputGroupAddon>
      {input}
      {value.length > 0 ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={t("accessibility.clearSearch")}
            onClick={() => {
              onValueChange("");
              inputRef.current?.focus();
            }}
            size="icon-xs"
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
