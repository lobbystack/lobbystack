"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";

export const settingRowClassName = "rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0";

type TextSettingRowProps = {
  id: string;
  label: string;
  description?: string;
  /** The saved value, which the dialog opens with. */
  value: string;
  disabled: boolean;
  /** Saves the trimmed draft, and resolves true when the dialog may close. */
  onSave: (value: string) => Promise<boolean>;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  /** A single-line field, for short values such as a name. */
  singleLine?: boolean;
  /** Whether an empty value can be saved, which clears the setting. */
  allowEmpty?: boolean;
};

/** A setting row whose Edit button opens a dialog with one text field. */
export function TextSettingRow({ allowEmpty = false, description, disabled, id, label, maxLength, onSave, placeholder, rows = 3, singleLine = false, value }: TextSettingRowProps) {
  const { t } = useTranslation("agent");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (await onSave(draft.trim())) setOpen(false);
    } finally {
      setSaving(false);
    }
  }
  const field = { autoFocus: true, disabled: saving, id, maxLength, onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(event.target.value), placeholder, value: draft };
  return (
    <Item className={settingRowClassName} variant="default">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {/* The saved value, so the row shows what's set; the hint only until there is one. */}
        {value || description ? <ItemDescription className={value ? "text-foreground/80" : undefined}>{value || description}</ItemDescription> : null}
      </ItemContent>
      <ItemActions className="w-full justify-end self-center sm:w-auto">
        <Button aria-label={t("agent:actions.editField", { field: label })} disabled={disabled} onClick={() => { setDraft(value); setOpen(true); }} size="sm" type="button" variant="outline">
          {t("agent:actions.edit")}
        </Button>
      </ItemActions>
      <Dialog onOpenChange={(next) => { if (!next && !saving) setOpen(false); }} open={open}>
        <DialogContent size="sm" className="flex flex-col gap-4">
          <DialogHeader><DialogTitle>{label}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>
          {singleLine ? <Input aria-label={label} {...field} /> : <Textarea aria-label={label} rows={rows} {...field} />}
          <DialogFooter>
            <Button disabled={saving} onClick={() => setOpen(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
            <Button disabled={saving || (!allowEmpty && !draft.trim())} onClick={() => void save()} type="button">
              {saving ? t("agent:actions.saving") : t("agent:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Item>
  );
}
