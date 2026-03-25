import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { RuntimeLocale } from "@ai-receptionist/shared";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type BusinessProfileFormProps = {
  businessId: Id<"businesses">;
};

export function BusinessProfileForm(props: BusinessProfileFormProps) {
  const { t } = useTranslation(["settings", "common"]);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const saveProfile = useMutation(api.ai.context.snapshots.updateReceptionistProfile);
  const [greeting, setGreeting] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [bookingPolicy, setBookingPolicy] = useState("");
  const [voiceInstructions, setVoiceInstructions] = useState("");
  const [smsInstructions, setSmsInstructions] = useState("");
  const [transferMode, setTransferMode] = useState("on_request");
  const [transferNumber, setTransferNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    setGreeting(profile.greeting);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
    setBookingPolicy(profile.bookingPolicy);
    setVoiceInstructions(profile.voiceInstructions ?? "");
    setSmsInstructions(profile.smsInstructions ?? "");
    setTransferMode(profile.transferMode);
    setTransferNumber(profile.transferNumber ?? "");
  }, [configuration]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await saveProfile({
        businessId: props.businessId,
        greeting,
        defaultLocale,
        bookingPolicy,
        ...(voiceInstructions.trim() ? { voiceInstructions: voiceInstructions.trim() } : {}),
        ...(smsInstructions.trim() ? { smsInstructions: smsInstructions.trim() } : {}),
        transferMode,
        transferNumber: transferNumber.trim() || null,
      });
      setStatus(t("profile.saved"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="space-y-2 pb-2">
        <div className="space-y-2">
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-8" onSubmit={(event) => void handleSubmit(event)}>
          <label className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">{t("profile.greeting")}</span>
            <Input
              value={greeting}
              onChange={(event) => setGreeting(event.target.value)}
            />
          </label>
          <label className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">{t("profile.defaultCustomerLanguage")}</span>
            <Select
              value={defaultLocale}
              onValueChange={(value) => setDefaultLocale((value as RuntimeLocale | "") || "en")}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("profile.selectDefaultLanguage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("common:language.english")}</SelectItem>
                <SelectItem value="fr">{t("common:language.french")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">{t("profile.bookingPolicy")}</span>
            <Textarea
              rows={3}
              value={bookingPolicy}
              onChange={(event) => setBookingPolicy(event.target.value)}
            />
          </label>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-3">
              <span className="text-xs font-medium text-muted-foreground">{t("profile.transferMode")}</span>
              <Select value={transferMode} onValueChange={(value) => setTransferMode(value ?? "on_request")}>
                <SelectTrigger>
                  <SelectValue placeholder={t("profile.selectTransferMode")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">{t("profile.transferModes.never")}</SelectItem>
                  <SelectItem value="always">{t("profile.transferModes.always")}</SelectItem>
                  <SelectItem value="on_request">{t("profile.transferModes.on_request")}</SelectItem>
                  <SelectItem value="on_urgent">{t("profile.transferModes.on_urgent")}</SelectItem>
                  <SelectItem value="during_business_hours">{t("profile.transferModes.during_business_hours")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-3">
              <span className="text-xs font-medium text-muted-foreground">{t("profile.transferNumber")}</span>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder={t("profile.placeholders.transferNumber")}
                  value={transferNumber}
                  onChange={(event) => setTransferNumber(event.target.value)}
                />
              </div>
            </label>
          </div>
          <label className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">{t("profile.voiceInstructions")}</span>
            <Textarea
              rows={4}
              value={voiceInstructions}
              onChange={(event) => setVoiceInstructions(event.target.value)}
            />
          </label>
          <label className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground">{t("profile.smsInstructions")}</span>
            <Textarea
              rows={4}
              value={smsInstructions}
              onChange={(event) => setSmsInstructions(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-6">
            <Button disabled={isSaving} type="submit">
              {isSaving ? t("profile.saving") : t("profile.save")}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
