"use client";

import { useEffect, useState } from "react";
import { normalizeAgentVoice, AGENT_TEXT_MAX_LENGTH, type AgentVoice } from "@lobbystack/shared";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { HiddenTextSkeleton } from "@/components/loading-skeletons";
import { useTelemetry } from "@/components/product-analytics";
import { settingRowClassName, TextSettingRow } from "@/components/text-setting-row";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { VoiceDialog, voiceName, useVoicePreview, useVoiceTraits } from "@/components/voice-dialog";
import { useAgentSettingsQuery, useSaveAgent } from "@/hooks/use-agent-settings";

const AGENT_NAME_MAX_LENGTH = 80;

type AgentSectionProps = { businessId: string; agentId: string; canManage: boolean };

/** An agent's name, greeting and voice. */
export function AgentIdentitySection({ agentId, businessId, canManage }: AgentSectionProps) {
  const { t } = useTranslation(["agent", "common"]);
  const telemetry = useTelemetry();
  const query = useAgentSettingsQuery(businessId, agentId);
  const save = useSaveAgent(businessId, agentId);
  const profile = query.data?.profile;
  const loading = !businessId || !agentId || query.isLoading;
  const [voice, setVoice] = useState<AgentVoice>(normalizeAgentVoice(undefined));
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const voiceTraits = useVoiceTraits();
  const voicePreview = useVoicePreview(query.data?.business?.defaultLocale ?? "en");
  const savedVoice = profile?.voice;
  // The row follows the saved voice when it loads or another agent opens.
  useEffect(() => { setVoice(normalizeAgentVoice(savedVoice)); }, [agentId, savedVoice]);

  async function saveText(setting: "name" | "greeting", value: string): Promise<boolean> {
    if (!canManage || !profile) return false;
    try {
      await save({ [setting]: value });
      telemetry.track("web.agent.settings_saved", { businessId, setting });
      toast.success(t("agent:actions.saved"));
      return true;
    } catch {
      toast.error(t("agent:actions.saveFailed"));
      return false;
    }
  }

  async function saveVoice(next: AgentVoice): Promise<boolean> {
    if (!canManage || !profile) return false;
    setVoiceSaving(true);
    try {
      await save({ voice: next });
      // Only now: the dialog shows the current voice as in use, and a failed save keeps the pick.
      setVoice(next);
      telemetry.track("web.agent.settings_saved", { businessId, setting: "voice" });
      toast.success(t("agent:actions.saved"));
      return true;
    } catch {
      toast.error(t("agent:actions.saveFailed"));
      return false;
    } finally {
      setVoiceSaving(false);
    }
  }

  const disabled = loading || !profile || !canManage;
  return (
    <section aria-busy={loading || undefined} className="flex flex-col gap-3">
      <h2 className="type-title">{t("agent:identity.title")}</h2>
      <Surface className="flex flex-col">
        <TextSettingRow description={t("agent:fields.name.hint")} disabled={disabled} id="agent-name" label={t("agent:fields.name.label")} maxLength={AGENT_NAME_MAX_LENGTH} onSave={(value) => saveText("name", value)} placeholder={t("agent:fields.name.placeholder")} singleLine value={profile?.name ?? ""} />
        <TextSettingRow description={t("agent:fields.greeting.hint")} disabled={disabled} id="agent-greeting" label={t("agent:fields.greeting.label")} maxLength={AGENT_TEXT_MAX_LENGTH} onSave={(value) => saveText("greeting", value)} placeholder={t("agent:fields.greeting.placeholder")} value={profile?.greeting ?? ""} />
        <Item className={settingRowClassName} variant="default">
          <ItemContent>
            <ItemTitle>{t("agent:fields.voice.label")}</ItemTitle>
            {loading ? <HiddenTextSkeleton className="type-body">{t("agent:fields.voice.summary", { voice: voiceName(voice), traits: voiceTraits(voice) })}</HiddenTextSkeleton> : <ItemDescription>{t("agent:fields.voice.summary", { voice: voiceName(voice), traits: voiceTraits(voice) })}</ItemDescription>}
          </ItemContent>
          <ItemActions className="w-full sm:w-auto">
            {loading ? (
              <Skeleton aria-hidden="true" className="inline-flex h-8 items-center rounded-full px-3 type-button-sm"><span className="invisible">{t("agent:fields.voice.change")}</span></Skeleton>
            ) : (
              <Button disabled={!profile || !canManage} onClick={() => setVoiceDialogOpen(true)} size="sm" type="button" variant="outline">{t("agent:fields.voice.change")}</Button>
            )}
          </ItemActions>
        </Item>
        <VoiceDialog current={voice} onOpenChange={setVoiceDialogOpen} onSave={saveVoice} open={voiceDialogOpen} preview={voicePreview} saving={voiceSaving} />
      </Surface>
    </section>
  );
}
