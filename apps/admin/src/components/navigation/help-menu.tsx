"use client";

import Link from "next/link";
import { useState } from "react";
import { brandLinks } from "@lobbystack/shared";
import { BookOpen, CircleHelp, Gift, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBranding } from "@/components/branding-provider";
import { DashboardFeedbackDialog } from "@/components/dashboard-feedback-widget";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveBusiness } from "@/hooks/use-active-business";

/**
 * The Help Center, the affiliate program and feedback. A partner's
 * businesses never get the host's docs or marketing, so they see feedback
 * alone. `side` says where the menu opens from the button.
 */
export function HelpMenu({ side = "top" }: { side?: "top" | "right" | "bottom" | "left" }) {
  const { t } = useTranslation(["nav", "common"]);
  const { partner } = useBranding();
  const { business } = useActiveBusiness();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const docsHref = partner ? null : brandLinks().docsUrl;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button aria-label={t("nav:help")} size="icon-sm" type="button" variant="ghost" />}><CircleHelp /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52 rounded-xl" side={side} sideOffset={4}>
          <DropdownMenuGroup>
            {docsHref ? <DropdownMenuItem render={<a aria-label={t("common:feedback.helpCenter")} href={docsHref} rel="noreferrer" target="_blank" />}><BookOpen />{t("common:feedback.helpCenter")}</DropdownMenuItem> : null}
            {partner ? null : <DropdownMenuItem render={<Link href="/affiliate" />}><Gift />{t("nav:items.affiliate")}</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => setFeedbackOpen(true)}><MessageSquare />{t("common:feedback.trigger")}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DashboardFeedbackDialog businessId={business?.businessId} onOpenChange={setFeedbackOpen} open={feedbackOpen} />
    </>
  );
}
