import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

type BusinessHoursFormProps = {
  businessId: Id<"businesses">;
};

type HoursRowState = {
  open: string;
  close: string;
};

const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseTimeString(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
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
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const replaceBusinessHours = useMutation(api.businesses.catalog.replaceBusinessHours);
  const [rows, setRows] = useState<Array<HoursRowState>>(
    Array.from({ length: 7 }, () => ({ open: "", close: "" })),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
          throw new Error(`Invalid hours for ${dayLabels[dayOfWeek]}.`);
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
      setStatus("Saved business hours.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save business hours.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opening Hours</CardTitle>
        <CardDescription>
          Opening and closing hours are stored as structured data and stay authoritative
          over any retrieved documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="table-like">
            {rows.map((row, index) => (
              <div className="table-row" key={dayLabels[index]}>
                <strong>{dayLabels[index]}</strong>
                <input
                  className="text-input"
                  placeholder="09:00"
                  value={row.open}
                  onChange={(event) => updateRow(index, "open", event.target.value)}
                />
                <input
                  className="text-input"
                  placeholder="17:00"
                  value={row.close}
                  onChange={(event) => updateRow(index, "close", event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="inline-actions">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save hours"}
            </Button>
            <span className="muted">Leave a day blank to mark it closed.</span>
          </div>
          {status ? <span className="status-note">{status}</span> : null}
        </form>
      </CardContent>
    </Card>
  );
}
