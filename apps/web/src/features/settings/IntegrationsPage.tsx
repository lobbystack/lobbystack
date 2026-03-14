import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { CalendarDays, CheckCircle2, RefreshCcw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type IntegrationsPageProps = {
  businessId: Id<"businesses">;
};

type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
};

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

export function IntegrationsPage({ businessId }: IntegrationsPageProps) {
  const { i18n, t } = useTranslation("settings");
  const [searchParams, setSearchParams] = useSearchParams();
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId,
  });
  const connections = useQuery(api.integrations.calendar.listCalendarConnections, {
    businessId,
  }) as Array<Doc<"calendar_connections">> | undefined;
  const summary = useQuery(api.integrations.calendar.getCalendarReconciliationSummary, { businessId });
  const connectGoogle = useAction(api.integrations.calendar.connectGoogle);
  const listGoogleCalendars = useAction(api.integrations.calendar.listGoogleCalendars);
  const selectGoogleCalendar = useAction(api.integrations.calendar.selectGoogleCalendar);

  const staff = useMemo(
    () => (configuration?.staff ?? []) as Array<Doc<"staff">>,
    [configuration],
  );
  const googleConnections = useMemo(
    () =>
      ((connections ?? []).filter(
        (connection) =>
          connection.provider === "google" && connection.staffId !== undefined,
      ) as Array<Doc<"calendar_connections">>),
    [connections],
  );
  const microsoftConnected = (connections ?? []).some(
    (connection) => connection.provider === "microsoft",
  );

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [calendarOptions, setCalendarOptions] = useState<Array<GoogleCalendarOption>>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

  const selectedConnection =
    googleConnections.find((connection) => String(connection.staffId) === selectedStaffId) ?? null;

  useEffect(() => {
    const requestedStaffId = searchParams.get("staffId");
    if (requestedStaffId) {
      setSelectedStaffId(requestedStaffId);
    } else if (!selectedStaffId && staff[0]?._id) {
      setSelectedStaffId(String(staff[0]._id));
    }
  }, [searchParams, selectedStaffId, staff]);

  useEffect(() => {
    if (staff.length === 0) {
      setSelectedStaffId("");
      return;
    }

    setSelectedStaffId((current) => {
      if (!current) {
        return String(staff[0]?._id);
      }
      return staff.some((member) => String(member._id) === current)
        ? current
        : String(staff[0]?._id);
    });
  }, [staff]);

  useEffect(() => {
    const calendar = searchParams.get("calendar");
    const status = searchParams.get("status");
    const message = searchParams.get("message");

    if (calendar !== "google" || !status) {
      return;
    }

    if (status === "success") {
      setStatusMessage(
        message ? decodeURIComponent(message) : t("integrations.google.connectedSuccess"),
      );
      setErrorMessage(null);
    } else {
      setErrorMessage(
        message ? decodeURIComponent(message) : t("integrations.google.connectFailed"),
      );
      setStatusMessage(null);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("calendar");
    nextParams.delete("status");
    nextParams.delete("message");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  useEffect(() => {
    async function loadCalendars() {
      if (!selectedStaffId || !selectedConnection?.staffId) {
        setCalendarOptions([]);
        setSelectedCalendarId("");
        return;
      }

      setIsLoadingCalendars(true);
      setErrorMessage(null);
      try {
        const calendars = (await listGoogleCalendars({
          businessId,
          staffId: selectedConnection.staffId,
        })) as Array<GoogleCalendarOption>;
        setCalendarOptions(calendars);
        const selected =
          calendars.find((calendar) => calendar.selected) ??
          calendars.find((calendar) => calendar.id === selectedConnection.selectedCalendarId) ??
          calendars[0];
        setSelectedCalendarId(selected?.id ?? "");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : t("integrations.google.calendarListFailed"),
        );
      } finally {
        setIsLoadingCalendars(false);
      }
    }

    void loadCalendars();
  }, [
    businessId,
    listGoogleCalendars,
    selectedConnection?.selectedCalendarId,
    selectedConnection?.staffId,
    selectedStaffId,
    t,
  ]);

  async function handleConnectGoogle(): Promise<void> {
    if (!selectedStaffId) {
      setErrorMessage(t("integrations.google.chooseStaffFirst"));
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await connectGoogle({
        businessId,
        staffId: selectedStaffId as Id<"staff">,
      });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("integrations.google.connectFailed"),
      );
      setIsConnecting(false);
    }
  }

  async function handleSaveCalendar(): Promise<void> {
    if (!selectedStaffId || !selectedCalendarId) {
      setErrorMessage(t("integrations.google.chooseCalendarFirst"));
      return;
    }

    setIsSavingCalendar(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await selectGoogleCalendar({
        businessId,
        staffId: selectedStaffId as Id<"staff">,
        calendarId: selectedCalendarId,
      });
      setStatusMessage(t("integrations.google.calendarSaved"));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("integrations.google.calendarSaveFailed"),
      );
    } finally {
      setIsSavingCalendar(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-5" />
            </div>
            <CardTitle>{t("integrations.cards.google.title")}</CardTitle>
            <CardDescription>{t("integrations.providers.google")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-2">
                <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                  {t("integrations.google.staffLabel")}
                </span>
                <Select
                  onValueChange={(value) => setSelectedStaffId(value ?? "")}
                  value={selectedStaffId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("integrations.google.selectStaff")} />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => (
                      <SelectItem key={member._id} value={String(member._id)}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex items-end">
                <Button
                  className="w-full md:w-auto"
                  disabled={staff.length === 0 || isConnecting}
                  onClick={() => void handleConnectGoogle()}
                  type="button"
                >
                  {isConnecting
                    ? t("integrations.google.connecting")
                    : selectedConnection
                      ? t("integrations.google.reconnect")
                      : t("integrations.google.connect")}
                </Button>
              </div>
            </div>

            {statusMessage ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {selectedConnection ? (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{t("integrations.status.connected")}</Badge>
                  {selectedConnection.lastSyncError ? (
                    <Badge variant="destructive">{t("integrations.google.syncNeedsAttention")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("integrations.google.syncHealthy")}</Badge>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                      {t("integrations.google.connectedAccount")}
                    </p>
                    <p className="text-sm text-foreground">
                      {selectedConnection.externalAccountEmail ??
                        selectedConnection.externalAccountId}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                      {t("integrations.google.selectedCalendar")}
                    </p>
                    <p className="text-sm text-foreground">
                      {selectedConnection.selectedCalendarSummary ??
                        selectedConnection.selectedCalendarId ??
                        t("integrations.google.noCalendarSelected")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                      {t("integrations.google.lastSync")}
                    </p>
                    <p className="text-sm text-foreground">
                      {formatTimestamp(selectedConnection.lastSyncedAt, i18n.language) ??
                        t("integrations.google.neverSynced")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                      {t("integrations.google.lastSyncState")}
                    </p>
                    <p className="text-sm text-foreground">
                      {selectedConnection.lastSyncError ??
                        t("integrations.google.lastSyncOk")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="space-y-2">
                    <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                      {t("integrations.google.calendarLabel")}
                    </span>
                    <Select
                      disabled={isLoadingCalendars || calendarOptions.length === 0}
                      onValueChange={(value) => setSelectedCalendarId(value ?? "")}
                      value={selectedCalendarId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isLoadingCalendars
                              ? t("integrations.google.loadingCalendars")
                              : t("integrations.google.selectCalendar")
                          }
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
                  </label>
                  <div className="flex items-end gap-2">
                    <Button
                      disabled={isLoadingCalendars || !selectedCalendarId || isSavingCalendar}
                      onClick={() => void handleSaveCalendar()}
                      type="button"
                      variant="secondary"
                    >
                      {isSavingCalendar
                        ? t("integrations.google.savingCalendar")
                        : t("integrations.google.saveCalendar")}
                    </Button>
                    <Button
                      disabled={isLoadingCalendars || !selectedConnection.staffId}
                      onClick={() => {
                        setSelectedCalendarId(selectedConnection.selectedCalendarId ?? "");
                        setStatusMessage(null);
                        setErrorMessage(null);
                        setIsLoadingCalendars(true);
                        void listGoogleCalendars({
                          businessId,
                          staffId: selectedConnection.staffId,
                        })
                          .then((calendars) => {
                            const nextCalendars = calendars as Array<GoogleCalendarOption>;
                            setCalendarOptions(nextCalendars);
                          })
                          .catch((error) => {
                            setErrorMessage(
                              error instanceof Error
                                ? error.message
                                : t("integrations.google.calendarListFailed"),
                            );
                          })
                          .finally(() => {
                            setIsLoadingCalendars(false);
                          });
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <RefreshCcw className="size-4" />
                      {t("integrations.google.refreshCalendars")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
                {staff.length === 0
                  ? t("integrations.google.noStaff")
                  : t("integrations.google.notConnectedForStaff")}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                  {t("integrations.google.mappedConnections")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("integrations.google.mappedConnectionsDescription")}
                </p>
              </div>
              {googleConnections.length > 0 ? (
                <div className="grid gap-3">
                  {googleConnections.map((connection) => {
                    const member = staff.find(
                      (candidate) => candidate._id === connection.staffId,
                    );
                    return (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
                        key={connection._id}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {member?.name ?? t("integrations.google.unknownStaff")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {connection.externalAccountEmail ?? connection.externalAccountId}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>
                            {connection.selectedCalendarSummary ??
                              connection.selectedCalendarId ??
                              t("integrations.google.noCalendarSelected")}
                          </p>
                          <p>
                            {connection.lastSyncError ??
                              formatTimestamp(connection.lastSyncedAt, i18n.language) ??
                              t("integrations.google.neverSynced")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("integrations.google.noConnections")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-5" />
            </div>
            <CardTitle>{t("integrations.cards.microsoft.title")}</CardTitle>
            <CardDescription>{t("integrations.providers.microsoft")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {microsoftConnected
              ? t("integrations.status.connected")
              : t("integrations.status.notConnected")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("integrations.summary.title")}</CardTitle>
          <CardDescription>{t("integrations.summary.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.connectedCalendars")}</span>
            <span className="font-medium">{connections?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.openIssues")}</span>
            <span className="font-medium">{summary?.openIssueCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.syncedAppointments")}</span>
            <span className="font-medium">{summary?.counts.synced ?? 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
