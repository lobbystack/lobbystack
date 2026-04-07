import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { RuntimeLocale } from "@ai-receptionist/shared";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { PhoneInput } from "@/components/ui/phone-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type AgentBasicSettingsPageProps = {
  businessId: Id<"businesses">;
};

export function resolveTransferNumberForSave({
  rawInputValue,
  validTransferNumber,
}: {
  rawInputValue: string;
  validTransferNumber: string;
}):
  | { ok: true; value: string | null }
  | { ok: false; errorKey: "agent:fields.transferNumber.errors.invalid" } {
  const trimmedVisibleTransferNumber = rawInputValue.trim();
  if (trimmedVisibleTransferNumber.length === 0) {
    return { ok: true, value: null };
  }

  const trimmedTransferNumber = validTransferNumber.trim();
  if (trimmedTransferNumber.length > 0) {
    return { ok: true, value: trimmedTransferNumber };
  }

  return {
    ok: false,
    errorKey: "agent:fields.transferNumber.errors.invalid",
  };
}

export function AgentBasicSettingsPage({ businessId }: AgentBasicSettingsPageProps) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId,
  });
  const saveProfile = useMutation(api.ai.context.snapshots.updateReceptionistProfile);
  const persistedProfile = configuration?.profile;

  const [greeting, setGreeting] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [transferNumber, setTransferNumber] = useState("");
  const [transferNumberInputValue, setTransferNumberInputValue] = useState("");
  const [greetingStatus, setGreetingStatus] = useState<string | null>(null);
  const [localeStatus, setLocaleStatus] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [isGreetingSaving, setIsGreetingSaving] = useState(false);
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
  const [transferStatusTone, setTransferStatusTone] = useState<"success" | "error">("success");

  useEffect(() => {
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    setGreeting(profile.greeting);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
    setTransferNumber(profile.transferNumber ?? "");
    setTransferNumberInputValue(profile.transferNumber ?? "");
  }, [configuration]);

  useEffect(() => {
    const timeouts: number[] = [];

    if (greetingStatus) {
      timeouts.push(window.setTimeout(() => {
        setGreetingStatus(null);
      }, 3000));
    }

    if (localeStatus) {
      timeouts.push(window.setTimeout(() => {
        setLocaleStatus(null);
      }, 3000));
    }

    if (transferStatus) {
      timeouts.push(window.setTimeout(() => {
        setTransferStatus(null);
        setTransferStatusTone("success");
      }, 3000));
    }

    return () => {
      for (const timeoutId of timeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [greetingStatus, localeStatus, transferStatus]);

  async function saveGreeting(): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsGreetingSaving(true);
    setGreetingStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "greeting",
      });
      setGreetingStatus(t("agent:actions.saved"));
    } finally {
      setIsGreetingSaving(false);
    }
  }

  async function saveDefaultLocale(): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsLocaleSaving(true);
    setLocaleStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "default_locale",
      });
      setLocaleStatus(t("agent:actions.saved"));
    } finally {
      setIsLocaleSaving(false);
    }
  }

  async function saveTransferNumber(): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsTransferSaving(true);
    setTransferStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "transfer_number",
      });
      setTransferStatus(t("agent:actions.saved"));
      setTransferStatusTone("success");
    } finally {
      setIsTransferSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel htmlFor="agent-greeting">
                {t("agent:fields.greeting.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:fields.greeting.hint")}
              </FieldDescription>
            </FieldContent>
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
              <Button
                disabled={isGreetingSaving || !persistedProfile}
                onClick={() => void saveGreeting()}
                type="button"
              >
                {isGreetingSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {greetingStatus ? (
                <span className="text-sm text-muted-foreground">{greetingStatus}</span>
              ) : null}
            </div>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor="agent-default-language">
                {t("agent:fields.defaultLocale.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:fields.defaultLocale.hint")}
              </FieldDescription>
            </FieldContent>
            <div style={{ width: "13ch" }}>
              <NativeSelect
                aria-label={t("agent:fields.defaultLocale.label")}
                className="w-full"
                id="agent-default-language"
                onChange={(event) => {
                  setDefaultLocale((event.target.value as RuntimeLocale | "") || "en");
                  setLocaleStatus(null);
                }}
                value={defaultLocale}
              >
                <NativeSelectOption value="en">
                  {t("common:language.english")}
                </NativeSelectOption>
                <NativeSelectOption value="fr">
                  {t("common:language.french")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={isLocaleSaving || !persistedProfile}
                onClick={() => void saveDefaultLocale()}
                type="button"
              >
                {isLocaleSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {localeStatus ? (
                <span className="text-sm text-muted-foreground">{localeStatus}</span>
              ) : null}
            </div>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor="agent-transfer-number">
                {t("agent:fields.transferNumber.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:fields.transferNumber.hint")}
              </FieldDescription>
            </FieldContent>
            <div className="w-full max-w-sm">
              <PhoneInput
                id="agent-transfer-number"
                locale={i18n.language}
                onRawValueChange={(nextRawValue) => {
                  setTransferNumberInputValue(nextRawValue);
                  setTransferStatus(null);
                  setTransferStatusTone("success");
                }}
                value={transferNumber || undefined}
                onChange={(nextValue) => {
                  setTransferNumber(nextValue ?? "");
                  setTransferStatus(null);
                  setTransferStatusTone("success");
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={isTransferSaving || !persistedProfile}
                onClick={() => void saveTransferNumber()}
                type="button"
              >
                {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
              {transferStatus ? (
                <span
                  className={
                    transferStatusTone === "error"
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {transferStatus}
                </span>
              ) : null}
            </div>
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}
