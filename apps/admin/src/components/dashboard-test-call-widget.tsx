"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import { webCallEndpoint } from "@/lib/web-call-endpoint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type TestCallWidgetProps = {
  businessId?: string;
  businessSlug?: string;
  className?: string;
};

type WebVoiceControls = {
  forceEndCall: () => Promise<void>;
  startCall: () => Promise<void>;
};

export function DashboardTestCallWidget({
  businessId,
  businessSlug,
  className,
}: TestCallWidgetProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const voiceControlsRef = useRef<WebVoiceControls | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      void voiceControlsRef.current?.forceEndCall();
    }
    setOpen(nextOpen);
  };

  const handleTestCallClick = () => {
    setOpen(true);
    void voiceControlsRef.current?.startCall();
  };

  if (!businessSlug) {
    return null;
  }

  return (
    <div className={cn("hidden items-center md:flex", className)}>
      <Button
        aria-label={t("testCall.trigger")}
        onClick={handleTestCallClick}
        size="sm"
        type="button"
        variant="outline"
      >
        <Phone className="text-sidebar-foreground" />
        <span className="text-sidebar-foreground">{t("testCall.trigger")}</span>
      </Button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent
          className="border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[34rem]"
          overlayClassName="bg-black/60 backdrop-blur-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("testCall.title")}</DialogTitle>
            <DialogDescription>{t("testCall.description")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <TestCallAuraPortal open={open}>
        <TestCallAura
          businessId={businessId}
          businessSlug={businessSlug}
          onCallEnded={() => setOpen(false)}
          onRegisterControls={(controls) => {
            voiceControlsRef.current = controls;
          }}
        />
      </TestCallAuraPortal>
    </div>
  );
}

function TestCallAuraPortal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-hidden={!open}
      className={cn(
        "pointer-events-none fixed inset-0 z-[70] flex items-center justify-center transition-opacity duration-100",
        open ? "opacity-100" : "invisible opacity-0",
      )}
    >
      <div className="pointer-events-auto w-full max-w-[22rem] md:max-w-[30rem]">
        {children}
      </div>
    </div>,
    document.body,
  );
}

type TestCallAuraProps = {
  businessId?: string | undefined;
  businessSlug: string;
  onCallEnded: () => void;
  onRegisterControls: (controls: WebVoiceControls) => void;
};

function TestCallAura({
  businessId,
  businessSlug,
  onCallEnded,
  onRegisterControls,
}: TestCallAuraProps) {
  const getStartPayload = useCallback(async (): Promise<Record<string, string>> => {
    if (!businessId) return {};
    const response = await fetch(`/api/voice/test-call/proof?businessId=${encodeURIComponent(businessId)}`, { credentials: "include" });
    if (!response.ok) throw new Error("Test calls are unavailable.");
    const { proof } = await response.json() as { proof: string };
    return { dashboardTestCallProof: proof };
  }, [businessId]);

  return (
    <AuraVoiceDemo
      auraTone="dark"
      businessSlug={businessSlug}
      className="w-full"
      endpoint={webCallEndpoint}
      getStartPayload={getStartPayload}
      onCallEnded={onCallEnded}
      onRegisterControls={onRegisterControls}
      widgetId="lobbystack-dashboard-test-call"
    />
  );
}
