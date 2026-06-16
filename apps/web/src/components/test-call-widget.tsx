import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { TelemetryEventName } from "@lobbystack/telemetry";
import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import {
  DASHBOARD_TEST_CALL_WIDGET_ID,
  getWebCallEndpoint,
} from "@/components/web-voice/config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type TestCallWidgetProps = {
  businessId?: Id<"businesses">;
  businessSlug?: string;
  className?: string;
};

type WebVoiceControls = {
  forceEndCall: () => Promise<void>;
  startCall: () => Promise<void>;
};

export function TestCallWidget({
  businessId,
  businessSlug,
  className,
}: TestCallWidgetProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const voiceControlsRef = useRef<WebVoiceControls | null>(null);

  const handleEvent = useCallback(
    (eventName: TelemetryEventName, properties?: Record<string, unknown>) => {
      captureAnalyticsEvent(eventName, {
        ...(businessId ? { businessId: String(businessId) } : {}),
        ...properties,
      });
    },
    [businessId],
  );

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
        <Phone className="text-muted-foreground" />
        <span className="text-muted-foreground">{t("testCall.trigger")}</span>
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
          businessSlug={businessSlug}
          onCallEnded={() => setOpen(false)}
          onEvent={handleEvent}
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
  businessSlug: string;
  onCallEnded: () => void;
  onEvent: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  onRegisterControls: (controls: WebVoiceControls) => void;
};

function TestCallAura({
  businessSlug,
  onCallEnded,
  onEvent,
  onRegisterControls,
}: TestCallAuraProps) {
  return (
    <AuraVoiceDemo
      auraTone="dark"
      businessSlug={businessSlug}
      className="w-full"
      endpoint={getWebCallEndpoint()}
      onCallEnded={onCallEnded}
      onEvent={onEvent}
      onRegisterControls={onRegisterControls}
      widgetId={DASHBOARD_TEST_CALL_WIDGET_ID}
    />
  );
}
