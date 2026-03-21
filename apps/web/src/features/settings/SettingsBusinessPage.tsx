import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
};

export function SettingsBusinessPage(props: SettingsBusinessPageProps) {
  const { t } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId: props.businessId,
  });
  const currentUser = useQuery(api.users.current, {});
  const updateBusinessName = useMutation(api.businesses.catalog.updateBusinessName);
  const changeEmail = useAction(api.businesses.catalog.changeEmail);
  const changePassword = useAction(api.businesses.catalog.changePassword);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [currentEmailPassword, setCurrentEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

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

  async function handleEmailSave(): Promise<void> {
    setEmailStatus(null);
    setEmailError(null);

    try {
      const result = await changeEmail({
        currentPassword: currentEmailPassword,
        newEmail: email,
      });

      setEmail("");
      setCurrentEmailPassword("");
      setEmailStatus(t("account.changeEmail.saved", { email: result.email }));
    } catch (error) {
      setEmailError(getChangeEmailErrorMessage(error, t));
    }
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
                {t("account.changeEmail.label")}
              </label>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("account.changeEmail.description")}
              </p>
              {currentUser?.email ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("account.changeEmail.currentEmail", { email: currentUser.email })}
                </p>
              ) : null}
            </div>
            <div className="space-y-4">
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                placeholder={t("account.changeEmail.newEmailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                id="profile-password"
                type="password"
                autoComplete="current-password"
                placeholder={t("account.changeEmail.currentPasswordPlaceholder")}
                value={currentEmailPassword}
                onChange={(event) => setCurrentEmailPassword(event.target.value)}
              />
              {emailStatus ? <p className="text-sm text-muted-foreground">{emailStatus}</p> : null}
              {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
              <div className="pt-4">
                <Button type="button" onClick={() => void handleEmailSave()}>
                  {t("account.changeEmail.save")}
                </Button>
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

function getChangeEmailErrorMessage(
  error: unknown,
  t: TFunction<"settings">,
) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("InvalidSecret")) {
    return t("account.changeEmail.errors.invalidPassword");
  }
  if (message.includes("already exists")) {
    return t("account.changeEmail.errors.alreadyExists");
  }
  if (message.includes("already on your account")) {
    return t("account.changeEmail.errors.unchanged");
  }
  if (message.includes("No email is configured")) {
    return t("account.changeEmail.errors.noEmail");
  }
  if (message.includes("required")) {
    return t("account.changeEmail.errors.required");
  }

  return t("account.changeEmail.errors.failed");
}
