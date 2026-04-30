import { useTranslation } from "react-i18next";
import { useState } from "react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";

type SettingsNotificationsPageProps = {
  businessId: Id<"businesses">;
};

export function SettingsNotificationsPage({
  businessId: _businessId,
}: SettingsNotificationsPageProps) {
  const { t } = useTranslation(["settings", "common"]);

  // Local state for UI only, as requested.
  const [voiceMessage, setVoiceMessage] = useState(true);
  const [pausedSms, setPausedSms] = useState(true);
  
  const [smsFailed, setSmsFailed] = useState(true);
  const [calendarSync, setCalendarSync] = useState(true);
  const [transferFailed, setTransferFailed] = useState(true);
  const [aiReplyFailed, setAiReplyFailed] = useState(true);

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-12">
        {/* Communication Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.communication.title")}
            </h3>
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.communication.voiceMessage.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.communication.voiceMessage.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={voiceMessage} 
                  onCheckedChange={setVoiceMessage} 
                  aria-label={t("settings:notifications.communication.voiceMessage.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.communication.pausedSms.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.communication.pausedSms.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={pausedSms} 
                  onCheckedChange={setPausedSms} 
                  aria-label={t("settings:notifications.communication.pausedSms.title")}
                />
              </ItemActions>
            </Item>
          </div>
        </div>

        {/* System Issues Group */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings:notifications.systemIssues.title")}
            </h3>
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card">
            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.systemIssues.smsFailed.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.systemIssues.smsFailed.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={smsFailed} 
                  onCheckedChange={setSmsFailed} 
                  aria-label={t("settings:notifications.systemIssues.smsFailed.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.systemIssues.calendarSync.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.systemIssues.calendarSync.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={calendarSync} 
                  onCheckedChange={setCalendarSync} 
                  aria-label={t("settings:notifications.systemIssues.calendarSync.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.systemIssues.transferFailed.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.systemIssues.transferFailed.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={transferFailed} 
                  onCheckedChange={setTransferFailed} 
                  aria-label={t("settings:notifications.systemIssues.transferFailed.title")}
                />
              </ItemActions>
            </Item>

            <Item variant="default" className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0">
              <ItemContent>
                <ItemTitle>{t("settings:notifications.systemIssues.aiReplyFailed.title")}</ItemTitle>
                <ItemDescription>
                  {t("settings:notifications.systemIssues.aiReplyFailed.description")}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Switch 
                  checked={aiReplyFailed} 
                  onCheckedChange={setAiReplyFailed} 
                  aria-label={t("settings:notifications.systemIssues.aiReplyFailed.title")}
                />
              </ItemActions>
            </Item>
          </div>
        </div>
      </div>
    </div>
  );
}
