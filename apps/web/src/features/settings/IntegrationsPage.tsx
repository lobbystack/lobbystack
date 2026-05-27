import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceClassName } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { useObservedAction } from "@/lib/observed-convex";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { captureAnalyticsEvent, captureAnalyticsException } from "@/lib/analytics";

type IntegrationsPageProps = {
  businessId: Id<"businesses">;
};

type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
};

type CalendarConnectionListItem = {
  _id: Id<"calendar_connections">;
  businessId: Id<"businesses">;
  provider: string;
  ownerUserId: Id<"users">;
  staffId?: Id<"staff">;
  externalAccountEmail?: string;
  selectedCalendarId?: string;
  selectedCalendarSummary?: string;
  status: string;
  tokenExpiresAt?: string;
  syncWindowStartsAt?: string;
  lastSyncAttemptAt?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
};

function GoogleCalendarLogo() {
  return (
    <svg
      aria-hidden="true"
      className="size-7"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z"
        fill="currentColor"
      />
    </svg>
  );
}

function MicrosoftCalendarLogo() {
  return (
    <svg
      aria-hidden="true"
      className="size-7"
      viewBox="0 0 13 14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13 4.69375v5.239c0 .115-.04.212-.119.288-.079.077-.176.115-.29.115H8.317v-3.4795l.8.6145c.051.0425.1145.063.1895.063.074 0 .1385-.0205.1945-.0635L13 4.69375Zm-4.6825-1.0105h4.2735c.1055 0 .1965.0315.2715.096.075.064.117.15.124.255l-3.6845 2.938-.9845-.7745V3.68325Zm-.6155-2.251v11.1355L1 11.40975v-8.7875l6.703-1.19Zm-2.0245 5.59-.018 0c-.0075.5585-.1575 1.0245-.4425 1.3985-.2855.373-.645.5675-1.0725.585-.4135-.0215-.765-.218-1.0505-.588-.285-.372-.435-0.837-.4425-1.3955.0075-.566.15-1.036.435-1.407.2855-.3705.638-.5655 1.05-.582.428.0165.788.212 1.0655.582.283.371.4295.8405.4395 1.407Zm-1.56-1.241-.0135.0195c-.2175.0155-.3985.1355-.5405.3605-.15.2245-.2175.5175-.2175.87 0 .352.0675.645.2175.877.15.232.3295.345.5475.345.218 0 .3975-.12.548-.352.143-.232.2175-.525.2175-.8855 0-.3535-.075-.6455-.2175-.876-.1445-.2305-.326-.3485-.5415-.3585Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatTimestamp(timestamp: string | undefined, locale: string): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type InlineConfirmDeleteButtonProps = {
  deleting: boolean;
  disabled?: boolean;
  onConfirm: () => void;
};

function InlineConfirmDeleteButton({
  deleting,
  disabled = false,
  onConfirm,
}: InlineConfirmDeleteButtonProps) {
  const { t } = useTranslation("settings");
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isConfirming || deleting) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsConfirming(false);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [deleting, isConfirming]);

  useEffect(() => {
    if (!deleting) {
      return;
    }

    setIsConfirming(false);
  }, [deleting]);

  return (
    <motion.div layout className="overflow-hidden">
      <AnimatePresence initial={false} mode="wait">
        {isConfirming ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 8 }}
            initial={{ opacity: 0, scale: 0.96, x: 8 }}
            key="confirm-delete"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Button
              disabled={disabled || deleting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onConfirm();
              }}
              size="sm"
              title={t("integrations.google.disconnectConfirm")}
              type="button"
              variant="destructive"
            >
              {deleting
                ? t("integrations.google.disconnecting")
                : t("integrations.google.disconnectConfirm")}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -8 }}
            initial={{ opacity: 0, scale: 0.96, x: -8 }}
            key="delete-icon"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Button
              aria-label={t("integrations.google.disconnect")}
              disabled={disabled || deleting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsConfirming(true);
              }}
              size="icon-sm"
              title={t("integrations.google.disconnect")}
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function IntegrationsPage({ businessId }: IntegrationsPageProps) {
  const { i18n, t } = useTranslation("settings");
  const [searchParams, setSearchParams] = useSearchParams();
  const handledCallbackRef = useRef<string | null>(null);
  const connections = useQuery(api.integrations.calendar.listCalendarConnections, {
    businessId,
  });
  const isLoadingConnections = connections === undefined;
  const connectGoogle = useObservedAction(api.integrations.calendar.connectGoogle, {
    reportFailures: false,
  });
  const disconnectGoogleCalendar = useObservedAction(api.integrations.calendar.disconnectGoogleCalendar);
  const listGoogleCalendars = useObservedAction(api.integrations.calendar.listGoogleCalendars, {
    reportFailures: false,
  });
  const selectGoogleCalendar = useObservedAction(api.integrations.calendar.selectGoogleCalendar, {
    reportFailures: false,
  });

  const googleConnections = useMemo(
    () =>
      ((connections ?? []).filter(
        (connection) => connection.provider === "google",
      ) as Array<CalendarConnectionListItem>),
    [connections],
  );
  const selectedConnection = useMemo(
    () =>
      googleConnections.find((connection) => connection.selectedCalendarId !== undefined) ??
      googleConnections.find((connection) => connection.status === "connected") ??
      googleConnections[0] ??
      null,
    [googleConnections],
  );
  const googleHasConnection = googleConnections.length > 0;
  const googleConnected = googleConnections.some((connection) => connection.status === "connected");
  const googleNeedsReconnect = googleHasConnection && !googleConnected;
  const microsoftConnected = (connections ?? []).some(
    (connection) => connection.provider === "microsoft",
  );
  const selectedConnectionId = selectedConnection?._id ?? null;
  const selectedConnectionStatus = selectedConnection?.status ?? null;
  const selectedConnectionCalendarId = selectedConnection?.selectedCalendarId ?? "";
  const googleCalendarListFailedMessage = t("integrations.google.calendarListFailed");

  const [calendarOptions, setCalendarOptions] = useState<Array<GoogleCalendarOption>>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  const [googleSheetOpen, setGoogleSheetOpen] = useState(false);
  useEffect(() => {
    const calendar = searchParams.get("calendar");
    const status = searchParams.get("status");
    const message = searchParams.get("message");
    const callbackKey = `${calendar ?? ""}:${status ?? ""}:${message ?? ""}`;

    if (calendar !== "google" || !status) {
      return;
    }

    if (handledCallbackRef.current === callbackKey) {
      return;
    }
    handledCallbackRef.current = callbackKey;

    if (status === "success") {
      captureAnalyticsEvent("web.integration.calendar_connect_completed", {
        businessId: String(businessId),
        provider: "google",
      });
      toast.success(message ?? t("integrations.google.connectedSuccess"));
    } else {
      captureAnalyticsEvent("web.integration.calendar_connect_failed", {
        businessId: String(businessId),
        provider: "google",
      });
      toast.error(message ?? t("integrations.google.connectFailed"));
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("calendar");
    nextParams.delete("status");
    nextParams.delete("message");
    setSearchParams(nextParams, { replace: true });
  }, [businessId, searchParams, setSearchParams, t]);

  useEffect(() => {
    if (!googleSheetOpen) {
      return;
    }

    let cancelled = false;

    async function loadCalendars() {
      if (!selectedConnection || selectedConnectionStatus !== "connected") {
        setCalendarOptions((current) => (current.length === 0 ? current : []));
        setSelectedCalendarId((current) =>
          current === selectedConnectionCalendarId ? current : selectedConnectionCalendarId,
        );
        return;
      }

      setIsLoadingCalendars(true);
      try {
        const calendars = (await listGoogleCalendars({
          businessId,
        })) as Array<GoogleCalendarOption>;
        if (cancelled) {
          return;
        }
        setCalendarOptions(calendars);
        const selected =
          calendars.find((calendar) => calendar.selected) ??
          calendars.find((calendar) => calendar.id === selectedConnectionCalendarId) ??
          calendars[0];
        setSelectedCalendarId((current) => {
          const nextSelectedCalendarId = selected?.id ?? "";
          return current === nextSelectedCalendarId ? current : nextSelectedCalendarId;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        captureAnalyticsException(error, {
          businessId: String(businessId),
          provider: "google",
          operation: "list_calendars",
        });
        toast.error(error instanceof Error ? error.message : googleCalendarListFailedMessage);
      } finally {
        if (!cancelled) {
          setIsLoadingCalendars(false);
        }
      }
    }

    void loadCalendars();

    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    googleCalendarListFailedMessage,
    googleSheetOpen,
    listGoogleCalendars,
    selectedConnectionId,
    selectedConnectionCalendarId,
    selectedConnectionStatus,
  ]);

  function openGoogleSheet(): void {
    setSelectedCalendarId(selectedConnectionCalendarId);
    setGoogleSheetOpen(true);
  }

  async function handleConnectGoogle(): Promise<void> {
    setIsConnecting(true);

    try {
      captureAnalyticsEvent("web.integration.calendar_connect_started", {
        businessId: String(businessId),
        provider: "google",
      });
      const result = await connectGoogle({
        businessId,
      });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      captureAnalyticsEvent("web.integration.calendar_connect_failed", {
        businessId: String(businessId),
        provider: "google",
      });
      captureAnalyticsException(error, {
        businessId: String(businessId),
        provider: "google",
        operation: "connect_calendar",
      });
      toast.error(
        error instanceof Error ? error.message : t("integrations.google.connectFailed"),
      );
      setIsConnecting(false);
    }
  }

  async function handleDisconnectGoogle(): Promise<void> {
    setIsDisconnecting(true);

    try {
      await disconnectGoogleCalendar({ businessId });
      captureAnalyticsEvent("web.integration.calendar_disconnect_completed", {
        businessId: String(businessId),
        provider: "google",
      });
      setGoogleSheetOpen(false);
      setCalendarOptions([]);
      setSelectedCalendarId("");
      toast.success(t("integrations.google.disconnectedSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("integrations.google.disconnectFailed"),
      );
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleSaveCalendar(): Promise<void> {
    if (selectedConnection?.status !== "connected") {
      toast.error("Reconnect Google Calendar before choosing a calendar.");
      return;
    }

    if (!selectedCalendarId) {
      toast.error(t("integrations.google.chooseCalendarFirst"));
      return;
    }

    setIsSavingCalendar(true);
    try {
      await selectGoogleCalendar({
        businessId,
        calendarId: selectedCalendarId,
      });
      toast.success(t("integrations.google.calendarSaved"));
    } catch (error) {
      captureAnalyticsException(error, {
        businessId: String(businessId),
        provider: "google",
        operation: "save_selected_calendar",
      });
      toast.error(
        error instanceof Error ? error.message : t("integrations.google.calendarSaveFailed"),
      );
    } finally {
      setIsSavingCalendar(false);
    }
  }

  async function handleRefreshCalendars(): Promise<void> {
    if (selectedConnection?.status !== "connected") {
      return;
    }

    setIsLoadingCalendars(true);

    try {
      const calendars = (await listGoogleCalendars({
        businessId,
      })) as Array<GoogleCalendarOption>;
      setCalendarOptions(calendars);
      const selected =
        calendars.find((calendar) => calendar.selected) ??
        calendars.find((calendar) => calendar.id === selectedConnection?.selectedCalendarId) ??
        calendars[0];
      setSelectedCalendarId(selected?.id ?? "");
    } catch (error) {
      captureAnalyticsException(error, {
        businessId: String(businessId),
        provider: "google",
        operation: "refresh_calendars",
      });
      toast.error(
        error instanceof Error ? error.message : t("integrations.google.calendarListFailed"),
      );
    } finally {
      setIsLoadingCalendars(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader title={t("sections.integrations")} />
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <li className={`${surfaceClassName} p-4`}>
            <div className="mb-8 flex items-center justify-between gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center">
                <GoogleCalendarLogo />
              </div>
              <div className="flex items-center gap-2">
                {!isLoadingConnections && googleHasConnection ? (
                  <InlineConfirmDeleteButton
                    deleting={isDisconnecting}
                    onConfirm={() => void handleDisconnectGoogle()}
                  />
                ) : null}
                {isLoadingConnections ? (
                  <Skeleton className="h-9 w-24 rounded-md" />
                ) : (
                  <Button
                    className={
                      googleConnected && !googleNeedsReconnect
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : undefined
                    }
                    disabled={isConnecting}
                    onClick={() =>
                      googleConnected && !googleNeedsReconnect
                        ? openGoogleSheet()
                        : void handleConnectGoogle()
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {googleNeedsReconnect
                      ? t("integrations.google.reconnect")
                      : googleConnected
                        ? t("integrations.actions.connected")
                        : t("integrations.actions.connect")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="type-section-title text-lg">{t("integrations.cards.google.title")}</h2>
              <p className="type-body-muted line-clamp-2">
                {t("integrations.cards.google.description")}
              </p>
            </div>
          </li>

          <li className={`${surfaceClassName} p-4`}>
            <div className="mb-8 flex items-center justify-between gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center text-foreground">
                <MicrosoftCalendarLogo />
              </div>
              {isLoadingConnections ? (
                <Skeleton className="h-9 w-24 rounded-md" />
              ) : (
                <Button
                  className={
                    microsoftConnected
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : undefined
                  }
                  disabled
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {microsoftConnected
                    ? t("integrations.actions.connected")
                    : t("integrations.actions.connect")}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="type-section-title text-lg">{t("integrations.cards.microsoft.title")}</h2>
              <p className="type-body-muted line-clamp-2">
                {t("integrations.cards.microsoft.description")}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <Dialog onOpenChange={setGoogleSheetOpen} open={googleSheetOpen}>
        <DialogContent className="max-h-[90vh] w-full overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="gap-0 border-b p-6 pb-5">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center">
                <GoogleCalendarLogo />
              </div>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("integrations.google.sheetTitle")}</DialogTitle>
                <DialogDescription>{t("integrations.google.sheetDescription")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex max-h-[calc(90vh-7rem)] flex-col gap-6 overflow-y-auto p-6">
            <section className="flex flex-col gap-4 rounded-xl border p-4">
              <div className="flex flex-col gap-1">
                <h3 className="type-item-title">
                  {t("integrations.google.connectionSectionTitle")}
                </h3>
                <p className="type-body-muted">
                  {t("integrations.google.connectionSectionDescription")}
                </p>
              </div>

              <p className="type-body-muted">
                {t("integrations.google.privacyNoticeText")}{" "}
                <a
                  href="/privacy"
                  className="underline underline-offset-4 decoration-2"
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("integrations.google.privacyPolicyLinkText")}
                </a>
              </p>

              <Button
                className="w-full sm:w-auto"
                disabled={isConnecting}
                onClick={() => void handleConnectGoogle()}
                type="button"
              >
                {isConnecting
                  ? t("integrations.google.connecting")
                  : selectedConnection
                    ? t("integrations.google.reconnect")
                    : t("integrations.google.connect")}
              </Button>

              {selectedConnection ? (
                <div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <p className="type-meta">
                      {t("integrations.google.connectedAccount")}
                    </p>
                    <p className="type-body">
                      {selectedConnection.externalAccountEmail ??
                        t("integrations.google.connectedAccountUnavailable")}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="type-meta">
                      {t("integrations.google.lastSync")}
                    </p>
                    <p className="type-body">
                      {formatTimestamp(selectedConnection.lastSyncedAt, i18n.language) ??
                        t("integrations.google.neverSynced")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="type-body-muted rounded-xl border border-dashed px-4 py-4">
                  {t("integrations.google.notConnectedDescription")}
                </div>
              )}
            </section>

            {selectedConnection ? (
              <>
                <section className="flex flex-col gap-4 rounded-xl border p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="type-item-title">
                      {t("integrations.google.calendarSectionTitle")}
                    </h3>
                    <p className="type-body-muted">
                      {t("integrations.google.calendarSectionDescription")}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        selectedConnection.status === "connected" ? "secondary" : "destructive"
                      }
                    >
                      {selectedConnection.status === "connected"
                        ? t("integrations.status.connected")
                        : t("integrations.status.reconnectRequired")}
                    </Badge>
                    {selectedConnection.lastSyncError ? (
                      <Badge variant="destructive">
                        {t("integrations.google.syncNeedsAttention")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("integrations.google.syncHealthy")}</Badge>
                    )}
                  </div>

                  <FieldGroup>
                    <Field>
                      <FieldContent>
                        <FieldLabel>{t("integrations.google.calendarLabel")}</FieldLabel>
                        <FieldDescription>
                          {selectedConnection.status === "connected"
                            ? t("integrations.google.selectCalendar")
                            : t("integrations.google.reconnect")}
                        </FieldDescription>
                      </FieldContent>
                      {isLoadingCalendars ? (
                        <Skeleton className="h-10 w-full rounded-md" />
                      ) : (
                        <Select
                          disabled={calendarOptions.length === 0}
                          onValueChange={(value) => setSelectedCalendarId(value ?? "")}
                          value={selectedCalendarId}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={t("integrations.google.selectCalendar")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {calendarOptions.map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.primary
                                  ? t("integrations.google.primaryCalendarLabel", {
                                      summary: calendar.summary,
                                    })
                                  : calendar.summary}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  </FieldGroup>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        isLoadingCalendars ||
                        !selectedCalendarId ||
                        isSavingCalendar ||
                        selectedConnection.status !== "connected"
                      }
                      onClick={() => void handleSaveCalendar()}
                      type="button"
                      variant="secondary"
                    >
                      {isSavingCalendar
                        ? t("integrations.google.savingCalendar")
                        : t("integrations.google.saveCalendar")}
                    </Button>
                    <Button
                      disabled={
                        isLoadingCalendars ||
                        selectedConnection.status !== "connected"
                      }
                      onClick={() => void handleRefreshCalendars()}
                      type="button"
                      variant="ghost"
                    >
                      <RefreshCcw className="size-4" />
                      {t("integrations.google.refreshCalendars")}
                    </Button>
                    <Button
                      disabled={!selectedConnection}
                      onClick={() => void handleDisconnectGoogle()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("integrations.google.disconnect")}
                    </Button>
                  </div>

                  {isLoadingCalendars ? (
                    <div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <p className="type-meta">
                          {t("integrations.google.selectedCalendar")}
                        </p>
                        <p className="type-body">
                          {selectedConnection.selectedCalendarSummary ??
                            selectedConnection.selectedCalendarId ??
                            t("integrations.google.noCalendarSelected")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="type-meta">
                          {t("integrations.google.lastSyncState")}
                        </p>
                        <p className="type-body">
                          {selectedConnection.lastSyncError ??
                            t("integrations.google.lastSyncOk")}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </>
            ) : null}

            <Separator />
            <p className="type-meta">
              {t("integrations.providers.microsoft")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
