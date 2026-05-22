import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { useObservedMutation } from "@/lib/observed-convex";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SettingsNotificationsPageProps = {
  businessId: Id<"businesses">;
};

type NotificationChannel = "email" | "sms";

type NotificationEventKey =
  | "voiceMessage"
  | "pausedSms"
  | "smsFailed"
  | "calendarSync"
  | "transferFailed"
  | "aiReplyFailed";

type NotificationEventPreferences = Record<
  NotificationEventKey,
  Record<NotificationChannel, boolean>
>;

type NotificationPreferencesState = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  eventPreferences: NotificationEventPreferences;
  dailySummaryEnabled: boolean;
  dailySummarySendTime: string;
  smsConsentGranted: boolean;
  smsConsentDisclosureVersion: string;
  smsConsentDisclosureText: string;
};

type SmsUnavailableReason = "phone_unverified" | "sender_missing" | null;

const communicationEvents: Array<NotificationEventKey> = [
  "voiceMessage",
  "pausedSms",
];

const systemIssueEvents: Array<NotificationEventKey> = [
  "smsFailed",
  "calendarSync",
  "transferFailed",
  "aiReplyFailed",
];

function toPreferenceState(input: NotificationPreferencesState): NotificationPreferencesState {
  return {
    emailEnabled: input.emailEnabled,
    smsEnabled: input.smsEnabled,
    eventPreferences: input.eventPreferences,
    dailySummaryEnabled: input.dailySummaryEnabled,
    dailySummarySendTime: input.dailySummarySendTime,
    smsConsentGranted: input.smsConsentGranted,
    smsConsentDisclosureVersion: input.smsConsentDisclosureVersion,
    smsConsentDisclosureText: input.smsConsentDisclosureText,
  };
}

