import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { IconPhone, IconRobotFace } from "@tabler/icons-react";

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
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const saveProfile = useMutation(api.ai.context.snapshots.updateReceptionistProfile);
  const [greeting, setGreeting] = useState("");
  const [tone, setTone] = useState("");
  const [summary, setSummary] = useState("");
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
    setTone(profile.tone);
    setSummary(profile.summary);
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
        tone,
        summary,
        bookingPolicy,
        voiceInstructions: voiceInstructions.trim() || undefined,
        smsInstructions: smsInstructions.trim() || undefined,
        transferMode,
        transferNumber: transferNumber.trim() || undefined,
      });
      setStatus("Saved receptionist profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            <IconRobotFace className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>Receptionist Profile</CardTitle>
            <CardDescription>
              Define the voice, tone, booking policy, and transfer rules that shape your receptionist.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Greeting</span>
              <Input
                value={greeting}
                onChange={(event) => setGreeting(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Tone</span>
              <Input
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Business summary</span>
            <Textarea
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Booking policy</span>
            <Textarea
              rows={3}
              value={bookingPolicy}
              onChange={(event) => setBookingPolicy(event.target.value)}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Transfer mode</span>
              <Select value={transferMode} onValueChange={(value) => setTransferMode(value ?? "on_request")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select transfer mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="on_request">On request</SelectItem>
                  <SelectItem value="on_urgent">On urgent issues</SelectItem>
                  <SelectItem value="during_business_hours">During business hours</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Transfer number</span>
              <div className="relative">
                <IconPhone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="+1 555 123 4567"
                  value={transferNumber}
                  onChange={(event) => setTransferNumber(event.target.value)}
                />
              </div>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">Voice instructions</span>
            <Textarea
              rows={4}
              value={voiceInstructions}
              onChange={(event) => setVoiceInstructions(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">SMS instructions</span>
            <Textarea
              rows={4}
              value={smsInstructions}
              onChange={(event) => setSmsInstructions(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save profile"}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
