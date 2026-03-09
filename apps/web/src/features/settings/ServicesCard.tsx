import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { IconCalendarPlus } from "@tabler/icons-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            <IconCalendarPlus className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>Services</CardTitle>
            <CardDescription>
              Service definitions power both booking logic and the receptionist snapshot callers hear.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Service name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Slug</span>
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Duration (minutes)</span>
              <Input
                min="5"
                step="5"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Description</span>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Add service"}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </form>
        <div className="space-y-3">
          {services.map((service) => (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={service._id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="text-sm text-foreground">{service.name}</strong>
                <Badge variant="outline">{service.durationMinutes} min</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {service.description || "No description yet."}
              </p>
            </div>
          ))}
          {configuration && services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              No services configured yet.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
