import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Receptionist Profile</CardTitle>
        <CardDescription>
          These structured settings feed the business snapshot that the voice gateway
          loads once per call.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="field-grid">
            <label className="stack">
              <span className="kpi-label">Greeting</span>
              <input
                className="text-input"
                value={greeting}
                onChange={(event) => setGreeting(event.target.value)}
              />
            </label>
            <label className="stack">
              <span className="kpi-label">Tone</span>
              <input
                className="text-input"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </label>
          </div>
          <label className="stack">
            <span className="kpi-label">Business Summary</span>
            <textarea
              className="text-area"
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="stack">
            <span className="kpi-label">Booking Policy</span>
            <textarea
              className="text-area"
              rows={3}
              value={bookingPolicy}
              onChange={(event) => setBookingPolicy(event.target.value)}
            />
          </label>
          <div className="field-grid">
            <label className="stack">
              <span className="kpi-label">Transfer Mode</span>
              <select
                className="text-input"
                value={transferMode}
                onChange={(event) => setTransferMode(event.target.value)}
              >
                <option value="never">Never</option>
                <option value="always">Always</option>
                <option value="on_request">On request</option>
                <option value="on_urgent">On urgent issues</option>
                <option value="during_business_hours">During business hours</option>
              </select>
            </label>
            <label className="stack">
              <span className="kpi-label">Transfer Number</span>
              <input
                className="text-input"
                placeholder="+1 555 123 4567"
                value={transferNumber}
                onChange={(event) => setTransferNumber(event.target.value)}
              />
            </label>
          </div>
          <label className="stack">
            <span className="kpi-label">Voice Instructions</span>
            <textarea
              className="text-area"
              rows={4}
              value={voiceInstructions}
              onChange={(event) => setVoiceInstructions(event.target.value)}
            />
          </label>
          <label className="stack">
            <span className="kpi-label">SMS Instructions</span>
            <textarea
              className="text-area"
              rows={4}
              value={smsInstructions}
              onChange={(event) => setSmsInstructions(event.target.value)}
            />
          </label>
          <div className="inline-actions">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save profile"}
            </Button>
            {status ? <span className="status-note">{status}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
