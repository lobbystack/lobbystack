import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      setStatus(t("setup.created"));
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("setup.businessName")}
              </span>
              <Input
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder={t("setup.placeholders.businessName")}
                value={name}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("setup.slug")}
              </span>
              <Input
                onChange={(event) => setSlug(slugify(event.target.value))}
                placeholder={t("setup.placeholders.slug")}
                value={slug}
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("setup.timezone")}
              </span>
              <Input onChange={(event) => setTimezone(event.target.value)} value={timezone} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                {t("setup.businessType")}
              </span>
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
            </label>
          </div>
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
