"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CallForwardingDialog } from "@/components/call-forwarding-dialog";
import { useActivation } from "@/hooks/use-activation";
import { useOpenNumberStep } from "@/lib/number-step";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { openTestWindow, useTestWindowReady } from "@/lib/test-window";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { isWebsiteImportRunning, websiteImportHost, WebsiteImportProgress } from "./website-import-progress";

export function DashboardActivationCard({ businessId }: { businessId: string | undefined }) {
  const { t } = useTranslation("dashboard");
  const [forwardingOpen, setForwardingOpen] = useState(false);
  const openNumberStep = useOpenNumberStep();
  const testWindowReady = useTestWindowReady();
  const { canSetUp, data, eligible, heardItWork, needsNumberClaim, trialAvailable, trialNumber, upgrade } = useActivation(businessId);

  if (!businessId || !canSetUp || !data || !eligible) return null;

  if (isWebsiteImportRunning(data.websiteImport)) {
    return <WebsiteImportProgress job={data.websiteImport!} />;
  }

  if (trialNumber && !needsNumberClaim) {
    return (
      <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-card-title text-foreground">{t("activation.forwardTrial.title", { number: formatPhoneNumberDisplay(trialNumber) })}</p>
          <p className="type-body-muted">{t("activation.forwardTrial.description")}</p>
        </div>
        <Button className="shrink-0" onClick={() => setForwardingOpen(true)} type="button" variant="outline">{t("activation.forwardTrial.cta")}</Button>
        <CallForwardingDialog e164={trialNumber} onOpenChange={setForwardingOpen} open={forwardingOpen} />
      </Surface>
    );
  }

  if (trialAvailable && heardItWork && !needsNumberClaim) {
    return (
      <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-card-title text-foreground">{t("activation.freeTrial.title")}</p>
          <p className="type-body-muted">{t("activation.freeTrial.description")}</p>
        </div>
        <Button className="shrink-0" onClick={() => void openNumberStep(businessId!)} type="button">{t("activation.freeTrial.cta")}</Button>
      </Surface>
    );
  }

  const pagesRead = data.websiteImport?.status === "completed" ? data.websiteImport.indexedCount || data.websiteImport.importedCount : 0;
  const host = data.websiteImport ? websiteImportHost(data.websiteImport.websiteUrl) : null;

  return (
    <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="type-card-title text-foreground">
          {!heardItWork ? t("activation.hearIt.title") : needsNumberClaim ? t("activation.claimNumber.title") : t("activation.upgrade.title")}
        </p>
        <p className="type-body-muted">
          {!heardItWork
            ? pagesRead && host
              ? t("activation.hearIt.descriptionWithPages", { count: pagesRead, host })
              : t("activation.hearIt.description")
            : needsNumberClaim
              ? t("activation.claimNumber.description")
              : t("activation.upgrade.description")}
        </p>
      </div>
      {!heardItWork
        ? testWindowReady
          ? <Button className="shrink-0" onClick={() => openTestWindow()} type="button" variant="outline"><Phone />{t("activation.hearIt.cta")}</Button>
          : null
        : needsNumberClaim
          ? <Button className="shrink-0" nativeButton={false} render={<Link href="/agents/primary/channels/phone" />}>{t("activation.claimNumber.cta")}</Button>
          : <Button className="shrink-0" onClick={upgrade} type="button">{t("activation.upgrade.cta")}</Button>}
    </Surface>
  );
}
