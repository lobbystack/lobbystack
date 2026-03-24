import { useEffect, useState } from "react";
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
  const [transferNumber, setTransferNumber] = useState("");
  const [greetingStatus, setGreetingStatus] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [languageStatus, setLanguageStatus] = useState<string | null>(null);
  const [isGreetingSaving, setIsGreetingSaving] = useState(false);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
  const [isLanguageSaving, setIsLanguageSaving] = useState(false);

  useEffect(() => {
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    setGreeting(profile.greeting);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
    setTransferNumber(profile.transferNumber ?? "");
  }, [configuration]);

  useEffect(() => {
    const timeouts: number[] = [];

    if (greetingStatus) {
      timeouts.push(window.setTimeout(() => {
        setGreetingStatus(null);
      }, 3000));
    }

    if (languageStatus) {
      timeouts.push(window.setTimeout(() => {
        setLanguageStatus(null);
      }, 3000));
    }

    if (transferStatus) {
      timeouts.push(window.setTimeout(() => {
        setTransferStatus(null);
      }, 3000));
    }

    return () => {
      for (const timeoutId of timeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [greetingStatus, languageStatus, transferStatus]);

  async function saveGreeting(): Promise<void> {
    setIsGreetingSaving(true);
    setGreetingStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        tone: configuration?.profile?.tone ?? "",
        summary: configuration?.profile?.summary ?? "",
        bookingPolicy: configuration?.profile?.bookingPolicy ?? "",
        transferMode: configuration?.profile?.transferMode ?? "on_request",
        ...(transferNumber.trim().length > 0
          ? { transferNumber: transferNumber.trim() }
          : {}),
      });
      setGreetingStatus(t("agent:actions.saved"));
    } finally {
      setIsGreetingSaving(false);
    }
  }

  async function saveDefaultLanguage(nextDefaultLocale: RuntimeLocale): Promise<void> {
    setIsLanguageSaving(true);
    setLanguageStatus(null);
    try {
      const trimmedTransferNumber = transferNumber.trim();
      await saveProfile({
        businessId,
        defaultLocale: nextDefaultLocale,
        greeting,
        tone: configuration?.profile?.tone ?? "",
        summary: configuration?.profile?.summary ?? "",
        bookingPolicy: configuration?.profile?.bookingPolicy ?? "",
        transferMode: configuration?.profile?.transferMode ?? "on_request",
        ...(trimmedTransferNumber.length > 0
          ? { transferNumber: trimmedTransferNumber }
          : {}),
      });
      setLanguageStatus(t("agent:actions.saved"));
    } finally {
      setIsLanguageSaving(false);
    }
  }

  async function saveTransferNumber(): Promise<void> {
    setIsTransferSaving(true);
    setTransferStatus(null);
    try {
      const trimmedTransferNumber = transferNumber.trim();
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        tone: configuration?.profile?.tone ?? "",
        summary: configuration?.profile?.summary ?? "",
        bookingPolicy: configuration?.profile?.bookingPolicy ?? "",
        transferMode: configuration?.profile?.transferMode ?? "on_request",
        ...(trimmedTransferNumber.length > 0
          ? { transferNumber: trimmedTransferNumber }
          : {}),
      });
      setTransferStatus(t("agent:actions.saved"));
    } finally {
      setIsTransferSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="flex flex-col gap-6">
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
                setGreetingStatus(null);
              }}
            />
            <div className="flex items-center gap-3">
              <Button disabled={isGreetingSaving} onClick={() => void saveGreeting()} type="button">
                {isGreetingSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {greetingStatus ? (
                <span className="text-sm text-muted-foreground">{greetingStatus}</span>
              ) : null}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="agent-default-language">
              {t("agent:fields.defaultLanguage.label")}
            </FieldLabel>
            <FieldDescription>
              {t("agent:fields.defaultLanguage.hint")}
            </FieldDescription>
            <div className="flex items-center gap-3">
              <div style={{ width: "13ch" }}>
                <NativeSelect
                  className="w-full"
                  id="agent-default-language"
                  value={defaultLocale}
                  onChange={(event) => {
                    const nextDefaultLocale =
                      (event.target.value as RuntimeLocale | "") || "en";
                    setDefaultLocale(nextDefaultLocale);
                    void saveDefaultLanguage(nextDefaultLocale);
                  }}
                >
                  <NativeSelectOption value="en">
                    {t("common:language.english")}
                  </NativeSelectOption>
                  <NativeSelectOption value="fr">
                    {t("common:language.french")}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              {languageStatus ? (
                <span className="text-sm text-muted-foreground">{languageStatus}</span>
              ) : null}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="agent-transfer-number">
              {t("agent:fields.transferNumber.label")}
            </FieldLabel>
            <FieldDescription>
              {t("agent:fields.transferNumber.hint")}
            </FieldDescription>
            <div style={{ width: "13ch" }}>
              <Input
                id="agent-transfer-number"
                placeholder={t("agent:fields.transferNumber.placeholder")}
                value={transferNumber}
                onChange={(event) => {
                  setTransferNumber(event.target.value);
                  setTransferStatus(null);
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={isTransferSaving}
                onClick={() => void saveTransferNumber()}
                type="button"
              >
                {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {transferStatus ? (
                <span className="text-sm text-muted-foreground">{transferStatus}</span>
              ) : null}
            </div>
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}
