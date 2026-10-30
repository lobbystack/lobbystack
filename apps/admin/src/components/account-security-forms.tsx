"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { failedPasswordRequirements } from "@/lib/password-policy";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function postAuth(path: string, body?: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; code?: string } | null;
    throw Object.assign(new Error(payload?.message ?? "The account security request failed."), { code: payload?.code });
  }
}

export function AccountSecurityForms({ currentEmail }: { currentEmail: string | null | undefined }) {
  const { t } = useTranslation("settings");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const emailId = useId();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [currentPasswordRefused, setCurrentPasswordRefused] = useState(false);
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();
  const [pending, setPending] = useState(false);

  const nextEmail = email.trim();
  const emailProblem = !nextEmail ? "required" : !EMAIL_PATTERN.test(nextEmail) ? "invalid" : nextEmail.toLowerCase() === currentEmail?.toLowerCase() ? "unchanged" : null;
  // Checked after the first send attempt, like the other forms; a refusal from the server shows in the same place.
  const emailMessage = emailSubmitted && emailProblem ? t(`account.changeEmail.errors.${emailProblem}`) : emailError;

  function changeEmailOpen(open: boolean) {
    setEmailOpen(open);
    if (!open) { setEmail(""); setEmailError(null); setEmailSubmitted(false); }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailSubmitted(true); setEmailError(null);
    if (emailProblem) return;
    setPending(true);
    try {
      await postAuth("change-email", { newEmail: nextEmail, callbackURL: "/settings/account?emailChanged=true" });
      toast.success(t("account.changeEmail.confirmationSent", { email: nextEmail })); changeEmailOpen(false);
    } catch (error) { setEmailError(error instanceof Error ? error.message : t("account.changeEmail.errors.failed")); }
    finally { setPending(false); }
  }

  // Each field lists everything wrong with it, so several problems show as bullets. Checked after the first save attempt,
  // like the other forms; only a wrong current password is known from the server's answer.
  const currentPasswordProblems = [...(!currentPassword ? ["currentRequired"] : []), ...(currentPasswordRefused ? ["invalidCurrent"] : [])];
  const newPasswordProblems = !newPassword ? ["newRequired"] : [...failedPasswordRequirements(newPassword).map((requirement) => `${requirement}Missing`), ...(newPassword === currentPassword ? ["unchanged"] : [])];
  const confirmPasswordProblems = !confirmNewPassword ? ["confirmRequired"] : confirmNewPassword !== newPassword ? ["mismatch"] : [];
  const messages = (problems: string[]) => problems.map((problem) => ({ message: t(`account.changePassword.errors.${problem}`) }));
  const currentPasswordErrors = passwordSubmitted ? messages(currentPasswordProblems) : messages(currentPasswordProblems.filter((problem) => problem === "invalidCurrent"));
  const newPasswordErrors = passwordSubmitted ? messages(newPasswordProblems) : [];
  const confirmPasswordErrors = passwordSubmitted ? messages(confirmPasswordProblems) : [];

  function changePasswordOpen(open: boolean) {
    setPasswordOpen(open);
    if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); setPasswordError(null); setPasswordSubmitted(false); setCurrentPasswordRefused(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSubmitted(true); setPasswordError(null); setCurrentPasswordRefused(false);
    if (!currentPassword || newPasswordProblems.length || confirmPasswordProblems.length) return;
    setPending(true);
    try {
      await postAuth("change-password", { currentPassword, newPassword, revokeOtherSessions: true });
      toast.success(t("account.changePassword.saved")); changePasswordOpen(false);
    } catch (error) {
      if ((error as { code?: unknown }).code === "INVALID_PASSWORD") setCurrentPasswordRefused(true);
      else setPasswordError(error instanceof Error ? error.message : t("account.changePassword.errors.failed"));
    }
    finally { setPending(false); }
  }

  return (
    <ItemGroup className="grid md:grid-cols-2" spacing="section">
      <Item variant="outline"><ItemContent><ItemTitle>{t("account.changeEmail.title")}</ItemTitle><ItemDescription>{t("account.changeEmail.description")}</ItemDescription>{currentEmail ? <p className="text-[15px] leading-6 text-foreground">{t("account.changeEmail.currentEmail", { email: currentEmail })}</p> : null}</ItemContent><ItemActions><Dialog onOpenChange={changeEmailOpen} open={emailOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("account.changeEmail.label")}</DialogTitle><DialogDescription>{t("account.changeEmail.description")}</DialogDescription></DialogHeader><form className="flex flex-col gap-6" noValidate onSubmit={(event) => void saveEmail(event)}><FieldGroup><Field><FieldLabel htmlFor="profile-current-email">{t("account.changeEmail.currentEmailLabel")}</FieldLabel><Input autoComplete="off" disabled id="profile-current-email" value={currentEmail ?? ""} /></Field><Field data-invalid={emailMessage ? true : undefined}><FieldLabel htmlFor={emailId}>{t("account.changeEmail.newEmailLabel")}</FieldLabel><Input aria-describedby={emailMessage ? `${emailId}-error` : undefined} aria-invalid={emailMessage ? true : undefined} autoComplete="email" id={emailId} onChange={(event) => { setEmail(event.target.value); setEmailError(null); }} placeholder={t("account.changeEmail.newEmailPlaceholder")} type="email" value={email} />{emailMessage ? <FieldError id={`${emailId}-error`}>{emailMessage}</FieldError> : null}</Field></FieldGroup><DialogFooter><DialogClose render={<Button disabled={pending} type="button" variant="outline" />}>{t("account.actions.cancel")}</DialogClose><Button disabled={pending} type="submit">{t("account.changeEmail.save")}</Button></DialogFooter></form></DialogContent></Dialog></ItemActions></Item>

      <Item variant="outline"><ItemContent><ItemTitle>{t("account.changePassword.title")}</ItemTitle><ItemDescription>{t("account.changePassword.description")}</ItemDescription><div className="text-[15px] font-medium leading-6 text-foreground">••••••••</div></ItemContent><ItemActions><Dialog onOpenChange={changePasswordOpen} open={passwordOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("account.changePassword.label")}</DialogTitle><DialogDescription>{t("account.changePassword.dialogDescription")}</DialogDescription></DialogHeader><form className="flex flex-col gap-6" noValidate onSubmit={(event) => void savePassword(event)}><FieldGroup><Field data-invalid={currentPasswordErrors.length ? true : undefined}><FieldLabel htmlFor={currentPasswordId}>{t("account.changePassword.currentPasswordLabel")}</FieldLabel><Input aria-describedby={currentPasswordErrors.length ? `${currentPasswordId}-error` : undefined} aria-invalid={currentPasswordErrors.length ? true : undefined} autoComplete="current-password" id={currentPasswordId} onChange={(event) => { setCurrentPassword(event.target.value); setCurrentPasswordRefused(false); }} type="password" value={currentPassword} />{currentPasswordErrors.length ? <FieldError errors={currentPasswordErrors} id={`${currentPasswordId}-error`} /> : null}</Field><Field data-invalid={newPasswordErrors.length ? true : undefined}><FieldLabel htmlFor={newPasswordId}>{t("account.changePassword.newPasswordLabel")}</FieldLabel><Input aria-describedby={newPasswordErrors.length ? `${newPasswordId}-error` : undefined} aria-invalid={newPasswordErrors.length ? true : undefined} autoComplete="new-password" id={newPasswordId} onChange={(event) => { setNewPassword(event.target.value); }} type="password" value={newPassword} />{newPasswordErrors.length ? <FieldError errors={newPasswordErrors} id={`${newPasswordId}-error`} /> : null}</Field><Field data-invalid={confirmPasswordErrors.length ? true : undefined}><FieldLabel htmlFor={confirmPasswordId}>{t("account.changePassword.confirmPasswordLabel")}</FieldLabel><Input aria-describedby={confirmPasswordErrors.length ? `${confirmPasswordId}-error` : undefined} aria-invalid={confirmPasswordErrors.length ? true : undefined} autoComplete="new-password" id={confirmPasswordId} onChange={(event) => { setConfirmNewPassword(event.target.value); }} type="password" value={confirmNewPassword} />{confirmPasswordErrors.length ? <FieldError errors={confirmPasswordErrors} id={`${confirmPasswordId}-error`} /> : null}</Field></FieldGroup>{passwordError ? <FieldError>{passwordError}</FieldError> : null}<DialogFooter><DialogClose render={<Button disabled={pending} type="button" variant="outline" />}>{t("account.actions.cancel")}</DialogClose><Button disabled={pending} type="submit">{t("account.changePassword.save")}</Button></DialogFooter></form></DialogContent></Dialog></ItemActions></Item>
    </ItemGroup>
  );
}
