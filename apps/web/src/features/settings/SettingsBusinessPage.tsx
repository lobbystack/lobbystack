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
  const [isBusinessNameDialogOpen, setIsBusinessNameDialogOpen] = useState(false);
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
      setIsBusinessNameDialogOpen(false);
    } finally {
      setIsSavingBusinessName(false);
    }
  }

  async function handlePasswordSave(): Promise<void> {
    setPasswordStatus(null);
    setPasswordError(null);

    try {
      if (newPassword !== confirmNewPassword) {
        throw new Error(t("account.changePassword.errors.mismatch"));
      }

      await changePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordStatus(t("account.changePassword.saved"));
      setIsPasswordDialogOpen(false);
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : t("account.changePassword.errors.failed"),
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
      <div className="w-full">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("account.businessName.label")}</ItemTitle>
              <ItemDescription>{t("account.businessName.description")}</ItemDescription>
              <p className="text-sm text-foreground">{businessName}</p>
              {businessNameStatus ? <ItemDescription>{businessNameStatus}</ItemDescription> : null}
            </ItemContent>
            <ItemActions>
              <Dialog
                onOpenChange={(open) => {
                  setIsBusinessNameDialogOpen(open);
                  if (open) {
                    setBusinessName(configuration?.business?.name ?? businessName);
                  }
                }}
                open={isBusinessNameDialogOpen}
              >
                <DialogTrigger render={<Button variant="outline" />}>
                  {t("account.actions.change")}
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("account.businessName.label")}</DialogTitle>
                    <DialogDescription>{t("account.businessName.description")}</DialogDescription>
                  </DialogHeader>

                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="profile-username">
                        {t("account.businessName.label")}
                      </FieldLabel>
                      <Input
                        id="profile-username"
                        placeholder={t("account.businessName.placeholder")}
                        value={businessName}
                        onChange={(event) => {
                          setBusinessName(event.target.value);
                          setBusinessNameStatus(null);
                        }}
                      />
                    </Field>
                  </FieldGroup>

                  <DialogFooter>
                    <Button
                      disabled={isSavingBusinessName}
                      type="button"
                      onClick={() => void handleBusinessNameSave()}
                    >
                      {isSavingBusinessName
                        ? t("account.businessName.saving")
                        : t("account.businessName.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </ItemActions>
          </Item>

          <ItemGroup spacing="section">
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>{t("account.changeEmail.title")}</ItemTitle>
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
                    {t("account.actions.change")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("account.changeEmail.label")}</DialogTitle>
                      <DialogDescription>{t("account.changeEmail.description")}</DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-email">
                          {t("account.changeEmail.newEmailPlaceholder")}
                        </FieldLabel>
                        <Input
                          id="profile-email"
                          autoComplete="email"
                          placeholder={t("account.changeEmail.newEmailPlaceholder")}
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="profile-password">
                          {t("account.changeEmail.currentPasswordLabel")}
                        </FieldLabel>
                        <Input
                          id="profile-password"
                          autoComplete="current-password"
                          placeholder={t("account.changeEmail.currentPasswordPlaceholder")}
                          type="password"
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
                <ItemTitle>{t("account.changePassword.title")}</ItemTitle>
                <ItemDescription>{t("account.changePassword.description")}</ItemDescription>
                <div className="text-lg leading-none text-foreground">••••••••</div>
                {passwordStatus ? <ItemDescription>{passwordStatus}</ItemDescription> : null}
              </ItemContent>
              <ItemActions>
                <Dialog onOpenChange={setIsPasswordDialogOpen} open={isPasswordDialogOpen}>
                  <DialogTrigger render={<Button variant="outline" />}>
                    {t("account.actions.change")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("account.changePassword.label")}</DialogTitle>
                      <DialogDescription>
                        {t("account.changePassword.dialogDescription")}
                      </DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-current-password">
                          {t("account.changePassword.currentPasswordLabel")}
                        </FieldLabel>
                        <Input
                          id="profile-current-password"
                          placeholder={t("account.changePassword.currentPasswordPlaceholder")}
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="profile-new-password">
                          {t("account.changePassword.newPasswordLabel")}
                        </FieldLabel>
                        <Input
                          id="profile-new-password"
                          placeholder={t("account.changePassword.newPasswordPlaceholder")}
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="profile-confirm-new-password">
                          {t("account.changePassword.confirmPasswordLabel")}
                        </FieldLabel>
                        <Input
                          id="profile-confirm-new-password"
                          placeholder={t("account.changePassword.confirmPasswordPlaceholder")}
                          type="password"
                          value={confirmNewPassword}
                          onChange={(event) => setConfirmNewPassword(event.target.value)}
                        />
                      </Field>
                    </FieldGroup>

                    {passwordError ? <FieldError>{passwordError}</FieldError> : null}

                    <DialogFooter>
                      <Button type="button" onClick={() => void handlePasswordSave()}>
                        {t("account.changePassword.save")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </ItemActions>
            </Item>
          </ItemGroup>
        </ItemGroup>
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