export function SettingsNotificationsPage({
  businessId,
}: SettingsNotificationsPageProps) {
  const { t } = useTranslation(["settings", "common"]);
  const remotePreferences = useQuery(
    api.users.preferences.getNotificationPreferences,
    { businessId },
  );
  const updateNotificationPreferences = useObservedMutation(
    api.users.preferences.updateNotificationPreferences,
  );
  const saveVersionRef = useRef(0);
  const [draft, setDraft] = useState<NotificationPreferencesState | null>(null);
  const [pendingSmsConsent, setPendingSmsConsent] =
    useState<NotificationPreferencesState | null>(null);

  useEffect(() => {
    if (remotePreferences) {
      setDraft(toPreferenceState(remotePreferences));
    }
  }, [remotePreferences]);

  const canUseSms = remotePreferences?.canUseSms ?? false;
  const smsUnavailableReason: SmsUnavailableReason =
    remotePreferences?.smsUnavailableReason ?? null;
  const isLoading = remotePreferences === undefined || draft === null;

  function showSmsUnavailableToast(): void {
    toast.error(
      t(
        smsUnavailableReason === "sender_missing"
          ? "settings:notifications.toast.smsSenderUnavailable"
          : "settings:notifications.toast.smsUnavailable",
      ),
    );
  }

  function persistPreferences(
    next: NotificationPreferencesState,
    options: { smsConsentAccepted?: boolean } = {},
  ): void {
    const previous = draft;
    if (!previous) {
      return;
    }

    if (!canUseSms && next.smsEnabled) {
      showSmsUnavailableToast();
      return;
    }

    setDraft(next);
    const saveVersion = saveVersionRef.current + 1;
    saveVersionRef.current = saveVersion;
    const {
      smsConsentGranted: _smsConsentGranted,
      smsConsentDisclosureText: _smsConsentDisclosureText,
      smsConsentDisclosureVersion: _smsConsentDisclosureVersion,
      ...persistedPreferences
    } = next;

    void updateNotificationPreferences({
      businessId,
      ...persistedPreferences,
      ...(options.smsConsentAccepted !== undefined
        ? { smsConsentAccepted: options.smsConsentAccepted }
        : {}),
    }).catch((error) => {
      if (saveVersionRef.current === saveVersion) {
        setDraft(previous);
      }
      toast.error(t("settings:notifications.toast.saveFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    });
  }

  function handleChannelChange(channel: NotificationChannel, checked: boolean): void {
    if (!draft) {
      return;
    }
    if (channel === "sms" && checked && !canUseSms) {
      showSmsUnavailableToast();
      return;
    }

    const next = {
      ...draft,
      [channel === "email" ? "emailEnabled" : "smsEnabled"]: checked,
    };

    if (channel === "sms" && checked && !draft.smsConsentGranted) {
      setPendingSmsConsent(next);
      return;
    }

    persistPreferences(next);
  }

  function acceptSmsConsent(): void {
    if (!pendingSmsConsent) {
      return;
    }
    persistPreferences(
      {
        ...pendingSmsConsent,
        smsConsentGranted: true,
      },
      { smsConsentAccepted: true },
    );
    setPendingSmsConsent(null);
  }

  function handlePrefChange(
    eventKey: NotificationEventKey,
    channel: NotificationChannel,
    checked: boolean,
  ): void {
    if (!draft) {
      return;
    }
    if (channel === "sms" && checked && !canUseSms) {
      showSmsUnavailableToast();
      return;
    }

    persistPreferences({
      ...draft,
      eventPreferences: {
        ...draft.eventPreferences,
        [eventKey]: {
          ...draft.eventPreferences[eventKey],
          [channel]: checked,
        },
      },
    });
  }

  function handleDailySummaryChange(checked: boolean): void {
    if (!draft) {
      return;
    }
    persistPreferences({
      ...draft,
      dailySummaryEnabled: checked,
    });
  }

  function handleSendTimeChange(sendTime: string): void {
    if (!draft) {
      return;
    }
    persistPreferences({
      ...draft,
      dailySummarySendTime: sendTime,
    });
  }

  const renderConfigRow = (
    eventKey: NotificationEventKey,
    titleKey: string,
    descriptionKey: string,
  ) => {
    return (
      <TableRow key={eventKey} className="border-b border-border last:border-b-0 hover:bg-transparent">
        <TableCell className="whitespace-normal px-6 py-5">
          <div className="flex flex-col gap-1 pr-4">
            <span className="text-sm font-medium text-foreground">{t(titleKey)}</span>
            <span className="text-sm text-muted-foreground">{t(descriptionKey)}</span>
          </div>
        </TableCell>
        {draft?.emailEnabled ? (
          <TableCell className="px-6 py-5 text-center align-middle !pr-6">
            <div className="flex w-full justify-center">
              <Checkbox
                aria-label={`${t("settings:notifications.sources.email.title")} - ${t(titleKey)}`}
                checked={draft.eventPreferences[eventKey].email}
                disabled={isLoading}
                onCheckedChange={(checked) =>
                  handlePrefChange(eventKey, "email", checked === true)
                }
              />
            </div>
          </TableCell>
        ) : null}
        {draft?.smsEnabled ? (
          <TableCell className="px-6 py-5 text-center align-middle !pr-6">
            <div className="flex w-full justify-center">
              <Checkbox
                aria-label={`${t("settings:notifications.sources.sms.title")} - ${t(titleKey)}`}
                checked={canUseSms && draft.eventPreferences[eventKey].sms}
                disabled={isLoading || !canUseSms}
                onCheckedChange={(checked) =>
                  handlePrefChange(eventKey, "sms", checked === true)
                }
              />
            </div>
          </TableCell>
        ) : null}
      </TableRow>
    );
  };

  const renderConfigHeader = () => (
    <TableHeader className="bg-transparent">
      <TableRow className="border-b border-border hover:bg-transparent">
        <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
          {t("settings:notifications.communication.eventColumn")}
        </TableHead>
        {draft?.emailEnabled ? (
          <TableHead className="h-12 w-[120px] px-6 text-center align-middle text-sm font-medium text-foreground">
            {t("settings:notifications.sources.email.title")}
          </TableHead>
        ) : null}
        {draft?.smsEnabled ? (
          <TableHead className="h-12 w-[120px] px-6 text-center align-middle text-sm font-medium text-foreground">
            {t("settings:notifications.sources.sms.title")}
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );

  const renderConfigRows = (events: Array<NotificationEventKey>) =>
    events.map((eventKey) =>
      renderConfigRow(
        eventKey,
        `settings:notifications.events.${eventKey}.title`,
        `settings:notifications.events.${eventKey}.description`,
      ),
    );

  if (isLoading) {
    return (
      <div className="w-full overflow-y-auto pb-12">
        <div className="flex w-full flex-col gap-12">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-12">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.sources.title")}
            </h3>
          </div>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("settings:notifications.sources.email.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.sources.email.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  aria-label={t("settings:notifications.sources.email.title")}
                  checked={draft.emailEnabled}
                  onCheckedChange={(checked) => handleChannelChange("email", checked)}
                />
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("settings:notifications.sources.sms.title")}</ItemTitle>
                <ItemDescription>
                  {canUseSms
                    ? t("settings:notifications.sources.sms.description")
                    : t(
                        smsUnavailableReason === "sender_missing"
                          ? "settings:notifications.sources.sms.senderMissingDescription"
                          : "settings:notifications.sources.sms.unverifiedDescription",
                      )}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  aria-label={t("settings:notifications.sources.sms.title")}
                  checked={draft.smsEnabled}
                  disabled={!canUseSms}
                  onCheckedChange={(checked) => handleChannelChange("sms", checked)}
                />
              </ItemActions>
            </Item>
          </Surface>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.communication.title")}
            </h3>
          </div>
          <Surface>
            <Table>
              {renderConfigHeader()}
              <TableBody>{renderConfigRows(communicationEvents)}</TableBody>
            </Table>
          </Surface>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.systemIssues.title")}
            </h3>
          </div>
          <Surface>
            <Table>
              {renderConfigHeader()}
              <TableBody>{renderConfigRows(systemIssueEvents)}</TableBody>
            </Table>
          </Surface>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.digest.title")}
            </h3>
          </div>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("settings:notifications.digest.dailySummary.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.digest.dailySummary.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  aria-label={t("settings:notifications.digest.dailySummary.title")}
                  checked={draft.dailySummaryEnabled}
                  onCheckedChange={handleDailySummaryChange}
                />
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("settings:notifications.digest.sendTime.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.digest.sendTime.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <NativeSelect
                  aria-label={t("settings:notifications.digest.sendTime.title")}
                  className="w-full sm:w-28"
                  onChange={(event) => handleSendTimeChange(event.target.value)}
                  value={draft.dailySummarySendTime}
                >
                  <NativeSelectOption value="08:00">8:00 AM</NativeSelectOption>
                  <NativeSelectOption value="09:00">9:00 AM</NativeSelectOption>
                  <NativeSelectOption value="17:00">5:00 PM</NativeSelectOption>
                  <NativeSelectOption value="18:00">6:00 PM</NativeSelectOption>
                </NativeSelect>
              </ItemActions>
            </Item>
          </Surface>
        </div>
      </div>
    </div>
    <Dialog
      open={pendingSmsConsent !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPendingSmsConsent(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings:notifications.smsConsent.title")}</DialogTitle>
          <DialogDescription>
            {t("settings:notifications.smsConsent.description")}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
          {draft.smsConsentDisclosureText}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingSmsConsent(null)}>
            {t("settings:notifications.smsConsent.cancel")}
          </Button>
          <Button onClick={acceptSmsConsent}>
            {t("settings:notifications.smsConsent.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
