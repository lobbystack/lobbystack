"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { ReceptionistPage, SaveRow, useReceptionist, useSaveReceptionist, type ReceptionistSettings } from "./receptionist-page";

/** GPT-Live voices an owner can pick. The first one is the platform default. */
export const RECEPTIONIST_VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"] as const;

type BehaviorValues = { name: string; greeting: string; tone: string; voiceInstructions: string; chatInstructions: string; voice: string; language: string };

function valuesFrom(profile: ReceptionistSettings): BehaviorValues {
  return {
    name: profile.name,
    greeting: profile.greeting,
    tone: profile.tone,
    voiceInstructions: profile.voiceInstructions ?? "",
    chatInstructions: profile.chatInstructions ?? "",
    voice: profile.voice ?? "",
    language: profile.language ?? "",
  };
}

/** Changed fields only, in the shape /api/agent accepts. */
export function behaviorPatch(saved: BehaviorValues, next: BehaviorValues): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (next.name.trim() !== saved.name) patch.name = next.name.trim();
  if (next.greeting.trim() !== saved.greeting) patch.greeting = next.greeting.trim();
  if (next.tone.trim() !== saved.tone) patch.tone = next.tone.trim();
  if (next.voiceInstructions.trim() !== saved.voiceInstructions) patch.voiceInstructions = next.voiceInstructions.trim() || null;
  if (next.chatInstructions.trim() !== saved.chatInstructions) patch.chatInstructions = next.chatInstructions.trim() || null;
  if (next.voice !== saved.voice) patch.voice = next.voice || null;
  if (next.language !== saved.language) patch.receptionistLanguage = next.language || null;
  return patch;
}

export function ReceptionistBehaviorSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation(["receptionists", "common"]);
  const navigation = useNavigationSnapshot();
  const query = useReceptionist(agentId);
  const save = useSaveReceptionist(agentId);
  const saved = useMemo(() => query.data ? valuesFrom(query.data.profile) : null, [query.data]);
  const [values, setValues] = useState<BehaviorValues | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { name: useId(), greeting: useId(), tone: useId(), voiceInstructions: useId(), chatInstructions: useId(), voice: useId(), language: useId() };

  useEffect(() => { if (saved) setValues(saved); }, [saved]);

  const patch = saved && values ? behaviorPatch(saved, values) : {};
  const dirty = Object.keys(patch).length > 0;
  const invalid = Boolean(values && (!values.name.trim() || !values.greeting.trim() || !values.tone.trim()));
  const canManage = navigation?.canManage ?? false;
  const set = (key: keyof BehaviorValues) => (event: { target: { value: string } }) => setValues((current) => current ? { ...current, [key]: event.target.value } : current);

  async function submit() {
    if (!dirty || invalid) return;
    setSaving(true);
    try {
      await save(patch);
      toast.success(t("save.saved"));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setSaving(false);
    }
  }

  const businessLanguage = query.data?.business?.defaultLocale === "fr" ? t("common:language.french") : t("common:language.english");

  return (
    <ReceptionistPage agentId={agentId} description={t("behavior.description")} section="behavior">
      {!values ? <Skeleton className="h-96 w-full rounded-xl" /> : (
        <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <Surface className="p-6">
            <FieldGroup>
              <Field>
                <FieldContent><FieldLabel htmlFor={ids.name}>{t("behavior.name.label")}</FieldLabel><FieldDescription>{t("behavior.name.hint")}</FieldDescription></FieldContent>
                <Input className="sm:max-w-md" disabled={!canManage} id={ids.name} maxLength={80} onChange={set("name")} value={values.name} />
              </Field>
              <Field>
                <FieldContent><FieldLabel htmlFor={ids.greeting}>{t("behavior.greeting.label")}</FieldLabel><FieldDescription>{t("behavior.greeting.hint")}</FieldDescription></FieldContent>
                <Input disabled={!canManage} id={ids.greeting} onChange={set("greeting")} value={values.greeting} />
              </Field>
              <Field>
                <FieldContent><FieldLabel htmlFor={ids.voiceInstructions}>{t("behavior.voiceInstructions.label")}</FieldLabel><FieldDescription>{t("behavior.voiceInstructions.hint")}</FieldDescription></FieldContent>
                <Textarea className="min-h-32" disabled={!canManage} id={ids.voiceInstructions} onChange={set("voiceInstructions")} placeholder={t("behavior.voiceInstructions.placeholder")} value={values.voiceInstructions} />
              </Field>
              <Field>
                <FieldContent><FieldLabel htmlFor={ids.chatInstructions}>{t("behavior.chatInstructions.label")}</FieldLabel><FieldDescription>{t("behavior.chatInstructions.hint")}</FieldDescription></FieldContent>
                <Textarea className="min-h-32" disabled={!canManage} id={ids.chatInstructions} onChange={set("chatInstructions")} placeholder={t("behavior.chatInstructions.placeholder")} value={values.chatInstructions} />
              </Field>
              <Field>
                <FieldContent><FieldLabel htmlFor={ids.tone}>{t("behavior.tone.label")}</FieldLabel><FieldDescription>{t("behavior.tone.hint")}</FieldDescription></FieldContent>
                <Input className="sm:max-w-md" disabled={!canManage} id={ids.tone} onChange={set("tone")} value={values.tone} />
              </Field>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field>
                  <FieldContent><FieldLabel htmlFor={ids.voice}>{t("behavior.voice.label")}</FieldLabel><FieldDescription>{t("behavior.voice.hint")}</FieldDescription></FieldContent>
                  <NativeSelect disabled={!canManage} id={ids.voice} onChange={set("voice")} value={values.voice}>
                    <NativeSelectOption value="">{t("behavior.voice.default")}</NativeSelectOption>
                    {RECEPTIONIST_VOICES.slice(1).map((voice) => <NativeSelectOption key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldContent><FieldLabel htmlFor={ids.language}>{t("behavior.language.label")}</FieldLabel><FieldDescription>{t("behavior.language.hint")}</FieldDescription></FieldContent>
                  <NativeSelect disabled={!canManage} id={ids.language} onChange={set("language")} value={values.language}>
                    <NativeSelectOption value="">{t("behavior.language.business", { language: businessLanguage })}</NativeSelectOption>
                    <NativeSelectOption value="en">{t("common:language.english")}</NativeSelectOption>
                    <NativeSelectOption value="fr">{t("common:language.french")}</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
            </FieldGroup>
          </Surface>
          {canManage ? <SaveRow canSave={!invalid} dirty={dirty} onReset={() => saved && setValues(saved)} onSave={() => void submit()} saving={saving} /> : null}
        </form>
      )}
    </ReceptionistPage>
  );
}
