"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { PartnerAccessLevel } from "@lobbystack/shared";
import { cn } from "@/lib/utils";

const ACCESS_LEVELS: PartnerAccessLevel[] = ["full", "activity"];

/**
 * The access level a partner gives a business's own operators, as a radio
 * group with what each level lets them do. The partner console asks it when
 * it creates a business or a prospect demo.
 */
export function AccessLevelOptions({ value, onChange }: { value: PartnerAccessLevel; onChange: (level: PartnerAccessLevel) => void }) {
  const { t } = useTranslation("partner");
  const id = useId();
  return (
    <div aria-label={t("businesses.create.accessLabel")} className="flex flex-col gap-3" role="radiogroup">
      {ACCESS_LEVELS.map((level) => {
        const selected = value === level;
        return (
          <button aria-checked={selected} aria-describedby={`${id}-${level}-help`} aria-labelledby={`${id}-${level}`} className="flex w-full items-start gap-3 py-1 text-left" key={level} onClick={() => onChange(level)} role="radio" type="button">
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-foreground" : "border-muted-foreground")}>{selected ? <span className="size-2 rounded-full bg-foreground" /> : null}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium" id={`${id}-${level}`}>{t(`businesses.access.${level}`)}</span>
              <span className="text-sm leading-6 text-muted-foreground" id={`${id}-${level}-help`}>{t(`businesses.create.access.${level}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
