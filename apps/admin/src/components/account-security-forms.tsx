"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";

async function postAuth(path: string, body?: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? "The account security request failed.");
  }
}

export function AccountSecurityForms({ currentEmail }: { currentEmail: string | null | undefined }) {
  const { t } = useTranslation("settings");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function saveEmail() {
    setPending(true); setEmailError(null); setEmailStatus(null);
    try {
      await postAuth("change-email", { newEmail: email, callbackURL: "/settings/account?emailChanged=true" });
      setEmailStatus(t("account.changeEmail.confirmationSent", { email })); setEmail(""); setEmailOpen(false);
    } catch (error) { setEmailError(error instanceof Error ? error.message : t("account.changeEmail.errors.failed")); }
    finally { setPending(false); }
  }

  async function savePassword() {
    setPending(true); setPasswordError(null); setPasswordStatus(null);
    try {
      if (newPassword !== confirmNewPassword) throw new Error(t("account.changePassword.errors.mismatch"));
      await postAuth("change-password", { currentPassword, newPassword, revokeOtherSessions: true });
      setPasswordStatus(t("account.changePassword.saved")); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); setPasswordOpen(false);
    } catch (error) { setPasswordError(error instanceof Error ? error.message : t("account.changePassword.errors.failed")); }
    finally { setPending(false); }
  }

  return (
    <ItemGroup spacing="section">
      <Item variant="outline"><ItemContent><ItemTitle>{t("account.changeEmail.title")}</ItemTitle><ItemDescription>{t("account.changeEmail.description")}</ItemDescription>{currentEmail ? <p className="text-[15px] leading-6 text-foreground">{t("account.changeEmail.currentEmail", { email: currentEmail })}</p> : null}{emailStatus ? <ItemDescription>{emailStatus}</ItemDescription> : null}</ItemContent><ItemActions><Dialog onOpenChange={setEmailOpen} open={emailOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("account.changeEmail.label")}</DialogTitle><DialogDescription>{t("account.changeEmail.description")}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="profile-email">{t("account.changeEmail.newEmailPlaceholder")}</FieldLabel><Input autoComplete="email" id="profile-email" onChange={(event) => setEmail(event.target.value)} placeholder={t("account.changeEmail.newEmailPlaceholder")} type="email" value={email} /></Field></FieldGroup>{emailError ? <FieldError>{emailError}</FieldError> : null}<DialogFooter><Button disabled={pending || !email} onClick={() => void saveEmail()} type="button">{t("account.changeEmail.save")}</Button></DialogFooter></DialogContent></Dialog></ItemActions></Item>

      <Item variant="outline"><ItemContent><ItemTitle>{t("account.changePassword.title")}</ItemTitle><ItemDescription>{t("account.changePassword.description")}</ItemDescription><div className="text-[15px] font-medium leading-6 text-foreground">••••••••</div>{passwordStatus ? <ItemDescription>{passwordStatus}</ItemDescription> : null}</ItemContent><ItemActions><Dialog onOpenChange={setPasswordOpen} open={passwordOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("account.changePassword.label")}</DialogTitle><DialogDescription>{t("account.changePassword.dialogDescription")}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="profile-current-password">{t("account.changePassword.currentPasswordLabel")}</FieldLabel><Input autoComplete="current-password" id="profile-current-password" onChange={(event) => setCurrentPassword(event.target.value)} placeholder={t("account.changePassword.currentPasswordPlaceholder")} type="password" value={currentPassword} /></Field><Field><FieldLabel htmlFor="profile-new-password">{t("account.changePassword.newPasswordLabel")}</FieldLabel><Input autoComplete="new-password" id="profile-new-password" onChange={(event) => setNewPassword(event.target.value)} placeholder={t("account.changePassword.newPasswordPlaceholder")} type="password" value={newPassword} /></Field><Field><FieldLabel htmlFor="profile-confirm-new-password">{t("account.changePassword.confirmPasswordLabel")}</FieldLabel><Input autoComplete="new-password" id="profile-confirm-new-password" onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder={t("account.changePassword.confirmPasswordPlaceholder")} type="password" value={confirmNewPassword} /></Field></FieldGroup>{passwordError ? <FieldError>{passwordError}</FieldError> : null}<DialogFooter><Button disabled={pending || !currentPassword || !newPassword || !confirmNewPassword} onClick={() => void savePassword()} type="button">{t("account.changePassword.save")}</Button></DialogFooter></DialogContent></Dialog></ItemActions></Item>
    </ItemGroup>
  );
}
