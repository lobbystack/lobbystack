import { FormEvent, useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { PencilLine } from "lucide-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ServicesCardProps = {
  businessId: Id<"businesses">;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ServicesCard(props: ServicesCardProps) {
  const { t } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const services = (configuration?.services ?? []) as Array<Doc<"services">>;
  const upsertService = useAction(api.businesses.catalog.upsertService);
  const [serviceId, setServiceId] = useState<Id<"services"> | null>(null);
  const [name, setName] = useState("");
  const [englishLabel, setEnglishLabel] = useState("");
  const [frenchLabel, setFrenchLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!serviceId) {
      setSlug(slugify(name));
    }
  }, [name, serviceId]);

  function resetForm(): void {
    setServiceId(null);
    setName("");
    setEnglishLabel("");
    setFrenchLabel("");
    setSlug("");
    setDescription("");
    setDurationMinutes("30");
  }

  function beginEditing(service: Doc<"services">): void {
    setServiceId(service._id);
    setName(service.name);
    setEnglishLabel(service.localizedNames?.en ?? "");
    setFrenchLabel(service.localizedNames?.fr ?? "");
    setSlug(service.slug);
    setDescription(service.description ?? "");
    setDurationMinutes(String(service.durationMinutes));
    setStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (trimmedName.length === 0 || trimmedSlug.length === 0) {
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      await upsertService({
        businessId: props.businessId,
        ...(serviceId ? { serviceId } : {}),
        name: trimmedName,
        localizedNames: {
          en: englishLabel.trim(),
          fr: frenchLabel.trim(),
        },
        slug: trimmedSlug,
        ...(description.trim() ? { description: description.trim() } : {}),
        durationMinutes: Number(durationMinutes),
        active: true,
      });
      setStatus(t("services.saved"));
      resetForm();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <CardTitle>{t("services.title")}</CardTitle>
          <CardDescription>{t("services.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <form className="flex flex-col gap-8" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-name">{t("services.serviceName")}</FieldLabel>
              <Input
                id="service-name"
                placeholder={t("services.placeholders.serviceName")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-slug">{t("services.slug")}</FieldLabel>
              <Input
                id="service-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-en">{t("services.englishLabel")}</FieldLabel>
              <Input
                id="service-en"
                placeholder={t("services.placeholders.englishLabel")}
                value={englishLabel}
                onChange={(event) => setEnglishLabel(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-fr">{t("services.frenchLabel")}</FieldLabel>
              <Input
                id="service-fr"
                placeholder={t("services.placeholders.frenchLabel")}
                value={frenchLabel}
                onChange={(event) => setFrenchLabel(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-duration">{t("services.durationMinutes")}</FieldLabel>
              <Input
                id="service-duration"
                min="5"
                step="5"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-description">{t("services.descriptionLabel")}</FieldLabel>
              <Input
                id="service-description"
                placeholder={t("services.placeholders.description")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isSaving || name.trim().length === 0 || slug.trim().length === 0}
              type="submit"
            >
              {isSaving
                ? t("services.saving")
                : serviceId
                  ? t("services.update")
                  : t("services.save")}
            </Button>
            {serviceId ? (
              <Button type="button" variant="ghost" onClick={resetForm}>
                {t("services.cancelEdit")}
              </Button>
            ) : null}
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </form>
        <div className="flex flex-col gap-4">
          {services.map((service) => (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={service._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <strong className="text-sm text-foreground">{service.name}</strong>
                  <div className="text-xs text-muted-foreground">
                    {t("services.englishLabel")}: {service.localizedNames?.en || service.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("services.frenchLabel")}: {service.localizedNames?.fr || service.name}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{service.durationMinutes} min</Badge>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => beginEditing(service)}>
                    <PencilLine className="size-4" />
                    <span className="sr-only">{t("services.edit")}</span>
                  </Button>
                </div>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {service.description || t("services.noDescription")}
              </p>
            </div>
          ))}
          {configuration && services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("services.empty")}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
