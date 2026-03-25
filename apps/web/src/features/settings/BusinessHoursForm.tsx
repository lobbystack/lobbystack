import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { getWeekdayLabels } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type BusinessHoursFormProps = {
  businessId: Id<"businesses">;
};

type HoursRowState = {
  open: string;
  close: string;
};

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseTimeString(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function BusinessHoursForm(props: BusinessHoursFormProps) {
  const { i18n, t } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const replaceBusinessHours = useMutation(api.businesses.catalog.replaceBusinessHours);
  const [rows, setRows] = useState<Array<HoursRowState>>(
    Array.from({ length: 7 }, () => ({ open: "", close: "" })),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dayLabels = getWeekdayLabels(i18n.language);

  useEffect(() => {
    if (!configuration) {
      return;
    }
    const nextRows = Array.from({ length: 7 }, () => ({ open: "", close: "" }));
    for (const row of configuration.hours) {
      nextRows[row.dayOfWeek] = {
        open: toTimeString(row.openMinutes),
        close: toTimeString(row.closeMinutes),
      };
    }
    setRows(nextRows);
  }, [configuration]);

  function updateRow(index: number, field: keyof HoursRowState, value: string): void {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      const hours = rows.flatMap((row, dayOfWeek) => {
        if (!row.open.trim() || !row.close.trim()) {
          return [];
        }
        const openMinutes = parseTimeString(row.open);
        const closeMinutes = parseTimeString(row.close);
        if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
          throw new Error(t("hours.invalidHours", { day: dayLabels[dayOfWeek] }));
        }
        return [
          {
            dayOfWeek,
            openMinutes,
            closeMinutes,
          },
        ];
      });

      await replaceBusinessHours({
        businessId: props.businessId,
        hours,
      });
      setStatus(t("hours.saved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("hours.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <CardTitle>{t("hours.title")}</CardTitle>
          <CardDescription>{t("hours.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-8" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel>{t("hours.title")}</FieldLabel>
                <FieldDescription>{t("hours.leaveBlank")}</FieldDescription>
              </FieldContent>
            </Field>
            {rows.map((row, index) => (
              <div
                className="grid gap-4 rounded-2xl border border-border/70 bg-background/70 p-4 md:grid-cols-[160px_1fr_1fr]"
                key={dayLabels[index]}
              >
                <div className="flex items-center text-sm font-medium text-foreground">
                  {dayLabels[index]}
                </div>
                <Input
                  placeholder="09:00"
                  value={row.open}
                  onChange={(event) => updateRow(index, "open", event.target.value)}
                />
                <Input
                  placeholder="17:00"
                  value={row.close}
                  onChange={(event) => updateRow(index, "close", event.target.value)}
                />
              </div>
            ))}
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSaving} type="submit">
              {isSaving ? t("hours.saving") : t("hours.save")}
            </Button>
            <span className="text-sm text-muted-foreground">{t("hours.leaveBlank")}</span>
          </div>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </form>
      </CardContent>
    </Card>
  );
}
