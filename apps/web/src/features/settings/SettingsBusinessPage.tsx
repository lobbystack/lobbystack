import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

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
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [businessNameStatus, setBusinessNameStatus] = useState<string | null>(null);
  const [isSavingBusinessName, setIsSavingBusinessName] = useState(false);

  useEffect(() => {
    const nextName = configuration?.business?.name;
    if (nextName !== undefined) {
      setBusinessName(nextName);
    }
  }, [configuration?.business?.name]);

  useEffect(() => {
    if (!businessNameStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBusinessNameStatus(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [businessNameStatus]);

  async function handleBusinessNameSave(): Promise<void> {
    setIsSavingBusinessName(true);
    setBusinessNameStatus(null);

    try {
      await updateBusinessName({
        businessId: props.businessId,
        name: businessName,
      });
      setBusinessNameStatus(t("account.businessName.saved"));
    } finally {
      setIsSavingBusinessName(false);
    }
  }

  async function handlePasswordSave(): Promise<void> {
    setPasswordStatus(null);
    setPasswordError(null);

    try {
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
      setPasswordStatus("Password updated.");
      setIsPasswordDialogOpen(false);
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    }
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
      setEmailStatus(t("account.changeEmail.confirmationSent", { email: result.email }));
      setIsEmailDialogOpen(false);
    } catch (error) {
      setEmailError(getChangeEmailErrorMessage(error, t));
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full max-w-xl">
        <div className="flex flex-col gap-8">
          <form className="flex flex-col gap-8" onSubmit={(event) => event.preventDefault()}>
            <FieldGroup>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="profile-username">Business name</FieldLabel>
                  <FieldDescription>
                    This is the name shown across the dashboard and customer-facing business details.
                  </FieldDescription>
                </FieldContent>
                <Input
                  id="profile-username"
                  placeholder="Maple Family Clinic"
                  value={businessName}
                  onChange={(event) => {
                    setBusinessName(event.target.value);
                    setBusinessNameStatus(null);
                  }}
                />
                <div className="flex items-center gap-3">
                  <Button
                    disabled={isSavingBusinessName}
                    type="button"
                    onClick={() => void handleBusinessNameSave()}
                  >
                    {isSavingBusinessName
                      ? t("account.businessName.saving")
                      : t("account.businessName.save")}
                  </Button>
                  {businessNameStatus ? (
                    <span className="text-sm text-muted-foreground">{businessNameStatus}</span>
                  ) : null}
                </div>
              </Field>
            </FieldGroup>
          </form>

          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Email</ItemTitle>
                <ItemDescription>{t("account.changeEmail.description")}</ItemDescription>
                {currentUser?.email ? (
                  <p className="text-sm text-foreground">
                    {t("account.changeEmail.currentEmail", { email: currentUser.email })}
                  </p>
                ) : null}
              {emailStatus ? <ItemDescription>{emailStatus}</ItemDescription> : null}
            </ItemContent>
            <ItemActions>
              <Dialog onOpenChange={setIsEmailDialogOpen} open={isEmailDialogOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  Change
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("account.changeEmail.label")}</DialogTitle>
                    <DialogDescription>
                      {t("account.changeEmail.description")}
                    </DialogDescription>
                  </DialogHeader>

                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="profile-email">
                        {t("account.changeEmail.newEmailPlaceholder")}
                      </FieldLabel>
                      <Input
                        id="profile-email"
                        type="email"
                        autoComplete="email"
                        placeholder={t("account.changeEmail.newEmailPlaceholder")}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="profile-password">
                        Current password
                      </FieldLabel>
                      <Input
                        id="profile-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder={t("account.changeEmail.currentPasswordPlaceholder")}
                        value={currentEmailPassword}
                        onChange={(event) => setCurrentEmailPassword(event.target.value)}
                      />
                    </Field>
                  </FieldGroup>

                  {emailError ? <FieldError>{emailError}</FieldError> : null}

                  <DialogFooter>
                    <Button type="button" onClick={() => void handleEmailSave()}>
                      {t("account.changeEmail.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </ItemActions>
          </Item>

            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Password</ItemTitle>
                <ItemDescription>
                  Password you use to log in.
                </ItemDescription>
                <div className="text-lg leading-none text-foreground">••••••••</div>
                {passwordStatus ? <ItemDescription>{passwordStatus}</ItemDescription> : null}
              </ItemContent>
            <ItemActions>
              <Dialog onOpenChange={setIsPasswordDialogOpen} open={isPasswordDialogOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  Change
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change password</DialogTitle>
                    <DialogDescription>
                      Enter your current password and a new password.
                    </DialogDescription>
                  </DialogHeader>

                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="profile-current-password">
                        Current password
                      </FieldLabel>
                      <Input
                        id="profile-current-password"
                        type="password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="profile-new-password">
                        New password
                      </FieldLabel>
                      <Input
                        id="profile-new-password"
                        type="password"
                        placeholder="New password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="profile-confirm-new-password">
                        Confirm new password
                      </FieldLabel>
                      <Input
                        id="profile-confirm-new-password"
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                      />
                    </Field>
                  </FieldGroup>

                  {passwordError ? <FieldError>{passwordError}</FieldError> : null}

                  <DialogFooter>
                    <Button type="button" onClick={() => void handlePasswordSave()}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </ItemActions>
          </Item>
          </ItemGroup>
        </div>
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
  if (message.includes("SITE_URL is required")) {
    return t("account.changeEmail.errors.missingSiteUrl");
  }
  if (message.includes("No email is configured")) {
    return t("account.changeEmail.errors.noEmail");
  }
  if (message.includes("New email is required")) {
    return t("account.changeEmail.errors.required");
  }

  return t("account.changeEmail.errors.failed");
}
