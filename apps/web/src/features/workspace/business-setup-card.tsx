import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BusinessSetupCard() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const bootstrapBusiness = useMutation(api.businesses.admin.bootstrapBusiness);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [businessType, setBusinessType] = useState("clinic");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    setError(null);

    try {
      await bootstrapBusiness({ name, slug, timezone, businessType });
      void navigate("/onboarding/verify-phone");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t("setup.failed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>{t("setup.title")}</CardTitle>
        <CardDescription>{t("setup.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="setup-business-name">{t("setup.businessName")}</FieldLabel>
                  <FieldDescription>{t("setup.placeholders.businessName")}</FieldDescription>
                </FieldContent>
                <Input
                  id="setup-business-name"
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder={t("setup.placeholders.businessName")}
                  value={name}
                />
              </Field>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="setup-business-slug">{t("setup.slug")}</FieldLabel>
                  <FieldDescription>{t("setup.placeholders.slug")}</FieldDescription>
                </FieldContent>
                <Input
                  id="setup-business-slug"
                  onChange={(event) => setSlug(slugify(event.target.value))}
                  placeholder={t("setup.placeholders.slug")}
                  value={slug}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="setup-timezone">{t("setup.timezone")}</FieldLabel>
                <Input id="setup-timezone" onChange={(event) => setTimezone(event.target.value)} value={timezone} />
              </Field>
              <Field>
                <FieldContent>
                  <FieldLabel>{t("setup.businessType")}</FieldLabel>
                  <FieldDescription>{t("setup.selectBusinessType")}</FieldDescription>
                </FieldContent>
                <Select onValueChange={(value) => setBusinessType(value ?? "clinic")} value={businessType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("setup.selectBusinessType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinic">{t("setup.businessTypes.clinic")}</SelectItem>
                    <SelectItem value="repair_shop">{t("setup.businessTypes.repair_shop")}</SelectItem>
                    <SelectItem value="salon">{t("setup.businessTypes.salon")}</SelectItem>
                    <SelectItem value="service_company">{t("setup.businessTypes.service_company")}</SelectItem>
                    <SelectItem value="other">{t("setup.businessTypes.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isSubmitting || name.trim().length === 0 || slug.trim().length === 0}
              type="submit"
            >
              {isSubmitting ? t("setup.creating") : t("setup.create")}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
            {error ? <span className="text-sm text-destructive">{error}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
