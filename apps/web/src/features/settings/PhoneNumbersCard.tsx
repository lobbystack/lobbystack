import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { IconPhone, IconRoute } from "@tabler/icons-react";

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

export function PhoneNumbersCard(props: PhoneNumbersCardProps) {
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
      const trimmedTwilioPhoneSid = twilioPhoneSid.trim();
      const result = await upsertPhoneNumber({
        businessId: props.businessId,
        e164: e164.replace(/\s+/g, ""),
        voiceEnabled,
        smsEnabled,
        status,
        ...(selectedPhoneNumber?._id !== undefined
          ? { phoneNumberId: selectedPhoneNumber._id }
          : {}),
        ...(trimmedTwilioPhoneSid ? { twilioPhoneSid: trimmedTwilioPhoneSid } : {}),
      });

      setSelectedPhoneNumberKey(String(result.phoneNumberId));
      setSaveMessage(selectedPhoneNumber ? "Saved phone number routing." : "Added phone number routing.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save phone number routing.",
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
            <IconRoute className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>Phone Number Routing</CardTitle>
            <CardDescription>
              Map Twilio numbers to this business so live calls and SMS load the correct receptionist snapshot.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Managed number
            </span>
            <Select
              onValueChange={(value) => setSelectedPhoneNumberKey(value ?? NEW_PHONE_VALUE)}
              value={selectedPhoneNumberKey}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a number" />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((phoneNumber) => (
                  <SelectItem key={phoneNumber._id} value={String(phoneNumber._id)}>
                    {phoneNumber.e164}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_PHONE_VALUE}>Add new number</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                E.164 number
              </span>
              <div className="relative">
                <IconPhone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  onChange={(event) => setE164(event.target.value)}
                  placeholder="+18708763750"
                  value={e164}
                />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Twilio Phone SID
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
                Status
              </span>
              <Select onValueChange={(value) => setStatus(value ?? "active")} value={status}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="provisioning">Provisioning</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <Checkbox
                checked={voiceEnabled}
                onCheckedChange={(checked) => setVoiceEnabled(Boolean(checked))}
              />
              <span className="text-sm text-foreground">Voice enabled</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <Checkbox
                checked={smsEnabled}
                onCheckedChange={(checked) => setSmsEnabled(Boolean(checked))}
              />
              <span className="text-sm text-foreground">SMS enabled</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSaving || e164.trim().length === 0} type="submit">
              {isSaving ? "Saving..." : selectedPhoneNumber ? "Save routing" : "Add number"}
            </Button>
            {saveMessage ? <span className="text-sm text-muted-foreground">{saveMessage}</span> : null}
            {errorMessage ? <span className="text-sm text-destructive">{errorMessage}</span> : null}
          </div>
        </form>

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            Current mappings
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
                      {phoneNumber.twilioPhoneSid ?? "No Twilio Phone SID saved yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{phoneNumber.status}</Badge>
                    {phoneNumber.voiceEnabled ? <Badge>Voice</Badge> : null}
                    {phoneNumber.smsEnabled ? <Badge variant="secondary">SMS</Badge> : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              No Twilio numbers are mapped yet. Add the live number you configured in Twilio using exact E.164 format.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
