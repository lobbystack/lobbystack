import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
};

export function SettingsBusinessPage(props: SettingsBusinessPageProps) {
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const updateBusinessName = useMutation(api.businesses.catalog.updateBusinessName);
  const changePassword = useAction(api.businesses.catalog.changePassword);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [currentEmailPassword, setCurrentEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    const nextName = configuration?.business?.name;
    if (nextName !== undefined) {
      setBusinessName(nextName);
    }
  }, [configuration?.business?.name]);

  async function handleBusinessNameSave(): Promise<void> {
    await updateBusinessName({
      businessId: props.businessId,
      name: businessName,
    });
  }

  async function handlePasswordSave(): Promise<void> {
    if (newPassword !== confirmNewPassword) {
      throw new Error("New passwords do not match.");
    }

    await changePassword({
      currentPassword,
      newPassword,
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

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
              <Button type="button" onClick={() => void handleBusinessNameSave()}>
                Save
              </Button>
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
              <Input
                id="profile-confirm-new-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
              />
              <div className="pt-4">
                <Button type="button" onClick={() => void handlePasswordSave()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
