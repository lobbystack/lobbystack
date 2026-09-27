"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";

export type SharedToggleItem = { id: string; title: string; description?: string; enabled: boolean; usedBy: { all: boolean; names: string[] } };

/** "Used by all receptionists" or the names of the ones that use it. */
export function UsedByLabel({ usedBy, receptionistCount }: { usedBy: { all: boolean; names: string[] }; receptionistCount: number }) {
  const { i18n, t } = useTranslation("receptionists");
  // With one receptionist there is nobody to share with, so say nothing.
  if (receptionistCount < 2) return null;
  if (usedBy.all) return <Badge variant="secondary">{t("shared.all")}</Badge>;
  if (usedBy.names.length === 0) return <Badge variant="outline">{t("shared.none")}</Badge>;
  return <Badge variant="outline">{t("shared.some", { names: new Intl.ListFormat(i18n.resolvedLanguage ?? i18n.language, { type: "conjunction" }).format(usedBy.names) })}</Badge>;
}

/**
 * Shared business items (knowledge, services) with one switch each for this
 * receptionist. A switch saves at once and a toast confirms.
 */
export function SharedToggleList({ title, description, items, emptyLabel, manageHref, manageLabel, canManage, onToggle, receptionistCount }: {
  receptionistCount: number;
  title: string;
  description: string;
  items: SharedToggleItem[];
  emptyLabel: string;
  manageHref: string;
  manageLabel: string;
  canManage: boolean;
  onToggle: (item: SharedToggleItem, enabled: boolean) => Promise<void>;
}) {
  const { t } = useTranslation("receptionists");
  const [pending, setPending] = useState<string | null>(null);
  async function toggle(item: SharedToggleItem, enabled: boolean) {
    setPending(item.id);
    try {
      await onToggle(item, enabled);
      toast.success(enabled ? t("shared.turnedOn", { title: item.title }) : t("shared.turnedOff", { title: item.title }));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-sm leading-snug font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button nativeButton={false} render={<Link href={manageHref} />} size="sm" variant="outline">{manageLabel}</Button>
      </div>
      <Surface className="flex flex-col">
        {items.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{emptyLabel}</p> : items.map((item) => (
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={item.id} variant="default">
            <ItemContent>
              <ItemTitle className="ph-mask">{item.title}</ItemTitle>
              {item.description ? <ItemDescription className="ph-mask line-clamp-1">{item.description}</ItemDescription> : null}
              {receptionistCount > 1 ? <div><UsedByLabel receptionistCount={receptionistCount} usedBy={item.usedBy} /></div> : null}
            </ItemContent>
            <ItemActions>
              <Switch aria-label={item.title} checked={item.enabled} disabled={!canManage || pending === item.id} onCheckedChange={(checked) => void toggle(item, checked)} />
            </ItemActions>
          </Item>
        ))}
      </Surface>
    </section>
  );
}
