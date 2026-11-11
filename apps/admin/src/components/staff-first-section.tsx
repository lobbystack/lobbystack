"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeStaffFirstMode, type RuntimeLocale } from "@lobbystack/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { SmallButtonSkeleton } from "@/components/loading-skeletons";
import { StaffFirstDialog, type StaffFirstPatch, type StaffFirstProfile } from "@/components/staff-first-dialog";
import { formatPhoneNumberDisplay } from "@/lib/phone";

export type { StaffFirstPatch, StaffFirstProfile } from "@/components/staff-first-dialog";

/** Where an agent's page scrolls to Staff answers first. */
export const STAFF_FIRST_ANCHOR = "staff-first";

/**
 * Staff answers first: which phone rings before the receptionist answers, and for how long. The row says
 * whether it's on and which phone rings; Set up or Edit opens the whole setting in a dialog.
 */
export function StaffFirstSection({ businessId, block, canManage, defaultLocale, isLoading, onSave, profile }: {
  businessId: string;
  block: "plan" | "carrier" | "setup" | null;
  canManage: boolean;
  defaultLocale: RuntimeLocale;
  isLoading: boolean;
  onSave: (patch: StaffFirstPatch) => Promise<void>;
  profile: StaffFirstProfile | null | undefined;
}) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const [open, setOpen] = useState(false);
  // What the last save sent, shown in the row until other settings come back from the server.
  const [lastSave, setLastSave] = useState<{ patch: StaffFirstPatch; profile: StaffFirstProfile | null | undefined } | null>(null);
  const saved = lastSave && lastSave.profile === profile ? lastSave.patch : null;
  const current: StaffFirstProfile | null | undefined = saved && profile ? { ...profile, ...saved } : profile;
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);

  // Links to the anchor scroll here once the settings have loaded, so the sections above stop moving.
  useEffect(() => {
    if (isLoading || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === `#${STAFF_FIRST_ANCHOR}`) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [isLoading]);

  const savedMode = normalizeStaffFirstMode(current?.staffFirstMode);
  const savedNumber = current?.staffFirstNumber ?? null;
  // A business that lost access can still turn the setting off.
  const disabled = !canManage || (block !== null && savedMode === "never");
  const modeLabel = t(`agent:staffFirst.mode.options.${savedMode}`);
  const state = savedMode !== "never" && savedNumber ? t("agent:staffFirst.state", { mode: modeLabel, number: formatPhoneNumberDisplay(savedNumber, i18n.language) }) : modeLabel;
  const titleId = `${STAFF_FIRST_ANCHOR}-row-title`;

  return (
    <section className="flex scroll-mt-20 flex-col gap-3 md:scroll-mt-6" id={STAFF_FIRST_ANCHOR} ref={sectionRef}>
      <h2 className="type-title">{t("agent:staffFirst.title")}</h2>
      <Surface className="flex flex-col">
        <Item variant="default">
          <ItemContent>
            <ItemTitle id={titleId}>{t("agent:staffFirst.mode.label")}</ItemTitle>
            {isLoading || !profile ? (
              // A div in the description's type, not the description itself: a placeholder is a div, which can't sit in a <p>.
              <div aria-hidden="true" className="type-body-muted" data-slot="staff-first-state-skeleton"><Skeleton className="h-[1lh] w-40 max-w-full" /></div>
            ) : (
              <>
                {/* Off while blocked says why instead; a business that lost access still sees what's on. */}
                {block && savedMode === "never" ? null : <ItemDescription>{state}</ItemDescription>}
                {block ? <ItemDescription>{t(`agent:staffFirst.unavailable.${block}`)}</ItemDescription> : null}
              </>
            )}
          </ItemContent>
          <ItemActions>
            {isLoading || !profile ? <SmallButtonSkeleton label={t("agent:staffFirst.setUp")} /> : (
              <Button aria-describedby={titleId} disabled={disabled} onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
                {savedMode === "never" ? t("agent:staffFirst.setUp") : t("agent:actions.edit")}
              </Button>
            )}
          </ItemActions>
        </Item>
      </Surface>
      <StaffFirstDialog
        businessId={businessId}
        defaultLocale={defaultLocale}
        onOpenChange={setOpen}
        onSave={async (patch) => {
          await onSave(patch);
          // Kept against the settings it was made on: once the refetch brings new ones, they take over.
          setLastSave({ patch, profile });
        }}
        open={open}
        profile={current}
      />
    </section>
  );
}
