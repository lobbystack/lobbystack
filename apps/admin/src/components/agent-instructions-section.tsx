"use client";

import { RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH } from "@lobbystack/shared";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { TextSettingRow } from "@/components/text-setting-row";
import { Surface } from "@/components/ui/surface";
import { useAgentSettingsQuery, useSaveAgent } from "@/hooks/use-agent-settings";

type InstructionField = "voiceInstructions" | "chatInstructions" | "smsInstructions";

// Chats cover the website widget and Instagram, so only that row says which channels it means.
const FIELDS: ReadonlyArray<{ field: InstructionField; key: "voice" | "chat" | "text"; setting: string; hint?: true }> = [
  { field: "voiceInstructions", key: "voice", setting: "voice_instructions" },
  { field: "chatInstructions", key: "chat", setting: "chat_instructions", hint: true },
  { field: "smsInstructions", key: "text", setting: "sms_instructions" },
];

/** What an agent should do on calls, in chats and in text messages. An empty field clears it. */
export function AgentInstructionsSection({ agentId, businessId, canManage }: { businessId: string; agentId: string; canManage: boolean }) {
  const { t } = useTranslation("agent");
  const telemetry = useTelemetry();
  const query = useAgentSettingsQuery(businessId, agentId);
  const save = useSaveAgent(businessId, agentId);
  const profile = query.data?.profile;
  const loading = !businessId || !agentId || query.isLoading;

  async function saveField(field: InstructionField, setting: string, value: string): Promise<boolean> {
    if (!canManage || !profile) return false;
    try {
      await save({ [field]: value || null });
      telemetry.track("web.agent.settings_saved", { businessId, setting });
      toast.success(t("agent:actions.saved"));
      return true;
    } catch {
      toast.error(t("agent:actions.saveFailed"));
      return false;
    }
  }

  return (
    <section aria-busy={loading || undefined} className="flex flex-col gap-3">
      <h2 className="font-heading text-sm leading-snug font-medium">{t("agent:fields.instructions.title")}</h2>
      <Surface className="flex flex-col">
        {FIELDS.map(({ field, hint, key, setting }) => (
          <TextSettingRow
            allowEmpty
            {...(hint ? { description: t(`agent:instructions.${key}.hint`) } : {})}
            disabled={loading || !profile || !canManage}
            id={`agent-${key}-instructions`}
            key={field}
            label={t(`agent:instructions.${key}.label`)}
            maxLength={RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH}
            onSave={(value) => saveField(field, setting, value)}
            placeholder={t(`agent:instructions.${key}.placeholder`)}
            rows={8}
            value={profile?.[field] ?? ""}
          />
        ))}
      </Surface>
    </section>
  );
}
