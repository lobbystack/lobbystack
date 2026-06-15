import { useCallback, useRef, useState } from "react";
import { Phone } from "lucide-react";
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

export function TestCallWidget({
  businessId,
  businessSlug,
  className,
}: TestCallWidgetProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const forceEndCallRef = useRef<(() => Promise<void>) | null>(null);

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
      void forceEndCallRef.current?.();
    }
    setOpen(nextOpen);
  };

  if (!businessSlug) {
    return null;
  }

  return (
    <div className={cn("hidden items-center md:flex", className)}>
      <Button
        aria-label={t("testCall.trigger")}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Phone className="text-muted-foreground" />
        <span className="text-muted-foreground">{t("testCall.trigger")}</span>
      </Button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent
          className="border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-md"
          overlayClassName="bg-black/60 backdrop-blur-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("testCall.title")}</DialogTitle>
            <DialogDescription>{t("testCall.description")}</DialogDescription>
          </DialogHeader>
          {open ? (
            <TestCallAura
              businessSlug={businessSlug}
              onEvent={handleEvent}
              onRegisterForceEnd={(forceEnd) => {
                forceEndCallRef.current = forceEnd;
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TestCallAuraProps = {
  businessSlug: string;
  onEvent: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  onRegisterForceEnd: (forceEnd: () => Promise<void>) => void;
};

function TestCallAura({
  businessSlug,
  onEvent,
  onRegisterForceEnd,
}: TestCallAuraProps) {
  return (
    <AuraVoiceDemo
      businessSlug={businessSlug}
      endpoint={getWebCallEndpoint()}
      onEvent={onEvent}
      onRegisterControls={({ forceEndCall }) => {
        onRegisterForceEnd(forceEndCall);
      }}
      widgetId={DASHBOARD_TEST_CALL_WIDGET_ID}
    />
  );
}
