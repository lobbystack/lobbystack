import { useTranslation } from "react-i18next";
import { useState } from "react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

type SettingsNotificationsPageProps = {
  businessId: Id<"businesses">;
};

type NotificationSources = {
  browser: boolean;
  email: boolean;
  sms: boolean;
};

type NotificationPreferences = {
  browser: boolean;
  email: boolean;
  sms: boolean;
};

export function SettingsNotificationsPage({
  businessId: _businessId,
}: SettingsNotificationsPageProps) {
  const { t } = useTranslation(["settings", "common"]);

  const [sources, setSources] = useState<NotificationSources>({
    browser: true,
    email: true,
    sms: false,
  });

  const [preferences, setPreferences] = useState<{
    voiceMessage: NotificationPreferences;
    pausedSms: NotificationPreferences;
    smsFailed: NotificationPreferences;
    calendarSync: NotificationPreferences;
    transferFailed: NotificationPreferences;
    aiReplyFailed: NotificationPreferences;
  }>({
    voiceMessage: { browser: true, email: true, sms: false },
    pausedSms: { browser: true, email: true, sms: false },
    smsFailed: { browser: true, email: true, sms: false },
    calendarSync: { browser: true, email: true, sms: false },
    transferFailed: { browser: true, email: true, sms: false },
    aiReplyFailed: { browser: true, email: true, sms: false },
  });

  const [dailySummary, setDailySummary] = useState(true);
  const [sendTime, setSendTime] = useState("08:00");

  const handlePrefChange = (
    event: keyof typeof preferences,
    source: keyof NotificationPreferences,
    checked: boolean
  ) => {
    setPreferences((prev) => ({
      ...prev,
      [event]: { ...prev[event], [source]: checked },
    }));
  };

  const renderConfigRow = (
    eventKey: keyof typeof preferences,
    titleKey: string,
    descriptionKey: string
  ) => {
    return (
      <TableRow className="border-b border-border last:border-b-0 hover:bg-transparent">
        <TableCell className="px-6 py-5 whitespace-normal">
          <div className="flex flex-col gap-1 pr-4">
            <span className="text-sm font-medium text-foreground">{t(titleKey)}</span>
            <span className="text-sm text-muted-foreground">{t(descriptionKey)}</span>
          </div>
        </TableCell>
        {sources.browser && (
          <TableCell className="px-6 py-5 text-center align-middle !pr-6">
            <div className="flex w-full justify-center">
              <Checkbox 
                checked={preferences[eventKey].browser}
                onCheckedChange={(c) => handlePrefChange(eventKey, "browser", c === true)}
                aria-label={`${t("settings:notifications.sources.browser.title")} - ${t(titleKey)}`}
              />
            </div>
          </TableCell>
        )}
        {sources.email && (
          <TableCell className="px-6 py-5 text-center align-middle !pr-6">
            <div className="flex w-full justify-center">
              <Checkbox 
                checked={preferences[eventKey].email}
                onCheckedChange={(c) => handlePrefChange(eventKey, "email", c === true)}
                aria-label={`${t("settings:notifications.sources.email.title")} - ${t(titleKey)}`}
              />
            </div>
          </TableCell>
        )}
        {sources.sms && (
          <TableCell className="px-6 py-5 text-center align-middle !pr-6">
            <div className="flex w-full justify-center">
              <Checkbox 
                checked={preferences[eventKey].sms}
                onCheckedChange={(c) => handlePrefChange(eventKey, "sms", c === true)}
                aria-label={`${t("settings:notifications.sources.sms.title")} - ${t(titleKey)}`}
              />
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  };

  const renderConfigHeader = () => (
    <TableHeader className="bg-transparent">
      <TableRow className="border-b border-border hover:bg-transparent">
        <TableHead className="px-6 h-12 align-middle text-sm font-medium text-foreground">Source</TableHead>
        {sources.browser && (
          <TableHead className="w-[120px] px-6 h-12 align-middle text-center text-sm font-medium text-foreground">
            {t("settings:notifications.sources.browser.title")}
          </TableHead>
        )}
        {sources.email && (
          <TableHead className="w-[120px] px-6 h-12 align-middle text-center text-sm font-medium text-foreground">
            {t("settings:notifications.sources.email.title")}
          </TableHead>
        )}
        {sources.sms && (
          <TableHead className="w-[120px] px-6 h-12 align-middle text-center text-sm font-medium text-foreground">
            {t("settings:notifications.sources.sms.title")}
          </TableHead>
        )}
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-12">
        {/* Sources Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.sources.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("settings:notifications.sources.description")}
            </p>
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.sources.browser.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.sources.browser.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch 
                  checked={sources.browser} 
                  onCheckedChange={(c) => setSources(prev => ({ ...prev, browser: c }))} 
                  aria-label={t("settings:notifications.sources.browser.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.sources.email.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.sources.email.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch 
                  checked={sources.email} 
                  onCheckedChange={(c) => setSources(prev => ({ ...prev, email: c }))} 
                  aria-label={t("settings:notifications.sources.email.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.sources.sms.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.sources.sms.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch 
                  checked={sources.sms} 
                  onCheckedChange={(c) => setSources(prev => ({ ...prev, sms: c }))} 
                  aria-label={t("settings:notifications.sources.sms.title")}
                />
              </ItemActions>
            </Item>
          </div>
        </div>

        {/* Communication Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.communication.title")}
            </h3>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              {renderConfigHeader()}
              <TableBody>
                {renderConfigRow("voiceMessage", "settings:notifications.communication.voiceMessage.title", "settings:notifications.communication.voiceMessage.description")}
                {renderConfigRow("pausedSms", "settings:notifications.communication.pausedSms.title", "settings:notifications.communication.pausedSms.description")}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* System Issues Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.systemIssues.title")}
            </h3>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              {renderConfigHeader()}
              <TableBody>
                {renderConfigRow("smsFailed", "settings:notifications.systemIssues.smsFailed.title", "settings:notifications.systemIssues.smsFailed.description")}
                {renderConfigRow("calendarSync", "settings:notifications.systemIssues.calendarSync.title", "settings:notifications.systemIssues.calendarSync.description")}
                {renderConfigRow("transferFailed", "settings:notifications.systemIssues.transferFailed.title", "settings:notifications.systemIssues.transferFailed.description")}
                {renderConfigRow("aiReplyFailed", "settings:notifications.systemIssues.aiReplyFailed.title", "settings:notifications.systemIssues.aiReplyFailed.description")}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Digest Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.digest.title")}
            </h3>
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.digest.dailySummary.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.digest.dailySummary.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch 
                  checked={dailySummary} 
                  onCheckedChange={setDailySummary} 
                  aria-label={t("settings:notifications.digest.dailySummary.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
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
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                >
                  <NativeSelectOption value="08:00">8:00 AM</NativeSelectOption>
                  <NativeSelectOption value="09:00">9:00 AM</NativeSelectOption>
                  <NativeSelectOption value="17:00">5:00 PM</NativeSelectOption>
                  <NativeSelectOption value="18:00">6:00 PM</NativeSelectOption>
                </NativeSelect>
              </ItemActions>
            </Item>
          </div>
        </div>
      </div>
    </div>
  );
}
