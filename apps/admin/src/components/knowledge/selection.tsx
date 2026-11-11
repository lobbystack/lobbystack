"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type Selection = {
  selecting: boolean;
  selected: ReadonlySet<string>;
  start: () => void;
  stop: () => void;
  toggle: (id: string) => void;
  toggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
};

/**
 * Selection mode for a table: off until the person clicks Select, then a
 * checkbox per row and one for all of them. Escape or Cancel leaves it and
 * clears the selection. Rows that leave the table leave the selection too.
 */
export function useSelection(ids: readonly string[]): Selection {
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const selected = useMemo(() => new Set(ids.filter((id) => chosen.has(id))), [chosen, ids]);
  const stop = useCallback(() => { setSelecting(false); setChosen(new Set()); }, []);
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, stop]);
  const allSelected = ids.length > 0 && selected.size === ids.length;
  return {
    selecting,
    selected,
    start: () => setSelecting(true),
    stop,
    toggle: (id) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    toggleAll: () => setChosen(allSelected ? new Set() : new Set(ids)),
    allSelected,
    someSelected: selected.size > 0 && !allSelected,
  };
}

export type SelectionAction = { id: string; label: string; onClick: (ids: string[]) => void; destructive?: boolean; disabled?: boolean };

/**
 * Above a table: a Select button, or in selection mode the number selected,
 * its actions and Cancel. Each action gets the ids selected.
 */
export function SelectionBar({ selection, actions, disabled = false, label }: { selection: Selection; actions: SelectionAction[]; disabled?: boolean; label?: string }) {
  const { t } = useTranslation("agent");
  if (!selection.selecting) {
    return <Button disabled={disabled} onClick={selection.start} size="sm" type="button" variant="outline">{t("sections.knowledge.selection.select")}</Button>;
  }
  const ids = [...selection.selected];
  return (
    <div aria-label={label} className="flex flex-wrap items-center gap-2" role="toolbar">
      <span aria-live="polite" className="type-body-muted tabular-nums">{t("sections.knowledge.selection.count", { count: ids.length })}</span>
      {actions.map((action) => <Button disabled={!ids.length || action.disabled} key={action.id} onClick={() => action.onClick(ids)} size="sm" type="button" variant={action.destructive ? "destructive" : "outline"}>{action.label}</Button>)}
      <Button onClick={selection.stop} size="sm" type="button" variant="ghost">{t("sections.knowledge.selection.cancel")}</Button>
    </div>
  );
}

export function SelectAllCheckbox({ selection }: { selection: Selection }) {
  const { t } = useTranslation("agent");
  return <Checkbox aria-label={t("sections.knowledge.selection.selectAll")} checked={selection.allSelected} indeterminate={selection.someSelected} onCheckedChange={selection.toggleAll} />;
}

export function RowCheckbox({ selection, id, title }: { selection: Selection; id: string; title: string }) {
  const { t } = useTranslation("agent");
  return <Checkbox aria-label={t("sections.knowledge.selection.selectRow", { title })} checked={selection.selected.has(id)} onCheckedChange={() => selection.toggle(id)} onClick={(event) => event.stopPropagation()} />;
}
