import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { RuntimeLocale } from "@ai-receptionist/shared";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type AgentBasicSettingsPageProps = {
  businessId: Id<"businesses">;
};

export function AgentBasicSettingsPage({ businessId }: AgentBasicSettingsPageProps) {
  const { t } = useTranslation(["agent", "common"]);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId,
  });
  const saveProfile = useMutation(api.ai.context.snapshots.updateReceptionistProfile);

  const [greeting, setGreeting] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    setGreeting(profile.greeting);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
  }, [configuration]);

  useEffect(() => {
    if (!status) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        tone: configuration?.profile?.tone ?? "",
        summary: configuration?.profile?.summary ?? "",
        bookingPolicy: configuration?.profile?.bookingPolicy ?? "",
        transferMode: configuration?.profile?.transferMode ?? "on_request",
      });
      setStatus(t("agent:actions.saved"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="agent-greeting">
              {t("agent:fields.greeting.label")}
            </FieldLabel>
            <FieldDescription>
              {t("agent:fields.greeting.hint")}
            </FieldDescription>
            <Input
              id="agent-greeting"
              placeholder={t("agent:fields.greeting.placeholder")}
              value={greeting}
              onChange={(event) => {
                setGreeting(event.target.value);
                setStatus(null);
              }}
            />
            <div className="flex items-center gap-3">
              <Button disabled={isSaving} type="submit">
                {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="agent-default-language">
              {t("agent:fields.defaultLanguage.label")}
            </FieldLabel>
            <FieldDescription>
              {t("agent:fields.defaultLanguage.hint")}
            </FieldDescription>
            <NativeSelect
              className="max-w-xs"
              id="agent-default-language"
              value={defaultLocale}
              onChange={(event) =>
                setDefaultLocale((event.target.value as RuntimeLocale | "") || "en")
              }
            >
              <NativeSelectOption value="en">
                {t("common:language.english")}
              </NativeSelectOption>
              <NativeSelectOption value="fr">
                {t("common:language.french")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
