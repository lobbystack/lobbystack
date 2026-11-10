"use client";

import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { openTestWindow, useTestWindowReady } from "@/lib/test-window";

/**
 * Opens the one test window the shell keeps mounted, for an agent or, without
 * one, the default agent. The shell mounts the window for people who can set
 * agents up; until it's there, a placeholder holds the button's place. Phones
 * get the header's button.
 */
export function TestCallButton({ agentId, variant = "outline" }: { agentId?: string; variant?: "default" | "outline" }) {
  const { t } = useTranslation("common");
  const ready = useTestWindowReady();
  const can = useBusinessCan();
  const { business, businesses } = useActiveBusiness();
  if (!can("setup")) return null;
  if (!ready) {
    if (!business && !businesses.isLoading) return null;
    return (
      <Skeleton aria-hidden="true" className="hidden h-8 shrink-0 items-center gap-1.5 rounded-4xl px-3 text-sm font-medium whitespace-nowrap md:inline-flex">
        <span className="invisible size-4 shrink-0" />
        <span className="invisible">{t("testCall.trigger")}</span>
      </Skeleton>
    );
  }
  return <Button className="hidden md:inline-flex" onClick={() => openTestWindow(agentId ? { agentId } : {})} size="sm" type="button" variant={variant}><Phone data-icon="inline-start" />{t("testCall.trigger")}</Button>;
}
