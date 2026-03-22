import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { RuntimeLocale } from "@ai-receptionist/shared";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";

type AgentPageProps = {
  businessId?: Id<"businesses">;
};

function BasicSettingsSection({ businessId }: { businessId: Id<"businesses"> }) {
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
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agent-greeting">{t("agent:fields.greeting.label")}</Label>
          <Input
            id="agent-greeting"
            placeholder={t("agent:fields.greeting.placeholder")}
            value={greeting}
            onChange={(event) => setGreeting(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("agent:fields.greeting.hint")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-default-language">{t("agent:fields.defaultLanguage.label")}</Label>
          <Select
            value={defaultLocale}
            onValueChange={(value) => setDefaultLocale((value as RuntimeLocale | "") || "en")}
          >
            <SelectTrigger id="agent-default-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("common:language.english")}</SelectItem>
              <SelectItem value="fr">{t("common:language.french")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("agent:fields.defaultLanguage.hint")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={isSaving} type="submit">
          {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
        </Button>
        {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
      </div>
    </form>
  );
}

export function AgentPage({ businessId }: AgentPageProps) {
  const { t } = useTranslation("agent");

  if (!businessId) {
    return (
      <div className="flex flex-col gap-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(247,247,245,0.98)_55%,rgba(236,253,245,0.9))] px-6 py-8 shadow-sm shadow-black/5 md:px-8 md:py-10">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-foreground/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-6">
            <div className="max-w-3xl space-y-4">
              <Badge className="rounded-full bg-foreground px-3 py-1 text-primary-foreground">
                {t("page.eyebrow")}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  {t("page.title")}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  {t("empty.description")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <BusinessSetupCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("page.title")}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("page.description")}
        </p>
      </div>

      <Accordion multiple defaultValue={["basic-settings"]}>
        <AccordionItem value="basic-settings">
          <AccordionHeader>
            <AccordionTrigger>
              <div className="space-y-1">
                <span className="text-sm font-semibold">{t("sections.basicSettings.title")}</span>
                <p className="text-xs font-normal text-muted-foreground">
                  {t("sections.basicSettings.description")}
                </p>
              </div>
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <BasicSettingsSection businessId={businessId} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
