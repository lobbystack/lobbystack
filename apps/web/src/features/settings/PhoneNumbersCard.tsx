import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Phone, Route } from "lucide-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PhoneNumbersCardProps = {
  businessId: Id<"businesses">;
};

const NEW_PHONE_VALUE = "__new__";

function getPhoneLabel(phoneNumber: Doc<"phone_numbers">): string {
  return phoneNumber.twilioPhoneSid
    ? `${phoneNumber.e164} (${phoneNumber.twilioPhoneSid})`
    : phoneNumber.e164;
}

function getStatusLabel(
  status: string,
  t: (key: string) => string,
): string {
  switch (status) {
    case "active":
      return t("settings:phoneRouting.statuses.active");
    case "provisioning":
      return t("settings:phoneRouting.statuses.provisioning");
    case "inactive":
      return t("settings:phoneRouting.statuses.inactive");
    default:
      return status;
  }
}

export function PhoneNumbersCard(props: PhoneNumbersCardProps) {
  const { t } = useTranslation(["common", "settings"]);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const upsertPhoneNumber = useMutation(api.businesses.catalog.upsertPhoneNumber);
  const phoneNumbers = useMemo(
    () => (configuration?.phoneNumbers ?? []) as Array<Doc<"phone_numbers">>,
    [configuration],
  );
  const [selectedPhoneNumberKey, setSelectedPhoneNumberKey] = useState(NEW_PHONE_VALUE);
  const [e164, setE164] = useState("");
  const [twilioPhoneSid, setTwilioPhoneSid] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [status, setStatus] = useState("active");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPhoneNumber = phoneNumbers.find(
    (phoneNumber) => String(phoneNumber._id) === selectedPhoneNumberKey,
  );

  useEffect(() => {
    if (phoneNumbers.length === 0) {
      setSelectedPhoneNumberKey(NEW_PHONE_VALUE);
      return;
    }

    setSelectedPhoneNumberKey((currentValue) => {
      if (currentValue === NEW_PHONE_VALUE) {
        return String(phoneNumbers[0]?._id);
      }

      const stillExists = phoneNumbers.some(
        (phoneNumber) => String(phoneNumber._id) === currentValue,
      );
      return stillExists ? currentValue : String(phoneNumbers[0]?._id);
    });
  }, [phoneNumbers]);

  useEffect(() => {
    if (!selectedPhoneNumber) {
      setE164("");
      setTwilioPhoneSid("");
      setVoiceEnabled(true);
      setSmsEnabled(true);
      setStatus("active");
      return;
    }

    setE164(selectedPhoneNumber.e164);
    setTwilioPhoneSid(selectedPhoneNumber.twilioPhoneSid ?? "");
    setVoiceEnabled(selectedPhoneNumber.voiceEnabled);
    setSmsEnabled(selectedPhoneNumber.smsEnabled);
    setStatus(selectedPhoneNumber.status);
  }, [selectedPhoneNumber]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const result = await upsertPhoneNumber({
        businessId: props.businessId,
        ...(selectedPhoneNumber?._id ? { phoneNumberId: selectedPhoneNumber._id } : {}),
        e164: e164.replace(/\s+/g, ""),
        ...(twilioPhoneSid.trim() ? { twilioPhoneSid: twilioPhoneSid.trim() } : {}),
        voiceEnabled,
        smsEnabled,
        status,
      });

      setSelectedPhoneNumberKey(String(result.phoneNumberId));
      setSaveMessage(
        selectedPhoneNumber
          ? t("settings:phoneRouting.saved")
          : t("settings:phoneRouting.added"),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("settings:phoneRouting.saveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            <Route className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t("settings:phoneRouting.title")}</CardTitle>
            <CardDescription>{t("settings:phoneRouting.description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("settings:phoneRouting.managedNumber")}
            </span>
            <Select
              onValueChange={(value) => setSelectedPhoneNumberKey(value ?? NEW_PHONE_VALUE)}
              value={selectedPhoneNumberKey}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings:phoneRouting.selectNumber")} />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((phoneNumber) => (
                  <SelectItem key={phoneNumber._id} value={String(phoneNumber._id)}>
                    {phoneNumber.e164}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_PHONE_VALUE}>{t("settings:phoneRouting.addNewNumber")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:phoneRouting.e164Number")}
              </span>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  onChange={(event) => setE164(event.target.value)}
                  placeholder="+18708763750"
                  value={e164}
                />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:phoneRouting.twilioPhoneSid")}
              </span>
              <Input
                onChange={(event) => setTwilioPhoneSid(event.target.value)}
                placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={twilioPhoneSid}
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("settings:phoneRouting.status")}
              </span>
              <Select onValueChange={(value) => setStatus(value ?? "active")} value={status}>
                <SelectTrigger>
                  <SelectValue placeholder={t("settings:phoneRouting.selectStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("settings:phoneRouting.statuses.active")}</SelectItem>
                  <SelectItem value="provisioning">{t("settings:phoneRouting.statuses.provisioning")}</SelectItem>
                  <SelectItem value="inactive">{t("settings:phoneRouting.statuses.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <Checkbox
                checked={voiceEnabled}
                onCheckedChange={(checked) => setVoiceEnabled(Boolean(checked))}
              />
              <span className="text-sm text-foreground">{t("settings:phoneRouting.voiceEnabled")}</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <Checkbox
                checked={smsEnabled}
                onCheckedChange={(checked) => setSmsEnabled(Boolean(checked))}
              />
              <span className="text-sm text-foreground">{t("settings:phoneRouting.smsEnabled")}</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSaving || e164.trim().length === 0} type="submit">
              {isSaving
                ? t("settings:phoneRouting.saving")
                : selectedPhoneNumber
                  ? t("settings:phoneRouting.save")
                  : t("settings:phoneRouting.saveNew")}
            </Button>
            {saveMessage ? <span className="text-sm text-muted-foreground">{saveMessage}</span> : null}
            {errorMessage ? <span className="text-sm text-destructive">{errorMessage}</span> : null}
          </div>
        </form>

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            {t("settings:phoneRouting.currentMappings")}
          </p>
          {phoneNumbers.length > 0 ? (
            phoneNumbers.map((phoneNumber) => (
              <div
                className="rounded-2xl border border-border/70 bg-background/80 p-4"
                key={phoneNumber._id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{phoneNumber.e164}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {phoneNumber.twilioPhoneSid ?? t("settings:phoneRouting.noSid")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{getStatusLabel(phoneNumber.status, t)}</Badge>
                    {phoneNumber.voiceEnabled ? <Badge>{t("common:badges.voice")}</Badge> : null}
                    {phoneNumber.smsEnabled ? (
                      <Badge variant="secondary">{t("common:badges.sms")}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("settings:phoneRouting.empty")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
