import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

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
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const services = (configuration?.services ?? []) as Array<Doc<"services">>;
  const upsertService = useMutation(api.businesses.catalog.upsertService);
  const [name, setName] = useState("Initial Consultation");
  const [slug, setSlug] = useState("initial-consultation");
  const [description, setDescription] = useState("A 30 minute first appointment.");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSlug(slugify(name));
  }, [name]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await upsertService({
        businessId: props.businessId,
        name,
        slug,
        description: description.trim() || undefined,
        durationMinutes: Number(durationMinutes),
        active: true,
      });
      setStatus("Saved service.");
      setName("");
      setSlug("");
      setDescription("");
      setDurationMinutes("30");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Services are part of the snapshot and are also used by the booking engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="field-grid">
            <label className="stack">
              <span className="kpi-label">Service name</span>
              <input
                className="text-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="stack">
              <span className="kpi-label">Slug</span>
              <input
                className="text-input"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="stack">
              <span className="kpi-label">Duration (minutes)</span>
              <input
                className="text-input"
                min="5"
                step="5"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </label>
            <label className="stack">
              <span className="kpi-label">Description</span>
              <input
                className="text-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="inline-actions">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Add service"}
            </Button>
            {status ? <span className="status-note">{status}</span> : null}
          </div>
        </form>
        <div className="mini-list">
          {services.map((service) => (
            <div className="mini-list-item" key={service._id}>
              <strong>{service.name}</strong>
              <span className="muted">
                {service.durationMinutes} min
                {service.description ? ` • ${service.description}` : ""}
              </span>
            </div>
          ))}
          {configuration && services.length === 0 ? (
            <span className="muted">No services configured yet.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
