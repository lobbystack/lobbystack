"use client";

import { useTranslation } from "react-i18next";

import { LiveKnowledgeSurface } from "@/components/live-knowledge-surface";
import { LivePhoneNumberSettingsSurface } from "@/components/live-phone-number-settings-surface";
import { LiveServicesSurface } from "@/components/live-services-surface";
import { LiveWidgetSettingsSurface } from "@/components/live-widget-settings-surface";
import { BusinessPage, SharedUsageNotice } from "./business-page";
import { RoutingSection } from "./routing-section";

export { CalendarSurface } from "./calendar-surface";
export { InboxSurface } from "./inbox-surface";
export { StaffSurface } from "./staff-surface";

export function ServicesSurface() {
  const { t } = useTranslation("receptionists");
  return <BusinessPage notice={<SharedUsageNotice kind="services" />} title={t("nav.services")}><LiveServicesSurface /></BusinessPage>;
}

export function KnowledgeSurface() {
  const { t } = useTranslation("receptionists");
  return <BusinessPage notice={<SharedUsageNotice kind="knowledge" />} title={t("nav.knowledge")}><LiveKnowledgeSurface /></BusinessPage>;
}

/** Numbers and the website widget, with which receptionist answers each. */
export function NumbersSurface() {
  const { t } = useTranslation("receptionists");
  return (
    <BusinessPage title={t("nav.numbers")}>
      <div className="flex flex-col gap-10">
        <RoutingSection />
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">{t("numbersPage.phoneTitle")}</h2>
          <LivePhoneNumberSettingsSurface />
        </section>
        <section className="flex flex-col gap-3" id="widget">
          <h2 className="font-heading text-sm leading-snug font-medium">{t("numbersPage.widgetTitle")}</h2>
          <LiveWidgetSettingsSurface />
        </section>
      </div>
    </BusinessPage>
  );
}
