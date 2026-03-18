import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SettingsBusinessPage() {
  const [businessName, setBusinessName] = useState("Maple Family Clinic");
  const [email, setEmail] = useState("");
  const [currentEmailPassword, setCurrentEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full max-w-xl">
        <form className="space-y-8" onSubmit={(event) => event.preventDefault()}>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="profile-username">
                Business name
              </label>
              <p className="text-sm leading-6 text-muted-foreground">
                This is the name shown across the dashboard and customer-facing business details.
              </p>
            </div>
            <Input
              id="profile-username"
              placeholder="Maple Family Clinic"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <div className="pt-4">
              <Button type="button">Save</Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="profile-email">
                Change email
              </label>
              <p className="text-sm leading-6 text-muted-foreground">
                Enter you new email and current password.
              </p>
            </div>
            <div className="space-y-4">
              <Input
                id="profile-email"
                placeholder="New email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                id="profile-password"
                type="password"
                placeholder="Current password"
                value={currentEmailPassword}
                onChange={(event) => setCurrentEmailPassword(event.target.value)}
              />
              <div className="pt-4">
                <Button type="button">Save</Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="profile-current-password">
                Change password
              </label>
              <p className="text-sm leading-6 text-muted-foreground">
                Enter your current password and a new password.
              </p>
            </div>
            <div className="space-y-4">
              <Input
                id="profile-current-password"
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <Input
                id="profile-new-password"
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <div className="pt-4">
                <Button type="button">Save</Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
