"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeBookingMode } from "@lobbystack/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { startTestCall } from "@/lib/test-call-launcher";
import { receptionistPath, type ReceptionistSection } from "@/lib/navigation-routes";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { DeleteReceptionistSection } from "./delete-receptionist";
import { ReceptionistPage, useReceptionist, useReceptionistsOverview } from "./receptionist-page";

/** A summary of the receptionist, with a test call in the page header. */
export function ReceptionistOverviewSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["receptionists", "common"]);
  const query = useReceptionist(agentId);
  const navigation = useNavigationSnapshot();
  const overview = useReceptionistsOverview();
  const profile = query.data?.profile;
  const summary = overview.data?.receptionists.find((receptionist) => receptionist.id === agentId);
  const language = profile?.language ?? query.data?.business?.defaultLocale ?? "en";
  const cards: Array<{ section: ReceptionistSection; title: string; value: string; detail?: string }> = profile ? [
    { section: "behavior", title: t("overview.greeting"), value: profile.greeting, detail: t("overview.voiceAndLanguage", { voice: profile.voice ? profile.voice.charAt(0).toUpperCase() + profile.voice.slice(1) : t("behavior.voice.default"), language: language === "fr" ? t("common:language.french") : t("common:language.english") }) },
    { section: "booking", title: t("overview.booking"), value: t(`booking.mode.options.${normalizeBookingMode(profile.bookingMode)}`) },
    { section: "transfers", title: t("overview.transfers"), value: t(`transfers.mode.options.${profile.transferMode}`, { defaultValue: profile.transferMode }), ...(profile.transferNumber ? { detail: profile.transferNumber } : {}) },
    { section: "numbers", title: t("overview.routes"), value: t("overview.routeCount", { numbers: t("overview.numbers", { count: summary?.phoneNumberCount ?? 0 }), widgets: t("overview.widgets", { count: summary?.widgetKeyCount ?? 0 }) }) },
  ] : [];

  return (
    <ReceptionistPage
      actions={<Button onClick={() => startTestCall()} type="button"><Phone data-icon="inline-start" />{t("overview.testCall")}</Button>}
      agentId={agentId}
      description={t("overview.description")}
      section="overview"
    >
      <div className="flex flex-col gap-8">
      {!profile ? <Skeleton className="h-48 w-full rounded-xl" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring" href={receptionistPath(agentId, card.section)} key={card.section}>
              <Card className="h-full rounded-xl transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardDescription>{card.title}</CardDescription>
                  <CardTitle className="ph-mask line-clamp-2 text-base">{card.value}</CardTitle>
                </CardHeader>
                {card.detail ? <CardContent className="ph-mask text-sm text-muted-foreground">{card.detail}</CardContent> : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
      {(navigation?.receptionists.length ?? 0) > 1 ? <DeleteReceptionistSection agentId={agentId} /> : null}
      </div>
    </ReceptionistPage>
  );
}
